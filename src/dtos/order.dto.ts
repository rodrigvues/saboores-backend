import { Prisma, type EventStatus, type OrderStatus, type PaymentStatus } from "@prisma/client";

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
    total: string;
  }[];
  grandTotal: string;
};

function getOrderItemsTotal(orderItems: OrderItemRecord[]) {
  return orderItems.reduce(
    (total, orderItem) => total.plus(orderItem.unitPrice.mul(orderItem.quantity)),
    new Prisma.Decimal(0),
  );
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
    total: getOrderItemsTotal(order.orderItems).toString(),
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
    total: getOrderItemsTotal(order.orderItems).toString(),
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
    total: getOrderItemsTotal(order.orderItems).toString(),
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
    const orderTotal = getOrderItemsTotal(order.orderItems);
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
