import {
  toEventDetailsDto,
  toEventSummaryDto,
} from "../dtos/event.dto.js";
import { eventRepository } from "../repositories/event.repository.js";
import { orderRepository } from "../repositories/order.repository.js";
import { HttpError } from "../utils/http-error.js";

class EventService {
  async getEvents() {
    const events = await eventRepository.findMany();

    return events.map(toEventSummaryDto);
  }

  async getEventById(id: string) {
    const event = await eventRepository.findById(id);

    if (!event) {
      return null;
    }

    return toEventDetailsDto(event);
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
