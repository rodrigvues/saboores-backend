import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

class UserRepository {
  async createWithPassword(data: {
    name: string;
    surname: string;
    email: string;
    passwordHash: string;
    role: Role;
  }) {
    return prisma.user.create({ data });
  }

  /**
   * "Reivindica" uma conta legada (criada na Fase 1, sem senha): define a senha
   * preservando id/role/ownership. Atualiza também nome/sobrenome e role.
   */
  async claimAccount(
    id: string,
    data: { name: string; surname: string; passwordHash: string; role: Role },
  ) {
    return prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        surname: data.surname,
        passwordHash: data.passwordHash,
        role: data.role,
      },
    });
  }

  /** Inclui o `passwordHash` — usar SOMENTE no login. */
  async findByEmailWithPassword(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        passwordHash: true,
        disabledAt: true,
        createdAt: true,
      },
    });
  }

  /** Inclui o `passwordHash` por id — usar SOMENTE na troca de senha (F3.4). */
  async findByIdWithPassword(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, passwordHash: true },
    });
  }

  /** Atualiza apenas o hash de senha (troca/reset). */
  async updatePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: { id: true },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  /** Busca enxuta por e-mail (id/role/nome) — usada ao convidar organizer (F3.1). */
  async findByEmailBasic(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, name: true, surname: true, disabledAt: true },
    });
  }

  /** Promove/altera o papel (ex.: USER→ORGANIZER ao ser convidado). */
  async setRole(id: string, role: Role) {
    return prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, role: true },
    });
  }

  /** Perfil completo (sem hash) para `GET /auth/me`, refresh e `/profile`. */
  async findProfileById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        team: true,
        disabledAt: true,
        createdAt: true,
      },
    });
  }

  /** F3.3/F4.1 — edição do próprio perfil (campos permitidos já filtrados). */
  async updateProfile(
    id: string,
    data: {
      name?: string;
      surname?: string;
      displayName?: string | null;
      bio?: string | null;
      team?: string | null;
    },
  ) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        team: true,
        createdAt: true,
      },
    });
  }

  /** F4.1 — atualiza só a URL do avatar (após upload no storage). */
  async updateAvatarUrl(id: string, avatarUrl: string | null) {
    return prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }

  /** F4.2 — perfil público (sem e-mail/role). */
  async findPublicProfileById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        team: true,
        disabledAt: true,
      },
    });
  }

  /** F4.4 — dados de exibição dos usuários no ranking. */
  async findManyForRanking(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        surname: true,
        displayName: true,
        avatarUrl: true,
        disabledAt: true,
      },
    });
  }

  /** Dados mínimos para guards administrativos (F3.2/F3.7). */
  async findByIdForAdmin(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, disabledAt: true },
    });
  }

  /**
   * F3.2 — diretório paginado. Exclui ADMINs (ET: "Sem ADMINS, por ter ações
   * conflitantes"). Busca por nome/sobrenome/e-mail (case-insensitive).
   */
  async findManyPaged(params: { search?: string; skip: number; take: number }) {
    const search = params.search?.trim();
    const where = {
      role: { not: "ADMIN" as const },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { surname: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
        select: {
          id: true,
          name: true,
          surname: true,
          email: true,
          role: true,
          disabledAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { data, total };
  }

  /** F3.7 — set/clear do soft-disable. */
  async setDisabledAt(id: string, disabledAt: Date | null) {
    return prisma.user.update({
      where: { id },
      data: { disabledAt },
      select: { id: true, disabledAt: true },
    });
  }
}

export const userRepository = new UserRepository();
