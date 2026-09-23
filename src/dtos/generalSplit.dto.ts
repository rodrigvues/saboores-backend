import type { EventStatus, OrderStatus, PaymentStatus, SplitMode } from "@prisma/client";
import { centsToReais } from "../utils/money.js";

/**
 * DTOs do racha geral. Unidade de cada campo: `amount*`/`share*`/`total*`/`estimated*`
 * em string são REAIS com 2 casas; `*Percent` é número com 2 casas; contagens e
 * `version` são inteiros. Nenhum campo em centavos ou bps atravessa o fio.
 */

export type SplitQuoteDto = {
  eventId: string;
  version: number;
  mode: SplitMode;
  purchaseName: string;
  totalAmount: string;
  participantCount: number;
  targetParticipants: number | null;
  missingParticipants: number | null;
  completedAt: Date | null;
  settledAt: Date | null;
  viewerIsParticipant: boolean;
  shareIfJoining: string | null;
  sharePercentIfJoining: number | null;
  myShare: string | null;
  myShareIsFinal: boolean;
  mySharePercent: number | null;
  joinMinPercent: number | null;
  joinMaxPercent: number | null;
  myMinPercent: number | null;
  myMaxPercent: number | null;
  participantsAfter: number;
  isEstimate: boolean;
  fullyPinned: boolean;
};

export type GeneralSplitParticipationDto = {
  id: string;
  kind: "GENERAL_SPLIT";
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  event: { id: string; title: string };
  purchaseName: string;
  sharePercent: number | null;
  amountDue: string | null;
  estimatedShare: string | null;
  isEstimate: boolean;
  editableUntil: Date;
  pixKey: string | null;
  pixQrUrl: string | null;
  quote: SplitQuoteDto;
};

/** Bloco embutido no GET /events/:id e no card da listagem. */
export type GeneralSplitBlockDto = {
  purchaseName: string;
  totalAmount: string;
  mode: SplitMode;
  participantCount: number;
  targetParticipants: number | null;
  missingParticipants: number | null;
  completedAt: Date | null;
  settledAt: Date | null;
  version: number;
};

export type GeneralSplitDashboardPerson = {
  orderId: string;
  user: { id: string; fullName: string; email: string };
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  sharePercent: number | null;
  amountDue: string | null;
  isEstimate: boolean;
  joinedAt: Date;
};

export type GeneralSplitDashboardDto = {
  kind: "GENERAL_SPLIT";
  event: {
    id: string;
    title: string;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
    pixKey: string | null;
    pixQrUrl: string | null;
  };
  split: GeneralSplitBlockDto;
  settledTotal: string | null;
  byPerson: GeneralSplitDashboardPerson[];
};

type SplitBlockRecord = {
  purchaseName: string;
  totalAmountCents: number;
  mode: SplitMode;
  participantCount: number;
  targetParticipants: number | null;
  completedAt: Date | null;
  settledAt: Date | null;
  version: number;
};

/** Quantas pessoas faltam num TARGET; null no DYNAMIC. */
export function missingParticipantsOf(
  targetParticipants: number | null,
  participantCount: number,
): number | null {
  return targetParticipants === null
    ? null
    : Math.max(targetParticipants - participantCount, 0);
}

export function toGeneralSplitBlockDto(split: SplitBlockRecord): GeneralSplitBlockDto {
  return {
    purchaseName: split.purchaseName,
    totalAmount: centsToReais(split.totalAmountCents),
    mode: split.mode,
    participantCount: split.participantCount,
    targetParticipants: split.targetParticipants,
    missingParticipants: missingParticipantsOf(split.targetParticipants, split.participantCount),
    completedAt: split.completedAt,
    settledAt: split.settledAt,
    version: split.version,
  };
}
