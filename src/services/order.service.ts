import {
  toAdminEventOrderDto,
  toCancelOrderDto,
  toConfirmPaymentDto,
  toCreatedOrderDto,
  toEventSummaryDto,
  toUserOrderDto,
} from "../dtos/order.dto.js";
import { orderRepository } from "../repositories/order.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { HttpError } from "../utils/http-error.js";

type CreateOrderInput = {
  userId: string;
  eventId: string;
  items: {
    itemId: string;
    quantity: number;
  }[];
};

class OrderService {
  async create(data: CreateOrderInput) {
    const user = await userRepository.findById(data.userId);

    if (!user) {
      throw new HttpError(404, "Perfil não encontrado.");
    }

    const event = await orderRepository.findEventForOrder(data.eventId);

    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    if (event.status !== "OPEN") {
      throw new HttpError(409, "Evento não está aberto.");
    }

    const normalizedItems = this.normalizeItems(data.items);
    const totalQuantity = normalizedItems.reduce((total, item) => total + item.quantity, 0);

    if (totalQuantity >= 10) {
      throw new HttpError(400, "Pedidos não podem ter 10 ou mais itens.");
    }

    const items = await orderRepository.findActiveItemsByIds(
      normalizedItems.map((item) => item.itemId),
    );

    if (items.length !== normalizedItems.length) {
      throw new HttpError(400, "Pedido contém itens inválidos ou inexistentes.");
    }

    const itemsById = new Map(items.map((item) => [item.id, item]));

    const orderItems = normalizedItems.map((item) => {
      const foundItem = itemsById.get(item.itemId);

      if (!foundItem || foundItem.typeId !== event.typeId) {
        throw new HttpError(400, "Pedido com um ou mais itens não relacionados ao evento.");
      }

      return {
        itemId: foundItem.id,
        quantity: item.quantity,
        unitPrice: foundItem.price,
      };
    });

    const order = await orderRepository.create({
      userId: data.userId,
      eventId: data.eventId,
      items: orderItems,
    });

    return toCreatedOrderDto(order);
  }

  async getByUserId(userId: string) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new HttpError(404, "Perfil não encontrado.");
    }

    const orders = await orderRepository.findManyByUserId(userId);

    return orders.map(toUserOrderDto);
  }

  async cancel(id: string, userId: string) {
    const order = await orderRepository.findByIdForCancel(id);

    if (!order) {
      throw new HttpError(404, "Pedido não encontrado.");
    }

    if (order.userId !== userId) {
      throw new HttpError(403, "Você não tem permissão de cancelar esse pedido.");
    }

    if (order.status !== "PENDING") {
      throw new HttpError(409, "Apenas pedidos pendentes podem ser cancelados.");
    }

    if (order.event.status !== "OPEN") {
      throw new HttpError(409, "Pedido só pode ser cancelado enquanto o evento está aberto.");
    }

    const cancelledOrder = await orderRepository.cancel(id);

    return toCancelOrderDto(cancelledOrder);
  }

  async getByEventId(eventId: string) {
    const event = await orderRepository.findEventSummaryById(eventId);

    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const orders = await orderRepository.findManyByEventId(eventId);

    return orders.map(toAdminEventOrderDto);
  }

  async confirmPayment(id: string) {
    const order = await orderRepository.findByIdForPayment(id);

    if (!order) {
      throw new HttpError(404, "Pedido não encontrado.");
    }

    if (["CANCELLED", "EXPIRED"].includes(order.status)) {
      throw new HttpError(409, "Pedido cancelado ou expirado.");
    }

    const confirmedOrder = await orderRepository.confirmPayment(id);

    return toConfirmPaymentDto(confirmedOrder);
  }

  async getEventSummary(eventId: string) {
    const event = await orderRepository.findEventSummaryById(eventId);

    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const orders = await orderRepository.findManyByEventId(eventId);

    return toEventSummaryDto(event, orders);
  }

  private normalizeItems(items: CreateOrderInput["items"]) {
    const itemsById = new Map<string, { itemId: string; quantity: number }>();

    for (const item of items) {
      const current = itemsById.get(item.itemId);

      itemsById.set(item.itemId, {
        itemId: item.itemId,
        quantity: (current?.quantity ?? 0) + item.quantity,
      });
    }

    return Array.from(itemsById.values());
  }
}

export const orderService = new OrderService();
