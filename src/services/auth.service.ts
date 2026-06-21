import type { Role } from "@prisma/client";
import { env } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, isWithinBcryptLimit, verifyPassword } from "../lib/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../lib/refreshToken.js";
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiry,
} from "../lib/passwordReset.js";
import { toUserDto } from "../dtos/user.dto.js";
import { userRepository } from "../repositories/user.repository.js";
import { refreshTokenRepository } from "../repositories/refreshToken.repository.js";
import { passwordResetRepository } from "../repositories/passwordReset.repository.js";
import { emailService } from "./email.service.js";
import { ALLOWED_EMAIL_DOMAIN } from "../schemas/auth.schema.js";
import { HttpError } from "../utils/http-error.js";

type SessionUser = {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  createdAt: Date;
};

type RegisterInput = {
  name: string;
  surname: string;
  email: string;
  password: string;
  userAgent?: string;
};

type LoginInput = {
  email: string;
  password: string;
  userAgent?: string;
};

class AuthService {
  async register(data: RegisterInput) {
    const email = data.email.trim().toLowerCase();

    if (!isWithinBcryptLimit(data.password)) {
      throw new HttpError(400, "Senha muito longa.");
    }

    const existing = await userRepository.findByEmailWithPassword(email);
    // Já tem senha definida → conta de fato existente.
    if (existing?.passwordHash) {
      throw new HttpError(409, "E-mail já cadastrado.");
    }

    const passwordHash = await hashPassword(data.password);
    const role: Role = env.adminEmails.includes(email) ? "ADMIN" : "USER";
    const name = data.name.trim();
    const surname = data.surname.trim();

    // Conta legada (Fase 1, sem senha) é reivindicada; senão, cria do zero.
    const user = existing
      ? await userRepository.claimAccount(existing.id, { name, surname, passwordHash, role })
      : await userRepository.createWithPassword({ name, surname, email, passwordHash, role });

    return this.issueSession(user, data.userAgent);
  }

  async login(data: LoginInput) {
    const email = data.email.trim().toLowerCase();
    const user = await userRepository.findByEmailWithPassword(email);

    if (!user || !user.passwordHash) {
      throw new HttpError(401, "Credenciais inválidas.");
    }

    const ok = await verifyPassword(data.password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, "Credenciais inválidas.");
    }

    // F3.7 RN1 — conta desativada não loga.
    if (user.disabledAt) {
      throw new HttpError(403, "Esta conta está desativada.");
    }

