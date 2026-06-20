import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { authLimiter } from "../middlewares/rateLimit.js";

const authRoutes = Router();

authRoutes.post("/register", authLimiter, authController.register);
authRoutes.post("/login", authLimiter, authController.login);
authRoutes.post("/refresh", authController.refresh);
authRoutes.post("/logout", authController.logout);
authRoutes.get("/me", requireAuth, authController.me);

export { authRoutes };
