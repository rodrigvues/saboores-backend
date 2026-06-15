import { Router } from "express";
import { eventRoutes } from "./event.routes.js";
import { orderRoutes } from "./order.routes.js";
import { userRoutes } from "./user.routes.js";

const routes = Router();

routes.use("/events", eventRoutes);
routes.use("/orders", orderRoutes);
routes.use("/users", userRoutes);

export { routes };
