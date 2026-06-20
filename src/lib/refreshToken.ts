import { createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

/** Gera o refresh token cru (opaco, alta entropia) entregue ao cliente. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash determinístico para guardar no banco. Como o token já é aleatório e de
 * alta entropia, SHA-256 basta (bcrypt é para segredos de baixa entropia/senhas).
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}
