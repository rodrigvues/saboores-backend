import { toUserDto } from "../dtos/user.dto.js";
import { toPublicProfileDto } from "../dtos/publicProfile.dto.js";
import { userRepository } from "../repositories/user.repository.js";
import { rankingSeasonRepository } from "../repositories/rankingSeason.repository.js";
import { rankingService } from "./ranking.service.js";
import { uploadAvatar } from "../lib/storage.js";
import { HttpError } from "../utils/http-error.js";
import type { UpdateProfileInput } from "../schemas/profile.schema.js";

/** Campo de texto opcional: '' (após trim) vira null ("limpar"); senão o valor. */
function normalizeOptional(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === "" ? null : value.trim();
}

class ProfileService {
  /** F3.3 — perfil do próprio usuário. (Stats/rank são adicionados na Fase 4.) */
  async getMe(userId: string) {
    const user = await userRepository.findProfileById(userId);
    if (!user) {
      throw new HttpError(404, "Perfil não encontrado.");
    }
    return toUserDto(user);
  }

  /** F3.3/F4.1 — atualiza nome/sobrenome/apelido/bio/time. Ignora demais campos. */
  async updateMe(userId: string, input: UpdateProfileInput) {
    const data: {
      name?: string;
      surname?: string;
      displayName?: string | null;
      bio?: string | null;
      team?: string | null;
    } = {};

    if (input.name !== undefined) data.name = input.name.trim();
    if (input.surname !== undefined) data.surname = input.surname.trim();
    if (input.displayName !== undefined)
      data.displayName = normalizeOptional(input.displayName);
    if (input.bio !== undefined) data.bio = normalizeOptional(input.bio);
    if (input.team !== undefined) data.team = normalizeOptional(input.team);

    if (Object.keys(data).length === 0) {
      // Nada para atualizar — devolve o perfil atual.
      return this.getMe(userId);
    }

    const updated = await userRepository.updateProfile(userId, data);
    return toUserDto(updated);
  }

  /** F4.1 — recebe a imagem, sobe ao storage e grava a URL no perfil. */
  async uploadAvatar(userId: string, file?: { buffer: Buffer; mimetype: string }) {
    if (!file) {
      throw new HttpError(400, "Envie uma imagem no campo 'avatar'.");
    }

    const avatarUrl = await uploadAvatar({
      userId,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    await userRepository.updateAvatarUrl(userId, avatarUrl);
    return this.getMe(userId);
  }

  /** F4.2 — perfil público de outro usuário (apelido, avatar, stats, # ranking). */
  async getPublicProfile(id: string) {
    const user = await userRepository.findPublicProfileById(id);
    if (!user || user.disabledAt) {
      throw new HttpError(404, "Perfil não encontrado.");
    }
    const statsAndRank = await rankingService.getUserStatsAndRank(id);
    const titles = await rankingSeasonRepository.countTitles(id);
    return toPublicProfileDto(user, statsAndRank, titles);
  }
}

export const profileService = new ProfileService();
