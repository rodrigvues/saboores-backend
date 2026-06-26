import type { EventStatus, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import type { RecommendResult } from "../services/pizzaSplit.engine.js";

type DashboardEventRecord = {
  id: string;
  name: string;
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
  choicesLockedAt: Date | null;
  costRegisteredAt: Date | null;
  actualTotalCost: Prisma.Decimal | null;
  pixKey: string | null;
  pixQrUrl: string | null;
  costEvidenceUrl: string | null;
};

type DashboardParticipationRecord = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  slicesWanted: number | null;
  amountDue: Prisma.Decimal | null;
  user: { id: string; name: string; surname: string; email: string };
  flavorVotes: { flavor: { id: string; name: string; isSweet: boolean } }[];
};

export type PizzaDashboardDto = {
  kind: "PIZZA_SPLIT";
  event: {
    id: string;
    title: string;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
    choicesLockedAt: Date | null;
    costRegisteredAt: Date | null;
    actualTotalCost: string | null;
    pixKey: string | null;
    pixQrUrl: string | null;
    costEvidenceUrl: string | null;
  };
  participants: number;
  totalSlices: number;
  recommendedPizzas: { total: number; savory: number; sweet: number };
  estimatedTotal: string;
  estimatedPerPerson: string | null;
  flavorVotes: {
    flavorId: string;
    name: string;
    isSweet: boolean;
    votes: number;
    suggestedPizzas: number;
  }[];
  preferences: {
    key: string;
    text: string;
    yes: number;
    no: number;
    suggestion: number | null;
  }[];
  byPerson: {
    orderId: string;
    user: { id: string; fullName: string; email: string };
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    slicesWanted: number | null;
    amountDue: string | null;
    flavors: { id: string; name: string; isSweet: boolean }[];
  }[];
};

export function toPizzaDashboardDto(params: {
  event: DashboardEventRecord;
  result: RecommendResult;
  participations: DashboardParticipationRecord[];
}): PizzaDashboardDto {
  const { event, result, participations } = params;

  return {
    kind: "PIZZA_SPLIT",
    event: {
      id: event.id,
      title: event.name,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      choicesLockedAt: event.choicesLockedAt,
      costRegisteredAt: event.costRegisteredAt,
      actualTotalCost: event.actualTotalCost?.toString() ?? null,
      pixKey: event.pixKey,
      pixQrUrl: event.pixQrUrl,
      costEvidenceUrl: event.costEvidenceUrl,
    },
    participants: result.participants,
    totalSlices: result.totalSlices,
    recommendedPizzas: result.recommendedPizzas,
    estimatedTotal: result.estimatedTotal.toFixed(2),
    estimatedPerPerson:
      result.estimatedPerPerson !== null
        ? result.estimatedPerPerson.toFixed(2)
        : null,
    flavorVotes: result.flavorVotes.map((flavor) => ({
      flavorId: flavor.flavorId,
      name: flavor.name,
      isSweet: flavor.isSweet,
      votes: flavor.votes,
      suggestedPizzas: flavor.suggestedPizzas,
    })),
    preferences: result.preferences.map((pref) => ({
      key: pref.key,
      text: pref.text,
      yes: pref.yes,
      no: pref.no,
      suggestion: pref.suggestion,
    })),
    byPerson: participations.map((participation) => ({
      orderId: participation.id,
      user: {
        id: participation.user.id,
        fullName: `${participation.user.name} ${participation.user.surname}`,
        email: participation.user.email,
      },
      status: participation.status,
      paymentStatus: participation.paymentStatus,
      slicesWanted: participation.slicesWanted,
      amountDue: participation.amountDue?.toString() ?? null,
      flavors: participation.flavorVotes.map((vote) => ({
        id: vote.flavor.id,
        name: vote.flavor.name,
        isSweet: vote.flavor.isSweet,
      })),
    })),
  };
}
