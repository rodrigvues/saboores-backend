import { Prisma } from "@prisma/client";
import {
  toAdminEventOrderDto,
  toCancelOrderDto,
  toConfirmPaymentDto,
  toCreatedOrderDto,
  toDeliverOrderDto,
  toEventSummaryDto,
  toPizzaParticipationDto,
  toUserOrderDto,
} from "../dtos/order.dto.js";
import { orderRepository } from "../repositories/order.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { eventGoalRepository } from "../repositories/eventGoal.repository.js";
import { eventGoalService } from "./eventGoal.service.js";
import { isGoalReached, resolveCountsTowardGoal } from "./eventGoal.engine.js";
import { generalSplitService } from "./generalSplit.service.js";
import { centsToReais } from "../utils/money.js";
import { prisma } from "../lib/prisma.js";
import { flavorRepository } from "../repositories/flavor.repository.js";
import { preferenceQuestionRepository } from "../repositories/preferenceQuestion.repository.js";
import { rankingService } from "./ranking.service.js";
import { itemHistoryService } from "./itemHistory.service.js";
import { serviceFeeCents } from "./serviceFee.engine.js";
import { pizzaSplitService } from "./pizzaSplit.service.js";
import { emailService } from "./email.service.js";
import { auditService, AuditAction } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";
import { PIZZA_EDIT_WINDOW_MS } from "../constants/order.js";
import type {
  CreateOrderInput,
  UpdateParticipationInput,
} from "../schemas/order.schema.js";

type EventForOrder = NonNullable<
  Awaited<ReturnType<typeof orderRepository.findEventForOrder>>
>;

class OrderService {
  async create(params: { userId: string; input: CreateOrderInput }) {
    const user = await userRepository.findById(params.userId);
    if (!user) {
      throw new HttpError(404, "Perfil não encontrado.");
    }

    const event = await orderRepository.findEventForOrder(params.input.eventId);
    if (!event) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    // Rota errada é recusada por rota errada: a mensagem certa importa mais que o
    // status (INV-A3), então o racha geral sobe acima da guarda de status.
    if (event.kind === "GENERAL_SPLIT") {
      throw new HttpError(
        422,
        "Para entrar neste racha, abra a rodada e confirme sua entrada por lá.",
        "SPLIT_USE_JOIN_ENDPOINT",
      );
    }

    if (event.status !== "OPEN") {
      throw new HttpError(409, "Esta rodada não está aberta para pedidos.");
    }

    // `GENERAL_SPLIT` já saiu pela guarda acima (INV-A3); o `default` é a rede
    // para um quarto `kind` que um dia entre sem cair calado na encomenda.
    switch (event.kind) {
      case "PIZZA_SPLIT":
        return this.createPizzaParticipation(params.userId, event, params.input);
      case "STANDARD":
        return this.createStandardOrder(params.userId, event, params.input);
      default:
        throw new HttpError(400, "Tipo de rodada inválido.");
    }
  }

  private async createStandardOrder(
    userId: string,
    event: EventForOrder,
    input: CreateOrderInput,
  ) {
    if (!input.items || input.items.length === 0) {
      throw new HttpError(400, "Inclua ao menos um item no pedido.");
    }

    const normalizedItems = this.normalizeItems(input.items);
    const totalQuantity = normalizedItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );

    if (totalQuantity > event.maxItemsPerOrder) {
      throw new HttpError(
        400,
        `Cada pedido pode ter no máximo ${event.maxItemsPerOrder} itens.`,
      );
    }

    const items = await orderRepository.findActiveItemsByIds(
      normalizedItems.map((item) => item.itemId),
    );

