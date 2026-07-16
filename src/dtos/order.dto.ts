import { Prisma, type EventStatus, type OrderStatus, type PaymentStatus } from "@prisma/client";
import { PIZZA_EDIT_WINDOW_MS } from "../constants/order.js";

type OrderItemRecord = {
  quantity: number;
  unitPrice: Prisma.Decimal;
  item: {
    id: string;
    name: string;
  };
};

type OrderEventRecord = {
  id: string;
  name: string;
  status?: EventStatus;
  startsAt?: Date;
  endsAt?: Date;
};

type OrderBaseRecord = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
  deliveredAt?: Date | null;
  /** Snapshot da taxa de serviço (encomenda). Null = pedido sem taxa. */
  serviceFee?: Prisma.Decimal | null;
  event?: OrderEventRecord;
  orderItems: OrderItemRecord[];
};

type UserRecord = {
  id: string;
  name: string;
  surname: string;
  email: string;
};

type AdminOrderRecord = OrderBaseRecord & {
  user: UserRecord;
};

type SummaryEventRecord = {
  id: string;
  name: string;
  status: EventStatus;
  startsAt: Date;
  endsAt: Date;
};

export type OrderItemDto = {
  itemId: string;
  title: string;
  quantity: number;
  unitPrice: string;
};

export type CreatedOrderDto = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  event: {
    id: string;
    title: string;
  };
  items: OrderItemDto[];
  /** Taxa de serviço da rodada (string Decimal) ou null. Já somada em `total`. */
  serviceFee: string | null;
  total: string;
};

export type UserOrderDto = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  deliveredAt: Date | null;
  event: {
    id: string;
    title: string;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
  };
  items: OrderItemDto[];
  /** Taxa de serviço da rodada (string Decimal) ou null. Já somada em `total`. */
  serviceFee: string | null;
  total: string;
};

export type CancelOrderDto = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelledAt: Date | null;
};

export type ConfirmPaymentDto = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  confirmedAt: Date | null;
};

export type DeliverOrderDto = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveredAt: Date | null;
};

export type AdminEventOrderDto = {
  id: string;
  user: {
    id: string;
    name: string;
    surname: string;
    fullName: string;
    email: string;
  };
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  items: OrderItemDto[];
  /** Taxa de serviço da rodada (string Decimal) ou null. Já somada em `total`. */
  serviceFee: string | null;
  total: string;
};

export type EventSummaryDto = {
  event: {
    id: string;
    title: string;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
  };
  totalsByItem: {
    itemId: string;
    title: string;
    totalQuantity: number;
  }[];
  byPerson: {
    orderId: string;
    user: {
      id: string;
      fullName: string;
      email: string;
    };
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    items: Omit<OrderItemDto, "unitPrice">[];
    /** Taxa de serviço do pedido (string Decimal) ou null. Já somada em `total`. */
    serviceFee: string | null;
    total: string;
  }[];
  /** Soma dos totais por pessoa (itens + taxas de serviço). */
  grandTotal: string;
};

// ── Racha de pizza — participação (votos + fatias + respostas) ───────────────

type PizzaParticipationRecord = {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  slicesWanted: number | null;
  amountDue: Prisma.Decimal | null;
  event: { id: string; name: string };
  flavorVotes: { flavor: { id: string; name: string; isSweet: boolean } }[];
  preferences: {
    questionId: string;
    answer: boolean;
    question: { key: string; text: string };
  }[];
};

export type PizzaParticipationDto = {
  id: string;
  kind: "PIZZA_SPLIT";
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  event: { id: string; title: string };
  slicesWanted: number | null;
  /** Valor real após o rateio (string Decimal) ou null antes do custo. */
  amountDue: string | null;
  /** Estimativa "≈ R$ X/pessoa" (motor) enquanto não há custo real. */
  estimatedPerPerson: string | null;
  /** Limite para o próprio participante editar (createdAt + 10 min). */
  editableUntil: Date;
  flavors: { id: string; name: string; isSweet: boolean }[];
  answers: { questionId: string; key: string; text: string; answer: boolean }[];
};

export function toPizzaParticipationDto(
  order: PizzaParticipationRecord,
  estimatedPerPerson: string | null,
): PizzaParticipationDto {
  return {
    id: order.id,
    kind: "PIZZA_SPLIT",
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    event: { id: order.event.id, title: order.event.name },
    slicesWanted: order.slicesWanted,
    amountDue: order.amountDue?.toString() ?? null,
    estimatedPerPerson,
    editableUntil: new Date(order.createdAt.getTime() + PIZZA_EDIT_WINDOW_MS),
    flavors: order.flavorVotes.map((vote) => ({
      id: vote.flavor.id,
      name: vote.flavor.name,
      isSweet: vote.flavor.isSweet,
    })),
    answers: order.preferences.map((pref) => ({
      questionId: pref.questionId,
      key: pref.question.key,
      text: pref.question.text,
      answer: pref.answer,
    })),
  };
}

