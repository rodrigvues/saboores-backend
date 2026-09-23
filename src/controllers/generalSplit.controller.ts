import type { Request, Response } from "express";
import {
  closeSplitSchema,
  joinSplitSchema,
  updateMyShareSchema,
} from "../schemas/generalSplit.schema.js";
import { generalSplitService } from "../services/generalSplit.service.js";
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

class GeneralSplitController {
  /** GET /events/:id/split/quote — cotação viva de entrada/ajuste. */
  async quote(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const quote = await generalSplitService.getQuote(
        req.params.id as string,
        req.user.id,
      );
      return res.json(quote);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /events/:id/split/join — entra no racha (201) ou replay idempotente (200). */
  async join(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = joinSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const { created, dto } = await generalSplitService.join({
        eventId: req.params.id as string,
        userId: req.user.id,
        input: parsed.data,
      });
      return res.status(created ? 201 : 200).json(dto);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /events/:id/split/my-share — ajusta a própria porcentagem (ou solta a fixação). */
  async myShare(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = updateMyShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const dto = await generalSplitService.updateMyShare({
        eventId: req.params.id as string,
        userId: req.user.id,
        input: parsed.data,
      });
      return res.json(dto);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /events/:id/split/close — congela os valores e fecha o racha (organizador). */
  async close(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = closeSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const dashboard = await generalSplitService.close({
        eventId: req.params.id as string,
        actorId: req.user.id,
        input: parsed.data,
      });
      return res.json(dashboard);
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const generalSplitController = new GeneralSplitController();
