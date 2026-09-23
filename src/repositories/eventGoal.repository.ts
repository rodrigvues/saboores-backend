import { Prisma } from "@prisma/client"; // import de VALOR: precisa de Prisma.join
import { prisma } from "../lib/prisma.js";
import { ACTIVE_PARTICIPATION_STATUSES } from "../constants/order.js";

type Tx = Prisma.TransactionClient;

class EventGoalRepository {
  /**
   * Soma o subtotal dos itens que compõem a meta, por evento, em UMA query.
   * O groupBy do Prisma não expressa o join Order -> OrderItem; por isso raw.
   */
  async sumProgressByEvents(eventIds: string[], tx?: Tx) {
    if (eventIds.length === 0) return [];
    const client = tx ?? prisma;
    const rows = await client.$queryRaw<{ eventId: string; raisedCents: bigint }[]>`
      SELECT o."eventId" AS "eventId",
             COALESCE(SUM(ROUND(oi."unitPrice" * 100) * oi."quantity"), 0)::bigint AS "raisedCents"
        FROM "Order" o
        JOIN "OrderItem" oi ON oi."orderId" = o."id"
       WHERE o."eventId" IN (${Prisma.join(eventIds)})
         AND o."countsTowardGoal" = true
         AND o."status"::text IN (${Prisma.join(ACTIVE_PARTICIPATION_STATUSES)})
       GROUP BY o."eventId"`;
    return rows.map((row) => ({
      eventId: row.eventId,
      raisedCents: Number(row.raisedCents),
    }));
  }

  /**
   * Trava a rodada. A meta pode estar sendo criada agora pelo PATCH, e `FOR UPDATE`
   * não trava uma linha de EventGoal que ainda não existe.
   */
  async lockEvent(eventId: string, tx: Tx) {
    await tx.$executeRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
  }

  /** Trava a linha da meta: serializa pedidos simultâneos da mesma rodada. */
  async lockForUpdate(eventId: string, tx: Tx) {
    const rows = await tx.$queryRaw<
      { id: string; name: string; targetAmountCents: number; reachedAt: Date | null }[]
    >`SELECT "id", "name", "targetAmountCents", "reachedAt"
        FROM "EventGoal" WHERE "eventId" = ${eventId} FOR UPDATE`;
    return rows[0] ?? null;
  }

  /** Condicional: só a primeira transação a cruzar o alvo afeta 1 linha. */
  async markReached(eventId: string, tx: Tx): Promise<boolean> {
    const affected = await tx.$executeRaw`
      UPDATE "EventGoal"
         SET "reachedAt" = NOW(), "version" = "version" + 1
       WHERE "eventId" = ${eventId} AND "reachedAt" IS NULL`;
    return affected === 1;
  }

  async findByEventId(eventId: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.eventGoal.findUnique({ where: { eventId } });
  }

  async create(data: { eventId: string; name: string; targetAmountCents: number }, tx?: Tx) {
    const client = tx ?? prisma;
    return client.eventGoal.create({ data });
  }

  /** Editar alvo/nome incrementa `version` (RN-M7). */
  async update(
    eventId: string,
    data: { name: string; targetAmountCents: number },
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    return client.eventGoal.update({
      where: { eventId },
      data: { name: data.name, targetAmountCents: data.targetAmountCents, version: { increment: 1 } },
    });
  }

  async deleteByEventId(eventId: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.eventGoal.delete({ where: { eventId } });
  }

  /** Existe pedido ativo que compõe a meta? Base das travas de edição/remoção. */
  async countActiveOrdersInGoal(eventId: string, tx?: Tx): Promise<number> {
    const client = tx ?? prisma;
    return client.order.count({
      where: { eventId, countsTowardGoal: true, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
    });
  }

  /** Existe QUALQUER pedido ativo na rodada? Base da trava de criação tardia (RN-M8). */
  async countActiveOrders(eventId: string, tx?: Tx): Promise<number> {
    const client = tx ?? prisma;
    return client.order.count({
      where: { eventId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
    });
  }
}

export const eventGoalRepository = new EventGoalRepository();
