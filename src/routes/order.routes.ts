import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const orderRoutes = Router();

orderRoutes.post("/", requireAuth, orderController.create);
orderRoutes.get("/", requireAuth, orderController.index);
orderRoutes.patch("/:id/cancel", requireAuth, orderController.cancel);
orderRoutes.patch(
  "/:id/confirm-payment",
  requireAuth,
  requireAdmin,
  orderController.confirmPayment,
);

export { orderRoutes };
