import type { Prisma, PrismaClient } from "@prisma/client";
import { toFlavorDto, type FlavorDto } from "../dtos/flavor.dto.js";
import { flavorRepository } from "../repositories/flavor.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { eventOrganizerRepository } from "../repositories/eventOrganizer.repository.js";
import { HttpError } from "../utils/http-error.js";
import type { CreateFlavorInput, UpdateFlavorInput } from "../schemas/flavor.schema.js";

type Requester = { userId: string; isAdmin: boolean };
type Tx = Prisma.TransactionClient | PrismaClient;

/** Chave de comparação de nomes: sem espaços nas pontas, espaços colapsados, minúsculo. */
function flavorNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

class FlavorService {
  /** Sabores para a escolha do participante numa rodada (globais + extras do evento). */
  async listForEvent(eventId: string, requester: Requester): Promise<FlavorDto[]> {
    // Sabor só existe no racha de pizza; nos demais modos a lista global levaria
    // a uma escolha sem destino (INV-A16), então devolvemos vazio de saída.
    const core = await eventRepository.findPizzaCore(eventId);
    if (core?.kind !== "PIZZA_SPLIT") {
      return [];
    }
    const manages =
      requester.isAdmin ||
      (await eventOrganizerRepository.exists(eventId, requester.userId));
    const flavors = await flavorRepository.findForEvent(eventId);
    return flavors.map((flavor) =>
      toFlavorDto(flavor, this.canEdit(flavor.eventId, requester.isAdmin, manages)),
    );
  }

  /** Sabores que o usuário pode editar (gestão/CRUD): globais + extras que ele cuida. */
  async listManageable(requester: Requester): Promise<FlavorDto[]> {
    const flavors = await flavorRepository.findManageableBy({
      userId: requester.userId,
      isAdmin: requester.isAdmin,
    });
    // Extras já vêm filtrados por posse → editáveis; globais só por ADMIN.
    return flavors.map((flavor) =>
      toFlavorDto(flavor, this.canEdit(flavor.eventId, requester.isAdmin, true)),
    );
  }

  /**
   * Barra nomes duplicados no mesmo escopo (global, ou global + extras do evento),
   * tanto colisões com sabores já existentes quanto repetições dentro do próprio
   * lote. Comparação ignora caixa e espaços. Lança 400 na primeira duplicata.
   */
  async assertNamesAvailable(params: {
    names: string[];
    eventId: string | null;
    tx?: Tx;
  }): Promise<void> {
    if (params.names.length === 0) return;

    const seen = new Set<string>();
    for (const name of params.names) {
      const key = flavorNameKey(name);
      if (seen.has(key)) {
        throw new HttpError(400, `O sabor "${name.trim()}" está repetido na lista.`);
      }
      seen.add(key);
    }

    const existing = await flavorRepository.findActiveNames({
      eventId: params.eventId,
      tx: params.tx,
    });
    const taken = new Set(existing.map((flavor) => flavorNameKey(flavor.name)));
    for (const name of params.names) {
      if (taken.has(flavorNameKey(name))) {
        throw new HttpError(400, `Já existe um sabor chamado "${name.trim()}".`);
      }
    }
  }

  async create(params: {
    requester: Requester;
    input: CreateFlavorInput;
  }): Promise<FlavorDto> {
    const { requester, input } = params;
    const eventId = input.eventId ?? null;

    await this.assertCanManage(eventId, requester);
    await this.assertNamesAvailable({ names: [input.name], eventId });

    const flavor = await flavorRepository.create({
      name: input.name,
      isSweet: input.isSweet ?? false,
      eventId,
      createdByUserId: requester.userId,
    });
    return toFlavorDto(flavor, true);
  }

  async update(params: {
    requester: Requester;
    flavorId: string;
    input: UpdateFlavorInput;
  }): Promise<FlavorDto> {
    const { requester, flavorId, input } = params;

    const current = await flavorRepository.findById(flavorId);
    if (!current) {
      throw new HttpError(404, "Sabor não encontrado.");
    }

    await this.assertCanManage(current.eventId, requester);

    const updated = await flavorRepository.update(flavorId, {
      name: input.name,
      isSweet: input.isSweet,
      active: input.active,
    });
    return toFlavorDto(updated, true);
  }

  /** Sabor global exige ADMIN; extra exige acesso ao evento (organizer/ADMIN). */
  private async assertCanManage(eventId: string | null, requester: Requester) {
    if (eventId === null) {
      if (!requester.isAdmin) {
        throw new HttpError(403, "Apenas administradores gerenciam sabores padrão.");
      }
      return;
    }

    const exists = await eventRepository.existsById(eventId);
    if (!exists) {
      throw new HttpError(404, "Evento não encontrado.");
    }
    if (requester.isAdmin) return;

    const ok = await eventOrganizerRepository.exists(eventId, requester.userId);
    if (!ok) {
      throw new HttpError(403, "Acesso restrito aos organizadores deste evento.");
    }
  }

  private canEdit(eventId: string | null, isAdmin: boolean, manages: boolean): boolean {
    return eventId === null ? isAdmin : isAdmin || manages;
  }
}

export const flavorService = new FlavorService();
