import { Resend } from "resend";
import { env } from "../config/env.js";

/**
 * Cliente Resend único do app. `null` quando `RESEND_API_KEY` não está
 * configurada — nesse caso o `email.service` degrada para console em dev.
 *
 * SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Resend).
 */
export const resendClient = env.resendApiKey ? new Resend(env.resendApiKey) : null;
