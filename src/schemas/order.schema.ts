import { z } from "zod";

// `userId` não vem mais do cliente — é derivado do token (req.user.id).
export const createOrderSchema = z.object({
  eventId: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});
