import type { Role } from "@prisma/client";

/** Usuário autenticado anexado por `requireAuth` a cada request. */
export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
