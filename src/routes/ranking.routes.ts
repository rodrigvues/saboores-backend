import { Router } from "express";
import { rankingController } from "../controllers/ranking.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const rankingRoutes = Router();

// F4.4 — ranking visível a qualquer usuário autenticado.
rankingRoutes.get("/", requireAuth, rankingController.index);

export { rankingRoutes };
