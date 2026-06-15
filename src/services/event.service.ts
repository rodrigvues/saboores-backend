import {
  toEventDetailsDto,
  toEventSummaryDto,
} from "../dtos/event.dto.js";
import { eventRepository } from "../repositories/event.repository.js";

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
}

export const eventService = new EventService();
