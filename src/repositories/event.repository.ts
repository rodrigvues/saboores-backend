import type { EventKind, EventStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Projeção enxuta usada nas listagens (rodadas disponíveis / geridas). */
const listSelect = {
  id: true,
  name: true,
  startsAt: true,
  endsAt: true,
  status: true,
  kind: true,
  // Pizza: base p/ a estimativa "≈ R$ X/pessoa" no card (RP7). Null no STANDARD.
  slicesPerPizza: true,
  avgLargePizzaPrice: true,
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
  kind: true,
  // Config do racha (null no STANDARD).
  maxFlavorsPerOrder: true,
  slicesPerPizza: true,
  avgLargePizzaPrice: true,
  pixKey: true,
  pixQrUrl: true,
  // Encomenda — taxa de serviço (null/false no racha).
  hasServiceFee: true,
  serviceFeePercent: true,
  actualTotalCost: true,
  costEvidenceUrl: true,
  costRegisteredAt: true,
  choicesLockedAt: true,
  type: {
    select: {
      id: true,
      name: true,
      description: true,
      items: {
        where: { active: true },
        // Níveis (b) e (c) da ordenação; o nível (a) é aplicado no service.
        orderBy: [{ orderCount: "desc" }, { name: "asc" }],
        select: { id: true, name: true, price: true, active: true, orderCount: true },
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
    typeId: string | null;
    kind?: EventKind;
    startsAt: Date;
    endsAt: Date;
    status?: EventStatus;
    createdByUserId: string;
    maxFlavorsPerOrder?: number | null;
    slicesPerPizza?: number | null;
    avgLargePizzaPrice?: number | null;
    pixKey?: string | null;
    pixQrUrl?: string | null;
    hasServiceFee?: boolean;
    serviceFeePercent?: number | null;
    tx?: Tx;
  }) {
    const client = data.tx ?? prisma;
    return client.event.create({
      data: {
        name: data.name,
        typeId: data.typeId,
        ...(data.kind ? { kind: data.kind } : {}),
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        ...(data.status ? { status: data.status } : {}),
        createdByUserId: data.createdByUserId,
        maxFlavorsPerOrder: data.maxFlavorsPerOrder ?? null,
        slicesPerPizza: data.slicesPerPizza ?? null,
        avgLargePizzaPrice: data.avgLargePizzaPrice ?? null,
        pixKey: data.pixKey ?? null,
        pixQrUrl: data.pixQrUrl ?? null,
        hasServiceFee: data.hasServiceFee ?? false,
        serviceFeePercent: data.serviceFeePercent ?? null,
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
      maxFlavorsPerOrder?: number;
      slicesPerPizza?: number;
      avgLargePizzaPrice?: number;
      pixKey?: string;
      pixQrUrl?: string;
      hasServiceFee?: boolean;
      serviceFeePercent?: number | null;
    },
  ) {
    return prisma.event.update({ where: { id }, data, select: detailSelect });
  }

  /** Janela/status/modo para validar edição (datas coerentes, ciclo de vida). */
  async findForUpdate(id: string) {
    return prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        kind: true,
        costRegisteredAt: true,
        choicesLockedAt: true,
      },
    });
  }

  /** RP9 — fecha as escolhas (trava novas participações/edições). */
  async lockChoices(id: string) {
    return prisma.event.update({
      where: { id },
      data: { choicesLockedAt: new Date() },
      select: detailSelect,
    });
  }

  /** Racha — núcleo enxuto p/ custo/rateio (sem carregar itens do Type). */
  async findPizzaCore(id: string) {
    return prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        kind: true,
        slicesPerPizza: true,
        avgLargePizzaPrice: true,
        costRegisteredAt: true,
        actualTotalCost: true,
        createdByUserId: true,
        pixKey: true,
        pixQrUrl: true,
        costEvidenceUrl: true,
        choicesLockedAt: true,
      },
    });
  }

  /** RP9/RP10 — grava o custo real (+ evidência) numa transação com o rateio. */
  async registerCost(
    id: string,
    data: { actualTotalCost: number; costEvidenceUrl?: string | null },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? prisma;
    return client.event.update({
      where: { id },
      data: {
        actualTotalCost: data.actualTotalCost,
        costRegisteredAt: new Date(),
        ...(data.costEvidenceUrl ? { costEvidenceUrl: data.costEvidenceUrl } : {}),
      },
      select: { id: true },
    });
  }
}

export const eventRepository = new EventRepository();
