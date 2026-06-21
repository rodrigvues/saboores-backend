import { prisma } from "../lib/prisma.js";

class StatsRepository {
  /**
   * Linhas de pedidos CONFIRMADOS — base de estatísticas/ranking (F4.3 RN2:
   * apenas pedidos válidos). Opcionalmente de um único usuário.
   */
  async confirmedOrderRows(userId?: string) {
    return prisma.order.findMany({
      where: { status: "CONFIRMED", ...(userId ? { userId } : {}) },
      select: {
        userId: true,
        eventId: true,
        orderItems: { select: { quantity: true } },
      },
    });
  }
}

export const statsRepository = new StatsRepository();
