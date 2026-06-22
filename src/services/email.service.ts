import { resendClient } from "../lib/email.js";
import { env } from "../config/env.js";
import { RESET_TTL_MINUTES } from "../lib/passwordReset.js";

/**
 * Serviço centralizador de envio de e-mails (F3.5 ET). Todo e-mail do sistema
 * passa por aqui. Sem `RESEND_API_KEY`: em dev loga o conteúdo no console (para
 * testar o fluxo sem configurar nada); em prod apenas registra o erro.
 *
 * SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Resend).
 */
class EmailService {
  private async send(params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }) {
    if (!resendClient) {
      if (!env.isProd) {
        console.info(
          [
            "",
            "📧 [email dev — Resend não configurado]",
            `   para:    ${params.to}`,
            `   assunto: ${params.subject}`,
            `   ${params.text.replace(/\n/g, "\n   ")}`,
            "",
          ].join("\n"),
        );
        return;
      }
      console.error(
        "[email] RESEND_API_KEY ausente — e-mail não enviado:",
        params.subject,
      );
      return;
    }

    try {
      const { error } = await resendClient.emails.send({
        from: env.emailFrom,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      if (error) {
        console.error("[email] falha ao enviar via Resend:", error);
      }
    } catch (error) {
      console.error("[email] erro inesperado no envio:", error);
    }
  }

  /** F3.5 — e-mail com o link de redefinição de senha. */
  async sendPasswordReset(params: { to: string; resetUrl: string }) {
    const subject = "Redefinição de senha — Saboores";
    const text = [
      "Você pediu para redefinir sua senha no Saboores.",
      "",
      `Abra o link abaixo (válido por ${RESET_TTL_MINUTES} minutos):`,
      params.resetUrl,
      "",
      "Se não foi você, ignore este e-mail — sua senha continua a mesma.",
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <h2 style="color:#e8590c;">Redefinição de senha</h2>
        <p>Você pediu para redefinir sua senha no <strong>Saboores</strong>.</p>
        <p>
          <a href="${params.resetUrl}"
             style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Redefinir minha senha
          </a>
        </p>
        <p style="font-size:13px;color:#52606d;">O link é válido por ${RESET_TTL_MINUTES} minutos e de uso único.</p>
        <p style="font-size:13px;color:#52606d;">Se não foi você, ignore este e-mail — sua senha continua a mesma.</p>
      </div>
    `;

    await this.send({ to: params.to, subject, html, text });
  }

  /** Parte 2 — aviso de que uma nova rodada começou (cron). */
  async sendRoundStarted(params: { to: string; eventName: string; eventId: string }) {
    const url = `${env.appUrl}/rodadas/${params.eventId}`;
    const subject = `Nova rodada aberta: ${params.eventName} — Saboores`;
    const text = [
      `A rodada "${params.eventName}" está aberta para pedidos no Saboores!`,
      "",
      `Faça seu pedido: ${url}`,
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <h2 style="color:#e8590c;">Nova rodada aberta 🎉</h2>
        <p>A rodada <strong>${params.eventName}</strong> está aberta para pedidos no <strong>Saboores</strong>!</p>
        <p>
          <a href="${url}"
             style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Fazer meu pedido
          </a>
        </p>
        <p style="font-size:13px;color:#52606d;">Corra que tem prazo!</p>
      </div>
    `;

    await this.send({ to: params.to, subject, html, text });
  }

  /** Parte 2 — pagamento de um pedido confirmado (apenas o dono do pedido). */
  async sendPaymentConfirmed(params: {
    to: string;
    name: string;
    eventName: string;
    items: { quantity: number; title: string }[];
    total: string;
  }) {
    const url = `${env.appUrl}/pedidos`;
    const subject = `Pagamento confirmado — ${params.eventName}`;
    const itemsText = params.items
      .map((item) => `  - ${item.quantity}× ${item.title}`)
      .join("\n");
    const text = [
      `Olá, ${params.name}!`,
      "",
      `Confirmamos o pagamento do seu pedido na rodada "${params.eventName}".`,
      "",
      itemsText,
      "",
      `Total: R$ ${params.total}`,
      "",
      `Acompanhe em: ${url}`,
    ].join("\n");

    const itemsHtml = params.items
      .map((item) => `<li>${item.quantity}× ${item.title}</li>`)
      .join("");
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <h2 style="color:#0ca678;">Pagamento confirmado ✅</h2>
        <p>Olá, <strong>${params.name}</strong>! Confirmamos o pagamento do seu pedido na rodada
          <strong>${params.eventName}</strong>.</p>
        <ul style="color:#52606d;">${itemsHtml}</ul>
        <p style="font-weight:600;">Total: R$ ${params.total}</p>
        <p>
          <a href="${url}"
             style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Ver meus pedidos
          </a>
        </p>
      </div>
    `;

    await this.send({ to: params.to, subject, html, text });
  }

  /** Parte 2 — pedido entregue (apenas o dono do pedido). */
  async sendOrderDelivered(params: { to: string; name: string; eventName: string }) {
    const url = `${env.appUrl}/pedidos`;
    const subject = `Pedido entregue — ${params.eventName}`;
    const text = [
      `Olá, ${params.name}!`,
      "",
      `Seu pedido da rodada "${params.eventName}" foi entregue. Bom apetite! 😋`,
      "",
      `Histórico: ${url}`,
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <h2 style="color:#0ca678;">Pedido entregue 🛍️</h2>
        <p>Olá, <strong>${params.name}</strong>! Seu pedido da rodada
          <strong>${params.eventName}</strong> foi entregue. Bom apetite! 😋</p>
        <p>
          <a href="${url}"
             style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Ver histórico
          </a>
        </p>
      </div>
    `;

    await this.send({ to: params.to, subject, html, text });
  }
}

export const emailService = new EmailService();
