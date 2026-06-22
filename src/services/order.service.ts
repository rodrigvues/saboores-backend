import { Prisma } from "@prisma/client";
import {
  toAdminEventOrderDto,
  toCancelOrderDto,
  toConfirmPaymentDto,
  toCreatedOrderDto,
  toDeliverOrderDto,
  toEventSummaryDto,
  toUserOrderDto,
} from "../dtos/order.dto.js";
import { orderRepository } from "../repositories/order.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { rankingService } from "./ranking.service.js";
import { emailService } from "./email.service.js";
import { auditService, AuditAction } from "./audit.service.js";
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

    const wasAlreadyPaid = order.paymentStatus === "PAID";

    const confirmedOrder = await orderRepository.confirmPayment(id);

    // F4.3/F4.4 — confirmar pagamento muda as estatísticas: limpa o cache do ranking.
    rankingService.invalidate();

    // Parte 2 — notifica o dono do pedido (async; não bloqueia nem derruba a
    // resposta). Só na 1ª confirmação, para não reenviar em reconfirmações.
    if (!wasAlreadyPaid) {
      void this.notifyOrder(id, "payment");
    }

    return toConfirmPaymentDto(confirmedOrder);
  }

  /** Parte 2 — confirma a entrega de um pedido pago (organizer do evento/admin). */
  async deliver(id: string, actorId: string) {
    const order = await orderRepository.findByIdForPayment(id);

    if (!order) {
      throw new HttpError(404, "Pedido não encontrado.");
    }

    if (order.status === "DELIVERED") {
      throw new HttpError(409, "Pedido já foi entregue.");
    }

    if (order.status !== "CONFIRMED") {
      throw new HttpError(
        409,
        "Só pedidos com pagamento confirmado podem ser entregues.",
      );
    }

    const delivered = await orderRepository.deliver(id);

    await auditService.log({
      actorId,
      action: AuditAction.ORDER_DELIVERED,
      targetId: id,
    });

    // Parte 2 — notifica o dono do pedido (async).
    void this.notifyOrder(id, "delivered");

    return toDeliverOrderDto(delivered);
  }

  /**
   * Envia o e-mail de notificação do pedido (Parte 2). Best-effort: uma falha de
   * e-mail nunca derruba a operação de negócio que já aconteceu.
   */
  private async notifyOrder(id: string, kind: "payment" | "delivered") {
    try {
      const details = await orderRepository.findByIdWithDetails(id);
      if (!details) return;

      if (kind === "payment") {
        const total = details.orderItems.reduce(
          (acc, oi) => acc.plus(oi.unitPrice.mul(oi.quantity)),
          new Prisma.Decimal(0),
        );
        await emailService.sendPaymentConfirmed({
          to: details.user.email,
          name: details.user.name,
          eventName: details.event.name,
          items: details.orderItems.map((oi) => ({
            quantity: oi.quantity,
            title: oi.item.name,
          })),
          total: total.toString(),
        });
      } else {
        await emailService.sendOrderDelivered({
          to: details.user.email,
          name: details.user.name,
          eventName: details.event.name,
        });
      }
    } catch (error) {
      console.error("[order] falha ao enviar notificação", kind, error);
    }
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
