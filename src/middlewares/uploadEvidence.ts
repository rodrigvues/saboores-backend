import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { HttpError } from "../utils/http-error.js";

/** Evidência de custo do racha (RP9): png/jpg/jpeg, até 5MB. Campo `evidence`. */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg"]);
const MAX_BYTES = 5 * 1024 * 1024;

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
}).single("evidence");

/**
 * Recebe um arquivo opcional `evidence` (multipart) + os campos de texto
 * (`actualTotalCost`) em `req.body`. A evidência é opcional, porém recomendada.
 */
export function uploadEvidenceMiddleware(
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
