import { Router } from "express";
import { eventController } from "../controllers/event.controller.js";


const eventRoutes = Router();

eventRoutes.get("/", eventController.index);

eventRoutes.get("/:id/orders", eventController.orders);
eventRoutes.get("/:id/summary", eventController.summary);
eventRoutes.get("/:id", eventController.show);

export { eventRoutes };
