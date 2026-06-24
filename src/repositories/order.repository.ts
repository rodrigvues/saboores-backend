import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ACTIVE_PARTICIPATION_STATUSES } from "../constants/order.js";

class OrderRepository {
  async findEventForOrder(eventId: string) {
    return prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        name: true,
        typeId: true,
        status: true,
        maxItemsPerOrder: true,
      },
    });
  }

  async findEventSummaryById(eventId: string) {
    return prisma.event.findUnique({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });
  }

  async findActiveItemsByIds(itemIds: string[]) {
    return prisma.item.findMany({
      where: {
        id: {
          in: itemIds,
        },
        active: true,
      },
      select: {
        id: true,
        typeId: true,
        name: true,
        price: true,
      },
    });
  }

  async create(data: {
    userId: string;
    eventId: string;
    items: {
      itemId: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }[];
  }) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: data.userId,
          eventId: data.eventId,
          orderItems: {
            create: data.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          },
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
            },
          },
          orderItems: {
            select: {
              quantity: true,
              unitPrice: true,
              item: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return order;
    });
  }

  async findManyByUserId(userId: string) {
    return prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        },
        orderItems: {
          select: {
            quantity: true,
            unitPrice: true,
            item: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findByIdForCancel(id: string) {
    return prisma.order.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        cancelledAt: true,
        event: {
          select: {
            status: true,
          },
        },
      },
    });
  }

  async cancel(id: string) {
    return prisma.order.update({
      where: {
        id,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        cancelledAt: true,
      },
    });
  }

  /**
   * F4.2 — participantes de um evento (quem pediu). Considera participação ativa
   * (PENDING/CONFIRMED/DELIVERED; exclui cancelados/expirados). Distinto por usuário.
   */
  async findParticipantsByEventId(eventId: string) {
    return prisma.order.findMany({
      where: { eventId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      distinct: ["userId"],
      orderBy: { createdAt: "asc" },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async findManyByEventId(eventId: string) {
    return prisma.order.findMany({
      where: {
        eventId,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
          },
        },
        orderItems: {
          select: {
            quantity: true,
            unitPrice: true,
            item: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findByIdForPayment(id: string) {
    return prisma.order.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        confirmedAt: true,
      },
    });
  }

  async confirmPayment(id: string) {
    return prisma.order.update({
      where: {
        id,
      },
      data: {
        status: "CONFIRMED",
        paymentStatus: "PAID",
        confirmedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        confirmedAt: true,
      },
    });
  }

  /** Resolve o evento de um pedido — base do `requireOrderEventAccess`. */
  async findEventIdById(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      select: { eventId: true },
    });
    return order?.eventId ?? null;
  }

  /** Parte 2 — marca o pedido como entregue. */
  async deliver(id: string) {
    return prisma.order.update({
      where: { id },
      data: { status: "DELIVERED", deliveredAt: new Date() },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        deliveredAt: true,
      },
    });
  }

  /** Parte 2 — dados do pedido para montar e-mails de notificação. */
  async findByIdWithDetails(id: string) {
    return prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        user: { select: { name: true, email: true } },
        event: { select: { id: true, name: true } },
        orderItems: {
          select: {
            quantity: true,
            unitPrice: true,
            item: { select: { name: true } },
          },
        },
      },
    });
  }
}

export const orderRepository = new OrderRepository();
