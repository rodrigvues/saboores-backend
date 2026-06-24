import type { EventStatus, Prisma } from "@prisma/client";

type EventListRecord = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  type: {
    id: string;
    name: string;
    description: string | null;
  };
};

type EventDetailsRecord = EventListRecord & {
  createdAt: Date;
  maxItemsPerOrder: number;
  type: EventListRecord["type"] & {
    items: {
      id: string;
      name: string;
      price: Prisma.Decimal;
      active: boolean;
    }[];
  };
  createdByUser: {
    id: string;
    name: string;
    surname: string;
  };
};

export type EventSummaryDto = {
  id: string;
  title: string;
  description: string | null;
  typeId: string;
  typeTitle: string;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
};

export type EventDetailsDto = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  createdAt: Date;
  maxItemsPerOrder: number;
  type: {
    id: string;
    title: string;
    description: string | null;
  };
  createdBy: {
    id: string;
    name: string;
    surname: string;
    fullName: string;
  };
  flavors: {
    id: string;
    title: string;
    price: string;
    active: boolean;
  }[];
};

export function toEventSummaryDto(event: EventListRecord): EventSummaryDto {
  return {
    id: event.id,
    title: event.name,
    description: event.type.description,
    typeId: event.type.id,
    typeTitle: event.type.name,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
  };
}

export function toEventDetailsDto(event: EventDetailsRecord): EventDetailsDto {
  return {
    id: event.id,
    title: event.name,
    description: event.type.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    createdAt: event.createdAt,
    maxItemsPerOrder: event.maxItemsPerOrder,
    type: {
      id: event.type.id,
      title: event.type.name,
      description: event.type.description,
    },
    createdBy: {
      id: event.createdByUser.id,
      name: event.createdByUser.name,
      surname: event.createdByUser.surname,
      fullName: `${event.createdByUser.name} ${event.createdByUser.surname}`,
    },
    flavors: event.type.items.map((item) => ({
      id: item.id,
      title: item.name,
      price: item.price.toString(),
      active: item.active,
    })),
  };
}
