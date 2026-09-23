import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ACTIVE_PARTICIPATION_STATUSES } from "../constants/order.js";

/** Participação no racha com votos e respostas (resposta do create/edit). */
const pizzaParticipationInclude = {
  event: { select: { id: true, name: true } },
  flavorVotes: {
    select: { flavor: { select: { id: true, name: true, isSweet: true } } },
  },
  preferences: {
    select: {
      questionId: true,
      answer: true,
      question: { select: { key: true, text: true } },
    },
  },
} satisfies Prisma.OrderInclude;

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
        kind: true,
        status: true,
        maxItemsPerOrder: true,
        maxFlavorsPerOrder: true,
        slicesPerPizza: true,
        avgLargePizzaPrice: true,
        choicesLockedAt: true,
        createdByUserId: true,
        // Encomenda — taxa de serviço a "congelar" no pedido.
        hasServiceFee: true,
        serviceFeePercent: true,
      },
    });
  }

  /** Racha — participação ativa do usuário neste evento (entrada única). */
  async findUserParticipation(eventId: string, userId: string) {
    return prisma.order.findFirst({
      where: { eventId, userId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      select: { id: true, createdAt: true, status: true },
    });
  }

  /** Racha — participação do usuário com votos/respostas (tela de participação). */
  async findUserParticipationDetail(eventId: string, userId: string) {
    return prisma.order.findFirst({
      where: { eventId, userId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      include: pizzaParticipationInclude,
    });
  }

  /** Racha — cria a participação (votos + fatias + respostas) numa transação. */
  async createParticipation(data: {
    userId: string;
    eventId: string;
    slicesWanted: number;
    flavorIds: string[];
    answers: { questionId: string; answer: boolean }[];
  }) {
    return prisma.order.create({
      data: {
        userId: data.userId,
        eventId: data.eventId,
        slicesWanted: data.slicesWanted,
        flavorVotes: {
          create: data.flavorIds.map((flavorId) => ({ flavorId })),
        },
        preferences: {
          create: data.answers.map((answer) => ({
            questionId: answer.questionId,
            answer: answer.answer,
          })),
        },
      },
      include: pizzaParticipationInclude,
    });
  }

  /** Racha — dados para validar a edição (dono + janela + estado do evento). */
  async findParticipationForEdit(id: string) {
    return prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
        event: {
          select: {
            id: true,
            status: true,
            kind: true,
            maxFlavorsPerOrder: true,
            maxItemsPerOrder: true,
            slicesPerPizza: true,
            avgLargePizzaPrice: true,
            choicesLockedAt: true,
          },
        },
      },
    });
  }

  /** Racha — substitui votos/respostas e atualiza fatias (full replace). */
  async updateParticipation(
    id: string,
    data: {
      slicesWanted: number;
      flavorIds: string[];
      answers: { questionId: string; answer: boolean }[];
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.orderFlavor.deleteMany({ where: { orderId: id } });
      await tx.orderPreference.deleteMany({ where: { orderId: id } });
      return tx.order.update({
        where: { id },
        data: {
          slicesWanted: data.slicesWanted,
          flavorVotes: {
            create: data.flavorIds.map((flavorId) => ({ flavorId })),
          },
          preferences: {
            create: data.answers.map((answer) => ({
              questionId: answer.questionId,
              answer: answer.answer,
            })),
          },
        },
        include: pizzaParticipationInclude,
      });
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
        kind: true,
        startsAt: true,
        endsAt: true,
      },
    });
  }

  /**
   * Racha — agrega participação válida por evento (nº de pessoas + total de
   * fatias). Base da estimativa "≈ R$ X/pessoa" no card (RP7), em 1 consulta.
   */
  async aggregateParticipationByEvents(eventIds: string[]) {
    const rows = await prisma.order.groupBy({
      by: ["eventId"],
      where: {
        eventId: { in: eventIds },
        status: { in: ACTIVE_PARTICIPATION_STATUSES },
      },
      _count: { _all: true },
      _sum: { slicesWanted: true },
    });
    return rows.map((row) => ({
      eventId: row.eventId,
      participants: row._count._all,
      totalSlices: row._sum.slicesWanted ?? 0,
    }));
  }

  /**
   * Unidades que UM usuário já pediu de cada item, em 1 consulta. Base do 1º
   * nível da ordenação do catálogo da rodada.
   */
  async aggregateUserItemQuantities(params: { userId: string; itemIds: string[] }) {
    if (params.itemIds.length === 0) return [];

    const rows = await prisma.orderItem.groupBy({
      by: ["itemId"],
      where: {
        itemId: { in: params.itemIds },
        order: {
          userId: params.userId,
          status: { in: ACTIVE_PARTICIPATION_STATUSES },
        },
      },
      _sum: { quantity: true },
    });

    return rows.map((row) => ({ itemId: row.itemId, quantity: row._sum.quantity ?? 0 }));
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

  async create(
    data: {
      userId: string;
      eventId: string;
      /** Snapshot da taxa de serviço da rodada em reais (null = sem taxa). */
      serviceFee: Prisma.Decimal | null;
      /** Snapshot do percentual aplicado (só rótulo do recibo; null = sem taxa). */
      serviceFeePercent: Prisma.Decimal | null;
      /** Snapshot: este pedido compõe a meta da rodada? */
      countsTowardGoal: boolean;
      items: {
        itemId: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
      }[];
    },
    // A transação passa a ser do service (decisão travada 10); sem `tx` o
    // `create` com `orderItems.create` já é atômico por si só.
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? prisma;
    return client.order.create({
      data: {
        userId: data.userId,
        eventId: data.eventId,
        serviceFee: data.serviceFee,
        serviceFeePercent: data.serviceFeePercent,
        countsTowardGoal: data.countsTowardGoal,
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
            kind: true,
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
            kind: true,
          },
        },
      },
    });
  }

  /**
   * Racha — participações válidas com votos, respostas e valor devido. Base do
   * dashboard (RP6), do rateio (RP10) e das pendências/PIX (RP11).
   */
  async findValidParticipationsForEvent(eventId: string) {
    return prisma.order.findMany({
      where: { eventId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        slicesWanted: true,
        amountDue: true,
        user: { select: { id: true, name: true, surname: true, email: true } },
        flavorVotes: {
          select: { flavor: { select: { id: true, name: true, isSweet: true } } },
        },
        preferences: { select: { questionId: true, answer: true } },
      },
    });
  }

  /** Racha — grava o `amountDue` (snapshot do rateio) de várias participações. */
  async setAmountDues(
    updates: { orderId: string; amountDue: Prisma.Decimal }[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? prisma;
    for (const update of updates) {
      await client.order.update({
        where: { id: update.orderId },
        data: { amountDue: update.amountDue },
      });
    }
  }

  /** Racha — dados para o cancelamento pelo organizador (RP11) + recálculo. */
  async findByIdForOrganizerCancel(id: string) {
    return prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        event: {
          select: {
            id: true,
            kind: true,
            costRegisteredAt: true,
            actualTotalCost: true,
            createdByUserId: true,
          },
        },
      },
    });
  }

  async cancel(id: string, tx?: Prisma.TransactionClient) {
    // O cancelamento do racha geral roda DENTRO do lock (RN-22); os chamadores
    // atuais não passam `tx` e não mudam.
    const client = tx ?? prisma;
    return client.order.update({
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
        serviceFee: true,
        serviceFeePercent: true,
        amountDueCents: true,
        user: { select: { name: true, email: true } },
        event: {
          select: {
            id: true,
            name: true,
            kind: true,
            generalSplit: { select: { purchaseName: true } },
          },
        },
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
