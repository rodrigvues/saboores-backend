/** Mensagem de e-mail já pronta (assunto + corpo). */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Transporte de e-mail. Abstrai "como" o e-mail sai (Gmail SMTP, Resend, …) do
 * "o quê" sai (os templates em `email.service.ts`). Trocar de provedor é trocar
 * a instância usada no serviço — os templates não mudam.
 */
export interface EmailProvider {
  /** Nome do transporte (para logs). */
  readonly name: string;
  /** Há credenciais suficientes para enviar de verdade? */
  isConfigured(): boolean;
  /** Envia a mensagem; lança em caso de falha. */
  send(message: EmailMessage): Promise<void>;
}