    if (items.length !== normalizedItems.length) {
      throw new HttpError(400, "Alguns itens do pedido não estão mais disponíveis.");
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

    // A taxa é percentual sobre o subtotal e vira snapshot do pedido, como o
    // `unitPrice` do item: mudar a rodada depois não mexe em pedido já criado.
    const subtotalCents = orderItems.reduce(
      (acc, oi) => acc + Math.round(oi.unitPrice.toNumber() * 100) * oi.quantity,
      0,
    );
    const percent =
      event.hasServiceFee && event.serviceFeePercent
        ? event.serviceFeePercent.toNumber()
        : null;
    const feeCents = percent === null ? null : serviceFeeCents(subtotalCents, percent);

    const { order, goalJustReached } = await prisma.$transaction(
      async (tx) => {
        // Trava a rodada e a meta ANTES do insert: serializa pedidos simultâneos
        // e a criação/remoção da meta, e faz a soma enxergar os commitados + o nosso.
        await eventGoalRepository.lockEvent(event.id, tx);
        const goal = await eventGoalRepository.lockForUpdate(event.id, tx);
        const countsTowardGoal = resolveCountsTowardGoal({
          hasGoal: goal !== null,
          alreadyReached: goal?.reachedAt != null,
          optOut: input.optOutOfGoal === true,
        });

        const created = await orderRepository.create(
          {
            userId,
            eventId: event.id,
            serviceFee: feeCents === null ? null : new Prisma.Decimal(feeCents).div(100),
            serviceFeePercent: percent === null ? null : new Prisma.Decimal(percent),
            countsTowardGoal,
            items: orderItems,
          },
          tx,
        );
        if (!goal || goal.reachedAt || !countsTowardGoal) {
          return { order: created, goalJustReached: false };
        }

        const [progress] = await eventGoalRepository.sumProgressByEvents([event.id], tx);
        const justReached =
          isGoalReached(progress?.raisedCents ?? 0, goal.targetAmountCents) &&
          (await eventGoalRepository.markReached(event.id, tx));

        return { order: created, goalJustReached: justReached };
      },
      { timeout: 15_000 },
    );

    if (goalJustReached) {
      void eventGoalService.notifyGoalReached({
        eventId: event.id,
        actorId: userId,
        source: "order",
      });
    }

    // O histórico do usuário mudou: a próxima leitura do catálogo já reordena.
    itemHistoryService.invalidateUser(userId);

    return toCreatedOrderDto(order);
  }

  /**
   * Racha (RP5) — entrada **única** por pessoa: votos de sabor + fatias +
   * respostas. Bloqueia 2ª participação, valida limites e escolhas travadas.
   */
  private async createPizzaParticipation(
    userId: string,
    event: EventForOrder,
    input: CreateOrderInput,
  ) {
    if (event.choicesLockedAt) {
      throw new HttpError(409, "As escolhas desta rodada já foram fechadas.");
    }

    const existing = await orderRepository.findUserParticipation(event.id, userId);
    if (existing) {
      throw new HttpError(409, "Você já entrou neste racha. Edite sua participação.");
    }

    const { flavorIds, slicesWanted } = await this.validateParticipationInput(
      event,
      input.flavorIds,
      input.slicesWanted,
      input.answers,
    );

    const order = await orderRepository.createParticipation({
      userId,
      eventId: event.id,
      slicesWanted,
      flavorIds,
      answers: input.answers ?? [],
    });

    const estimate = await pizzaSplitService.estimatePerPersonForEvent(event);
    return toPizzaParticipationDto(order, estimate);
  }

  /**
   * Racha (RP5 RN4) — edita a própria participação só com a rodada **aberta** e
   * **até 10 min** após criá-la. Substitui votos/respostas e atualiza fatias.
   */
  async editParticipation(params: {
    orderId: string;
    userId: string;
    input: UpdateParticipationInput;
  }) {
    const order = await orderRepository.findParticipationForEdit(params.orderId);
    if (!order) {
      throw new HttpError(404, "Pedido não encontrado.");
    }
    if (order.event.kind === "GENERAL_SPLIT") {
      throw new HttpError(
        422,
        "Neste racha, o que dá para mudar é a sua parte, na tela da rodada.",
        "SPLIT_USE_MY_SHARE_ENDPOINT",
      );
    }
    if (order.event.kind !== "PIZZA_SPLIT") {
      throw new HttpError(400, "Esta rodada não permite editar a participação.");
    }
    if (order.userId !== params.userId) {
      throw new HttpError(403, "Você só pode editar a sua participação.");
    }
    if (order.event.status !== "OPEN" || order.event.choicesLockedAt) {
      throw new HttpError(409, "A rodada não está mais aberta para edições.");
    }
    if (Date.now() - order.createdAt.getTime() > PIZZA_EDIT_WINDOW_MS) {
      throw new HttpError(
        409,
        "O prazo de 10 minutos para editar sua participação já passou.",
      );
    }

    const { flavorIds, slicesWanted } = await this.validateParticipationInput(
      order.event,
      params.input.flavorIds,
      params.input.slicesWanted,
      params.input.answers,
    );

    const updated = await orderRepository.updateParticipation(params.orderId, {
      slicesWanted,
      flavorIds,
      answers: params.input.answers ?? [],
    });

    const estimate = await pizzaSplitService.estimatePerPersonForEvent({
      id: order.event.id,
      slicesPerPizza: order.event.slicesPerPizza,
      avgLargePizzaPrice: order.event.avgLargePizzaPrice,
    });
    return toPizzaParticipationDto(updated, estimate);
  }

