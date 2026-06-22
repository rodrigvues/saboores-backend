import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type Tx = Prisma.TransactionClient | PrismaClient;

type ItemInput = {
  id?: string;
  name: string;
  price: number;
  active?: boolean;
};

class TypeRepository {
  /** Tipos ativos (para o picker / gestão). `ownerId` filtra "meus tipos". */
  async findManyActive(ownerId?: string) {
    return prisma.type.findMany({
      where: { active: true, ...(ownerId ? { createdByUserId: ownerId } : {}) },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        createdByUserId: true,
        _count: { select: { items: { where: { active: true } } } },
      },
    });
  }

  /** Dados mínimos para o middleware de posse (requireTypeOwner) e validação. */
  async findOwnership(id: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.type.findUnique({
      where: { id },
      select: { id: true, createdByUserId: true, active: true },
    });
  }

  /**
   * Tipo + itens. `includeInactive` traz também itens desativados (para o dono
   * editar); o picker público vê apenas itens ativos.
   */
  async findByIdWithItems(id: string, includeInactive: boolean) {
    return prisma.type.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        createdByUserId: true,
        items: {
          where: includeInactive ? {} : { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, price: true, active: true },
        },
      },
    });
  }

  async create(data: {
    name: string;
    description?: string | null;
    createdByUserId: string;
    items: ItemInput[];
    tx?: Tx;
  }) {
    const client = data.tx ?? prisma;
    return client.type.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        createdByUserId: data.createdByUserId,
        items: {
          create: data.items.map((item) => ({
            name: item.name,
            price: item.price,
            active: item.active ?? true,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        createdByUserId: true,
        items: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, price: true, active: true },
        },
      },
    });
  }

  /**
   * Edita o tipo e faz upsert dos itens numa transação:
   * - item com `id` existente → update;
   * - item sem `id` → create;
   * - item existente ausente do payload → active=false (soft-remove), pois há
   *   `OrderItem` referenciando-o.
   */
  async updateWithItems(
    id: string,
    data: { name?: string; description?: string | null; items: ItemInput[] },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.type.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined
            ? { description: data.description }
            : {}),
        },
      });

      const existing = await tx.item.findMany({
        where: { typeId: id },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((i) => i.id));
      const keptIds = new Set<string>();

      for (const item of data.items) {
        if (item.id && existingIds.has(item.id)) {
          keptIds.add(item.id);
          await tx.item.update({
            where: { id: item.id },
            data: {
              name: item.name,
              price: item.price,
              active: item.active ?? true,
            },
          });
        } else {
          const created = await tx.item.create({
            data: {
              typeId: id,
              name: item.name,
              price: item.price,
              active: item.active ?? true,
            },
            select: { id: true },
          });
          keptIds.add(created.id);
        }
      }

      const toDeactivate = [...existingIds].filter((eid) => !keptIds.has(eid));
      if (toDeactivate.length > 0) {
        await tx.item.updateMany({
          where: { id: { in: toDeactivate } },
          data: { active: false },
        });
      }

      return tx.type.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          description: true,
          active: true,
          createdByUserId: true,
          items: {
            orderBy: { name: "asc" },
            select: { id: true, name: true, price: true, active: true },
          },
        },
      });
    });
  }
}

export const typeRepository = new TypeRepository();
