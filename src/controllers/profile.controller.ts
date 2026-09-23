import type { Request, Response } from "express";
import { updateProfileSchema } from "../schemas/profile.schema.js";
import { profileService } from "../services/profile.service.js";
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

class ProfileController {
  /** GET /profile/me — perfil do próprio usuário (F3.3). */
  async me(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const profile = await profileService.getMe(req.user.id);
      return res.json(profile);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /profile/me — edita nome/sobrenome/apelido/bio/time (F3.3/F4.1). */
  async updateMe(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      const profile = await profileService.updateMe(req.user.id, parsed.data);
      return res.json(profile);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** POST /profile/me/avatar — upload de avatar (F4.1). Arquivo via multer. */
  async uploadAvatar(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const profile = await profileService.uploadAvatar(req.user.id, req.file);
      return res.json(profile);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** GET /profile/:id — perfil público de outro usuário (F4.2). */
  async publicProfile(req: Request, res: Response) {
    try {
      const profile = await profileService.getPublicProfile(req.params.id as string);
      return res.json(profile);
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const profileController = new ProfileController();
