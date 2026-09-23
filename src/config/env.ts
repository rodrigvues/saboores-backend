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
  // ── E-mail transacional ─────────────────────────────────────
  // Transporte ATIVO: Gmail SMTP (não exige domínio próprio — App Password).
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  /** Nome amigável do remetente (ex.: "Saboores <voce@gmail.com>"). */
  EMAIL_FROM_NAME: z.string().default("Saboores"),
  // Resend fica como transporte alternativo (inativo). Precisa de domínio
  // verificado. Opcionais em dev; o serviço degrada para console.
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
  // ── Racha de pizza: defaults do motor de cálculo ────────────
  // Valor médio (R$) de uma pizza grande e nº de fatias por pizza. Servem de
  // pré-preenchimento na criação da rodada; cada rodada pode sobrescrever.
  DEFAULT_LARGE_PIZZA_PRICE: z.coerce.number().positive().default(60),
  DEFAULT_SLICES_PER_PIZZA: z.coerce.number().int().positive().default(8),
  // Bucket do Supabase Storage para a evidência de custo do racha (RP9).
  SUPABASE_EVENT_EVIDENCE_BUCKET: z.string().default("event-evidence"),
  // ── Frente 5: ranking por temporada + prêmio ────────────────
  // Conta dona das rodadas de encomenda cujo lucro vira prêmio.
  RANKING_PRIZE_OWNER_EMAIL: z.string().min(1).default("vitor.rodrigues@vertrau.capital"),
  // Fração do lucro que vira prêmio. NUNCA sai na API nem na tela.
  // O `default` fica DENTRO do preprocess: `.default()` só cobre `undefined`, e a
  // linha `RANKING_PRIZE_SHARE=` vazia viraria 0 no coerce, zerando o prêmio em silêncio.
  RANKING_PRIZE_SHARE: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().min(0).max(1).default(0.3),
  ),
  // Fechamento de temporada: 00:05 do dia 4 (fuso aplicado no job), depois da carência.
  RANKING_SEASON_CRON: z.string().default("5 0 4 * *"),
  // Carência antes de congelar a temporada (decisão 16), em horas a partir do fim da janela.
  RANKING_SEASON_GRACE_HOURS: z.coerce.number().int().min(0).default(72),
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
  // E-mail transacional — Gmail SMTP (ativo).
  gmailUser: raw.GMAIL_USER,
  gmailAppPassword: raw.GMAIL_APP_PASSWORD,
  emailFromName: raw.EMAIL_FROM_NAME,
  // Resend (transporte alternativo, inativo).
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
  // Racha de pizza — defaults do motor + bucket de evidência.
  defaultLargePizzaPrice: raw.DEFAULT_LARGE_PIZZA_PRICE,
  defaultSlicesPerPizza: raw.DEFAULT_SLICES_PER_PIZZA,
  supabaseEventEvidenceBucket: raw.SUPABASE_EVENT_EVIDENCE_BUCKET,
  // Frente 5 — ranking por temporada + prêmio.
  rankingPrizeOwnerEmail: raw.RANKING_PRIZE_OWNER_EMAIL.trim().toLowerCase(),
  rankingPrizeShare: raw.RANKING_PRIZE_SHARE,
  rankingSeasonCron: raw.RANKING_SEASON_CRON,
  rankingSeasonGraceHours: raw.RANKING_SEASON_GRACE_HOURS,
} as const;

// Em produção, e-mail é necessário (fluxo "esqueci a senha"). Em dev, o serviço
// degrada para console — ver src/services/email.service.ts.
if (env.isProd && !env.gmailUser && !env.resendApiKey) {
  console.warn(
    "⚠️  Nenhum transporte de e-mail configurado em produção (defina GMAIL_USER + " +
      "GMAIL_APP_PASSWORD, ou RESEND_API_KEY): o envio de e-mail ficará indisponível.",
  );
}

// Fração 0 é configuração válida, mas o prêmio fica "0.00" para sempre e a tela
// mostra o estado zero como se faltassem rodadas. Denuncie no boot.
if (env.rankingPrizeShare === 0) {
  console.warn("⚠️  RANKING_PRIZE_SHARE = 0: o prêmio será sempre R$ 0,00.");
}
