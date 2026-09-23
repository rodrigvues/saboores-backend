import type { Request, Response } from "express";
import { createTypeSchema, updateTypeSchema } from "../schemas/type.schema.js";
import { typeService } from "../services/type.service.js";
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

function requesterOf(req: Request) {
  return { userId: req.user!.id, isAdmin: req.user!.role === "ADMIN" };
}

class TypeController {
  /** GET /types — tipos ativos (picker/gestão). `?mine=true` = só os meus. */
  async index(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const types = await typeService.list(requesterOf(req), {
        mine: req.query.mine === "true",
      });
      return res.json(types);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** GET /types/:id — tipo + itens. */
  async show(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const type = await typeService.getById(
        req.params.id as string,
        requesterOf(req),
      );
      return res.json(type);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /types — cria tipo + itens (createdByUserId = usuário do token). */
  async create(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = createTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const type = await typeService.create({
        actorId: req.user.id,
        name: parsed.data.name,
        description: parsed.data.description,
        items: parsed.data.items,
      });
      return res.status(201).json(type);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /types/:id — edita tipo + upsert de itens (posse via middleware). */
  async update(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = updateTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const type = await typeService.update({
        actorId: req.user.id,
        typeId: req.params.id as string,
        name: parsed.data.name,
        description: parsed.data.description,
        items: parsed.data.items,
      });
      return res.json(type);
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const typeController = new TypeController();
