import { env } from "../config/env.js";
import { gmailProvider } from "../lib/email/gmail.provider.js";
import type { EmailMessage } from "../lib/email/types.js";
import { RESET_TTL_MINUTES } from "../lib/passwordReset.js";

/**
 * Serviço centralizador de envio de e-mails. Todos os templates do sistema vivem
 * aqui; o "como enviar" fica no transporte (`provider`). Sem credenciais do
 * transporte: em dev loga o conteúdo no console (para testar o fluxo sem
 * configurar nada); em prod apenas registra o erro.
 *
 * Transporte ATIVO: Gmail SMTP (`lib/email/gmail.provider.ts`). Resend continua
 * disponível em `lib/email/resend.provider.ts` — para voltar a ele, troque a
 * instância de `provider` abaixo (a interface é a mesma).
 */
class EmailService {
  private readonly provider = gmailProvider;

  private async send(message: EmailMessage) {
    if (!this.provider.isConfigured()) {
      if (!env.isProd) {
        console.info(
          [
            "",
            `📧 [email dev — ${this.provider.name} não configurado]`,
            `   para:    ${message.to}`,
            `   assunto: ${message.subject}`,
            `   ${message.text.replace(/\n/g, "\n   ")}`,
            "",
          ].join("\n"),
        );
        return;
      }
      console.error(
        "[email] transporte não configurado — e-mail não enviado:",
        message.subject,
      );
      return;
    }

    try {
      await this.provider.send(message);
    } catch (error) {
      console.error(`[email] falha ao enviar via ${this.provider.name}:`, error);
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
    serviceFee?: string | null;
    serviceFeePercent?: string | null;
    total: string;
  }) {
    const url = `${env.appUrl}/pedidos`;
    const subject = `Pagamento confirmado — ${params.eventName}`;
    // O e-mail é pt-BR e o Decimal chega como "0.75" / "11"; sem isto sai "R$ 11".
    const brl = (v: string) => Number(v).toFixed(2).replace(".", ",");
    const feeLabel = params.serviceFeePercent
      ? `Taxa de serviço (${params.serviceFeePercent.replace(".", ",")}%)`
      : "Taxa de serviço";
    const itemsText = params.items
      .map((item) => `  - ${item.quantity}× ${item.title}`)
      .join("\n");
    const feeText =
      params.serviceFee != null ? [`${feeLabel}: R$ ${brl(params.serviceFee)}`] : [];
    const text = [
      `Olá, ${params.name}!`,
      "",
      `Confirmamos o pagamento do seu pedido na rodada "${params.eventName}".`,
      "",
      itemsText,
      "",
      ...feeText,
      `Total: R$ ${brl(params.total)}`,
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
        ${params.serviceFee != null ? `<p style="color:#e8590c;">${feeLabel}: R$ ${brl(params.serviceFee)}</p>` : ""}
        <p style="font-weight:600;">Total: R$ ${brl(params.total)}</p>
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

  /**
   * RP12 — racha fechado: avisa cada participante do **valor real** + o **PIX do
   * organizador** para pagar. Fire-and-forget no registro do custo.
   */
  async sendSplitSettled(params: {
    to: string;
    name: string;
    eventName: string;
    amount: string;
    pixKey: string | null;
  }) {
    const url = `${env.appUrl}/pedidos`;
    const subject = `O racha fechou — ${params.eventName}`;
    const pixText = params.pixKey
      ? `\nPague no PIX do organizador: ${params.pixKey}`
      : "";
    const text = [
      `Olá, ${params.name}!`,
      "",
      `O racha "${params.eventName}" fechou. Seu valor é R$ ${params.amount}.`,
      pixText,
      "",
      `Detalhes e pagamento: ${url}`,
    ].join("\n");

    const pixHtml = params.pixKey
      ? `<p style="font-size:14px;color:#1f2933;">Chave PIX do organizador:<br/>
          <code style="font-size:15px;">${params.pixKey}</code></p>`
      : "";
    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <h2 style="color:#e8590c;">O racha fechou 🍕</h2>
        <p>Olá, <strong>${params.name}</strong>! O racha
          <strong>${params.eventName}</strong> fechou.</p>
        <p style="font-size:18px;font-weight:700;">Seu valor: R$ ${params.amount}</p>
        ${pixHtml}
        <p>
          <a href="${url}"
             style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Ver e pagar
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

  /** Meta de valor atingida — avisa o criador da rodada (best-effort). */
  async sendGoalReached(params: {
    to: string;
    name: string;
    eventName: string;
    goalName: string;
    targetAmount: string;
    raisedAmount: string;
  }) {
    const url = `${env.appUrl}/painel/rodadas`;
    const subject = `Meta atingida: ${params.eventName}`;
    const text = [
      `Olá, ${params.name}! A rodada "${params.eventName}" atingiu a meta "${params.goalName}".`,
      `Em pedidos ativos até agora: R$ ${params.raisedAmount} (meta: R$ ${params.targetAmount}).`,
      "Já dá para comprar. A rodada continua aberta, e os pedidos que chegarem agora aparecem separados no seu painel.",
      "",
      `Ver a rodada: ${url}`,
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1f2933;">
        <h2 style="color:#0ca678;">Sua meta bateu 🎯</h2>
        <p>Olá, <strong>${params.name}</strong>! A rodada <strong>${params.eventName}</strong>
          atingiu a meta <strong>${params.goalName}</strong>.</p>
        <p>Em pedidos ativos até agora: <strong>R$ ${params.raisedAmount}</strong>
          (meta: R$ ${params.targetAmount}).</p>
        <p>Já dá para comprar. A rodada continua aberta, e os pedidos que chegarem agora aparecem
          separados no seu painel.</p>
        <p>
          <a href="${url}"
             style="display:inline-block;background:#e8590c;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Ver a rodada
          </a>
        </p>
      </div>
    `;

    await this.send({ to: params.to, subject, html, text });
  }
}

export const emailService = new EmailService();
