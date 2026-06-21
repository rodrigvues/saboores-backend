import { z } from "zod";

/**
 * F3.3/F4.1 — edição do próprio perfil. Apenas campos permitidos; e-mail e role
 * não entram aqui (e-mail é credencial — F3.3 RN2). Strings vazias em campos
 * opcionais significam "limpar" (viram null no service).
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres.").optional(),
  surname: z
    .string()
    .trim()
    .min(2, "Sobrenome deve ter ao menos 2 caracteres.")
    .optional(),
  displayName: z
    .string()
    .trim()
    .max(40, "Apelido deve ter no máximo 40 caracteres.")
    .refine((v) => v === "" || v.length >= 2, "Apelido deve ter ao menos 2 caracteres.")
    .optional(),
  bio: z.string().trim().max(280, "Bio deve ter no máximo 280 caracteres.").optional(),
  team: z.string().trim().max(60, "Time/setor deve ter no máximo 60 caracteres.").optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
