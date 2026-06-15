import { z } from "zod";

export const identifyUserSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2),
  surname: z.string().trim().min(2),
});
