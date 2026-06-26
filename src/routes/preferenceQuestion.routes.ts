import { Router } from "express";
import { preferenceQuestionController } from "../controllers/preferenceQuestion.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const preferenceQuestionRoutes = Router();

preferenceQuestionRoutes.get("/", requireAuth, preferenceQuestionController.index);

export { preferenceQuestionRoutes };
