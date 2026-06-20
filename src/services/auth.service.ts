import type { Role } from "@prisma/client";
import { env } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, isWithinBcryptLimit, verifyPassword } from "../lib/password.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../lib/refreshToken.js";
import { toUserDto } from "../dtos/user.dto.js";
import { userRepository } from "../repositories/user.repository.js";
import { refreshTokenRepository } from "../repositories/refreshToken.repository.js";
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
