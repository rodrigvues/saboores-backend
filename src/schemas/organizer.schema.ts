import { z } from "zod";

/** F3.1 — convidar organizer por e-mail. */
export const inviteOrganizerSchema = z.object({
  email: z.email("Informe um e-mail válido."),
});
