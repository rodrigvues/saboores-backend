import type { NextFunction, Request, Response } from "express";

/**
 * Exige perfil ADMIN. Deve rodar SEMPRE depois de `requireAuth`,
 * que é quem popula `req.user`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "Autenticação necessária." });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Acesso restrito a administradores." });
  }

  return next();
}
