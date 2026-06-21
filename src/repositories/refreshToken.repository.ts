import { prisma } from "../lib/prisma.js";

class RefreshTokenRepository {
  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string;
  }) {
    return prisma.refreshToken.create({ data });
  }

  async findByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revoke(id: string, replacedByTokenId?: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        ...(replacedByTokenId ? { replacedByTokenId } : {}),
      },
    });
  }

  /** Derruba todas as sessões ativas do usuário (logout-all / reuso detectado). */
  async revokeAllForUser(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Derruba todas as sessões ativas do usuário EXCETO uma (F3.4: trocar senha
   * mantém a sessão atual e revoga as demais).
   */
  async revokeAllForUserExcept(userId: string, exceptId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, id: { not: exceptId } },
      data: { revokedAt: new Date() },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
