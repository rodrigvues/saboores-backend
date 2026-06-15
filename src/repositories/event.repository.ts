import { prisma } from "../lib/prisma.js";

class EventRepository {
  async findMany() {
    return prisma.event.findMany();
  }

  async findById(id: string) {
    return prisma.event.findUnique({
      where: {
        id,
      },
    });
  }
}

export const eventRepository = new EventRepository();