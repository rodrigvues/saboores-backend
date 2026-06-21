import { hashPassword, isWithinBcryptLimit } from "../lib/password.js";
import { toAdminUserDto } from "../dtos/adminUser.dto.js";
import { userRepository } from "../repositories/user.repository.js";
import { refreshTokenRepository } from "../repositories/refreshToken.repository.js";
import { auditService, AuditAction } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";

class UserService {
  /** F3.2 — lista paginada (sem ADMINs, sem dados sensíveis). */
  async list(params: { search?: string; page: number; pageSize: number }) {
    const { data, total } = await userRepository.findManyPaged({
      search: params.search,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    });

    return {
      data: data.map(toAdminUserDto),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  /**
   * F3.2 — reset de senha pelo admin (sem senha anterior/token). Revoga todas as
   * sessões do alvo (política de invalidação) e audita. Não atua sobre ADMINs.
   */
  async resetPassword(params: {
    actorId: string;
    targetUserId: string;
    newPassword: string;
  }) {
    if (!isWithinBcryptLimit(params.newPassword)) {
      throw new HttpError(400, "Senha muito longa.");
    }

    const target = await this.requireNonAdminTarget(params.targetUserId);

    const passwordHash = await hashPassword(params.newPassword);
    await userRepository.updatePassword(target.id, passwordHash);
    await refreshTokenRepository.revokeAllForUser(target.id);

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.USER_PASSWORD_RESET,
      targetId: target.id,
    });
  }

  /**
   * F3.2/F3.7 — ativa/desativa conta (soft). Desativar revoga sessões e impede
   * login. Não atua sobre ADMINs (evita lockout do último admin — RN3). Audita.
   */
  async setStatus(params: {
    actorId: string;
    targetUserId: string;
    active: boolean;
  }) {
    const target = await this.requireNonAdminTarget(params.targetUserId);

    const wasActive = target.disabledAt === null;
    if (wasActive === params.active) {
      // Idempotente: já está no estado desejado.
      return;
    }

    const disabledAt = params.active ? null : new Date();
    await userRepository.setDisabledAt(target.id, disabledAt);

    if (!params.active) {
      // Desativou: derruba todas as sessões ativas (F3.7 RN1).
      await refreshTokenRepository.revokeAllForUser(target.id);
    }

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.USER_STATUS_CHANGE,
      targetId: target.id,
      metadata: { from: wasActive ? "active" : "disabled", to: params.active ? "active" : "disabled" },
    });
  }

  /** Carrega o alvo e garante que não é ADMIN (ações do diretório não tocam admins). */
  private async requireNonAdminTarget(targetUserId: string) {
    const target = await userRepository.findByIdForAdmin(targetUserId);
    if (!target) {
      throw new HttpError(404, "Usuário não encontrado.");
    }
    if (target.role === "ADMIN") {
      throw new HttpError(403, "Esta ação não pode ser aplicada a um administrador.");
    }
    return target;
  }
}

export const userService = new UserService();
