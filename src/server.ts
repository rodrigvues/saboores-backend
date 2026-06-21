import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env.js";
import { routes } from "./routes/index.js";

const app = express();

// Atrás do proxy (Vercel/Railway): confia em 1 hop para Secure cookie e req.ip.
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors(
    env.corsOrigin.length > 0
      ? { origin: env.corsOrigin, credentials: true }
      : {},
  ),
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "API running",
  });
});

app.use(routes);

app.listen(env.port, () => {
  console.log(`🚀 Server running on port ${env.port}`);
});
