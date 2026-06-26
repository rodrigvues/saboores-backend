import type { Request, Response } from "express";
import {
  createOrderSchema,
  updateParticipationSchema,
} from "../schemas/order.schema.js";
import { orderService } from "../services/order.service.js";
import { HttpError } from "../utils/http-error.js";

function handleError(error: unknown, res: Response) {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  throw error;
}

class OrderController {
  async create(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    const parsedBody = createOrderSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        message: parsedBody.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }

    try {
      const order = await orderService.create({
        userId: req.user.id,
        input: parsedBody.data,
      });

      return res.status(201).json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** GET /orders/participation/:eventId — racha: minha participação (ou null). */
  async myParticipation(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const participation = await orderService.getMyParticipation(
        req.params.eventId as string,
        req.user.id,
      );
      return res.json(participation);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /orders/:id — racha: edita a própria participação (≤10min, aberta). */
  async editParticipation(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    const parsed = updateParticipationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      });
    }
    try {
      const order = await orderService.editParticipation({
        orderId: req.params.id as string,
        userId: req.user.id,
        input: parsed.data,
      });
      return res.json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }

  /** PATCH /orders/:id/cancel-by-organizer — racha: cancelamento pelo organizador. */
  async cancelByOrganizer(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }
    try {
      const order = await orderService.cancelByOrganizer(
        req.params.id as string,
        req.user.id,
      );
      return res.json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async index(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    try {
      const orders = await orderService.getByUserId(req.user.id);

      return res.json(orders);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async cancel(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    try {
      const order = await orderService.cancel(req.params.id as string, req.user.id);

      return res.json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async confirmPayment(req: Request, res: Response) {
    try {
      const order = await orderService.confirmPayment(req.params.id as string);

      return res.json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async deliver(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    try {
      const order = await orderService.deliver(
        req.params.id as string,
        req.user.id,
      );

      return res.json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }
}

export const orderController = new OrderController();
