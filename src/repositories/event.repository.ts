import type { EventStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Projeção enxuta usada nas listagens (rodadas disponíveis / geridas). */
const listSelect = {
  id: true,
  name: true,
  startsAt: true,
  endsAt: true,
  status: true,
  type: { select: { id: true, name: true, description: true } },
} satisfies Prisma.EventSelect;

/** Projeção completa usada no detalhe (com itens ativos e criador). */
const detailSelect = {
  id: true,
  name: true,
  startsAt: true,
  endsAt: true,
  status: true,
  createdAt: true,
  maxItemsPerOrder: true,
  type: {
    select: {
      id: true,
      name: true,
      description: true,
      items: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, price: true, active: true },
      },
    },
  },
  createdByUser: { select: { id: true, name: true, surname: true } },
} satisfies Prisma.EventSelect;

class EventRepository {
  async findMany() {
    return prisma.event.findMany({
      orderBy: { startsAt: "asc" },
      select: listSelect,
    });
  }

  /** Rodadas que o usuário pode gerenciar: ADMIN vê todas; ORGANIZER as vinculadas. */
  async findManagedBy(params: { userId: string; isAdmin: boolean }) {
    return prisma.event.findMany({
      where: params.isAdmin
        ? {}
        : { organizers: { some: { userId: params.userId } } },
      orderBy: { startsAt: "desc" },
      select: listSelect,
    });
  }

  async existsById(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });
    return event !== null;
  }

  async findById(id: string) {
    return prisma.event.findUnique({ where: { id }, select: detailSelect });
  }

  async create(data: {
    name: string;
    typeId: string;
    startsAt: Date;
    endsAt: Date;
    status?: EventStatus;
    createdByUserId: string;
    tx?: Tx;
  }) {
    const client = data.tx ?? prisma;
    return client.event.create({
      data: {
        name: data.name,
        typeId: data.typeId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        ...(data.status ? { status: data.status } : {}),
        createdByUserId: data.createdByUserId,
      },
      select: detailSelect,
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      startsAt?: Date;
      endsAt?: Date;
      status?: EventStatus;
    },
  ) {
    return prisma.event.update({ where: { id }, data, select: detailSelect });
  }

  /** Janela/status para validar edição (datas coerentes). */
  async findForUpdate(id: string) {
    return prisma.event.findUnique({
      where: { id },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    });
  }
}

export const eventRepository = new EventRepository();
