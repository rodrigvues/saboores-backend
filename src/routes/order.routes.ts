import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireOrderEventAccess } from "../middlewares/requireOrderEventAccess.js";

const orderRoutes = Router();

orderRoutes.post("/", requireAuth, orderController.create);
orderRoutes.get("/", requireAuth, orderController.index);
// Racha — minha participação numa rodada (para a tela de participação).
orderRoutes.get("/participation/:eventId", requireAuth, orderController.myParticipation);
orderRoutes.patch("/:id/cancel", requireAuth, orderController.cancel);
// Racha — editar a própria participação (dono; janela validada no service).
orderRoutes.patch("/:id", requireAuth, orderController.editParticipation);
// Racha — cancelamento pelo organizador (ADMIN/ORGANIZER do evento do pedido).
orderRoutes.patch(
  "/:id/cancel-by-organizer",
  requireAuth,
  requireOrderEventAccess,
  orderController.cancelByOrganizer,
);
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
