import type { Request, Response } from "express";
import {
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
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
    const parsedBody = createOrderSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        message: "Erro interno do sistema.",
      });
    }

    try {
      const order = await orderService.create(parsedBody.data);

      return res.status(201).json(order);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async index(req: Request, res: Response) {
    const parsedQuery = listOrdersQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      return res.status(400).json({
        message: "Erro interno do sistema.",
      });
    }

    try {
      const orders = await orderService.getByUserId(parsedQuery.data.userId);

      return res.json(orders);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async cancel(req: Request, res: Response) {
    const parsedBody = cancelOrderSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        message: "Erro interno do sistema.",
      });
    }

    try {
      const order = await orderService.cancel(req.params.id as string, parsedBody.data.userId);

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
}

export const orderController = new OrderController();