  /** Valida sabores (limite, validade) + fatias (teto) + perguntas ativas. */
  private async validateParticipationInput(
    event: {
      id: string;
      maxFlavorsPerOrder: number | null;
      maxItemsPerOrder: number;
    },
    rawFlavorIds: string[] | undefined,
    rawSlices: number | undefined,
    answers: { questionId: string; answer: boolean }[] | undefined,
  ) {
    const flavorIds = [...new Set(rawFlavorIds ?? [])];
    if (flavorIds.length === 0) {
      throw new HttpError(400, "Escolha ao menos um sabor.");
    }
    const maxFlavors = event.maxFlavorsPerOrder ?? 3;
    if (flavorIds.length > maxFlavors) {
      throw new HttpError(
        400,
        `Você pode escolher no máximo ${maxFlavors} sabores.`,
      );
    }
    const validFlavors = await flavorRepository.findValidForEvent(event.id, flavorIds);
    if (validFlavors.length !== flavorIds.length) {
      throw new HttpError(400, "Algum sabor não está disponível nesta rodada.");
    }

    const slicesWanted = rawSlices ?? 0;
    if (slicesWanted < 1) {
      throw new HttpError(400, "Informe quantas fatias você costuma comer.");
    }
    if (slicesWanted > event.maxItemsPerOrder) {
      throw new HttpError(
        400,
        `No máximo ${event.maxItemsPerOrder} fatias por pessoa.`,
      );
    }

    if (answers && answers.length > 0) {
      const ids = [...new Set(answers.map((answer) => answer.questionId))];
      const validQuestions =
        await preferenceQuestionRepository.findActiveByIds(ids);
      if (validQuestions.length !== ids.length) {
        throw new HttpError(400, "Alguma pergunta do formulário é inválida.");
      }
    }

    return { flavorIds, slicesWanted };
  }

  /** Racha — participação do usuário no evento (ou null). Inclui estimativa "≈". */
  async getMyParticipation(eventId: string, userId: string) {
    const config = await eventRepository.findPizzaCore(eventId);
    if (config?.kind === "GENERAL_SPLIT") {
      return generalSplitService.getMyParticipation(eventId, userId);
    }
    const order = await orderRepository.findUserParticipationDetail(eventId, userId);
    if (!order) {
      return null;
    }
    const estimate = config
      ? await pizzaSplitService.estimatePerPersonForEvent({
          id: eventId,
          slicesPerPizza: config.slicesPerPizza,
          avgLargePizzaPrice: config.avgLargePizzaPrice,
        })
      : null;
    return toPizzaParticipationDto(order, estimate);
  }

