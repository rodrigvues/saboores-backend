import type { Role } from "@prisma/client";

type AdminUserRecord = {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  disabledAt: Date | null;
  createdAt: Date;
};

/**
 * DTO reduzido do diretório admin (F3.2). NUNCA inclui passwordHash, refresh
 * tokens ou qualquer dado sensível. `active` deriva de `disabledAt`.
 */
export type AdminUserDto = {
  id: string;
  name: string;
  surname: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
};

export function toAdminUserDto(user: AdminUserRecord): AdminUserDto {
  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    fullName: `${user.name} ${user.surname}`,
    email: user.email,
    role: user.role,
    active: user.disabledAt === null,
    createdAt: user.createdAt,
  };
}
