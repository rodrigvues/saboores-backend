import type { Request, Response } from "express";
import { inviteOrganizerSchema } from "../schemas/organizer.schema.js";
import { eventOrganizerService } from "../services/eventOrganizer.service.js";
import { HttpError } from "../utils/http-error.js";

function handleError(error: unknown, res: Response) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  throw error;
}

class OrganizerController {
  /** POST /events/:id/invite — convida organizer (F3.1). */
  async invite(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const parsed = inviteOrganizerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      const result = await eventOrganizerService.invite({
        actorId: req.user.id,
        eventId: req.params.id as string,
        email: parsed.data.email,
      });
      return res.status(201).json(result);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** GET /events/:id/organizers — lista organizadores (F3.1). */
  async list(req: Request, res: Response) {
    try {
      const organizers = await eventOrganizerService.list(req.params.id as string);
      return res.json(organizers);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** DELETE /events/:id/organizers/:userId — remove vínculo (F3.1). */
  async remove(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    try {
      await eventOrganizerService.remove({
        actorId: req.user.id,
        eventId: req.params.id as string,
        userId: req.params.userId as string,
      });
      return res.status(204).send();
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const organizerController = new OrganizerController();
