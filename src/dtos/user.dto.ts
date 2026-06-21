import type { Role } from "@prisma/client";

type UserRecord = {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  displayName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  team?: string | null;
  createdAt: Date;
};

export type UserDto = {
  id: string;
  name: string;
  surname: string;
  fullName: string;
  email: string;
  role: Role;
  // F4.1 — identidade enriquecida (sempre presentes; null quando não definidos).
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  team: string | null;
  createdAt: Date;
};

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    name: user.name,
    surname: user.surname,
    fullName: `${user.name} ${user.surname}`,
    email: user.email,
    role: user.role,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    team: user.team ?? null,
    createdAt: user.createdAt,
  };
}
