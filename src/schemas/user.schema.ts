import { z } from "zod";
import { passwordSchema } from "./auth.schema.js";

/** F3.2 — query do diretório admin. */
export const listUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** F3.2 — reset de senha pelo admin (sem senha anterior/token). */
export const resetUserPasswordSchema = z.object({
  newPassword: passwordSchema,
});

/** F3.2/F3.7 — ativar/desativar conta. */
export const setUserStatusSchema = z.object({
  active: z.boolean(),
});
