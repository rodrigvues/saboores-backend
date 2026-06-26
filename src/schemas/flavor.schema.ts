import { z } from "zod";

/**
 * POST /flavors — cria um sabor. Sem `eventId` ⇒ sabor **padrão global** (exige
 * ADMIN no service). Com `eventId` ⇒ **extra** daquele evento (exige acesso).
 */
export const createFlavorSchema = z.object({
  name: z.string().trim().min(2, "Nome do sabor deve ter ao menos 2 caracteres.").max(60),
  isSweet: z.boolean().optional(),
  eventId: z.string().trim().min(1).optional(),
});

/** PATCH /flavors/:id — edição parcial (posse validada no service). */
export const updateFlavorSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    isSweet: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nada para atualizar." });

export type CreateFlavorInput = z.infer<typeof createFlavorSchema>;
export type UpdateFlavorInput = z.infer<typeof updateFlavorSchema>;
