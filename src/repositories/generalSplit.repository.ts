import { Prisma } from "@prisma/client"; // valor, não só tipo: `Prisma.join` é usado abaixo
import { prisma } from "../lib/prisma.js";
import { ACTIVE_PARTICIPATION_STATUSES } from "../constants/order.js";

type Tx = Prisma.TransactionClient;

export type GeneralSplitRow = {
  id: string;
  eventId: string;
  purchaseName: string;
  totalAmountCents: number;
  mode: "DYNAMIC" | "TARGET";
  targetParticipants: number | null;
  participantCount: number;
  pinnedBps: number;
  version: number;
  completedAt: Date | null;
  settledAt: Date | null;
};

/** Participação do racha geral, na ORDEM DE ENTRADA (o motor depende disso). */
const participantSelect = {
  id: true,
  userId: true,
  status: true,
  paymentStatus: true,
  createdAt: true,
  sharePercentBps: true,
  amountDueCents: true,
  idempotencyKey: true,
  user: { select: { id: true, name: true, surname: true, email: true } },
} satisfies Prisma.OrderSelect;

export type ParticipantRow = Prisma.OrderGetPayload<{ select: typeof participantSelect }>;

class GeneralSplitRepository {
  /**
   * Trava a linha do racha: serializa TODOS os escritores do mesmo evento, para
   * ninguém calcular sobre estado sujo. Primeira instrução de toda transação.
   */
  async lockByEventId(eventId: string, tx: Tx): Promise<GeneralSplitRow | null> {
    const rows = await tx.$queryRaw<GeneralSplitRow[]>`
      SELECT "id", "eventId", "purchaseName", "totalAmountCents", "mode"::text AS "mode",
             "targetParticipants", "participantCount", "pinnedBps", "version",
             "completedAt", "settledAt"
        FROM "GeneralSplit"
       WHERE "eventId" = ${eventId}
       FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Leitura sem lock — só para a cotação (GET /split/quote) e para os cards. */
  async findByEventId(eventId: string) {
    return prisma.generalSplit.findUnique({ where: { eventId } });
  }

  async findManyByEventIds(eventIds: string[]) {
    return prisma.generalSplit.findMany({ where: { eventId: { in: eventIds } } });
  }

  /** Participações ativas de vários eventos, ordenadas (para o card da listagem). */
  async findActiveParticipationsByEventIds(eventIds: string[]) {
    if (eventIds.length === 0) return [];
    return prisma.order.findMany({
      where: { eventId: { in: eventIds }, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        eventId: true,
        userId: true,
        sharePercentBps: true,
        amountDueCents: true,
      },
    });
  }

  async findParticipants(eventId: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.order.findMany({
      where: { eventId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      // Desempate por id: a ordem decide quem leva o resíduo de centavos (RN-3b).
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: participantSelect,
    });
  }

  async findParticipationByUser(eventId: string, userId: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.order.findFirst({
      where: { eventId, userId, status: { in: ACTIVE_PARTICIPATION_STATUSES } },
      select: participantSelect,
    });
  }

  /**
   * Sem filtro de status, de propósito: o cancelamento precisa ler a linha JÁ
   * cancelada para devolver os bps dela ao `pinnedBps`.
   */
  async findParticipationById(orderId: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.order.findUnique({
      where: { id: orderId },
      select: { ...participantSelect, eventId: true },
    });
  }

  async findByIdempotencyKey(key: string, tx?: Tx) {
    const client = tx ?? prisma;
    return client.order.findUnique({
      where: { idempotencyKey: key },
      select: { ...participantSelect, eventId: true },
    });
  }

  /** `completedAt` fresco, para saber se FOI ESTA entrada que completou o racha. */
  async findCompletedAt(splitId: string, tx: Tx) {
    return tx.generalSplit.findUnique({
      where: { id: splitId },
      select: { completedAt: true },
    });
  }

  // --- escritas de linha (o service nunca chama `tx.<model>`) ---

  async createSplit(
    data: {
      eventId: string;
      purchaseName: string;
      totalAmountCents: number;
      mode: "DYNAMIC" | "TARGET";
      targetParticipants: number | null;
      participantCount: number;
    },
    tx: Tx,
  ) {
    return tx.generalSplit.create({ data, select: { id: true } });
  }

  async createParticipation(
    data: {
      userId: string;
      eventId: string;
      sharePercentBps: number | null;
      amountDueCents: number | null;
      idempotencyKey?: string;
    },
    tx: Tx,
  ) {
    return tx.order.create({ data, select: { id: true } });
  }

  async updateParticipationShare(orderId: string, sharePercentBps: number | null, tx: Tx) {
    return tx.order.update({
      where: { id: orderId },
      data: { sharePercentBps },
      select: { id: true },
    });
  }

  /**
   * Entrada: reserva a vaga, soma os bps e sobe a version numa ÚNICA instrução.
   * A guarda de `targetParticipants` é o que torna impossível estourar o limite.
   */
  async applyJoin(params: {
    tx: Tx;
    splitId: string;
    expectedVersion: number;
    addPinnedBps: number;
  }): Promise<number> {
    const { tx, splitId, expectedVersion, addPinnedBps } = params;
    return tx.$executeRaw`
      UPDATE "GeneralSplit"
         SET "participantCount" = "participantCount" + 1,
             "pinnedBps"        = "pinnedBps" + ${addPinnedBps},
             "version"          = "version" + 1,
             "completedAt"      = CASE
               WHEN "targetParticipants" IS NOT NULL
                AND "participantCount" + 1 >= "targetParticipants"
               THEN COALESCE("completedAt", now())
               ELSE "completedAt"
             END
       WHERE "id" = ${splitId}
         AND "version" = ${expectedVersion}
         AND "settledAt" IS NULL
         AND ("targetParticipants" IS NULL OR "participantCount" < "targetParticipants")
         AND "pinnedBps" + ${addPinnedBps} <= 10000
    `;
  }

  /** Mudança de porcentagem: delta pode ser negativo (removeu a fixação). */
  async applyShareChange(params: {
    tx: Tx;
    splitId: string;
    expectedVersion: number;
    bpsDelta: number;
  }): Promise<number> {
    const { tx, splitId, expectedVersion, bpsDelta } = params;
    return tx.$executeRaw`
      UPDATE "GeneralSplit"
         SET "pinnedBps" = "pinnedBps" + ${bpsDelta},
             "version"   = "version" + 1
       WHERE "id" = ${splitId}
         AND "version" = ${expectedVersion}
         AND "settledAt" IS NULL
         AND "pinnedBps" + ${bpsDelta} BETWEEN 0 AND 10000
    `;
  }

  /** Cancelamento: devolve a vaga e reabre o TARGET que estava completo. */
  async applyCancel(params: {
    tx: Tx;
    splitId: string;
    expectedVersion: number;
    removedPinnedBps: number;
  }): Promise<number> {
    const { tx, splitId, expectedVersion, removedPinnedBps } = params;
    return tx.$executeRaw`
      UPDATE "GeneralSplit"
         SET "participantCount" = GREATEST("participantCount" - 1, 0),
             "pinnedBps"        = GREATEST("pinnedBps" - ${removedPinnedBps}, 0),
             "version"          = "version" + 1,
             "completedAt"      = CASE
               WHEN "targetParticipants" IS NOT NULL
                AND "participantCount" - 1 < "targetParticipants"
               THEN NULL
               ELSE "completedAt"
             END
       WHERE "id" = ${splitId}
         AND "version" = ${expectedVersion}
         AND "settledAt" IS NULL
    `;
  }

  async applySettle(params: {
    tx: Tx;
    splitId: string;
    expectedVersion: number;
  }): Promise<number> {
    const { tx, splitId, expectedVersion } = params;
    return tx.$executeRaw`
      UPDATE "GeneralSplit"
         SET "settledAt" = now(),
             "version"   = "version" + 1
       WHERE "id" = ${splitId}
         AND "version" = ${expectedVersion}
         AND "settledAt" IS NULL
    `;
  }

  /** Congela o valor de cada participação (espelha orderRepository.setAmountDues). */
  async setAmountDueCents(updates: { orderId: string; amountDueCents: number }[], tx: Tx) {
    for (const update of updates) {
      await tx.order.update({
        where: { id: update.orderId },
        data: { amountDueCents: update.amountDueCents },
      });
    }
  }

  /**
   * Agregado derivado é cache, não verdade (decisão 4 do master): reconstrói
   * `participantCount`/`pinnedBps` a partir das Orders. Usado no cancelamento.
   */
  async recomputeAggregates(eventId: string, tx: Tx): Promise<number> {
    const statuses = Prisma.join(ACTIVE_PARTICIPATION_STATUSES);
    return tx.$executeRaw`
      UPDATE "GeneralSplit" gs
         SET "participantCount" = agg.count,
             "pinnedBps"        = agg.bps,
             "version"          = gs."version" + 1
        FROM (
          SELECT COUNT(*)::int AS count,
                 COALESCE(SUM("sharePercentBps"), 0)::int AS bps
            FROM "Order"
           WHERE "eventId" = ${eventId}
             AND "status"::text IN (${statuses})
        ) agg
       WHERE gs."eventId" = ${eventId}
    `;
  }
}

export const generalSplitRepository = new GeneralSplitRepository();
