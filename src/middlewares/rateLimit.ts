import rateLimit from "express-rate-limit";

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
