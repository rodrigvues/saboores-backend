import { z } from "zod";

export const createOrderSchema = z.object({
  userId: z.string().trim().min(1),
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

export const listOrdersQuerySchema = z.object({
  userId: z.string().trim().min(1),
});

export const cancelOrderSchema = z.object({
  userId: z.string().trim().min(1),
});
