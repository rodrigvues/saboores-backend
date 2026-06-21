import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { authLimiter, passwordResetLimiter } from "../middlewares/rateLimit.js";

const authRoutes = Router();

authRoutes.post("/register", authLimiter, authController.register);
authRoutes.post("/login", authLimiter, authController.login);
authRoutes.post("/refresh", authController.refresh);
authRoutes.post("/logout", authController.logout);
authRoutes.get("/me", requireAuth, authController.me);

// F3.4 — trocar senha (logado). F3.6 — encerrar todas as sessões.
authRoutes.post("/change-password", requireAuth, authController.changePassword);
authRoutes.post("/logout-all", requireAuth, authController.logoutAll);

// F3.5 — esqueci a senha (público). POST pede; PATCH consome o token.
authRoutes.post("/forgot-password", passwordResetLimiter, authController.forgotPassword);
authRoutes.patch("/forgot-password", authController.resetPassword);

export { authRoutes };