    return this.issueSession(user, data.userAgent);
  }

  async refresh(rawToken: string | undefined, userAgent?: string) {
    if (!rawToken) {
      throw new HttpError(401, "Sessão inválida.");
    }

    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(rawToken));
    if (!stored) {
      throw new HttpError(401, "Sessão inválida.");
    }

    // Reuso de um token já revogado = possível roubo → derruba todas as sessões.
    if (stored.revokedAt) {
      await refreshTokenRepository.revokeAllForUser(stored.userId);
      throw new HttpError(401, "Sessão inválida.");
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new HttpError(401, "Sessão expirada.");
    }

    const user = await userRepository.findProfileById(stored.userId);
    if (!user) {
      throw new HttpError(401, "Sessão inválida.");
    }

    // F3.7 — conta desativada perde a sessão também na renovação.
    if (user.disabledAt) {
      await refreshTokenRepository.revokeAllForUser(user.id);
      throw new HttpError(403, "Esta conta está desativada.");
    }

    // Rotação: cria o novo refresh e marca o atual como revogado/substituído.
    const newRefresh = await this.createRefresh(user.id, userAgent);
    await refreshTokenRepository.revoke(stored.id, newRefresh.id);

    return this.buildSession(user, newRefresh.rawToken);
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const stored = await refreshTokenRepository.findByHash(hashRefreshToken(rawToken));
    if (stored && !stored.revokedAt) {
      await refreshTokenRepository.revoke(stored.id);
    }
  }

  async me(userId: string) {
    const user = await userRepository.findProfileById(userId);
    if (!user) {
      throw new HttpError(404, "Perfil não encontrado.");
    }
    return toUserDto(user);
  }

  /**
   * F3.4 — troca de senha do próprio usuário. Exige a senha atual e revoga
   * TODAS as outras sessões, preservando a atual (identificada pelo refresh do
   * cookie). Senha atual incorreta → erro genérico (RN2).
   */
  async changePassword(data: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    currentRawRefreshToken?: string;
  }) {
    if (!isWithinBcryptLimit(data.newPassword)) {
      throw new HttpError(400, "Senha muito longa.");
    }

    const user = await userRepository.findByIdWithPassword(data.userId);
    if (!user || !user.passwordHash) {
      throw new HttpError(401, "Não foi possível trocar a senha.");
    }

    const ok = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!ok) {
      // Genérico de propósito (RN2): não revela detalhes.
      throw new HttpError(400, "Não foi possível trocar a senha.");
    }

    const passwordHash = await hashPassword(data.newPassword);
    await userRepository.updatePassword(user.id, passwordHash);

    // Preserva a sessão atual; derruba as demais (DA F3.4: todos menos a atual).
    const current = data.currentRawRefreshToken
      ? await refreshTokenRepository.findByHash(
          hashRefreshToken(data.currentRawRefreshToken),
        )
      : null;

    if (current && current.userId === user.id) {
      await refreshTokenRepository.revokeAllForUserExcept(user.id, current.id);
    } else {
      await refreshTokenRepository.revokeAllForUser(user.id);
    }
  }

  /** F3.6 — encerra todas as sessões do usuário ("sair de todos os dispositivos"). */
  async logoutAll(userId: string) {
    await refreshTokenRepository.revokeAllForUser(userId);
  }

  /**
   * F3.5 — pedido de redefinição. NUNCA revela se o e-mail existe (anti-enumeração
   * RN2): o controller responde sempre 200 genérico. Aqui, só dispara o e-mail se
   * houver conta válida (com senha, ativa) no domínio permitido.
   */
  async forgotPassword(rawEmail: string) {
    const email = rawEmail.trim().toLowerCase();

    // RN5 — só e-mails do domínio permitido (silenciosamente ignora o resto).
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      return;
    }

    const user = await userRepository.findByEmailWithPassword(email);
    // Conta inexistente, sem senha (não reivindicada) ou desativada → não envia.
    if (!user || !user.passwordHash || user.disabledAt) {
      return;
    }

    // Um novo pedido invalida tokens anteriores ainda válidos.
    await passwordResetRepository.invalidateActiveForUser(user.id);

    const rawToken = generateResetToken();
    await passwordResetRepository.create({
      userId: user.id,
      tokenHash: hashResetToken(rawToken),
      expiresAt: resetTokenExpiry(),
    });

    const resetUrl = `${env.appUrl}/redefinir-senha?token=${rawToken}`;
    await emailService.sendPasswordReset({ to: user.email, resetUrl });
  }

  /**
   * F3.5 — consome o token de uso único e define a nova senha. Revoga TODAS as
   * sessões do usuário (RN3). Erros genéricos para não vazar validade do token.
   */
  async resetPassword(rawToken: string, newPassword: string) {
    if (!isWithinBcryptLimit(newPassword)) {
      throw new HttpError(400, "Senha muito longa.");
    }

    const stored = await passwordResetRepository.findByHash(hashResetToken(rawToken));
    if (!stored || stored.usedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, "Link inválido ou expirado. Solicite um novo.");
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(stored.userId, passwordHash);
    await passwordResetRepository.markUsed(stored.id);
    await refreshTokenRepository.revokeAllForUser(stored.userId);
  }

  private async issueSession(user: SessionUser, userAgent?: string) {
    const refresh = await this.createRefresh(user.id, userAgent);
    return this.buildSession(user, refresh.rawToken);
  }

  private buildSession(user: SessionUser, refreshToken: string) {
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
    });
    return { user: toUserDto(user), accessToken, refreshToken };
  }

  private async createRefresh(userId: string, userAgent?: string) {
    const rawToken = generateRefreshToken();
    const record = await refreshTokenRepository.create({
      userId,
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: refreshTokenExpiry(),
      userAgent,
    });
    return { id: record.id, rawToken };
  }
}

export const authService = new AuthService();
