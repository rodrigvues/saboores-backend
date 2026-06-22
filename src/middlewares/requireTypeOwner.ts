import type { NextFunction, Request, Response } from "express";
import { typeRepository } from "../repositories/type.repository.js";

/**
 * Posse de um Tipo (F3.8): só o **dono** (`createdByUserId`) ou um **ADMIN**
 * pode editar o tipo e seus itens. Deve rodar depois de `requireAuth` em rotas
 * com `:id` = typeId.
 */
export async function requireTypeOwner(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({ message: "Autenticação necessária." });
  }

  const type = await typeRepository.findOwnership(req.params.id as string);
  if (!type) {
    return res.status(404).json({ message: "Tipo não encontrado." });
  }

  if (req.user.role === "ADMIN" || type.createdByUserId === req.user.id) {
    return next();
  }

  return res
    .status(403)
    .json({ message: "Apenas quem criou o tipo (ou um admin) pode editá-lo." });
}
