import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter ao menos 8 caracteres.")
  .max(72, "A senha deve ter no máximo 72 caracteres.");

/** Domínio corporativo permitido (mesma regra do cadastro). */
export const ALLOWED_EMAIL_DOMAIN = "@vertrau.capital";

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

/** F3.4 — trocar senha estando logado. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: passwordSchema,
});

/** F3.5 — pedir redefinição de senha (resposta sempre genérica). */
export const forgotPasswordSchema = z.object({
  email: z.email(),
});

/** F3.5 — consumir o token e definir a nova senha. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token inválido."),
  newPassword: passwordSchema,
});
