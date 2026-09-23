import { Prisma } from "@prisma/client";
import { recommendPurchase, splitCostEqually } from "./pizzaSplit.engine.js";
import { toEventSummaryDto, type EventSummaryDto } from "../dtos/event.dto.js";
import { toPizzaDashboardDto, type PizzaDashboardDto } from "../dtos/pizzaSplit.dto.js";
import { eventRepository } from "../repositories/event.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { preferenceQuestionRepository } from "../repositories/preferenceQuestion.repository.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { emailService } from "./email.service.js";
import { auditService, AuditAction } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";

type EventListRow = Awaited<ReturnType<typeof eventRepository.findMany>>[number];
type Participation = Awaited<
  ReturnType<typeof orderRepository.findValidParticipationsForEvent>
>[number];

/**
 * Camada que conecta o motor puro (`pizzaSplit.engine`) aos dados. Aqui ficam as
 * consultas; o cálculo vive no motor. Usado pela listagem (estimativa no card),
 * pelo dashboard (RP6) e pelo rateio do custo real (RP9/RP10).
 */
class PizzaSplitService {
  /** Acrescenta a estimativa "≈ R$ X/pessoa" às rodadas de pizza da lista (RP7). */
  async attachEstimates(events: EventListRow[]): Promise<EventSummaryDto[]> {
    const pizzaIds = events
      .filter((event) => event.kind === "PIZZA_SPLIT")
      .map((event) => event.id);

    if (pizzaIds.length === 0) {
      return events.map((event) => toEventSummaryDto(event));
    }

    const aggregates =
      await orderRepository.aggregateParticipationByEvents(pizzaIds);
    const byEvent = new Map(aggregates.map((agg) => [agg.eventId, agg]));

    return events.map((event) => {
      if (event.kind !== "PIZZA_SPLIT") {
        return toEventSummaryDto(event);
      }
      const agg = byEvent.get(event.id);
      const result = recommendPurchase({
        participants: agg?.participants ?? 0,
        totalSlices: agg?.totalSlices ?? 0,
        slicesPerPizza: event.slicesPerPizza ?? env.defaultSlicesPerPizza,
        avgLargePizzaPrice: this.priceOrDefault(event.avgLargePizzaPrice),
        sweetVoters: 0,
        flavorVotes: [],
        preferences: [],
      });
      return toEventSummaryDto(
        event,
        result.estimatedPerPerson !== null
          ? result.estimatedPerPerson.toFixed(2)
          : null,
      );
    });
  }

  /** Estimativa "≈ R$ X/pessoa" de uma rodada (resposta de criar/editar participação). */
  async estimatePerPersonForEvent(config: {
    id: string;
    slicesPerPizza: number | null;
    avgLargePizzaPrice: Prisma.Decimal | number | null;
  }): Promise<string | null> {
    const [agg] = await orderRepository.aggregateParticipationByEvents([config.id]);
    const result = recommendPurchase({
      participants: agg?.participants ?? 0,
      totalSlices: agg?.totalSlices ?? 0,
      slicesPerPizza: config.slicesPerPizza ?? env.defaultSlicesPerPizza,
      avgLargePizzaPrice: this.priceOrDefault(config.avgLargePizzaPrice),
      sweetVoters: 0,
      flavorVotes: [],
      preferences: [],
    });
    return result.estimatedPerPerson !== null
      ? result.estimatedPerPerson.toFixed(2)
      : null;
  }

  /** Dashboard de recomendação do organizador (RP6). */
  async getDashboard(eventId: string): Promise<PizzaDashboardDto> {
    const event = await eventRepository.findById(eventId);
    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const participations =
      await orderRepository.findValidParticipationsForEvent(eventId);
    const activeQuestions = await preferenceQuestionRepository.findActive();

    let totalSlices = 0;
    let sweetVoters = 0;
    const flavorTally = new Map<
      string,
      { flavorId: string; name: string; isSweet: boolean; votes: number }
    >();
    const prefYes = new Map<string, number>();
    const prefNo = new Map<string, number>();

    for (const participation of participations) {
      totalSlices += participation.slicesWanted ?? 0;
      if (participation.flavorVotes.some((vote) => vote.flavor.isSweet)) {
        sweetVoters += 1;
      }
      for (const vote of participation.flavorVotes) {
        const current = flavorTally.get(vote.flavor.id);
        flavorTally.set(vote.flavor.id, {
          flavorId: vote.flavor.id,
          name: vote.flavor.name,
          isSweet: vote.flavor.isSweet,
          votes: (current?.votes ?? 0) + 1,
        });
      }
      for (const answer of participation.preferences) {
        const bucket = answer.answer ? prefYes : prefNo;
        bucket.set(answer.questionId, (bucket.get(answer.questionId) ?? 0) + 1);
      }
    }

    const result = recommendPurchase({
      participants: participations.length,
      totalSlices,
      slicesPerPizza: event.slicesPerPizza ?? env.defaultSlicesPerPizza,
      avgLargePizzaPrice: this.priceOrDefault(event.avgLargePizzaPrice),
      sweetVoters,
      flavorVotes: [...flavorTally.values()],
      preferences: activeQuestions.map((question) => ({
        key: question.key,
        text: question.text,
        yes: prefYes.get(question.id) ?? 0,
        no: prefNo.get(question.id) ?? 0,
      })),
    });

    return toPizzaDashboardDto({ event, result, participations });
  }

