import type { NextFunction, Request, Response } from "express";
import { eventOrganizerRepository } from "../repositories/eventOrganizer.repository.js";

/**
 * Autorização de recursos de um evento (F3.1 ET).
 * - ADMIN: acesso irrestrito a qualquer evento (RN4).
 * - ORGANIZER: só os eventos com vínculo em `EventOrganizer`.
 * - USER: sem permissões administrativas sobre eventos.
 *
 * Deve rodar SEMPRE depois de `requireAuth` e em rotas com `:id` = eventId.
 */
export async function requireEventAccess(
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
    const eventId = req.params.id as string;
    const hasAccess = await eventOrganizerRepository.exists(eventId, req.user.id);
    if (hasAccess) {
      return next();
    }
  }

  return res
    .status(403)
    .json({ message: "Acesso restrito aos organizadores deste evento." });
}
