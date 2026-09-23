import type { OrderStatus } from "@prisma/client";

/**
 * Pedidos "válidos" para estatísticas/ranking e contagens (Parte 2): um pedido
 * ENTREGUE continua sendo um pedido pago/válido. Centralizado aqui para que
 * adicionar/alterar estados não exija caçar comparações `=== "CONFIRMED"` pelo
 * código.
 */
export const VALID_ORDER_STATUSES: OrderStatus[] = ["CONFIRMED", "DELIVERED"];

/** Participação ativa numa rodada (exclui cancelados/expirados). */
export const ACTIVE_PARTICIPATION_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "DELIVERED",
];

/**
 * Janela em que o participante ainda edita a própria entrada, contada a partir de
 * `Order.createdAt`. Vale para os dois rachas. Passado isso (ou com a rodada
 * fechada), só o organizador mexe.
 */
export const EDIT_WINDOW_MS = 10 * 60 * 1000;

/** @deprecated Use `EDIT_WINDOW_MS`. Mantido para não quebrar os usos do racha de pizza. */
export const PIZZA_EDIT_WINDOW_MS = EDIT_WINDOW_MS;

/**
 * Quantos itens ganham o selo "mais pedidos" na vitrine da encomenda. Dois é o
 * que cabe na tela sem o selo virar ruído: se quase tudo é destaque, nada é.
 */
export const MOST_ORDERED_HIGHLIGHT_COUNT = 2;
