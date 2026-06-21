import { prisma } from "../lib/prisma.js";

class EventOrganizerRepository {
  /** Existe vínculo (eventId, userId)? Base do middleware de autorização. */
  async exists(eventId: string, userId: string) {
    const link = await prisma.eventOrganizer.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true },
    });
    return link !== null;
  }

  async create(data: {
    eventId: string;
    userId: string;
    createdByUserId?: string | null;
  }) {
    return prisma.eventOrganizer.create({
      data: {
        eventId: data.eventId,
        userId: data.userId,
        createdByUserId: data.createdByUserId ?? null,
      },
      select: { id: true },
    });
  }

  /** Organizadores de um evento, com dados públicos do usuário. */
  async findByEvent(eventId: string) {
    return prisma.eventOrganizer.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        createdByUserId: true,
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async delete(eventId: string, userId: string) {
    return prisma.eventOrganizer.delete({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true },
    });
  }
}

export const eventOrganizerRepository = new EventOrganizerRepository();
