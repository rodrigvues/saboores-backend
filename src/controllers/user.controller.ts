import type { Request, Response } from "express";
import { identifyUserSchema } from "../schemas/user.schema.js";
import { userService } from "../services/user.service.js";
import { HttpError } from "../utils/http-error.js";

class UserController {
  async create(req: Request, res: Response) {
    const parsedBody = identifyUserSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        message: "Erro interno do sistema.",
      });
    }

    try {
      const user = await userService.identify(parsedBody.data);

      return res.json(user);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({
          message: error.message,
        });
      }

      throw error;
    }
  }
}

export const userController = new UserController();
