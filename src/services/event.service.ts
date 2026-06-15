import { eventRepository } from "../repositories/event.repository.js";

class EventService {
  async getEvents() {
    return eventRepository.findMany();
  }

  async getEventById(id: string) {
    return eventRepository.findById(id);
  }
}

export const eventService = new EventService();