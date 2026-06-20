import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.");

export const registerSchema = z.object({
  name: z.string().trim().min(2),
  surname: z.string().trim().min(2),
  email: z
    .email()
    .refine(
      (value) => value.toLowerCase().endsWith("@vertrau.capital"),
      "Utilize um e-mail @vertrau.capital.",
    ),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
