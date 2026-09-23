import type { EventKind, EventStatus, Prisma } from "@prisma/client";
import { pickMostOrderedIds } from "../services/itemOrdering.engine.js";
import type { EventGoalDto } from "./eventGoal.dto.js";

type EventTypeRef = {
  id: string;
  name: string;
  description: string | null;
};

/** Meta como sai da projeção do repositório (o progresso é agregado à parte). */
type EventGoalRef = {
  name: string;
  targetAmountCents: number;
  reachedAt: Date | null;
} | null;

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
  goal: EventGoalRef;
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
  serviceFeePercent: Prisma.Decimal | null;
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
          orderCount: number;
        }[];
      })
    | null;
  createdByUser: {
    id: string;
    name: string;
    surname: string;
  };
  goal: EventGoalRef;
};

/** Item já ordenado pelo service, com os flags de personalização e destaque. */
export type OrderedEventItem = {
  id: string;
  name: string;
  price: Prisma.Decimal;
  active: boolean;
  orderCount: number;
  orderedByMe: boolean;
  isMostOrdered: boolean;
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
  /** Meta de valor (encomenda). Null quando a rodada não tem meta. */
  goal: EventGoalDto | null;
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
  /** Percentual da taxa sobre o subtotal (encomenda). Null quando a rodada não cobra taxa. */
  serviceFeePercent: string | null;
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
    /**
     * Este usuário já pediu este item antes (1º nível da ordenação). Só é
     * calculado em GET /events/:id; POST /events e PATCH /events/:id devolvem
     * sempre false (ver RN-12).
     */
    orderedByMe: boolean;
    /** Unidades que o grupo já pediu (2º nível). Agregado derivado. */
    orderCount: number;
    /**
     * Está entre os dois itens mais pedidos do catálogo (RN-13). Ao contrário
     * de `orderedByMe`, não depende de quem pergunta: vale em toda resposta.
     */
    isMostOrdered: boolean;
  }[];
  /** Config do racha (PIZZA_SPLIT). Null no STANDARD. */
  pizza: EventPizzaConfig | null;
  /** Meta de valor (encomenda). Null quando a rodada não tem meta. */
  goal: EventGoalDto | null;
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
    // Preenchido depois por eventGoalService (o progresso é agregado à parte).
    goal: null,
  };
}

export function toEventDetailsDto(
  event: EventDetailsRecord,
  orderedItems?: OrderedEventItem[],
): EventDetailsDto {
  const isPizza = event.kind === "PIZZA_SPLIT";
  const fallbackItems = event.type?.items ?? [];
  // `isMostOrdered` não depende de quem pergunta, então vale também no fallback.
  const fallbackMostOrdered = pickMostOrderedIds(fallbackItems);
  // Sem lista ordenada (criação, edição, racha): ordem do repositório, sem `orderedByMe`.
  const items: OrderedEventItem[] =
    orderedItems ??
    fallbackItems.map((item) => ({
      ...item,
      orderedByMe: false,
      isMostOrdered: fallbackMostOrdered.has(item.id),
    }));

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
    serviceFeePercent:
      event.hasServiceFee && event.serviceFeePercent
        ? event.serviceFeePercent.toString()
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
    flavors: items.map((item) => ({
      id: item.id,
      title: item.name,
      price: item.price.toString(),
      active: item.active,
      orderedByMe: item.orderedByMe,
      orderCount: item.orderCount,
      isMostOrdered: item.isMostOrdered,
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
    // Preenchido depois por eventGoalService (o progresso é agregado à parte).
    goal: null,
  };
}
