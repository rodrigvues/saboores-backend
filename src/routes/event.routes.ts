import { Router } from "express";
import { eventController } from "../controllers/event.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const eventRoutes = Router();

eventRoutes.get("/", requireAuth, eventController.index);

eventRoutes.get("/:id/orders", requireAuth, requireAdmin, eventController.orders);
eventRoutes.get("/:id/summary", requireAuth, requireAdmin, eventController.summary);
eventRoutes.get("/:id", requireAuth, eventController.show);

export { eventRoutes };
