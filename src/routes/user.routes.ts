import { Router } from "express";
import { userController } from "../controllers/user.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const userRoutes = Router();

// Diretório e ações administrativas (F3.2/F3.7) — todas exigem ADMIN.
userRoutes.get("/", requireAuth, requireAdmin, userController.index);
userRoutes.post(
  "/:id/reset-password",
  requireAuth,
  requireAdmin,
  userController.resetPassword,
);
userRoutes.patch(
  "/:id/status",
  requireAuth,
  requireAdmin,
  userController.setStatus,
);

export { userRoutes };
