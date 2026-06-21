import { Router } from "express";
import { profileController } from "../controllers/profile.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { uploadAvatarMiddleware } from "../middlewares/uploadAvatar.js";

const profileRoutes = Router();

// F3.3/F4.1 — perfil próprio (self-service).
profileRoutes.get("/me", requireAuth, profileController.me);
profileRoutes.patch("/me", requireAuth, profileController.updateMe);
profileRoutes.post(
  "/me/avatar",
  requireAuth,
  uploadAvatarMiddleware,
  profileController.uploadAvatar,
);

// F4.2 — perfil público (registrado após /me para não capturar "me" como :id).
profileRoutes.get("/:id", requireAuth, profileController.publicProfile);

export { profileRoutes };
