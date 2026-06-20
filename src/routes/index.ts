import { Router } from "express";
import { authRoutes } from "./auth.routes.js";
import { eventRoutes } from "./event.routes.js";
import { orderRoutes } from "./order.routes.js";

const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/events", eventRoutes);
routes.use("/orders", orderRoutes);

export { routes };
