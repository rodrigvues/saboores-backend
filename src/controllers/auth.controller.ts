import type { Request, Response } from "express";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "../schemas/auth.schema.js";
import { authService } from "../services/auth.service.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

const REFRESH_COOKIE = "refreshToken";

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
  };
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions(),
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

function handleError(error: unknown, res: Response) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  throw error;
}

class AuthController {
  async register(req: Request, res: Response) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados de cadastro inválidos.",
      });
    }

    try {
      const { user, accessToken, refreshToken } = await authService.register({
        ...parsed.data,
        userAgent: req.headers["user-agent"],
      });
      setRefreshCookie(res, refreshToken);
      return res.status(201).json({ user, accessToken });
    } catch (error) {
      return handleError(error, res);
    }
  }

  async login(req: Request, res: Response) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }

    try {
      const { user, accessToken, refreshToken } = await authService.login({
        ...parsed.data,
        userAgent: req.headers["user-agent"],
      });
      setRefreshCookie(res, refreshToken);
      return res.json({ user, accessToken });
    } catch (error) {
      return handleError(error, res);
    }
  }

  async refresh(req: Request, res: Response) {
    try {
      const { user, accessToken, refreshToken } = await authService.refresh(
        req.cookies?.[REFRESH_COOKIE],
        req.headers["user-agent"],
      );
      setRefreshCookie(res, refreshToken);
      return res.json({ user, accessToken });
    } catch (error) {
      clearRefreshCookie(res);
      return handleError(error, res);
    }
  }

  async logout(req: Request, res: Response) {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    return res.status(204).send();
  }

  async me(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const user = await authService.me(req.user.id);
      return res.json(user);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async changePassword(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      await authService.changePassword({
        userId: req.user.id,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        currentRawRefreshToken: req.cookies?.[REFRESH_COOKIE],
      });
      return res.status(204).send();
    } catch (error) {
      return handleError(error, res);
    }
  }

  async logoutAll(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    await authService.logoutAll(req.user.id);
    clearRefreshCookie(res);
    return res.status(204).send();
  }

  /**
   * POST /auth/forgot-password (F3.5) — resposta SEMPRE genérica e 200
   * (anti-enumeração RN2), mesmo com payload inválido.
   */
  async forgotPassword(req: Request, res: Response) {
    const generic = {
      message: "Se o e-mail existir, enviamos as instruções de redefinição.",
    };

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(200).json(generic);
    }

    try {
      await authService.forgotPassword(parsed.data.email);
    } catch (error) {
      // Não vaza falhas internas no fluxo anti-enumeração; apenas loga.
      console.error("[auth] forgotPassword:", error);
    }
    return res.status(200).json(generic);
  }

  /** PATCH /auth/forgot-password (F3.5) — consome o token e troca a senha. */
  async resetPassword(req: Request, res: Response) {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      await authService.resetPassword(parsed.data.token, parsed.data.newPassword);
      return res.status(204).send();
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const authController = new AuthController();
