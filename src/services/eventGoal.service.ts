import type { EventKind, EventStatus } from "@prisma/client";
import { eventGoalRepository } from "../repositories/eventGoal.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { auditService, AuditAction } from "./audit.service.js";
import { emailService } from "./email.service.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../utils/http-error.js";
import {
  amountToCents,
  centsToAmount,
  isGoalReached,
} from "./eventGoal.engine.js";
import { toEventGoalDto, type EventGoalDto } from "../dtos/eventGoal.dto.js";
import type { EventSummaryDto } from "../dtos/event.dto.js";
import type { GoalInput } from "../schemas/event.schema.js";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type EventListRow = Awaited<ReturnType<typeof eventRepository.findMany>>[number];
type GoalRecord = { name: string; targetAmountCents: number; reachedAt: Date | null };

class EventGoalService {
  /** Preenche `goal` nos DTOs de listagem, com 1 query agregada. */
  async attachGoals(rows: EventListRow[], dtos: EventSummaryDto[]): Promise<EventSummaryDto[]> {
    const withGoal = rows
      .map((row, index) => ({ row, index }))
      .filter((entry) => (entry.row as { goal?: GoalRecord | null }).goal);
    if (withGoal.length === 0) return dtos;

    const eventIds = withGoal.map((entry) => entry.row.id);
    const progress = await eventGoalRepository.sumProgressByEvents(eventIds);
    const raisedByEvent = new Map(progress.map((p) => [p.eventId, p.raisedCents]));

    for (const { row, index } of withGoal) {
      const goal = (row as { goal: GoalRecord }).goal;
      dtos[index].goal = toEventGoalDto(goal, raisedByEvent.get(row.id) ?? 0);
    }
    return dtos;
  }

  /** Agrega um evento só. */
  async buildForEvent(goal: GoalRecord | null, eventId: string): Promise<EventGoalDto | null> {
    if (!goal) return null;
    const [progress] = await eventGoalRepository.sumProgressByEvents([eventId]);
    return toEventGoalDto(goal, progress?.raisedCents ?? 0);
  }

  /** Cria a meta dentro da transação do POST /events. Sem trava (rodada nova) e
   *  sem auditoria (o EVENT_GOAL_SET sai depois do commit, no event.service). */
  async applyOnCreate(params: { eventId: string; actorId: string; input: GoalInput; tx: Tx }) {
    await eventGoalRepository.create(
      {
        eventId: params.eventId,
        name: params.input.name,
        targetAmountCents: amountToCents(params.input.targetAmount),
      },
      params.tx,
    );
  }

  /** Cria, edita ou remove a meta. Devolve `true` se a edição atingiu a meta agora. */
  async applyOnUpdate(params: {
    eventId: string;
    actorId: string;
    input: GoalInput | null;
    eventStatus: EventStatus;
    eventKind: EventKind;
  }): Promise<boolean> {
    const { eventId, input, eventStatus, eventKind } = params;

    const result = await prisma.$transaction(async (tx) => {
      if (eventKind !== "STANDARD") {
        throw new HttpError(400, "Meta de valor só se aplica a rodadas de encomenda.");
      }
      if (eventStatus === "CLOSED") {
        throw new HttpError(409, "A rodada está encerrada. A meta não pode mais ser alterada.");
      }
      await eventGoalRepository.lockEvent(eventId, tx);
      const current = await eventGoalRepository.lockForUpdate(eventId, tx);

      if (input === null) {
        if (current === null) return { audit: null as null | "set" | "removed", justReached: false };
        if (current.reachedAt) {
          throw new HttpError(409, "A meta já foi atingida e não pode ser removida.");
        }
        if ((await eventGoalRepository.countActiveOrdersInGoal(eventId, tx)) > 0) {
          throw new HttpError(409, "A meta já tem pedidos e não pode ser removida.");
        }
        await eventGoalRepository.deleteByEventId(eventId, tx);
        return { audit: "removed" as const, justReached: false };
      }

      const targetCents = amountToCents(input.targetAmount);
      if (current === null) {
        if ((await eventGoalRepository.countActiveOrders(eventId, tx)) > 0) {
          throw new HttpError(
            409,
            "A rodada já tem pedidos. A meta só pode ser criada antes do primeiro pedido.",
          );
        }
        await eventGoalRepository.create({ eventId, name: input.name, targetAmountCents: targetCents }, tx);
        return { audit: "set" as const, justReached: false };
      }

      if (current.reachedAt) {
        throw new HttpError(409, "A meta já foi atingida e não pode ser editada.");
      }
      await eventGoalRepository.update(eventId, { name: input.name, targetAmountCents: targetCents }, tx);
      const [progress] = await eventGoalRepository.sumProgressByEvents([eventId], tx);
      let justReached = false;
      if (isGoalReached(progress?.raisedCents ?? 0, targetCents)) {
        justReached = await eventGoalRepository.markReached(eventId, tx);
      }
      return { audit: "set" as const, justReached };
    });

    // Auditoria best-effort, FORA da transação (audit usa o client global).
    if (result.audit === "set") {
      void auditService.log({
        actorId: params.actorId,
        action: AuditAction.EVENT_GOAL_SET,
        targetId: eventId,
        metadata: { eventId, goalName: input?.name },
      });
    } else if (result.audit === "removed") {
      void auditService.log({
        actorId: params.actorId,
        action: AuditAction.EVENT_GOAL_REMOVED,
        targetId: eventId,
        metadata: { eventId },
      });
    }
    return result.justReached;
  }

  /** Best-effort: auditoria + e-mail de meta atingida. Chamado depois do commit. */
  async notifyGoalReached(params: {
    eventId: string;
    actorId: string;
    source: "order" | "patch";
  }): Promise<void> {
    try {
      const event = await eventRepository.findById(params.eventId);
      const goal = await eventGoalRepository.findByEventId(params.eventId);
      if (!event || !goal) return;
      const owner = await userRepository.findProfileById(event.createdByUser.id);
      if (!owner) return;
      const [progress] = await eventGoalRepository.sumProgressByEvents([params.eventId]);
      const raisedCents = progress?.raisedCents ?? 0;

      void auditService.log({
        actorId: params.actorId,
        action: AuditAction.EVENT_GOAL_REACHED,
        targetId: params.eventId,
        metadata: { eventId: params.eventId, goalName: goal.name, raisedCents, source: params.source },
      });
      await emailService.sendGoalReached({
        to: owner.email,
        name: owner.name,
        eventName: event.name,
        goalName: goal.name,
        targetAmount: centsToAmount(goal.targetAmountCents),
        raisedAmount: centsToAmount(raisedCents),
      });
    } catch (error) {
      console.error("[eventGoal] falha ao notificar meta atingida", error);
    }
  }
}

export const eventGoalService = new EventGoalService();
