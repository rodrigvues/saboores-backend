import { Resend } from "resend";
import { env } from "../../config/env.js";
import type { EmailMessage, EmailProvider } from "./types.js";

/**
 * Transporte de e-mail via Resend.
 *
 * ⚠️ MANTIDO mas NÃO é o transporte ativo hoje — ver `gmail.provider.ts` e
 * `email.service.ts`. Use-o quando houver um **domínio próprio verificado** no
 * Resend (o domínio de teste `resend.dev` só entrega para o dono da conta).
 * Requer `RESEND_API_KEY` + `EMAIL_FROM` no domínio verificado. Para reativar,
 * basta apontar `EmailService.provider` para `resendProvider`.
 */
class ResendProvider implements EmailProvider {
  readonly name = "resend";
  private readonly client = env.resendApiKey ? new Resend(env.resendApiKey) : null;

  isConfigured(): boolean {
    return this.client !== null;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.client) {
      throw new Error("RESEND_API_KEY ausente.");
    }
    const { error } = await this.client.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend: ${error.message ?? "falha ao enviar"}`);
    }
  }
}

export const resendProvider = new ResendProvider();
