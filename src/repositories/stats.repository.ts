import { prisma } from "../lib/prisma.js";
import { VALID_ORDER_STATUSES } from "../constants/order.js";

class StatsRepository {
  /**
   * Linhas de pedidos VÁLIDOS (CONFIRMED ou DELIVERED) — base de
   * estatísticas/ranking (F4.3 RN2: apenas pedidos válidos). Opcionalmente de um
   * único usuário.
   */
  async validOrderRows(userId?: string) {
    return prisma.order.findMany({
      where: {
        status: { in: VALID_ORDER_STATUSES },
        ...(userId ? { userId } : {}),
      },
      select: {
        userId: true,
        eventId: true,
        orderItems: { select: { quantity: true } },
      },
    });
  }
}

export const statsRepository = new StatsRepository();
