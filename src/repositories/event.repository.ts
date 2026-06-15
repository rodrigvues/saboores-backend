import { prisma } from "../lib/prisma.js";

class EventRepository {
  async findMany() {
    return prisma.event.findMany({
      orderBy: {
        startsAt: "asc",
      },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        status: true,
        type: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    return prisma.event.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        status: true,
        createdAt: true,
        type: {
          select: {
            id: true,
            name: true,
            description: true,
            items: {
              where: {
                active: true,
              },
              orderBy: {
                name: "asc",
              },
              select: {
                id: true,
                name: true,
                price: true,
                active: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            surname: true,
          },
        },
      },
    });
  }
}

export const eventRepository = new EventRepository();
