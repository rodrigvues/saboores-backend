import { z } from "zod";

/**
 * Item de um Tipo. Não há CRUD avulso de item: itens nascem/morrem dentro do
 * formulário do Tipo. No create, vêm sem `id`; na edição, itens existentes
 * trazem `id` (update) e os ausentes são soft-removidos (active=false).
 */
const itemBaseSchema = z.object({
  name: z.string().trim().min(1, "Nome do item é obrigatório."),
  // Preço em reais; aceita número ou string numérica. Prisma converte p/ Decimal.
  price: z.coerce.number().positive("Preço deve ser maior que zero."),
});

export const createTypeSchema = z.object({
  name: z.string().trim().min(2, "Nome do tipo deve ter ao menos 2 caracteres."),
  description: z.string().trim().max(500).optional(),
  items: z.array(itemBaseSchema).min(1, "Inclua ao menos um item."),
});

export const updateTypeSchema = z.object({
  name: z.string().trim().min(2).optional(),
  // `null` limpa a descrição.
  description: z.string().trim().max(500).nullable().optional(),
  items: z
    .array(
      itemBaseSchema.extend({
        id: z.string().trim().min(1).optional(),
        active: z.boolean().optional(),
      }),
    )
    .min(1, "O tipo precisa de ao menos um item."),
});

export type CreateTypeInput = z.infer<typeof createTypeSchema>;
export type UpdateTypeInput = z.infer<typeof updateTypeSchema>;
