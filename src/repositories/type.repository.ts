import { Prisma, type PrismaClient } from "@prisma/client"; // Prisma.join é valor
import { prisma } from "../lib/prisma.js";
import { ACTIVE_PARTICIPATION_STATUSES } from "../constants/order.js";

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
   * Recalcula `Item.orderCount` de um tipo a partir da fonte da verdade
   * (OrderItem). Auto-curativa: zera item sem pedido e conserta desvio antigo.
   */
  async recomputeItemOrderCounts(typeId: string, tx?: Tx) {
    const client = tx ?? prisma;
    // `status::text` porque o parâmetro chega como texto e o Postgres não
    // compara enum com texto sem cast explícito.
    return client.$executeRaw`
      UPDATE "Item" AS i
      SET "orderCount" = agg.total
      FROM (
        SELECT it."id" AS "itemId",
               COALESCE(
                 SUM(oi."quantity") FILTER (
                   WHERE o."status"::text IN (${Prisma.join(ACTIVE_PARTICIPATION_STATUSES)})
                 ),
                 0
               )::int AS total
        FROM "Item" it
        LEFT JOIN "OrderItem" oi ON oi."itemId" = it."id"
        LEFT JOIN "Order" o ON o."id" = oi."orderId"
        WHERE it."typeId" = ${typeId}
        GROUP BY it."id"
      ) AS agg
      WHERE agg."itemId" = i."id" AND i."orderCount" IS DISTINCT FROM agg.total
    `;
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