  /** RP9 — fecha as escolhas (trava novas participações/edições). */
  async lockChoices(params: { eventId: string; actorId: string }) {
    const event = await eventRepository.findPizzaCore(params.eventId);
    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }
    if (event.kind === "GENERAL_SPLIT") {
      throw new HttpError(422, "No racha geral não existe fechar escolhas.", "SPLIT_NOT_APPLICABLE");
    }
    if (event.kind !== "PIZZA_SPLIT") {
      throw new HttpError(400, "Fechar escolhas só vale para o racha de pizza.");
    }
    if (event.choicesLockedAt) {
      throw new HttpError(409, "As escolhas desta rodada já estavam fechadas.");
    }

    await eventRepository.lockChoices(params.eventId);
    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.EVENT_CHOICES_LOCKED,
      targetId: params.eventId,
    });

    return this.getDashboard(params.eventId);
  }

  /**
   * RP9/RP10 — registra o custo real (+ evidência), **rateia igualmente** e grava
   * o `amountDue` de cada participação numa transação. Bloqueia se já houve
   * pagamento. Notifica os participantes (best-effort).
   */
  async registerCost(params: {
    eventId: string;
    actorId: string;
    actualTotalCost: number;
    evidenceUrl: string | null;
  }): Promise<PizzaDashboardDto> {
    const event = await eventRepository.findPizzaCore(params.eventId);
    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }
    if (event.kind === "GENERAL_SPLIT") {
      throw new HttpError(
        422,
        "No racha geral o valor já é conhecido. Use o fechamento do racha.",
        "SPLIT_NOT_APPLICABLE",
      );
    }
    if (event.kind !== "PIZZA_SPLIT") {
      throw new HttpError(400, "Registrar custo só vale para o racha de pizza.");
    }

    const participations =
      await orderRepository.findValidParticipationsForEvent(params.eventId);
    if (participations.length === 0) {
      throw new HttpError(409, "Não há participações para ratear.");
    }

    const anyPaid = participations.some((p) => p.paymentStatus === "PAID");
    if (event.costRegisteredAt && anyPaid) {
      throw new HttpError(
        409,
        "Já há pagamentos confirmados; o custo não pode mais ser alterado.",
      );
    }

    const split = this.computeSplit(
      params.actualTotalCost,
      participations,
      event.createdByUserId,
    );

    await prisma.$transaction(async (tx) => {
      await eventRepository.registerCost(
        params.eventId,
        { actualTotalCost: params.actualTotalCost, costEvidenceUrl: params.evidenceUrl },
        tx,
      );
      await orderRepository.setAmountDues(split.updates, tx);
    });

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.EVENT_COST_REGISTERED,
      targetId: params.eventId,
      metadata: { actualTotalCost: params.actualTotalCost },
    });

    void this.notifySettled(event.name, event.pixKey, split.centsByOrder, participations);

    return this.getDashboard(params.eventId);
  }

  /** RP11 — recalcula o rateio após cancelamento, se ninguém pagou ainda. */
  async recomputeSplit(eventId: string) {
    const event = await eventRepository.findPizzaCore(eventId);
    if (!event || !event.costRegisteredAt || event.actualTotalCost == null) {
      return;
    }
    const participations =
      await orderRepository.findValidParticipationsForEvent(eventId);
    if (participations.length === 0) {
      return;
    }
    if (participations.some((p) => p.paymentStatus === "PAID")) {
      return; // após o 1º pagamento o rateio congela
    }

    const split = this.computeSplit(
      Number(event.actualTotalCost),
      participations,
      event.createdByUserId,
    );
    await orderRepository.setAmountDues(split.updates);
  }

  /** Roda o motor de rateio e devolve updates (Decimal) + mapa em centavos. */
  private computeSplit(
    actualTotalCost: number,
    participations: Participation[],
    organizerUserId: string,
  ) {
    const result = splitCostEqually({
      totalCostCents: Math.round(actualTotalCost * 100),
      participants: participations.map((p) => ({ orderId: p.id, userId: p.userId })),
      organizerUserId,
    });
    return {
      updates: result.map((row) => ({
        orderId: row.orderId,
        amountDue: new Prisma.Decimal(row.amountDueCents).div(100),
      })),
      centsByOrder: new Map(result.map((row) => [row.orderId, row.amountDueCents])),
    };
  }

  private async notifySettled(
    eventName: string,
    pixKey: string | null,
    centsByOrder: Map<string, number>,
    participations: Participation[],
  ) {
    for (const participation of participations) {
      const cents = centsByOrder.get(participation.id) ?? 0;
      try {
        await emailService.sendSplitSettled({
          to: participation.user.email,
          name: participation.user.name,
          eventName,
          amount: (cents / 100).toFixed(2),
          pixKey,
        });
      } catch (error) {
        console.error("[pizzaSplit] falha ao avisar participante", error);
      }
    }
  }

  private priceOrDefault(value: Prisma.Decimal | number | null): number {
    return value != null ? Number(value) : env.defaultLargePizzaPrice;
  }
}

export const pizzaSplitService = new PizzaSplitService();
