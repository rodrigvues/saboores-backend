import { prisma } from "../lib/prisma.js";

class RankingSeasonRepository {
  async findByPeriod(period: string) {
    return prisma.rankingSeason.findUnique({ where: { period } });
  }

  async create(data: {
    period: string;
    closedAt: Date;
    championUserId: string | null;
    championDisplayName: string | null;
    championAvatarUrl: string | null;
    championPoints: number;
    participants: number;
    prizeAmountCents: number | null;
  }) {
    return prisma.rankingSeason.create({ data });
  }

  /** Quantas vezes o usuário foi campeão (badge do perfil). */
  async countTitles(userId: string) {
    return prisma.rankingSeason.count({ where: { championUserId: userId } });
  }
}

export const rankingSeasonRepository = new RankingSeasonRepository();
