import { Router } from "express";
import { typeController } from "../controllers/type.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireTypeOwner } from "../middlewares/requireTypeOwner.js";

const typeRoutes = Router();

typeRoutes.get("/", requireAuth, typeController.index);
typeRoutes.post("/", requireAuth, typeController.create);
typeRoutes.get("/:id", requireAuth, typeController.show);
typeRoutes.patch("/:id", requireAuth, requireTypeOwner, typeController.update);

export { typeRoutes };
