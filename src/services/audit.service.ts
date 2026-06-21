import type { Prisma } from "@prisma/client";
import { auditRepository } from "../repositories/audit.repository.js";

/**
 * Ações auditadas (F3.1 RN10 / F3.2 / F3.7). Strings estáveis — não renomear
 * sem migrar registros existentes.
 */
export const AuditAction = {
  EVENT_ORGANIZER_INVITE: "EVENT_ORGANIZER_INVITE",
  EVENT_ORGANIZER_REMOVE: "EVENT_ORGANIZER_REMOVE",
  USER_STATUS_CHANGE: "USER_STATUS_CHANGE",
  USER_PASSWORD_RESET: "USER_PASSWORD_RESET",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

type LogInput = {
  actorId: string;
  action: AuditAction;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

class AuditService {
  /**
   * Registra uma ação sensível. Best-effort: uma falha de auditoria não deve
   * derrubar a operação de negócio que já aconteceu — apenas loga no servidor.
   */
  async log(input: LogInput) {
    try {
      await auditRepository.create(input);
    } catch (error) {
      console.error("[audit] falha ao registrar ação", input.action, error);
    }
  }
}

export const auditService = new AuditService();
