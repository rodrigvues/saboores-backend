import type { Request, Response } from "express";
import {
  listUsersQuerySchema,
  resetUserPasswordSchema,
  setUserStatusSchema,
} from "../schemas/user.schema.js";
import { userService } from "../services/user.service.js";
import { HttpError } from "../utils/http-error.js";

function handleError(error: unknown, res: Response) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  throw error;
}

class UserController {
  /** GET /users — diretório admin (F3.2). */
  async index(req: Request, res: Response) {
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
      });
    }

    const result = await userService.list(parsed.data);
    return res.json(result);
  }

  /** POST /users/:id/reset-password — admin define nova senha (F3.2). */
  async resetPassword(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const parsed = resetUserPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      await userService.resetPassword({
        actorId: req.user.id,
        targetUserId: req.params.id as string,
        newPassword: parsed.data.newPassword,
      });
      return res.status(204).send();
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /users/:id/status — ativar/desativar (F3.2/F3.7). */
  async setStatus(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const parsed = setUserStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      await userService.setStatus({
        actorId: req.user.id,
        targetUserId: req.params.id as string,
        active: parsed.data.active,
      });
      return res.status(204).send();
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const userController = new UserController();
