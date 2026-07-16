import {
  toEventDetailsDto,
  toEventSummaryDto,
} from "../dtos/event.dto.js";
import { eventRepository } from "../repositories/event.repository.js";
import { typeRepository } from "../repositories/type.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { flavorRepository } from "../repositories/flavor.repository.js";
import { flavorService } from "./flavor.service.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { eventOrganizerService } from "./eventOrganizer.service.js";
import { auditService, AuditAction } from "./audit.service.js";
import { pizzaSplitService } from "./pizzaSplit.service.js";
import { HttpError } from "../utils/http-error.js";
import type { CreateEventInput, UpdateEventInput } from "../schemas/event.schema.js";

class EventService {
  async getEvents() {
    const events = await eventRepository.findMany();
    return pizzaSplitService.attachEstimates(events);
  }

  /** Rodadas que o usuário gerencia (ADMIN: todas; ORGANIZER: vinculadas). */
  async getManaged(params: { userId: string; isAdmin: boolean }) {
    const events = await eventRepository.findManagedBy(params);
    return pizzaSplitService.attachEstimates(events);
  }

  async getEventById(id: string) {
    const event = await eventRepository.findById(id);

    if (!event) {
      return null;
    }

    return toEventDetailsDto(event);
  }

  /**
   * Cria a rodada. Ramifica por `kind`:
   * - STANDARD: `typeId` existente ou `newType` inline (pastel).
   * - PIZZA_SPLIT: sem Type; config do motor + PIX + sabores extras.
   * Em ambos, o criador vira ORGANIZER (promovido se for USER).
   */
  async create(params: { actorId: string; input: CreateEventInput }) {
    if (params.input.kind === "PIZZA_SPLIT") {
      return this.createPizza(params.actorId, params.input);
    }
    return this.createStandard(params.actorId, params.input);
  }

  private async createStandard(actorId: string, input: CreateEventInput) {
    const result = await prisma.$transaction(async (tx) => {
      let typeId: string;
      let createdTypeId: string | null = null;

      if (input.newType) {
        const type = await typeRepository.create({
          name: input.newType.name,
          description: input.newType.description ?? null,
          createdByUserId: actorId,
          items: input.newType.items,
          tx,
        });
        typeId = type.id;
        createdTypeId = type.id;
      } else {
        const type = await typeRepository.findOwnership(input.typeId as string, tx);
        if (!type || !type.active) {
          throw new HttpError(400, "Tipo inválido ou inativo.");
        }
        typeId = type.id;
      }

      const event = await eventRepository.create({
        name: input.name,
        typeId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        createdByUserId: actorId,
        pixKey: input.pixKey ?? null,
        pixQrUrl: input.pixQrUrl ?? null,
        hasServiceFee: input.hasServiceFee ?? false,
        serviceFeeAmount: input.hasServiceFee ? input.serviceFeeAmount ?? null : null,
        tx,
      });

      await eventOrganizerService.linkOrganizer({
        eventId: event.id,
        userId: actorId,
        grantedBy: actorId,
        tx,
      });

      return { event, createdTypeId };
    });

    if (result.createdTypeId) {
      await auditService.log({
        actorId,
        action: AuditAction.TYPE_CREATE,
        targetId: result.createdTypeId,
      });
    }
    await auditService.log({
      actorId,
      action: AuditAction.EVENT_CREATE,
      targetId: result.event.id,
    });

    return toEventDetailsDto(result.event);
  }