function getOrderItemsTotal(orderItems: OrderItemRecord[]) {
  return orderItems.reduce(
    (total, orderItem) => total.plus(orderItem.unitPrice.mul(orderItem.quantity)),
    new Prisma.Decimal(0),
  );
}

/** Total do pedido = itens + taxa de serviço (quando houver). */
function getOrderTotal(order: Pick<OrderBaseRecord, "orderItems" | "serviceFee">) {
  return getOrderItemsTotal(order.orderItems).plus(order.serviceFee ?? 0);
}

function serviceFeeToString(serviceFee: Prisma.Decimal | null | undefined) {
  return serviceFee?.toString() ?? null;
}

function toOrderItemsDto(orderItems: OrderItemRecord[]): OrderItemDto[] {
  return orderItems.map((orderItem) => ({
    itemId: orderItem.item.id,
    title: orderItem.item.name,
    quantity: orderItem.quantity,
    unitPrice: orderItem.unitPrice.toString(),
  }));
}

export function toCreatedOrderDto(order: OrderBaseRecord & { event: OrderEventRecord }): CreatedOrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    event: {
      id: order.event.id,
      title: order.event.name,
    },
    items: toOrderItemsDto(order.orderItems),
    serviceFee: serviceFeeToString(order.serviceFee),
    total: getOrderTotal(order).toString(),
  };
}

export function toUserOrderDto(
  order: OrderBaseRecord & { event: Required<OrderEventRecord> },
): UserOrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    deliveredAt: order.deliveredAt ?? null,
    event: {
      id: order.event.id,
      title: order.event.name,
      status: order.event.status,
      startsAt: order.event.startsAt,
      endsAt: order.event.endsAt,
    },
    items: toOrderItemsDto(order.orderItems),
    serviceFee: serviceFeeToString(order.serviceFee),
    total: getOrderTotal(order).toString(),
  };
}

export function toCancelOrderDto(order: {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  cancelledAt: Date | null;
}): CancelOrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    cancelledAt: order.cancelledAt,
  };
}

export function toConfirmPaymentDto(order: {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  confirmedAt: Date | null;
}): ConfirmPaymentDto {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    confirmedAt: order.confirmedAt,
  };
}

export function toDeliverOrderDto(order: {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveredAt: Date | null;
}): DeliverOrderDto {
  return {
    id: order.id,
    status: order.status,
    paymentStatus: order.paymentStatus,
    deliveredAt: order.deliveredAt,
  };
}

export function toAdminEventOrderDto(order: AdminOrderRecord): AdminEventOrderDto {
  return {
    id: order.id,
    user: {
      id: order.user.id,
      name: order.user.name,
      surname: order.user.surname,
      fullName: `${order.user.name} ${order.user.surname}`,
      email: order.user.email,
    },
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    items: toOrderItemsDto(order.orderItems),
    serviceFee: serviceFeeToString(order.serviceFee),
    total: getOrderTotal(order).toString(),
  };
}

export function toEventSummaryDto(
  event: SummaryEventRecord,
  orders: AdminOrderRecord[],
): EventSummaryDto {
  const validOrders = orders.filter((order) => !["CANCELLED", "EXPIRED"].includes(order.status));
  const totalsByItem = new Map<string, { itemId: string; title: string; totalQuantity: number }>();
  let grandTotal = new Prisma.Decimal(0);

  const byPerson = validOrders.map((order) => {
    const orderTotal = getOrderTotal(order);
    grandTotal = grandTotal.plus(orderTotal);

    for (const orderItem of order.orderItems) {
      const current = totalsByItem.get(orderItem.item.id);

      totalsByItem.set(orderItem.item.id, {
        itemId: orderItem.item.id,
        title: orderItem.item.name,
        totalQuantity: (current?.totalQuantity ?? 0) + orderItem.quantity,
      });
    }

    return {
      orderId: order.id,
      user: {
        id: order.user.id,
        fullName: `${order.user.name} ${order.user.surname}`,
        email: order.user.email,
      },
      status: order.status,
      paymentStatus: order.paymentStatus,
      items: order.orderItems.map((orderItem) => ({
        itemId: orderItem.item.id,
        title: orderItem.item.name,
        quantity: orderItem.quantity,
      })),
      serviceFee: serviceFeeToString(order.serviceFee),
      total: orderTotal.toString(),
    };
  });

  return {
    event: {
      id: event.id,
      title: event.name,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    totalsByItem: Array.from(totalsByItem.values()),
    byPerson,
    grandTotal: grandTotal.toString(),
  };
}
