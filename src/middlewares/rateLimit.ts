import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/** Limita tentativas de login/registro por IP (anti brute-force). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
});

/** F3.5 RN4 — limita pedidos de redefinição de senha por IP (anti-abuso/spam). */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas tentativas. Tente novamente em alguns minutos." },
});

/** Chave por usuário autenticado; cai no IP (normalizado para IPv6) quando não há token. */
function userOrIpKey(req: Request): string {
  return req.user ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

/** Cotação do racha: leitura barata, mas a tela consulta a cada mudança. */
export const splitQuoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Muitas consultas seguidas. Aguarde um instante.", code: "RATE_LIMITED" },
});

/** Escrita no racha: entrar, mudar porcentagem, fechar. */
export const splitWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { message: "Muitas tentativas seguidas. Aguarde um instante.", code: "RATE_LIMITED" },
});