  private async createPizza(actorId: string, input: CreateEventInput) {
    const result = await prisma.$transaction(async (tx) => {
      const event = await eventRepository.create({
        name: input.name,
        typeId: null,
        kind: "PIZZA_SPLIT",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        createdByUserId: actorId,
        maxFlavorsPerOrder: input.maxFlavorsPerOrder ?? 3,
        slicesPerPizza: input.slicesPerPizza ?? env.defaultSlicesPerPizza,
        avgLargePizzaPrice: input.avgLargePizzaPrice ?? env.defaultLargePizzaPrice,
        pixKey: input.pixKey ?? null,
        pixQrUrl: input.pixQrUrl ?? null,
        tx,
      });

      // Sabores extras informados na criação (RP3). Barra nomes que já existem
      // como sabor padrão (ou repetidos no próprio lote) → 400.
      const extras = input.extraFlavors ?? [];
      await flavorService.assertNamesAvailable({
        names: extras.map((flavor) => flavor.name),
        eventId: event.id,
        tx,
      });
      for (const flavor of extras) {
        await flavorRepository.create({
          name: flavor.name,
          isSweet: flavor.isSweet ?? false,
          eventId: event.id,
          createdByUserId: actorId,
          tx,
        });
      }

      await eventOrganizerService.linkOrganizer({
        eventId: event.id,
        userId: actorId,
        grantedBy: actorId,
        tx,
      });

      return { event };
    });

    await auditService.log({
      actorId,
      action: AuditAction.EVENT_CREATE,
      targetId: result.event.id,
    });

    return toEventDetailsDto(result.event);
  }

  /** Edita a rodada (nome/datas/status e, no racha, a config). Posse via `requireEventAccess`. */
  async update(params: {
    actorId: string;
    eventId: string;
    input: UpdateEventInput;
  }) {
    const current = await eventRepository.findForUpdate(params.eventId);
    if (!current) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const startsAt = params.input.startsAt ?? current.startsAt;
    const endsAt = params.input.endsAt ?? current.endsAt;
    if (endsAt <= startsAt) {
      throw new HttpError(400, "O término deve ser após o início.");
    }

    // PIX vale para os dois modos; o motor do racha continua exclusivo dele.
    const pizzaConfigProvided =
      params.input.maxFlavorsPerOrder !== undefined ||
      params.input.slicesPerPizza !== undefined ||
      params.input.avgLargePizzaPrice !== undefined;

    if (pizzaConfigProvided && current.kind !== "PIZZA_SPLIT") {
      throw new HttpError(400, "Configuração de racha não se aplica a esta rodada.");
    }

    const pizzaFrozenTouched =
      pizzaConfigProvided ||
      params.input.pixKey !== undefined ||
      params.input.pixQrUrl !== undefined;
    if (
      current.kind === "PIZZA_SPLIT" &&
      pizzaFrozenTouched &&
      current.costRegisteredAt
    ) {
      throw new HttpError(
        409,
        "O custo já foi registrado; a configuração está congelada.",
      );
    }

    // Taxa de serviço só existe na encomenda (STANDARD).
    const feeProvided =
      params.input.hasServiceFee !== undefined ||
      params.input.serviceFeeAmount !== undefined;
    if (feeProvided && current.kind !== "STANDARD") {
      throw new HttpError(400, "Taxa de serviço só se aplica a rodadas de encomenda.");
    }

    const updated = await eventRepository.update(params.eventId, {
      name: params.input.name,
      startsAt: params.input.startsAt,
      endsAt: params.input.endsAt,
      status: params.input.status,
      maxFlavorsPerOrder: params.input.maxFlavorsPerOrder,
      slicesPerPizza: params.input.slicesPerPizza,
      avgLargePizzaPrice: params.input.avgLargePizzaPrice,
      pixKey: params.input.pixKey,
      pixQrUrl: params.input.pixQrUrl,
      hasServiceFee: params.input.hasServiceFee,
      // Desligar a taxa zera o valor guardado (evita "taxa fantasma" ao religar).
      serviceFeeAmount:
        params.input.hasServiceFee === false ? null : params.input.serviceFeeAmount,
    });

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.EVENT_UPDATE,
      targetId: params.eventId,
      metadata: { changed: Object.keys(params.input) },
    });

    return toEventDetailsDto(updated);
  }

  /** F4.2 — lista mínima de participantes de um evento (apelido + avatar). */
  async getParticipants(eventId: string) {
    const exists = await eventRepository.existsById(eventId);
    if (!exists) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const rows = await orderRepository.findParticipantsByEventId(eventId);
    return rows.map(({ user }) => ({
      id: user.id,
      displayName: user.displayName ?? `${user.name} ${user.surname}`,
      avatarUrl: user.avatarUrl,
    }));
  }
}

export const eventService = new EventService();
