import type { EventKind, EventStatus, Prisma } from "@prisma/client";

type EventTypeRef = {
  id: string;
  name: string;
  description: string | null;
};

type EventListRecord = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  kind: EventKind;
  slicesPerPizza: number | null;
  avgLargePizzaPrice: Prisma.Decimal | null;
  type: EventTypeRef | null;
};

type EventDetailsRecord = {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  createdAt: Date;
  maxItemsPerOrder: number;
  kind: EventKind;
  maxFlavorsPerOrder: number | null;
  slicesPerPizza: number | null;
  avgLargePizzaPrice: Prisma.Decimal | null;
  pixKey: string | null;
  pixQrUrl: string | null;
  hasServiceFee: boolean;
  serviceFeeAmount: Prisma.Decimal | null;
  actualTotalCost: Prisma.Decimal | null;
  costEvidenceUrl: string | null;
  costRegisteredAt: Date | null;
  choicesLockedAt: Date | null;
  type:
    | (EventTypeRef & {
        items: {
          id: string;
          name: string;
          price: Prisma.Decimal;
          active: boolean;
        }[];
      })
    | null;
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
  kind: EventKind;
  typeId: string | null;
  typeTitle: string | null;
  startsAt: Date;
  endsAt: Date;
  status: EventStatus;
  /** Pizza: "≈ R$ X/pessoa" (motor). Null no STANDARD. */
  estimatedPerPerson: string | null;
};

/** Config + custo do racha (RP3/RP9). Só presente em PIZZA_SPLIT. */
export type EventPizzaConfig = {
  maxFlavorsPerOrder: number | null;
  slicesPerPizza: number | null;
  avgLargePizzaPrice: string | null;
  pixKey: string | null;
  pixQrUrl: string | null;
  actualTotalCost: string | null;
  costEvidenceUrl: string | null;
  costRegisteredAt: Date | null;
  choicesLockedAt: Date | null;
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
  kind: EventKind;
  /** Taxa de serviço por pedido (encomenda). Null quando a rodada não cobra taxa. */
  serviceFee: string | null;
  /** Recebimento PIX da rodada (vale para os dois modos). */
  pixKey: string | null;
  pixQrUrl: string | null;
  type: {
    id: string;
    title: string;
    description: string | null;
  } | null;
  createdBy: {
    id: string;
    name: string;
    surname: string;
    fullName: string;
  };
  /** Itens/sabores do pastel (STANDARD). Vazio no racha — lá os sabores vêm de /flavors. */
  flavors: {
    id: string;
    title: string;
    price: string;
    active: boolean;
  }[];
  /** Config do racha (PIZZA_SPLIT). Null no STANDARD. */
  pizza: EventPizzaConfig | null;
};

export function toEventSummaryDto(
  event: EventListRecord,
  estimatedPerPerson: string | null = null,
): EventSummaryDto {
  return {
    id: event.id,
    title: event.name,
    description: event.type?.description ?? null,
    kind: event.kind,
    typeId: event.type?.id ?? null,
    typeTitle: event.type?.name ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    estimatedPerPerson,
  };
}

export function toEventDetailsDto(event: EventDetailsRecord): EventDetailsDto {
  const isPizza = event.kind === "PIZZA_SPLIT";

  return {
    id: event.id,
    title: event.name,
    description: event.type?.description ?? null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    createdAt: event.createdAt,
    maxItemsPerOrder: event.maxItemsPerOrder,
    kind: event.kind,
    serviceFee:
      event.hasServiceFee && event.serviceFeeAmount
        ? event.serviceFeeAmount.toString()
        : null,
    pixKey: event.pixKey,
    pixQrUrl: event.pixQrUrl,
    type: event.type
      ? {
          id: event.type.id,
          title: event.type.name,
          description: event.type.description,
        }
      : null,
    createdBy: {
      id: event.createdByUser.id,
      name: event.createdByUser.name,
      surname: event.createdByUser.surname,
      fullName: `${event.createdByUser.name} ${event.createdByUser.surname}`,
    },
    flavors: (event.type?.items ?? []).map((item) => ({
      id: item.id,
      title: item.name,
      price: item.price.toString(),
      active: item.active,
    })),
    pizza: isPizza
      ? {
          maxFlavorsPerOrder: event.maxFlavorsPerOrder,
          slicesPerPizza: event.slicesPerPizza,
          avgLargePizzaPrice: event.avgLargePizzaPrice?.toString() ?? null,
          pixKey: event.pixKey,
          pixQrUrl: event.pixQrUrl,
          actualTotalCost: event.actualTotalCost?.toString() ?? null,
          costEvidenceUrl: event.costEvidenceUrl,
          costRegisteredAt: event.costRegisteredAt,
          choicesLockedAt: event.choicesLockedAt,
        }
      : null,
  };
}
