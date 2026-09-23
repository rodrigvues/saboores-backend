import type { Request, Response } from "express";
import { eventService } from "../services/event.service.js";
import { orderService } from "../services/order.service.js";
import { pizzaSplitService } from "../services/pizzaSplit.service.js";
import {
  createEventSchema,
  registerCostSchema,
  updateEventSchema,
} from "../schemas/event.schema.js";
import { uploadEventEvidence } from "../lib/storage.js";
import { HttpError } from "../utils/http-error.js";

function handleError(error: unknown, res: Response) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  throw error;
}

class EventController {
  async index(req: Request, res: Response) {
    const events = await eventService.getEvents();

    return res.json(events);
  }

  /** GET /events/managed — rodadas que o usuário gerencia (Parte 1). */
  async managed(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const events = await eventService.getManaged({
        userId: req.user.id,
        isAdmin: req.user.role === "ADMIN",
      });
      return res.json(events);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /events — cria a rodada (modo A typeId ou modo B newType). */
  async create(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const event = await eventService.create({
        actorId: req.user.id,
        input: parsed.data,
      });
      return res.status(201).json(event);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /events/:id — edita a rodada (posse via requireEventAccess). */
  async update(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = updateEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const event = await eventService.update({
        actorId: req.user.id,
        eventId: req.params.id as string,
        input: parsed.data,
      });
      return res.json(event);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async show(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const event = await eventService.getEventById({
      id: req.params.id as string,
      userId: req.user.id,
    });

    if (!event) {
      return res.status(404).json({
        message: "Evento não encontrado.",
      });
    }

    return res.json(event);
  }

  async orders(req: Request, res: Response) {
    try {
      const orders = await orderService.getByEventId(req.params.id as string);

      return res.json(orders);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async summary(req: Request, res: Response) {
    try {
      const summary = await orderService.getEventSummary(req.params.id as string);

      return res.json(summary);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** GET /events/:id/participants — lista mínima de participantes (F4.2). */
  async participants(req: Request, res: Response) {
    try {
      const participants = await eventService.getParticipants(req.params.id as string);

      return res.json(participants);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /events/:id/lock — racha: fecha as escolhas (RP9). */
  async lock(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const dashboard = await pizzaSplitService.lockChoices({
        eventId: req.params.id as string,
        actorId: req.user.id,
      });
      return res.json(dashboard);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /events/:id/cost — racha: custo real + evidência → rateio (RP9/RP10). */
  async cost(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = registerCostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      let evidenceUrl: string | null = null;
      if (req.file) {
        evidenceUrl = await uploadEventEvidence({
          eventId: req.params.id as string,
          buffer: req.file.buffer,
          contentType: req.file.mimetype,
        });
      }
      const dashboard = await pizzaSplitService.registerCost({
        eventId: req.params.id as string,
        actorId: req.user.id,
        actualTotalCost: parsed.data.actualTotalCost,
        evidenceUrl,
      });
      return res.json(dashboard);
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const eventController = new EventController();
