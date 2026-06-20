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
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  /** Perfil completo (sem hash) para `GET /auth/me` e refresh. */
  async findProfileById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
  }
}

export const userRepository = new UserRepository();
