import { prisma } from "../lib/prisma.js";
import { VALID_ORDER_STATUSES } from "../constants/order.js";

type ValidOrderRowsParams = {
  userId?: string;
  /** Inclusivo. */
  from?: Date;
  /** EXCLUSIVO (RN-2). */
  to?: Date;
};

class StatsRepository {
  /**
   * Linhas de pedidos VÁLIDOS (CONFIRMED ou DELIVERED) — base de
   * estatísticas/ranking (F4.3 RN2). Opcionalmente de um único usuário e/ou
   * dentro de uma janela de tempo (`from` inclusivo, `to` exclusivo — RN-2).
   */
  async validOrderRows(params: ValidOrderRowsParams = {}) {
    const { userId, from, to } = params;
    return prisma.order.findMany({
      where: {
        status: { in: VALID_ORDER_STATUSES },
        ...(userId ? { userId } : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
      },
      select: {
        userId: true,
        eventId: true,
        createdAt: true,
        orderItems: { select: { quantity: true } },
      },
    });
  }

  /**
   * Frente 5 — lucro elegível ao prêmio (RN-15): taxa de serviço de pedidos
   * pagos, em rodadas de encomenda criadas pela conta dona do projeto.
   */
  async sumServiceFeeForPrize(params: { since: Date; ownerEmail: string }) {
    const result = await prisma.order.aggregate({
      _sum: { serviceFee: true },
      where: {
        status: { in: VALID_ORDER_STATUSES },
        paymentStatus: "PAID",
        createdAt: { gte: params.since },
        event: {
          kind: "STANDARD",
          createdByUser: {
            email: { equals: params.ownerEmail, mode: "insensitive" },
          },
        },
      },
    });
    return result._sum.serviceFee; // Prisma.Decimal | null — converta no service.
  }
}

export const statsRepository = new StatsRepository();
