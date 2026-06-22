import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireOrderEventAccess } from "../middlewares/requireOrderEventAccess.js";

const orderRoutes = Router();

orderRoutes.post("/", requireAuth, orderController.create);
orderRoutes.get("/", requireAuth, orderController.index);
orderRoutes.patch("/:id/cancel", requireAuth, orderController.cancel);
// Confirmar pagamento e entrega: ADMIN ou ORGANIZER vinculado ao evento do pedido.
orderRoutes.patch(
  "/:id/confirm-payment",
  requireAuth,
  requireOrderEventAccess,
  orderController.confirmPayment,
);
orderRoutes.patch(
  "/:id/deliver",
  requireAuth,
  requireOrderEventAccess,
  orderController.deliver,
);

export { orderRoutes };
