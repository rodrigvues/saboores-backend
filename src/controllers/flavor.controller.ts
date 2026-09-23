import type { Request, Response } from "express";
import { createFlavorSchema, updateFlavorSchema } from "../schemas/flavor.schema.js";
import { flavorService } from "../services/flavor.service.js";
import { HttpError } from "../utils/http-error.js";

function handleError(error: unknown, res: Response) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
      ...(error.details !== undefined ? { current: error.details } : {}),
    });
  }
  throw error;
}

class FlavorController {
  /** GET /flavors?eventId= — sabores para a escolha do participante. */
  async index(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const eventId = req.query.eventId;
    if (typeof eventId !== "string" || eventId.length === 0) {
      return res.status(400).json({ message: "Informe o eventId." });
    }
    try {
      const flavors = await flavorService.listForEvent(eventId, {
        userId: req.user.id,
        isAdmin: req.user.role === "ADMIN",
      });
      return res.json(flavors);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** GET /flavors/manage — sabores que o usuário pode editar (CRUD). */
  async manage(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const flavors = await flavorService.listManageable({
        userId: req.user.id,
        isAdmin: req.user.role === "ADMIN",
      });
      return res.json(flavors);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /flavors — cria sabor padrão (ADMIN) ou extra de evento (organizer). */
  async create(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = createFlavorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const flavor = await flavorService.create({
        requester: { userId: req.user.id, isAdmin: req.user.role === "ADMIN" },
        input: parsed.data,
      });
      return res.status(201).json(flavor);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /flavors/:id — edita/desativa sabor (posse validada no service). */
  async update(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = updateFlavorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const flavor = await flavorService.update({
        requester: { userId: req.user.id, isAdmin: req.user.role === "ADMIN" },
        flavorId: req.params.id as string,
        input: parsed.data,
      });
      return res.json(flavor);
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const flavorController = new FlavorController();
