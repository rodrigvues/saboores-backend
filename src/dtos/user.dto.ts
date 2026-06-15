import type { Role } from "@prisma/client";

type UserRecord = {
  id: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  createdAt: Date;
};

export type UserDto = {
  id: string;
  name: string;
  surname: string;
  fullName: string;
  email: string;
  role: Role;
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
    createdAt: user.createdAt,
  };
}
