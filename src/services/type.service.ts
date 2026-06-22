import {
  toTypeDetailDto,
  toTypeListItemDto,
  type TypeDetailDto,
  type TypeListItemDto,
} from "../dtos/type.dto.js";
import { typeRepository } from "../repositories/type.repository.js";
import { auditService, AuditAction } from "./audit.service.js";
import { HttpError } from "../utils/http-error.js";

type Requester = { userId: string; isAdmin: boolean };

class TypeService {
  /** Tipos ativos para o picker/gestão. `mine` filtra os que o usuário criou. */
  async list(
    requester: Requester,
    options: { mine?: boolean } = {},
  ): Promise<TypeListItemDto[]> {
    const types = await typeRepository.findManyActive(
      options.mine ? requester.userId : undefined,
    );
    return types.map((type) =>
      toTypeListItemDto(
        type,
        requester.isAdmin || type.createdByUserId === requester.userId,
      ),
    );
  }

  async getById(id: string, requester: Requester): Promise<TypeDetailDto> {
    const ownership = await typeRepository.findOwnership(id);
    if (!ownership) {
      throw new HttpError(404, "Tipo não encontrado.");
    }
    const canEdit =
      requester.isAdmin || ownership.createdByUserId === requester.userId;

    const type = await typeRepository.findByIdWithItems(id, canEdit);
    if (!type) {
      throw new HttpError(404, "Tipo não encontrado.");
    }
    return toTypeDetailDto(type, canEdit);
  }

  async create(params: {
    actorId: string;
    name: string;
    description?: string;
    items: { name: string; price: number }[];
  }): Promise<TypeDetailDto> {
    const type = await typeRepository.create({
      name: params.name,
      description: params.description ?? null,
      createdByUserId: params.actorId,
      items: params.items,
    });

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.TYPE_CREATE,
      targetId: type.id,
    });

    return toTypeDetailDto(type, true);
  }

  /** Edição (posse já validada por `requireTypeOwner`). */
  async update(params: {
    actorId: string;
    typeId: string;
    name?: string;
    description?: string | null;
    items: { id?: string; name: string; price: number; active?: boolean }[];
  }): Promise<TypeDetailDto> {
    const updated = await typeRepository.updateWithItems(params.typeId, {
      name: params.name,
      description: params.description,
      items: params.items,
    });
    if (!updated) {
      throw new HttpError(404, "Tipo não encontrado.");
    }

    await auditService.log({
      actorId: params.actorId,
      action: AuditAction.TYPE_UPDATE,
      targetId: params.typeId,
    });

    return toTypeDetailDto(updated, true);
  }
}

export const typeService = new TypeService();
