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
