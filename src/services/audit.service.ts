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
  EVENT_CREATE: "EVENT_CREATE",
  EVENT_UPDATE: "EVENT_UPDATE",
  TYPE_CREATE: "TYPE_CREATE",
  TYPE_UPDATE: "TYPE_UPDATE",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  EVENT_CHOICES_LOCKED: "EVENT_CHOICES_LOCKED",
  EVENT_COST_REGISTERED: "EVENT_COST_REGISTERED",
  EVENT_SERVICE_FEE_MIGRATED: "EVENT_SERVICE_FEE_MIGRATED",
  EVENT_GOAL_SET: "EVENT_GOAL_SET",
  EVENT_GOAL_REMOVED: "EVENT_GOAL_REMOVED",
  EVENT_GOAL_REACHED: "EVENT_GOAL_REACHED",
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
