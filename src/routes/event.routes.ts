import { Router } from "express";
import { eventController } from "../controllers/event.controller.js";
import { organizerController } from "../controllers/organizer.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireEventAccess } from "../middlewares/requireEventAccess.js";
import { uploadEvidenceMiddleware } from "../middlewares/uploadEvidence.js";

const eventRoutes = Router();

eventRoutes.get("/", requireAuth, eventController.index);

// Parte 1 — rodadas geridas pelo usuário e criação de rodada.
eventRoutes.get("/managed", requireAuth, eventController.managed);
eventRoutes.post("/", requireAuth, eventController.create);

// Gestão da rodada (ADMIN ou ORGANIZER vinculado ao evento).
eventRoutes.get("/:id/orders", requireAuth, requireEventAccess, eventController.orders);
eventRoutes.get("/:id/summary", requireAuth, requireEventAccess, eventController.summary);

// Racha de pizza — fechar escolhas e registrar custo real + evidência (RP9/RP10).
eventRoutes.post("/:id/lock", requireAuth, requireEventAccess, eventController.lock);
eventRoutes.post(
  "/:id/cost",
  requireAuth,
  requireEventAccess,
  uploadEvidenceMiddleware,
  eventController.cost,
);

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

eventRoutes.patch("/:id", requireAuth, requireEventAccess, eventController.update);
eventRoutes.get("/:id", requireAuth, eventController.show);

export { eventRoutes };
