import {
  toEventDetailsDto,
  toEventSummaryDto,
} from "../dtos/event.dto.js";
import { eventRepository } from "../repositories/event.repository.js";
import { typeRepository } from "../repositories/type.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { prisma } from "../lib/prisma.js";
import { eventOrganizerService } from "./eventOrganizer.service.js";
import { auditService, AuditAction } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";
import type { CreateEventInput, UpdateEventInput } from "../schemas/event.schema.js";

class EventService {
  async getEvents() {
    const events = await eventRepository.findMany();

    return events.map(toEventSummaryDto);
  }

  /** Rodadas que o usuário gerencia (ADMIN: todas; ORGANIZER: vinculadas). */
  async getManaged(params: { userId: string; isAdmin: boolean }) {
    const events = await eventRepository.findManagedBy(params);
    return events.map(toEventSummaryDto);
  }

  async getEventById(id: string) {
    const event = await eventRepository.findById(id);

    if (!event) {
      return null;
    }

    return toEventDetailsDto(event);
  }

  /**
   * Cria a rodada (Parte 1). Modo A: `typeId` existente. Modo B: `newType`
   * inline (cria Tipo + itens na mesma transação). Em ambos, o criador é
   * vinculado como ORGANIZER e promovido se for USER.
   */
  async create(params: {
    actorId: string;
    input: CreateEventInput;
  }) {
    const { input } = params;

    const result = await prisma.$transaction(async (tx) => {
      let typeId: string;
      let createdTypeId: string | null = null;

      if (input.newType) {
        const type = await typeRepository.create({
          name: input.newType.name,
          description: input.newType.description ?? null,
          createdByUserId: params.actorId,
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
        createdByUserId: params.actorId,
        tx,
      });

      await eventOrganizerService.linkOrganizer({
        eventId: event.id,
        userId: params.actorId,
        grantedBy: params.actorId,
        tx,
      });

      return { event, createdTypeId };
    });

    if (result.createdTypeId) {
      await auditService.log({
        actorId: params.actorId,
        action: AuditAction.TYPE_CREATE,
        targetId: result.createdTypeId,
      });
    }
    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.EVENT_CREATE,
      targetId: result.event.id,
    });

    return toEventDetailsDto(result.event);
  }

  /** Edita a rodada (nome/datas/status). Posse via `requireEventAccess`. */
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

    const updated = await eventRepository.update(params.eventId, {
      name: params.input.name,
      startsAt: params.input.startsAt,
      endsAt: params.input.endsAt,
      status: params.input.status,
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
