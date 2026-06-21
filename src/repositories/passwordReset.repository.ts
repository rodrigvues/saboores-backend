import { prisma } from "../lib/prisma.js";

class PasswordResetRepository {
  async create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.passwordResetToken.create({ data, select: { id: true } });
  }

  async findByHash(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  async markUsed(id: string) {
    return prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
      select: { id: true },
    });
  }

  /** Invalida tokens ativos anteriores do usuário (um novo pedido cancela os antigos). */
  async invalidateActiveForUser(userId: string) {
    return prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}

export const passwordResetRepository = new PasswordResetRepository();
