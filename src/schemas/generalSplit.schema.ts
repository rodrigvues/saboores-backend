import { z } from "zod";

/** Bloco do racha geral no POST /events (kind = GENERAL_SPLIT). Valores em REAIS. */
export const generalSplitConfigSchema = z
  .object({
    purchaseName: z
      .string()
      .trim()
      .min(2, "Diga o que vai ser comprado (ao menos 2 caracteres).")
      .max(80),
    // Piso de 1 centavo e teto que cabe no INTEGER: sem eles o CHECK do banco vira 500.
    totalAmount: z.coerce
      .number()
      .min(0.01, "O valor total deve ser de pelo menos R$ 0,01.")
      .max(200000, "O valor total passa do limite de uma rodada (R$ 200.000,00)."),
    mode: z.enum(["DYNAMIC", "TARGET"]),
    targetParticipants: z.coerce.number().int().min(2).max(200).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "TARGET" && (d.targetParticipants === undefined || d.targetParticipants < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetParticipants"],
        message: "Informe quantas pessoas vão compor o racha (mínimo 2).",
      });
    }
    if (d.mode === "DYNAMIC" && d.targetParticipants !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetParticipants"],
        message: "No racha dinâmico não se define o número de pessoas.",
      });
    }
  });

/**
 * Porcentagem assumida, em % com até 2 casas (50.5 = 50,50%). O service converte para
 * basis points com `percentToBps`. `0` é fixado de valor zero, não é flutuante.
 */
const sharePercentSchema = z.coerce
  .number()
  .min(0, "A porcentagem não pode ser negativa.")
  .max(100, "A porcentagem não passa de 100%.");

/**
 * POST /events/:id/split/join — `sharePercent` AUSENTE = flutuante (divide o que sobra).
 * Presente = fixado, inclusive `0`.
 */
export const joinSplitSchema = z.object({
  expectedVersion: z.coerce.number().int().min(0),
  sharePercent: sharePercentSchema.optional(),
  idempotencyKey: z.string().trim().uuid("Chave de idempotência inválida."),
});

/** PATCH /events/:id/split/my-share — `null` remove a fixação (volta a flutuante). */
export const updateMyShareSchema = z.object({
  expectedVersion: z.coerce.number().int().min(0),
  sharePercent: sharePercentSchema.nullable(),
});

/** POST /events/:id/split/close — `expectedVersion` é opcional (o lock já serializa). */
export const closeSplitSchema = z.object({
  expectedVersion: z.coerce.number().int().min(0).optional(),
});

export type GeneralSplitConfigInput = z.infer<typeof generalSplitConfigSchema>;
export type JoinSplitInput = z.infer<typeof joinSplitSchema>;
export type UpdateMyShareInput = z.infer<typeof updateMyShareSchema>;
export type CloseSplitInput = z.infer<typeof closeSplitSchema>;
