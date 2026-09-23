import { Prisma, type SplitMode } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  generalSplitRepository,
  type GeneralSplitRow,
  type ParticipantRow,
} from "../repositories/generalSplit.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { auditService, AuditAction } from "./audit.service.js";
import { emailService } from "./email.service.js";
import { HttpError } from "../utils/http-error.js";
import {
  BPS_TOTAL,
  computeShares,
  quoteForJoiner,
  targetShareCents,
  type ComputeSharesInput,
  type JoinerQuote,
  type QuoteInput,
} from "./generalSplit.engine.js";
import { centsToReais, reaisToCents } from "../utils/money.js";
import { bpsToPercent, bpsToPercentLabel, percentToBps } from "../utils/percent.js";
import { EDIT_WINDOW_MS, ACTIVE_PARTICIPATION_STATUSES } from "../constants/order.js";
import {
  missingParticipantsOf,
  toGeneralSplitBlockDto,
  type GeneralSplitDashboardDto,
  type GeneralSplitParticipationDto,
  type SplitQuoteDto,
} from "../dtos/generalSplit.dto.js";
import type { CancelOrderDto } from "../dtos/order.dto.js";
import type { EventSummaryDto } from "../dtos/event.dto.js";
import type {
  CloseSplitInput,
  GeneralSplitConfigInput,
  JoinSplitInput,
  UpdateMyShareInput,
} from "../schemas/generalSplit.schema.js";

type SplitState = {
  id: string;
  eventId: string;
  purchaseName: string;
  totalAmountCents: number;
  mode: SplitMode;
  targetParticipants: number | null;
  participantCount: number;
  pinnedBps: number;
  version: number;
  completedAt: Date | null;
  settledAt: Date | null;
};

/** Rede de segurança do laço: sob o lock, nenhuma repetição deveria acontecer. */
const LOCK_RETRY_ATTEMPTS = 2;

const isActive = (status: ParticipantRow["status"]) =>
  (ACTIVE_PARTICIPATION_STATUSES as string[]).includes(status);

class GeneralSplitService {
  // ── Criação (recebe a transação do POST /events) ─────────────

  async createForEvent(params: {
    tx: Prisma.TransactionClient;
    eventId: string;
    creatorUserId: string;
    input: GeneralSplitConfigInput;
  }): Promise<void> {
    const { tx, eventId, creatorUserId, input } = params;
    const totalAmountCents = reaisToCents(input.totalAmount);
    const isTarget = input.mode === "TARGET";

    await generalSplitRepository.createSplit(
      {
        eventId,
        purchaseName: input.purchaseName,
        totalAmountCents,
        mode: input.mode,
        targetParticipants: isTarget ? input.targetParticipants! : null,
        participantCount: 1, // RN-G1: o criador já conta
      },
      tx,
    );

    // No TARGET o valor já é conhecido e o criador (índice 0) leva o resíduo (RN-G8).
    await generalSplitRepository.createParticipation(
      {
        userId: creatorUserId,
        eventId,
        sharePercentBps: null,
        amountDueCents: isTarget
          ? targetShareCents(totalAmountCents, input.targetParticipants!, 0)
          : null,
      },
      tx,
    );
  }

  // ── Envelope de transação ────────────────────────────────────

