import { Router } from "express";
import { authRoutes } from "./auth.routes.js";
import { eventRoutes } from "./event.routes.js";
import { orderRoutes } from "./order.routes.js";
import { userRoutes } from "./user.routes.js";
import { profileRoutes } from "./profile.routes.js";
import { rankingRoutes } from "./ranking.routes.js";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/events", eventRoutes);
routes.use("/orders", orderRoutes);
routes.use("/users", userRoutes);
routes.use("/profile", profileRoutes);
routes.use("/ranking", rankingRoutes);

export { routes };
