import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Acesso centralizado e validado às variáveis de ambiente.
 * Falha rápido (process.exit) se algo essencial — como JWT_SECRET — faltar,
 * para o servidor não subir num estado inseguro.
 */
const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1, "JWT_SECRET é obrigatório"),
  /** Validade do access token (formato `ms`/`jsonwebtoken`, ex.: "15m"). */
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  /** Validade do refresh token, em dias. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(7),
  ADMIN_EMAILS: z.string().default(""),
  CORS_ORIGIN: z.string().default(""),
  /** Força o atributo Secure do cookie. Default: liga em produção. */
  COOKIE_SECURE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`);
  }
  process.exit(1);
}

const raw = parsed.data;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  port: raw.PORT,
  nodeEnv: raw.NODE_ENV,
  isProd: raw.NODE_ENV === "production",
  databaseUrl: raw.DATABASE_URL,
  jwtSecret: raw.JWT_SECRET,
  accessTokenTtl: raw.ACCESS_TOKEN_TTL,
  refreshTokenTtlDays: raw.REFRESH_TOKEN_TTL_DAYS,
  /** E-mails autorizados a virar ADMIN (allowlist). Sempre minúsculos. */
  adminEmails: splitList(raw.ADMIN_EMAILS).map((email) => email.toLowerCase()),
  /** Origens liberadas no CORS. Vazio = libera tudo (apenas dev/fallback). */
  corsOrigin: splitList(raw.CORS_ORIGIN),
  cookieSecure:
    raw.COOKIE_SECURE !== undefined
      ? raw.COOKIE_SECURE === "true"
      : raw.NODE_ENV === "production",
} as const;
