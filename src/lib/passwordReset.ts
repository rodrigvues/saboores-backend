import { createHash, randomBytes } from "node:crypto";

/** Validade do token de redefinição (F3.5 RN1 — janela curta). */
export const RESET_TTL_MINUTES = 45;

/** Token cru (opaco, alta entropia) enviado por e-mail. */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash determinístico guardado no banco (mesma técnica do refresh token). */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiry(): Date {
  return new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
}
