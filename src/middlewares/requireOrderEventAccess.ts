import type { NextFunction, Request, Response } from "express";
import { orderRepository } from "../repositories/order.repository.js";
import { eventOrganizerRepository } from "../repositories/eventOrganizer.repository.js";

/**
 * Autorização sobre um PEDIDO a partir do evento dele (confirmar pagamento /
 * confirmar entrega). Mesma regra do `requireEventAccess`, mas resolvendo o
 * `eventId` pelo `:id` = orderId:
 * - ADMIN: acesso irrestrito;
 * - ORGANIZER: só se vinculado ao evento do pedido;
 * - USER: 403.
 *
 * Deve rodar SEMPRE depois de `requireAuth`.
 */
export async function requireOrderEventAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({ message: "Autenticação necessária." });
  }

  if (req.user.role === "ADMIN") {
    return next();
  }

  if (req.user.role === "ORGANIZER") {
    const eventId = await orderRepository.findEventIdById(req.params.id as string);
    if (!eventId) {
      return res.status(404).json({ message: "Pedido não encontrado." });
    }
    const hasAccess = await eventOrganizerRepository.exists(eventId, req.user.id);
    if (hasAccess) {
      return next();
    }
  }

  return res
    .status(403)
    .json({ message: "Acesso restrito aos organizadores deste evento." });
}
