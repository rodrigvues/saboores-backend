import type { Request, Response } from "express";
import { eventService } from "../services/event.service.js";
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

class EventController {
  async index(req: Request, res: Response) {
    const events = await eventService.getEvents();

    return res.json(events);
  }

  async show(req: Request, res: Response) {
    const event = await eventService.getEventById(req.params.id as string);

    if (!event) {
      return res.status(404).json({
        message: "Evento não encontrado.",
      });
    }

    return res.json(event);
  }

  async orders(req: Request, res: Response) {
    try {
      const orders = await orderService.getByEventId(req.params.id as string);

      return res.json(orders);
    } catch (error) {
      return handleError(error, res);
    }
  }

  async summary(req: Request, res: Response) {
    try {
      const summary = await orderService.getEventSummary(req.params.id as string);

      return res.json(summary);
    } catch (error) {
      return handleError(error, res);
    }
  }

}

export const eventController = new EventController();