  async getByUserId(userId: string) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new HttpError(404, "Perfil não encontrado.");
    }

    const orders = await orderRepository.findManyByUserId(userId);

    return orders.map(toUserOrderDto);
  }

  /** Cancelamento pelo **dono** — só no pastel (no racha, só o organizador). */
  async cancel(id: string, userId: string) {
    const order = await orderRepository.findByIdForCancel(id);

    if (!order) {
      throw new HttpError(404, "Pedido não encontrado.");
    }

    if (order.event.kind === "PIZZA_SPLIT") {
      throw new HttpError(
        403,
        "No racha de pizza, só o organizador pode cancelar um pedido.",
      );
    }

    if (order.event.kind === "GENERAL_SPLIT") {
      throw new HttpError(
        403,
        "Neste racha, só o organizador pode tirar alguém. O valor dos outros depende de você.",
        "SPLIT_SELF_CANCEL_FORBIDDEN",
      );
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

    // Cancelar muda o histórico ativo do dono: reordena na próxima leitura.
    itemHistoryService.invalidateUser(userId);

    return toCancelOrderDto(cancelledOrder);
  }

  /**
   * Cancelamento pelo **organizador** (RP11) — único caminho de cancelamento no
   * racha. Se o custo já foi registrado e ninguém pagou, recalcula o rateio.
   */
  async cancelByOrganizer(id: string, actorId: string) {
    const order = await orderRepository.findByIdForOrganizerCancel(id);
    if (!order) {
      throw new HttpError(404, "Pedido não encontrado.");
    }
    if (["CANCELLED", "EXPIRED"].includes(order.status)) {
      throw new HttpError(409, "Pedido já está cancelado.");
    }

    // Racha geral — o cancelamento roda inteiro sob o lock do racha (RN-22):
    // recalcula as fatias dos demais e reprojeta o total antes de qualquer
    // escrita solta, então DELEGA por completo em vez de cancelar por fora.
    if (order.event.kind === "GENERAL_SPLIT") {
      const cancelled = await generalSplitService.cancelParticipation({
        eventId: order.event.id,
        orderId: id,
        actorId,
      });
      rankingService.invalidate();
      itemHistoryService.invalidateUser(order.userId);
      await auditService.log({
        actorId,
        action: AuditAction.ORDER_CANCELLED,
        targetId: id,
        metadata: { eventId: order.event.id },
      });
      return cancelled;
    }

    const cancelled = await orderRepository.cancel(id);

    // Cancelamento pelo organizador tira um pedido válido do mês: limpa o cache.
    rankingService.invalidate();
    // Quem perdeu o pedido é o dono, não o organizador que apertou o botão.
    itemHistoryService.invalidateUser(order.userId);

    if (order.event.kind === "PIZZA_SPLIT" && order.event.costRegisteredAt) {
      await pizzaSplitService.recomputeSplit(order.event.id);
    }

    await auditService.log({
      actorId,
      action: AuditAction.ORDER_CANCELLED,
      targetId: id,
      metadata: { eventId: order.event.id },
    });

    return toCancelOrderDto(cancelled);
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
        // Racha geral — o pedido não tem itens: o total é o valor devido
        // congelado e o e-mail mostra o nome da compra no lugar da lista.
        if (details.event.kind === "GENERAL_SPLIT") {
          await emailService.sendPaymentConfirmed({
            to: details.user.email,
            name: details.user.name,
            eventName: details.event.name,
            items: [],
            serviceFee: null,
            serviceFeePercent: null,
            total: centsToReais(details.amountDueCents ?? 0),
            purchaseName: details.event.generalSplit?.purchaseName ?? null,
          });
          return;
        }
        // Total transparente: itens + taxa de serviço (quando o pedido tem).
        const total = details.orderItems
          .reduce(
            (acc, oi) => acc.plus(oi.unitPrice.mul(oi.quantity)),
            new Prisma.Decimal(0),
          )
          .plus(details.serviceFee ?? 0);
        await emailService.sendPaymentConfirmed({
          to: details.user.email,
          name: details.user.name,
          eventName: details.event.name,
          items: details.orderItems.map((oi) => ({
            quantity: oi.quantity,
            title: oi.item.name,
          })),
          serviceFee: details.serviceFee?.toString() ?? null,
          serviceFeePercent: details.serviceFeePercent?.toString() ?? null,
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

    // Racha — dashboard de recomendação (RP6) em vez dos totais do pastel.
    if (event.kind === "PIZZA_SPLIT") {
      return pizzaSplitService.getDashboard(eventId);
    }

    // Racha geral — painel de fatias e valores devidos por pessoa.
    if (event.kind === "GENERAL_SPLIT") {
      return generalSplitService.getDashboard(eventId);
    }

    const orders = await orderRepository.findManyByEventId(eventId);
    const goal = await eventGoalService.buildForEvent(
      await eventGoalRepository.findByEventId(eventId),
      eventId,
    );

    return toEventSummaryDto(event, orders, goal);
  }

  private normalizeItems(items: NonNullable<CreateOrderInput["items"]>) {
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
