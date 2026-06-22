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
  // ── F3.5: e-mail transacional (Resend) ──────────────────────
  // SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Resend). Opcionais para o app
  // subir em dev; em produção devem ser definidos (ver checagem abaixo).
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Saboores <onboarding@resend.dev>"),
  /** Base do frontend p/ montar o link de redefinição (F3.5). */
  APP_URL: z.string().default("http://localhost:5173"),
  // ── F4.1: avatar (Supabase Storage) ─────────────────────────
  // SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Supabase Storage). Opcionais
  // em dev; sem elas o upload de avatar retorna erro claro (resto funciona).
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_AVATAR_BUCKET: z.string().default("avatars"),
  // ── Parte 2: notificações (jobs / cron) ─────────────────────
  // SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Notificações). Liga/desliga o
  // cron in-process e define sua cadência.
  JOBS_ENABLED: z.string().optional(),
  NOTIFY_ROUNDS_CRON: z.string().default("0 */3 * * *"),
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
  // F3.5 — e-mail transacional.
  resendApiKey: raw.RESEND_API_KEY,
  emailFrom: raw.EMAIL_FROM,
  appUrl: raw.APP_URL.replace(/\/+$/, ""),
  // F4.1 — avatar (Supabase Storage).
  supabaseUrl: raw.SUPABASE_URL,
  supabaseServiceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY,
  supabaseAvatarBucket: raw.SUPABASE_AVATAR_BUCKET,
  // Parte 2 — jobs/cron. Default ligado fora de test; JOBS_ENABLED=false desliga.
  jobsEnabled:
    raw.JOBS_ENABLED !== undefined
      ? raw.JOBS_ENABLED === "true"
      : raw.NODE_ENV !== "test",
  notifyRoundsCron: raw.NOTIFY_ROUNDS_CRON,
} as const;

// Em produção, e-mail é obrigatório (fluxo "esqueci a senha"). Em dev, o serviço
// degrada para console — ver src/services/email.service.ts.
if (env.isProd && !env.resendApiKey) {
  console.warn(
    "⚠️  RESEND_API_KEY ausente em produção: o envio de e-mail (reset de senha) " +
      "ficará indisponível. Ver docs/CONFIGURACAO-NECESSARIA.md (Resend).",
  );
}
