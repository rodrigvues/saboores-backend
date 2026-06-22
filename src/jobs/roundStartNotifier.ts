import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "../lib/prisma.js";
import { userRepository } from "../repositories/user.repository.js";
import { emailService } from "../services/email.service.js";
import { env } from "../config/env.js";

/**
 * Parte 2 — aviso de nova rodada. A cada execução, procura rodadas que entraram
 * na janela [startsAt, endsAt] (status OPEN) e ainda não foram anunciadas, e
 * notifica os usuários ativos.
 *
 * Idempotência: cada rodada é "reivindicada" atomicamente (`startNotifiedAt`)
 * antes do envio — só prossegue quem efetivamente marcou (`count === 1`). Assim
 * cada rodada dispara e-mail **uma única vez**, mesmo se o job rodar concorrente
 * ou houver mais de uma instância.
 */
export async function runRoundStartNotifier() {
  const now = new Date();

  const candidates = await prisma.event.findMany({
    where: {
      status: "OPEN",
      startsAt: { lte: now },
      endsAt: { gte: now },
      startNotifiedAt: null,
    },
    select: { id: true, name: true },
  });

  if (candidates.length === 0) return;

  const recipients = await userRepository.findActiveForNotification();

  for (const event of candidates) {
    const claimed = await prisma.event.updateMany({
      where: { id: event.id, startNotifiedAt: null },
      data: { startNotifiedAt: now },
    });
    if (claimed.count !== 1) continue; // outra execução já cuidou desta rodada

    for (const user of recipients) {
      try {
        await emailService.sendRoundStarted({
          to: user.email,
          eventName: event.name,
          eventId: event.id,
        });
      } catch (error) {
        console.error(
          "[jobs] falha ao notificar nova rodada",
          event.id,
          user.email,
          error,
        );
      }
    }

    console.info(
      `🔔 [jobs] rodada "${event.name}" anunciada a ${recipients.length} usuário(s).`,
    );
  }
}

let task: ScheduledTask | null = null;

/** Agenda o job de nova rodada conforme `NOTIFY_ROUNDS_CRON`. */
export function startRoundStartNotifier() {
  if (task) return;

  if (!cron.validate(env.notifyRoundsCron)) {
    console.error(
      `[jobs] NOTIFY_ROUNDS_CRON inválido ("${env.notifyRoundsCron}") — job não agendado.`,
    );
    return;
  }

  task = cron.schedule(env.notifyRoundsCron, () => {
    runRoundStartNotifier().catch((error) =>
      console.error("[jobs] erro no roundStartNotifier", error),
    );
  });

  console.info(`🔔 Job de nova rodada agendado (${env.notifyRoundsCron}).`);
}
