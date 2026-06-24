import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env.js";
import type { EmailMessage, EmailProvider } from "./types.js";

/**
 * Transporte ATIVO: Gmail SMTP via nodemailer.
 *
 * Não exige domínio próprio — você autentica como a sua conta Google usando uma
 * **App Password** e envia por `smtp.gmail.com`. Limite ~500 e-mails/dia; ótimo
 * para uso interno. Requer `GMAIL_USER` + `GMAIL_APP_PASSWORD`.
 *
 * Obs.: o Gmail reescreve o remetente para a conta autenticada, então o "from"
 * usa sempre `GMAIL_USER` (com um nome amigável de `EMAIL_FROM_NAME`).
 */
class GmailProvider implements EmailProvider {
  readonly name = "gmail-smtp";
  private readonly transporter: Transporter | null;

  constructor() {
    this.transporter =
      env.gmailUser && env.gmailAppPassword
        ? nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: env.gmailUser,
              // App passwords são exibidos com espaços, mas valem sem eles.
              pass: env.gmailAppPassword.replace(/\s+/g, ""),
            },
          })
        : null;
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!this.transporter) {
      throw new Error("GMAIL_USER/GMAIL_APP_PASSWORD ausentes.");
    }
    await this.transporter.sendMail({
      from: `${env.emailFromName} <${env.gmailUser}>`,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}

export const gmailProvider = new GmailProvider();
