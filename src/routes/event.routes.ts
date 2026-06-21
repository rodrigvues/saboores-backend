import { Router } from "express";
import { eventController } from "../controllers/event.controller.js";
import { organizerController } from "../controllers/organizer.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requireEventAccess } from "../middlewares/requireEventAccess.js";

const eventRoutes = Router();

eventRoutes.get("/", requireAuth, eventController.index);

eventRoutes.get("/:id/orders", requireAuth, requireAdmin, eventController.orders);
eventRoutes.get("/:id/summary", requireAuth, requireAdmin, eventController.summary);

// F4.2 — participantes (qualquer autenticado).
eventRoutes.get("/:id/participants", requireAuth, eventController.participants);

// F3.1 — gestão de organizadores (ADMIN ou ORGANIZER vinculado ao evento).
eventRoutes.post("/:id/invite", requireAuth, requireEventAccess, organizerController.invite);
eventRoutes.get(
  "/:id/organizers",
  requireAuth,
  requireEventAccess,
  organizerController.list,
);
eventRoutes.delete(
  "/:id/organizers/:userId",
  requireAuth,
  requireEventAccess,
  organizerController.remove,
);

eventRoutes.get("/:id", requireAuth, eventController.show);

export { eventRoutes };
