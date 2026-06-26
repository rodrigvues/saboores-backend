import { z } from "zod";

const answerSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.boolean(),
});

/**
 * POST /orders — `userId` vem do token. A forma depende do **modo do evento**
 * (validado no service por `event.kind`):
 * - STANDARD (pastel): `items` (compra a preço fixo).
 * - PIZZA_SPLIT (racha): `flavorIds` (votos) + `slicesWanted` + `answers`.
 */
export const createOrderSchema = z.object({
  eventId: z.string().trim().min(1),
  // STANDARD
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .optional(),
  // PIZZA_SPLIT
  flavorIds: z.array(z.string().trim().min(1)).optional(),
  slicesWanted: z.coerce.number().int().positive().optional(),
  answers: z.array(answerSchema).optional(),
});

/** PATCH /orders/:id — edição da participação no racha (votos/fatias/respostas). */
export const updateParticipationSchema = z.object({
  flavorIds: z.array(z.string().trim().min(1)).min(1, "Escolha ao menos um sabor."),
  slicesWanted: z.coerce.number().int().positive(),
  answers: z.array(answerSchema).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateParticipationInput = z.infer<typeof updateParticipationSchema>;
