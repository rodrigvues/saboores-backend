import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";

/**
 * Exige um access token válido em `Authorization: Bearer <token>`.
 * Popula `req.user` com { id, role, email } ou responde 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Autenticação necessária." });
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub, role: claims.role, email: claims.email };
    return next();
  } catch {
    return res.status(401).json({ message: "Sessão inválida ou expirada." });
  }
}
