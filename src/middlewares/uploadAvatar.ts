import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "../utils/http-error.js";

/** Tipos aceitos para avatar (F4.1 ET): apenas png/jpg/jpeg. */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB (F4.1 ET)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new HttpError(400, "Formato inválido. Envie .png, .jpg ou .jpeg."));
      return;
    }
    cb(null, true);
  },
}).single("avatar");

/**
 * Recebe um único arquivo `avatar` (multipart). Converte erros do multer e do
 * fileFilter em respostas JSON consistentes com o resto da API.
 */
export function uploadAvatarMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof HttpError) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Imagem muito grande. O limite é 5MB."
          : "Não foi possível processar o arquivo enviado.";
      return res.status(400).json({ message });
    }
    return res.status(400).json({ message: "Falha no envio da imagem." });
  });
}
