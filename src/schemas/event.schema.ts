import { z } from "zod";
import {
  MAX_SERVICE_FEE_PERCENT,
  MIN_SERVICE_FEE_PERCENT,
  hasMoreThanTwoDecimals,
} from "../services/serviceFee.engine.js";

const statusSchema = z.enum(["DRAFT", "OPEN", "CLOSED"]);

/** Tipo novo criado junto da rodada (modo B do POST /events — só STANDARD). */
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

/** Sabor extra cadastrado junto da criação do racha (RP3). */
const extraFlavorSchema = z.object({
  name: z.string().trim().min(2, "Nome do sabor deve ter ao menos 2 caracteres.").max(60),
  isSweet: z.boolean().optional(),
});

/**
 * POST /events — união por `kind`:
 * - STANDARD (default): usa **um Tipo existente** (`typeId`) **ou** **um Tipo novo
 *   inline** (`newType`). Exatamente um dos dois (encomenda/pastel). PIX
 *   obrigatório + taxa de serviço opcional (`hasServiceFee`/`serviceFeePercent`).
 * - PIZZA_SPLIT: **sem** Type; config do motor (`maxFlavorsPerOrder`, `slicesPerPizza`,
 *   `avgLargePizzaPrice`) + PIX obrigatório. Defaults aplicados no service.
 *
 * Validações cruzadas ficam no `superRefine` para mensagens claras por campo.
 */
export const createEventSchema = z
  .object({
    name: z.string().trim().min(2, "Nome da rodada deve ter ao menos 2 caracteres."),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    status: statusSchema.optional(),
    kind: z.enum(["STANDARD", "PIZZA_SPLIT"]).default("STANDARD"),
    // STANDARD
    typeId: z.string().trim().min(1).optional(),
    newType: newTypeSchema.optional(),
    hasServiceFee: z.boolean().optional(),
    serviceFeePercent: z.coerce.number().optional(),
    // PIZZA_SPLIT (defaults no service)
    maxFlavorsPerOrder: z.coerce.number().int().optional(),
    slicesPerPizza: z.coerce.number().int().optional(),
    avgLargePizzaPrice: z.coerce.number().optional(),
    pixKey: z.string().trim().optional(),
    pixQrUrl: z.string().trim().url("QR PIX deve ser uma URL válida.").optional(),
    extraFlavors: z.array(extraFlavorSchema).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.endsAt <= d.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "O término deve ser após o início.",
      });
    }

    // PIX da rodada é obrigatório nos dois modos (o pagamento vai direto ao organizador).
    if (!d.pixKey || d.pixKey.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pixKey"],
        message: "Informe a chave PIX da rodada (o dinheiro vai para você).",
      });
    }

    // A checagem de modo vale para os DOIS campos, fora do `if`: sem isso,
    // `{ kind: "PIZZA_SPLIT", serviceFeePercent: 10 }` passaria calado (RN-1).
    if ((d.hasServiceFee || d.serviceFeePercent !== undefined) && d.kind !== "STANDARD") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hasServiceFee"],
        message: "Taxa de serviço só se aplica a rodadas de encomenda.",
      });
    }

    if (d.hasServiceFee) {
      if (d.serviceFeePercent === undefined || d.serviceFeePercent < MIN_SERVICE_FEE_PERCENT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["serviceFeePercent"],
          message: "Informe o percentual da taxa (entre 0,01% e 100%).",
        });
      } else if (d.serviceFeePercent > MAX_SERVICE_FEE_PERCENT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["serviceFeePercent"],
          message: "O percentual da taxa não pode passar de 100%.",
        });
      } else if (hasMoreThanTwoDecimals(d.serviceFeePercent)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["serviceFeePercent"],
          message: "Use no máximo duas casas decimais no percentual.",
        });
      }
    }

    if (d.kind === "PIZZA_SPLIT") {
      if (
        d.maxFlavorsPerOrder !== undefined &&
        (d.maxFlavorsPerOrder < 2 || d.maxFlavorsPerOrder > 10)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxFlavorsPerOrder"],
          message: "Sabores por pessoa deve ficar entre 2 e 10.",
        });
      }
      if (d.slicesPerPizza !== undefined && d.slicesPerPizza < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slicesPerPizza"],
          message: "Fatias por pizza deve ser maior que zero.",
        });
      }
      if (d.avgLargePizzaPrice !== undefined && d.avgLargePizzaPrice <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["avgLargePizzaPrice"],
          message: "Valor médio da pizza deve ser maior que zero.",
        });
      }
    } else {
      // STANDARD — exatamente um entre typeId/newType.
      if (Boolean(d.typeId) === Boolean(d.newType)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["typeId"],
          message: "Informe um tipo existente (typeId) OU um novo tipo (newType).",
        });
      }
    }
  });

/** PATCH /events/:id — edição parcial. `kind` é imutável (não editável aqui). */
export const updateEventSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    status: statusSchema.optional(),
    // Config do racha editável enquanto aberta (RP3 RN7).
    maxFlavorsPerOrder: z.coerce.number().int().min(2).max(10).optional(),
    slicesPerPizza: z.coerce.number().int().positive().optional(),
    avgLargePizzaPrice: z.coerce.number().positive().optional(),
    pixKey: z.string().trim().min(1).optional(),
    pixQrUrl: z.string().trim().url("QR PIX deve ser uma URL válida.").optional(),
    // Encomenda — taxa de serviço em percentual (desligar zera o valor no service).
    hasServiceFee: z.boolean().optional(),
    serviceFeePercent: z.coerce
      .number()
      .min(MIN_SERVICE_FEE_PERCENT, "Informe o percentual da taxa (entre 0,01% e 100%).")
      .max(MAX_SERVICE_FEE_PERCENT, "O percentual da taxa não pode passar de 100%.")
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Nada para atualizar.",
  })
  .refine((d) => !d.hasServiceFee || d.serviceFeePercent !== undefined, {
    path: ["serviceFeePercent"],
    message: "Informe o percentual da taxa (entre 0,01% e 100%).",
  })
  // Sem este refine a regra das duas casas valeria só no POST, e o PATCH gravaria
  // 10.005 no banco, quebrando o contrato de arredondamento da decisão 5.
  .refine(
    (d) => d.serviceFeePercent === undefined || !hasMoreThanTwoDecimals(d.serviceFeePercent),
    {
      path: ["serviceFeePercent"],
      message: "Use no máximo duas casas decimais no percentual.",
    },
  );

/** POST /events/:id/cost — custo real (multipart; evidência é o arquivo). */
export const registerCostSchema = z.object({
  actualTotalCost: z.coerce.number().positive("Informe um custo total maior que zero."),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type RegisterCostInput = z.infer<typeof registerCostSchema>;
