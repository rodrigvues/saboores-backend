import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";

const orderRoutes = Router();

orderRoutes.post("/", orderController.create);
orderRoutes.get("/", orderController.index);
orderRoutes.patch("/:id/cancel", orderController.cancel);
orderRoutes.patch("/:id/confirm-payment", orderController.confirmPayment);

export { orderRoutes };