  private async withSplitLock<T>(
    eventId: string,
    work: (ctx: { tx: Prisma.TransactionClient; split: GeneralSplitRow }) => Promise<T>,
  ): Promise<T> {
    let lastConflict: HttpError | null = null;

    for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '3s'`);
            const split = await generalSplitRepository.lockByEventId(eventId, tx);
            if (!split) {
              const exists = await eventRepository.existsById(eventId);
              throw exists
                ? new HttpError(422, "Esta rodada não é um racha geral.", "SPLIT_NOT_APPLICABLE")
                : new HttpError(404, "Evento não encontrado.");
            }
            return work({ tx, split });
          },
          { timeout: 10_000, maxWait: 5_000, isolationLevel: "ReadCommitted" },
        );
      } catch (error) {
        if (error instanceof HttpError && error.code === "SPLIT_CONFLICT_RETRY") {
          lastConflict = error;
          continue;
        }
        if (this.isLockTimeout(error) || this.isPoolTimeout(error)) {
          throw new HttpError(
            503,
            "O racha está recebendo muita gente agora. Tente de novo em instantes.",
            "SPLIT_BUSY",
          );
        }
        throw error;
      }
    }

    throw new HttpError(
      409,
      "O valor do racha mudou enquanto você confirmava. Confira o valor novo e tente de novo.",
      "SPLIT_CONFLICT",
      lastConflict?.details ?? (await this.getQuoteSafe(eventId)),
    );
  }

  private isLockTimeout(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2010" &&
      (error.meta as { code?: string } | undefined)?.code === "55P03"
    );
  }

  private isPoolTimeout(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2024";
  }

  // ── Montadores de entrada do motor (sem cálculo) ─────────────

  private toEngineState(
    split: SplitState,
    participants: ParticipantRow[],
    creatorUserId: string,
  ): ComputeSharesInput {
    return {
      totalAmountCents: split.totalAmountCents,
      participants: participants.map((p) => ({
        orderId: p.id,
        userId: p.userId,
        sharePercentBps: p.sharePercentBps,
      })),
      creatorUserId,
    };
  }

  /** `QuoteInput` já EXCLUINDO o requisitante (RN-14b). */
  private toQuoteInput(
    split: SplitState,
    participants: ParticipantRow[],
    viewerOrderId: string | null,
  ): QuoteInput {
    let floatingCount = 0;
    let pinnedBps = 0;
    for (const p of participants) {
      if (viewerOrderId !== null && p.id === viewerOrderId) continue;
      if (p.sharePercentBps === null) floatingCount += 1;
      else pinnedBps += p.sharePercentBps;
    }
    return {
      totalAmountCents: split.totalAmountCents,
      participantCount: split.participantCount,
      floatingCount,
      pinnedBps,
    };
  }

  private validateSharePercent(params: {
    split: SplitState;
    quote: JoinerQuote;
    requestedBps: number | null;
  }): number | null {
    const { split, quote, requestedBps } = params;
    if (requestedBps === null) return null; // flutuante: sem faixa
    if (split.mode === "TARGET") {
      throw new HttpError(
        422,
        "Neste racha o valor por pessoa já está definido.",
        "SPLIT_SHARE_NOT_ALLOWED",
      );
    }
    if (requestedBps < quote.minBps) {
      throw new HttpError(
        422,
        `O mínimo que você pode assumir agora é ${bpsToPercentLabel(quote.minBps)}%.`,
        "SPLIT_SHARE_BELOW_MIN",
      );
    }
    if (requestedBps > quote.maxBps) {
      throw new HttpError(
        422,
        `O máximo disponível agora é ${bpsToPercentLabel(quote.maxBps)}%.`,
        "SPLIT_SHARE_ABOVE_MAX",
      );
    }
    return requestedBps;
  }

  /** Re-congela `amountDueCents` de toda a lista ativa por POSIÇÃO (RN-22b). Só TARGET. */
  private async refreezeTarget(
    split: SplitState,
    eventId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const participants = await generalSplitRepository.findParticipants(eventId, tx);
    const updates = participants.map((p, i) => ({
      orderId: p.id,
      amountDueCents: targetShareCents(split.totalAmountCents, split.targetParticipants!, i),
    }));
    await generalSplitRepository.setAmountDueCents(updates, tx);
  }

  // ── join ─────────────────────────────────────────────────────

  async join(params: { eventId: string; userId: string; input: JoinSplitInput }): Promise<{
    created: boolean;
    dto: GeneralSplitParticipationDto;
  }> {
    const replay = await generalSplitRepository.findByIdempotencyKey(params.input.idempotencyKey);
    if (replay) return this.resolveReplay(replay, params);

    const event = await orderRepository.findEventForOrder(params.eventId);
    if (!event) throw new HttpError(404, "Evento não encontrado.");
    if (event.kind !== "GENERAL_SPLIT") {
      throw new HttpError(422, "Esta rodada não é um racha geral.", "SPLIT_NOT_APPLICABLE");
    }
    if (event.status !== "OPEN") {
      throw new HttpError(409, "Esta rodada não está aberta.", "EVENT_NOT_OPEN");
    }

    const isPinned = params.input.sharePercent !== undefined;
    const requestedBps = isPinned ? percentToBps(params.input.sharePercent!) : null;

    const result = await this.withSplitLock(params.eventId, async ({ tx, split }) => {
      if (split.settledAt) throw new HttpError(409, "Este racha já foi fechado.", "SPLIT_CLOSED");
      if (
        split.completedAt ||
        (split.targetParticipants !== null && split.participantCount >= split.targetParticipants)
      ) {
        throw new HttpError(409, "Este racha já está completo.", "SPLIT_FULL");
      }
      if (split.pinnedBps >= BPS_TOTAL) {
        throw new HttpError(
          422,
          "Quem já está no racha assumiu o valor inteiro. Não dá para entrar agora.",
          "SPLIT_FULLY_PINNED",
        );
      }

      const replayInside = await generalSplitRepository.findByIdempotencyKey(
        params.input.idempotencyKey,
        tx,
      );
      if (replayInside) return { created: false as const, orderId: replayInside.id };

      const already = await generalSplitRepository.findParticipationByUser(
        params.eventId,
        params.userId,
        tx,
      );
      if (already) throw new HttpError(409, "Você já está neste racha.", "SPLIT_ALREADY_JOINED");

      const participants = await generalSplitRepository.findParticipants(params.eventId, tx);

      if (isPinned && split.version !== params.input.expectedVersion) {
        throw new HttpError(
          409,
          "O valor do racha mudou enquanto você confirmava. Confira o valor novo e tente de novo.",
          "SPLIT_CONFLICT",
          await this.getQuoteSafe(params.eventId),
        );
      }

      const quote = quoteForJoiner(this.toQuoteInput(split, participants, null));
      const sharePercentBps = this.validateSharePercent({ split, quote, requestedBps });
      const amountDueCents =
        split.mode === "TARGET"
          ? targetShareCents(split.totalAmountCents, split.targetParticipants!, split.participantCount)
          : null;

      const affected = await generalSplitRepository.applyJoin({
        tx,
        splitId: split.id,
        expectedVersion: split.version,
        addPinnedBps: sharePercentBps ?? 0,
      });
      if (affected === 0) throw new HttpError(409, "conflito interno", "SPLIT_CONFLICT_RETRY");

      const order = await generalSplitRepository.createParticipation(
        {
          userId: params.userId,
          eventId: params.eventId,
          sharePercentBps,
          amountDueCents,
          idempotencyKey: params.input.idempotencyKey,
        },
        tx,
      );

      if (split.mode === "TARGET") await this.refreezeTarget(split, params.eventId, tx);

      const fresh = await generalSplitRepository.findCompletedAt(split.id, tx);
      const completed = fresh?.completedAt !== null && split.completedAt === null;

      return {
        created: true as const,
        orderId: order.id,
        completed,
        mode: split.mode,
        sharePercentBps,
        participantCount: split.participantCount + 1,
      };
    });

    if (result.created) {
      await auditService.log({
        actorId: params.userId,
        action: AuditAction.SPLIT_JOIN,
        targetId: result.orderId,
        metadata: {
          eventId: params.eventId,
          mode: result.mode,
          sharePercentBps: result.sharePercentBps,
          participantCount: result.participantCount,
          completed: result.completed,
        },
      });
      void this.notifyAfterJoin(params.eventId, result.orderId, result.completed);
    }
    const dto = await this.getMyParticipation(params.eventId, params.userId);
    return { created: result.created, dto: dto! };
  }

  private async resolveReplay(
    replay: NonNullable<Awaited<ReturnType<typeof generalSplitRepository.findByIdempotencyKey>>>,
    params: { eventId: string; userId: string },
  ): Promise<{ created: false; dto: GeneralSplitParticipationDto }> {
    if (replay.eventId !== params.eventId || replay.userId !== params.userId) {
      throw new HttpError(
        409,
        "Esta confirmação já foi usada. Recarregue a rodada e tente de novo.",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    if (!isActive(replay.status)) {
      throw new HttpError(
        409,
        "Sua entrada neste racha foi cancelada pelo organizador.",
        "SPLIT_PARTICIPATION_CANCELLED",
      );
    }
    const dto = await this.getMyParticipation(params.eventId, params.userId);
    return { created: false, dto: dto! };
  }

  // ── updateMyShare ────────────────────────────────────────────

  async updateMyShare(params: {
    eventId: string;
    userId: string;
    input: UpdateMyShareInput;
  }): Promise<GeneralSplitParticipationDto> {
    const event = await orderRepository.findEventForOrder(params.eventId);
    if (!event) throw new HttpError(404, "Evento não encontrado.");
    if (event.kind !== "GENERAL_SPLIT") {
      throw new HttpError(422, "Esta rodada não é um racha geral.", "SPLIT_NOT_APPLICABLE");
    }
    if (event.status !== "OPEN") {
      throw new HttpError(409, "Esta rodada não está aberta.", "EVENT_NOT_OPEN");
    }

    const requestedBps =
      params.input.sharePercent === null ? null : percentToBps(params.input.sharePercent);

    await this.withSplitLock(params.eventId, async ({ tx, split }) => {
      if (split.settledAt) throw new HttpError(409, "Este racha já foi fechado.", "SPLIT_CLOSED");
      if (split.mode !== "DYNAMIC") {
        throw new HttpError(
          422,
          "Neste racha o valor por pessoa já está definido.",
          "SPLIT_SHARE_NOT_ALLOWED",
        );
      }
      const order = await generalSplitRepository.findParticipationByUser(
        params.eventId,
        params.userId,
        tx,
      );
      if (!order) {
        throw new HttpError(404, "Você não está neste racha.", "SPLIT_NOT_PARTICIPANT");
      }
      if (Date.now() - order.createdAt.getTime() > EDIT_WINDOW_MS) {
        throw new HttpError(
          409,
          "O prazo de 10 minutos para mudar sua parte já passou.",
          "SPLIT_EDIT_WINDOW_CLOSED",
        );
      }
      if (split.version !== params.input.expectedVersion) {
        throw new HttpError(
          409,
          "O valor do racha mudou enquanto você confirmava. Confira o valor novo e tente de novo.",
          "SPLIT_CONFLICT",
          await this.getQuoteSafe(params.eventId),
        );
      }

      const participants = await generalSplitRepository.findParticipants(params.eventId, tx);
      const quote = quoteForJoiner(this.toQuoteInput(split, participants, order.id));
      const newBps = this.validateSharePercent({ split, quote, requestedBps });

      const bpsDelta = (newBps ?? 0) - (order.sharePercentBps ?? 0);
      const affected = await generalSplitRepository.applyShareChange({
        tx,
        splitId: split.id,
        expectedVersion: split.version,
        bpsDelta,
      });
      if (affected === 0) throw new HttpError(409, "conflito interno", "SPLIT_CONFLICT_RETRY");

      await generalSplitRepository.updateParticipationShare(order.id, newBps, tx);

      // Só quem JÁ estava fixado e baixou (ou soltou a fixação) levanta o valor dos flutuantes.
      const raisedOthers =
        order.sharePercentBps !== null &&
        (newBps === null || newBps < order.sharePercentBps);

      await auditService.log({
        actorId: params.userId,
        action: AuditAction.SPLIT_SHARE_UPDATE,
        targetId: order.id,
        metadata: { eventId: params.eventId, from: order.sharePercentBps, to: newBps, raisedOthers },
      });
    });

    const dto = await this.getMyParticipation(params.eventId, params.userId);
    return dto!;
  }

  // ── close ────────────────────────────────────────────────────

  async close(params: {
    eventId: string;
    actorId: string;
    input: CloseSplitInput;
  }): Promise<GeneralSplitDashboardDto> {
    const event = await orderRepository.findEventForOrder(params.eventId);
    if (!event) throw new HttpError(404, "Evento não encontrado.");
    if (event.kind !== "GENERAL_SPLIT") {
      throw new HttpError(422, "Esta rodada não é um racha geral.", "SPLIT_NOT_APPLICABLE");
    }

    const frozen = await this.withSplitLock(params.eventId, async ({ tx, split }) => {
      if (split.settledAt) throw new HttpError(409, "Este racha já foi fechado.", "SPLIT_CLOSED");
      if (params.input.expectedVersion !== undefined && params.input.expectedVersion !== split.version) {
        throw new HttpError(
          409,
          "O valor do racha mudou enquanto você confirmava. Confira o valor novo e tente de novo.",
          "SPLIT_CONFLICT",
          await this.getQuoteSafe(params.eventId),
        );
      }
      if (split.mode === "TARGET" && !split.completedAt) {
        throw new HttpError(
          422,
          "Este racha ainda não completou. Espere as pessoas que faltam ou cancele quem não vai entrar.",
          "SPLIT_TARGET_NOT_REACHED",
        );
      }

      const participants = await generalSplitRepository.findParticipants(params.eventId, tx);
      if (participants.length === 0) {
        throw new HttpError(409, "Não há ninguém neste racha para fechar.", "SPLIT_EMPTY");
      }

      const shares =
        split.mode === "TARGET"
          ? participants.map((p, i) => ({
              orderId: p.id,
              amountDueCents: targetShareCents(split.totalAmountCents, split.targetParticipants!, i),
            }))
          : computeShares(this.toEngineState(split, participants, event.createdByUserId));

      const sum = shares.reduce((acc, s) => acc + s.amountDueCents, 0);
      if (sum !== split.totalAmountCents) {
        throw new HttpError(500, "Falha ao fechar o racha. Tente de novo.", "SPLIT_INVARIANT_BROKEN");
      }

      await generalSplitRepository.setAmountDueCents(shares, tx);
      const affected = await generalSplitRepository.applySettle({
        tx,
        splitId: split.id,
        expectedVersion: split.version,
      });
      if (affected === 0) throw new HttpError(409, "conflito interno", "SPLIT_CONFLICT_RETRY");

      await eventRepository.setStatus(params.eventId, "CLOSED", tx);

      return {
        mode: split.mode,
        participants: participants.length,
        totalAmountCents: split.totalAmountCents,
      };
    });

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.SPLIT_CLOSE,
      targetId: params.eventId,
      metadata: { participants: frozen.participants, totalAmountCents: frozen.totalAmountCents },
    });
    if (frozen.mode === "DYNAMIC") void this.notifySettled(params.eventId);
    return this.getDashboard(params.eventId);
  }

  // ── cancelParticipation (tudo sob o lock) ────────────────────

  async cancelParticipation(params: {
    eventId: string;
    orderId: string;
    actorId: string;
  }): Promise<CancelOrderDto> {
    return this.withSplitLock(params.eventId, async ({ tx, split }) => {
      if (split.settledAt) {
        throw new HttpError(
          422,
          "Este racha já foi fechado; os valores não mudam mais.",
          "SPLIT_ALREADY_SETTLED",
        );
      }
      const order = await generalSplitRepository.findParticipationById(params.orderId, tx);
      if (!order || order.eventId !== params.eventId) {
        throw new HttpError(404, "Pedido não encontrado.");
      }
      if (["CANCELLED", "EXPIRED"].includes(order.status)) {
        throw new HttpError(409, "Pedido já está cancelado.");
      }

      const cancelled = await orderRepository.cancel(params.orderId, tx);

      const affected = await generalSplitRepository.applyCancel({
        tx,
        splitId: split.id,
        expectedVersion: split.version,
        removedPinnedBps: order.sharePercentBps ?? 0,
      });
      if (affected === 0) throw new HttpError(409, "conflito interno", "SPLIT_CONFLICT_RETRY");

      await generalSplitRepository.recomputeAggregates(params.eventId, tx);

      if (split.mode === "TARGET") await this.refreezeTarget(split, params.eventId, tx);

      return {
        id: cancelled.id,
        status: cancelled.status,
        paymentStatus: cancelled.paymentStatus,
        cancelledAt: cancelled.cancelledAt,
      };
    });
  }

  // ── Leituras ─────────────────────────────────────────────────

  async isSettled(eventId: string): Promise<boolean> {
    const split = await generalSplitRepository.findByEventId(eventId);
    return split?.settledAt != null;
  }

  async getQuote(eventId: string, userId: string): Promise<SplitQuoteDto> {
    const split = await generalSplitRepository.findByEventId(eventId);
    if (!split) {
      const exists = await eventRepository.existsById(eventId);
      throw exists
        ? new HttpError(422, "Esta rodada não é um racha geral.", "SPLIT_NOT_APPLICABLE")
        : new HttpError(404, "Evento não encontrado.");
    }
    return this.buildQuote(split, userId);
  }

  private async getQuoteSafe(eventId: string): Promise<SplitQuoteDto | undefined> {
    try {
      const split = await generalSplitRepository.findByEventId(eventId);
      if (!split) return undefined;
      return await this.buildQuote(split, "");
    } catch {
      return undefined;
    }
  }

  private async buildQuote(split: SplitState, userId: string): Promise<SplitQuoteDto> {
    const participants = await generalSplitRepository.findParticipants(split.eventId);
    const mine = participants.find((p) => p.userId === userId) ?? null;
    const viewerIsParticipant = mine !== null;
    const fullyPinned = split.pinnedBps >= BPS_TOTAL;
    const targetFull =
      split.mode === "TARGET" &&
      (split.completedAt !== null ||
        (split.targetParticipants !== null && split.participantCount >= split.targetParticipants));
    const canJoin = !viewerIsParticipant && !split.settledAt && !fullyPinned && !targetFull;

    // Cotação de entrada (quem está fora).
    let shareIfJoiningCents: number | null = null;
    let sharePercentIfJoining: number | null = null;
    let joinMinBps: number | null = null;
    let joinMaxBps: number | null = null;
    let participantsAfter: number;
    if (split.mode === "TARGET") {
      participantsAfter = Math.min(split.participantCount + 1, split.targetParticipants ?? split.participantCount + 1);
      if (canJoin) {
        shareIfJoiningCents = targetShareCents(
          split.totalAmountCents,
          split.targetParticipants!,
          split.participantCount,
        );
        sharePercentIfJoining = this.percentFromCents(shareIfJoiningCents, split.totalAmountCents);
      }
    } else {
      const joinQuote = quoteForJoiner(this.toQuoteInput(split, participants, null));
      participantsAfter = joinQuote.participantsAfter;
      if (canJoin) {
        shareIfJoiningCents = joinQuote.shareCentsIfFloating;
        sharePercentIfJoining = joinQuote.sharePercentIfFloating;
        joinMinBps = joinQuote.minBps;
        joinMaxBps = joinQuote.maxBps;
      }
    }

    // Valor do usuário do token.
    let myShareCents: number | null = null;
    if (mine) {
      if (mine.amountDueCents !== null) {
        myShareCents = mine.amountDueCents;
      } else if (split.mode === "DYNAMIC") {
        const creatorUserId = await this.creatorOf(split.eventId);
        const shares = computeShares(this.toEngineState(split, participants, creatorUserId));
        myShareCents = shares.find((s) => s.orderId === mine.id)?.amountDueCents ?? null;
      }
    }

    // Limites de edição (só DYNAMIC + participante).
    let myMinBps: number | null = null;
    let myMaxBps: number | null = null;
    if (split.mode === "DYNAMIC" && mine) {
      const myQuote = quoteForJoiner(this.toQuoteInput(split, participants, mine.id));
      myMinBps = myQuote.minBps;
      myMaxBps = myQuote.maxBps;
    }

    const myShareIsFinal =
      split.settledAt !== null || (split.mode === "TARGET" && myShareCents !== null);
    const isEstimate = split.mode === "DYNAMIC" && split.settledAt === null;

    return {
      eventId: split.eventId,
      version: split.version,
      mode: split.mode,
      purchaseName: split.purchaseName,
      totalAmount: centsToReais(split.totalAmountCents),
      participantCount: split.participantCount,
      targetParticipants: split.targetParticipants,
      missingParticipants: missingParticipantsOf(split.targetParticipants, split.participantCount),
      completedAt: split.completedAt,
      settledAt: split.settledAt,
      viewerIsParticipant,
      shareIfJoining: shareIfJoiningCents !== null ? centsToReais(shareIfJoiningCents) : null,
      sharePercentIfJoining,
      myShare: myShareCents !== null ? centsToReais(myShareCents) : null,
      myShareIsFinal,
      mySharePercent: mine && mine.sharePercentBps !== null ? bpsToPercent(mine.sharePercentBps) : null,
      joinMinPercent: joinMinBps !== null ? bpsToPercent(joinMinBps) : null,
      joinMaxPercent: joinMaxBps !== null ? bpsToPercent(joinMaxBps) : null,
      myMinPercent: myMinBps !== null ? bpsToPercent(myMinBps) : null,
      myMaxPercent: myMaxBps !== null ? bpsToPercent(myMaxBps) : null,
      participantsAfter,
      isEstimate,
      fullyPinned,
    };
  }

  private percentFromCents(cents: number, totalCents: number): number {
    return totalCents > 0 ? Math.round((cents * BPS_TOTAL) / totalCents) / 100 : 0;
  }

  private async creatorOf(eventId: string): Promise<string> {
    const rows = await eventRepository.findCreatorsByIds([eventId]);
    return rows[0]?.createdByUserId ?? "";
  }

  async getMyParticipation(
    eventId: string,
    userId: string,
  ): Promise<GeneralSplitParticipationDto | null> {
    const order = await generalSplitRepository.findParticipationByUser(eventId, userId);
    if (!order) return null;
    const split = await generalSplitRepository.findByEventId(eventId);
    const event = await eventRepository.findById(eventId);
    if (!split || !event) return null;
    const quote = await this.buildQuote(split, userId);
    const amountDue = order.amountDueCents !== null ? centsToReais(order.amountDueCents) : null;

    return {
      id: order.id,
      kind: "GENERAL_SPLIT",
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      event: { id: event.id, title: event.name },
      purchaseName: split.purchaseName,
      sharePercent: order.sharePercentBps !== null ? bpsToPercent(order.sharePercentBps) : null,
      amountDue,
      estimatedShare: amountDue === null ? quote.myShare : null,
      isEstimate: quote.isEstimate,
      editableUntil: new Date(order.createdAt.getTime() + EDIT_WINDOW_MS),
      pixKey: event.pixKey,
      pixQrUrl: event.pixQrUrl,
      quote,
    };
  }

  async getBlockForEvent(eventId: string) {
    const split = await generalSplitRepository.findByEventId(eventId);
    return split ? toGeneralSplitBlockDto(split) : null;
  }

  async getDashboard(eventId: string): Promise<GeneralSplitDashboardDto> {
    const split = await generalSplitRepository.findByEventId(eventId);
    if (!split) {
      const exists = await eventRepository.existsById(eventId);
      throw exists
        ? new HttpError(422, "Esta rodada não é um racha geral.", "SPLIT_NOT_APPLICABLE")
        : new HttpError(404, "Evento não encontrado.");
    }
    const event = await eventRepository.findById(eventId);
    if (!event) throw new HttpError(404, "Evento não encontrado.");
    const participants = await generalSplitRepository.findParticipants(eventId);

    const projected =
      split.mode === "DYNAMIC" && split.settledAt === null
        ? new Map(
            computeShares(
              this.toEngineState(split, participants, event.createdByUser.id),
            ).map((s) => [s.orderId, s.amountDueCents]),
          )
        : null;

    const isEstimate = split.mode === "DYNAMIC" && split.settledAt === null;
    let settledSum = 0;
    let anyFrozen = false;

    const byPerson = participants.map((p) => {
      let cents: number | null = p.amountDueCents;
      if (cents !== null) {
        anyFrozen = true;
        settledSum += cents;
      } else if (projected) {
        cents = projected.get(p.id) ?? null;
      }
      return {
        orderId: p.id,
        user: {
          id: p.user.id,
          fullName: `${p.user.name} ${p.user.surname}`,
          email: p.user.email,
        },
        status: p.status,
        paymentStatus: p.paymentStatus,
        sharePercent: p.sharePercentBps !== null ? bpsToPercent(p.sharePercentBps) : null,
        amountDue: cents !== null ? centsToReais(cents) : null,
        isEstimate,
        joinedAt: p.createdAt,
      };
    });

    return {
      kind: "GENERAL_SPLIT",
      event: {
        id: event.id,
        title: event.name,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        pixKey: event.pixKey,
        pixQrUrl: event.pixQrUrl,
      },
      split: toGeneralSplitBlockDto(split),
      settledTotal: anyFrozen ? centsToReais(settledSum) : null,
      byPerson,
    };
  }

  async attachToSummaries(
    summaries: EventSummaryDto[],
    viewerId: string,
  ): Promise<EventSummaryDto[]> {
    const targets = summaries.filter((s) => s.kind === "GENERAL_SPLIT");
    if (targets.length === 0) return summaries;

    const ids = targets.map((s) => s.id);
    const splits = await generalSplitRepository.findManyByEventIds(ids);
    const splitByEvent = new Map(splits.map((s) => [s.eventId, s]));
    const parts = await generalSplitRepository.findActiveParticipationsByEventIds(ids);
    const partsByEvent = new Map<string, typeof parts>();
    for (const p of parts) {
      const list = partsByEvent.get(p.eventId) ?? [];
      list.push(p);
      partsByEvent.set(p.eventId, list);
    }
    const creators = await eventRepository.findCreatorsByIds(ids);
    const creatorByEvent = new Map(creators.map((c) => [c.id, c.createdByUserId]));

    for (const summary of summaries) {
      if (summary.kind !== "GENERAL_SPLIT") continue;
      const split = splitByEvent.get(summary.id);
      if (!split) continue;
      summary.generalSplit = toGeneralSplitBlockDto(split);
      const evParts = partsByEvent.get(summary.id) ?? [];
      const mine = evParts.find((p) => p.userId === viewerId) ?? null;
      summary.viewerIsParticipant = mine !== null;
      summary.estimatedPerPerson = this.estimatedForCard(
        split,
        evParts,
        mine,
        creatorByEvent.get(summary.id) ?? "",
      );
    }
    return summaries;
  }

  private estimatedForCard(
    split: SplitState,
    parts: { id: string; userId: string; sharePercentBps: number | null; amountDueCents: number | null }[],
    mine: { id: string; amountDueCents: number | null } | null,
    creatorUserId: string,
  ): string | null {
    if (split.mode === "TARGET") {
      if (mine) return centsToReais(mine.amountDueCents ?? 0);
      return centsToReais(
        targetShareCents(split.totalAmountCents, split.targetParticipants!, split.participantCount),
      );
    }
    // DYNAMIC
    if (mine) {
      const shares = computeShares({
        totalAmountCents: split.totalAmountCents,
        participants: parts.map((p) => ({ orderId: p.id, userId: p.userId, sharePercentBps: p.sharePercentBps })),
        creatorUserId,
      });
      return centsToReais(shares.find((s) => s.orderId === mine.id)?.amountDueCents ?? 0);
    }
    let floatingCount = 0;
    let pinnedBps = 0;
    for (const p of parts) {
      if (p.sharePercentBps === null) floatingCount += 1;
      else pinnedBps += p.sharePercentBps;
    }
    const q = quoteForJoiner({
      totalAmountCents: split.totalAmountCents,
      participantCount: split.participantCount,
      floatingCount,
      pinnedBps,
    });
    return centsToReais(q.shareCentsIfFloating);
  }

  // ── E-mails pós-commit ───────────────────────────────────────

  private async notifyAfterJoin(eventId: string, orderId: string, completed: boolean): Promise<void> {
    try {
      const split = await generalSplitRepository.findByEventId(eventId);
      if (!split || split.mode !== "TARGET") return; // DYNAMIC: sem e-mail na entrada
      const event = await eventRepository.findById(eventId);
      if (!event) return;

      if (completed) {
        const participants = await generalSplitRepository.findParticipants(eventId);
        for (const p of participants) {
          await emailService.sendGeneralSplitCompleted({
            to: p.user.email,
            name: p.user.name,
            eventName: event.name,
            eventId,
            purchaseName: split.purchaseName,
            amount: centsToReais(p.amountDueCents ?? 0),
            pixKey: event.pixKey,
          });
        }
      } else {
        const order = await generalSplitRepository.findParticipationById(orderId);
        if (!order) return;
        await emailService.sendGeneralSplitJoined({
          to: order.user.email,
          name: order.user.name,
          eventName: event.name,
          eventId,
          purchaseName: split.purchaseName,
          amount: centsToReais(order.amountDueCents ?? 0),
          pixKey: event.pixKey,
          missing: missingParticipantsOf(split.targetParticipants, split.participantCount) ?? 0,
        });
      }
    } catch (error) {
      console.error("[generalSplit] falha ao notificar entrada", error);
    }
  }

  private async notifySettled(eventId: string): Promise<void> {
    try {
      const split = await generalSplitRepository.findByEventId(eventId);
      const event = await eventRepository.findById(eventId);
      if (!split || !event) return;
      const participants = await generalSplitRepository.findParticipants(eventId);
      for (const p of participants) {
        await emailService.sendGeneralSplitSettled({
          to: p.user.email,
          name: p.user.name,
          eventName: event.name,
          purchaseName: split.purchaseName,
          amount: centsToReais(p.amountDueCents ?? 0),
          pixKey: event.pixKey,
        });
      }
    } catch (error) {
      console.error("[generalSplit] falha ao notificar fechamento", error);
    }
  }
}

export const generalSplitService = new GeneralSplitService();
