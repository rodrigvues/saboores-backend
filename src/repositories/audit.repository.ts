import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

class AuditRepository {
  async create(data: {
    actorId: string;
    action: string;
    targetId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        targetId: data.targetId ?? null,
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  }
}

export const auditRepository = new AuditRepository();
