import { z } from "zod";

const statusSchema = z.enum(["DRAFT", "OPEN", "CLOSED"]);

/** Tipo novo criado junto da rodada (modo B do POST /events). */
const newTypeSchema = z.object({
  name: z.string().trim().min(2, "Nome do tipo deve ter ao menos 2 caracteres."),
  description: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Nome do item é obrigatório."),
        price: z.coerce.number().positive("Preço deve ser maior que zero."),
      }),
    )
    .min(1, "Inclua ao menos um item."),
});

/**
 * POST /events — cria a rodada usando **um Tipo existente** (`typeId`) **ou**
 * criando **um Tipo novo inline** (`newType`). Exatamente um dos dois.
 */
export const createEventSchema = z
  .object({
    name: z.string().trim().min(2, "Nome da rodada deve ter ao menos 2 caracteres."),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: statusSchema.optional(),
    typeId: z.string().trim().min(1).optional(),
    newType: newTypeSchema.optional(),
  })
  .refine((d) => Boolean(d.typeId) !== Boolean(d.newType), {
    message: "Informe um tipo existente (typeId) OU um novo tipo (newType).",
    path: ["typeId"],
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "O término deve ser após o início.",
    path: ["endsAt"],
  });

/** PATCH /events/:id — edição parcial (datas validadas no service). */
export const updateEventSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    status: statusSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Nada para atualizar.",
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
