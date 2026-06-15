import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { routes } from "./routes/index.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(routes);

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "API running"
  });
});
app.use(routes);


const PORT = process.env.PORT || 3333;
app.use(routes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});