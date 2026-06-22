import type { Prisma, PrismaClient } from "@prisma/client";
import { eventOrganizerRepository } from "../repositories/eventOrganizer.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { auditService, AuditAction } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";

type Tx = Prisma.TransactionClient | PrismaClient;

class EventOrganizerService {
  /**
   * Cria o vínculo organizer↔evento e promove USER→ORGANIZER se necessário.
   *
   * HOOK REUTILIZÁVEL (F3.1): usado tanto pelo **convite** quanto pela **criação
   * de evento** (que passa `tx` para tudo acontecer na mesma transação do evento).
   * O criador vira ORGANIZER e ganha acesso automaticamente (F3.1 RN1/ET).
   */
  async linkOrganizer(params: {
    eventId: string;
    userId: string;
    grantedBy?: string | null;
    tx?: Tx;
  }) {
    await eventOrganizerRepository.create({
      eventId: params.eventId,
      userId: params.userId,
      createdByUserId: params.grantedBy ?? null,
      tx: params.tx,
    });

    const user = await userRepository.findByIdForAdmin(params.userId, params.tx);
    if (user && user.role === "USER") {
      // Promoção pode valer no próximo refresh (≤15min) — F3.1 RN9.
      await userRepository.setRole(params.userId, "ORGANIZER", params.tx);
    }
  }

  /** F3.1 — convida um usuário (por e-mail) a organizar o evento. */
  async invite(params: { actorId: string; eventId: string; email: string }) {
    const exists = await eventRepository.existsById(params.eventId);
    if (!exists) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const email = params.email.trim().toLowerCase();
    const target = await userRepository.findByEmailBasic(email);
    if (!target) {
      throw new HttpError(404, "Não há usuário cadastrado com esse e-mail.");
    }
    if (target.disabledAt) {
      throw new HttpError(409, "Usuário está desativado.");
    }
    if (target.role === "ADMIN") {
      throw new HttpError(409, "Administradores já têm acesso a todos os eventos.");
    }

    const already = await eventOrganizerRepository.exists(params.eventId, target.id);
    if (already) {
      throw new HttpError(409, "Este usuário já organiza este evento.");
    }

    await this.linkOrganizer({
      eventId: params.eventId,
      userId: target.id,
      grantedBy: params.actorId,
    });

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.EVENT_ORGANIZER_INVITE,
      targetId: target.id,
      metadata: { eventId: params.eventId },
    });

    return {
      userId: target.id,
      fullName: `${target.name} ${target.surname}`,
    };
  }

  /** F3.1 — lista organizadores do evento (para a UI de gestão). */
  async list(eventId: string) {
    const exists = await eventRepository.existsById(eventId);
    if (!exists) {
      throw new HttpError(404, "Evento não encontrado.");
    }

    const links = await eventOrganizerRepository.findByEvent(eventId);
    return links.map((link) => ({
      id: link.user.id,
      fullName: `${link.user.name} ${link.user.surname}`,
      displayName: link.user.displayName,
      email: link.user.email,
      avatarUrl: link.user.avatarUrl,
      since: link.createdAt,
    }));
  }

  /**
   * F3.1 — remove o vínculo do organizer com o evento. NÃO rebaixa o papel:
   * remover todos os vínculos não volta o usuário para USER (ET F3.1).
   */
  async remove(params: { actorId: string; eventId: string; userId: string }) {
    const linked = await eventOrganizerRepository.exists(params.eventId, params.userId);
    if (!linked) {
      throw new HttpError(404, "Este usuário não organiza este evento.");
    }

    await eventOrganizerRepository.delete(params.eventId, params.userId);

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.EVENT_ORGANIZER_REMOVE,
      targetId: params.userId,
      metadata: { eventId: params.eventId },
    });
  }
}

export const eventOrganizerService = new EventOrganizerService();
