import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient | PrismaClient;

const flavorSelect = {
  id: true,
  name: true,
  isSweet: true,
  eventId: true,
  active: true,
} satisfies Prisma.FlavorSelect;

class FlavorRepository {
  /** Sabores válidos para um evento: globais (`eventId = null`) + extras do evento. */
  async findForEvent(eventId: string) {
    return prisma.flavor.findMany({
      where: { active: true, OR: [{ eventId: null }, { eventId }] },
      orderBy: [{ isSweet: "asc" }, { name: "asc" }],
      select: flavorSelect,
    });
  }

  /**
   * Sabores que o usuário pode gerir: globais + sabores de eventos que ele cuida
   * (join `Flavor.eventId → Event.organizers`). ADMIN vê todos.
   */
  async findManageableBy(params: { userId: string; isAdmin: boolean }) {
    return prisma.flavor.findMany({
      where: {
        active: true,
        ...(params.isAdmin
          ? {}
          : {
              OR: [
                { eventId: null },
                { event: { organizers: { some: { userId: params.userId } } } },
              ],
            }),
      },
      orderBy: [{ isSweet: "asc" }, { name: "asc" }],
      select: flavorSelect,
    });
  }

  /**
   * Nomes ativos que ocupam o "namespace" de um escopo, para barrar duplicatas:
   * globais (`eventId = null`) e, se houver evento, também seus extras.
   */
  async findActiveNames(params: { eventId: string | null; tx?: Tx }) {
    const client = params.tx ?? prisma;
    return client.flavor.findMany({
      where: {
        active: true,
        OR: params.eventId
          ? [{ eventId: null }, { eventId: params.eventId }]
          : [{ eventId: null }],
      },
      select: { name: true },
    });
  }

  /** Verifica que todos os ids existem e são válidos para o evento (globais+extras). */
  async findValidForEvent(eventId: string, ids: string[]) {
    return prisma.flavor.findMany({
      where: {
        id: { in: ids },
        active: true,
        OR: [{ eventId: null }, { eventId }],
      },
      select: { id: true, isSweet: true },
    });
  }

  async findById(id: string) {
    return prisma.flavor.findUnique({ where: { id }, select: flavorSelect });
  }

  async create(data: {
    name: string;
    isSweet: boolean;
    eventId: string | null;
    createdByUserId: string;
    tx?: Tx;
  }) {
    const client = data.tx ?? prisma;
    return client.flavor.create({
      data: {
        name: data.name,
        isSweet: data.isSweet,
        eventId: data.eventId,
        createdByUserId: data.createdByUserId,
      },
      select: flavorSelect,
    });
  }

  async update(
    id: string,
    data: { name?: string; isSweet?: boolean; active?: boolean },
  ) {
    return prisma.flavor.update({ where: { id }, data, select: flavorSelect });
  }
}

export const flavorRepository = new FlavorRepository();
