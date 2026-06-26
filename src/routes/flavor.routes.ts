import { Router } from "express";
import { flavorController } from "../controllers/flavor.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const flavorRoutes = Router();

// `/manage` antes de qualquer rota dinâmica para não colidir.
flavorRoutes.get("/manage", requireAuth, flavorController.manage);
flavorRoutes.get("/", requireAuth, flavorController.index);
flavorRoutes.post("/", requireAuth, flavorController.create);
flavorRoutes.patch("/:id", requireAuth, flavorController.update);

export { flavorRoutes };
