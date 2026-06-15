import type { Request, Response } from "express";
import { eventService } from "../services/event.service.js"

class EventController {
  async index(req: Request, res: Response) {
    const events = await eventService.getEvents();

    return res.json(events);
  }

  async show(req: Request, res: Response) {
    const event = await eventService.getEventById(req.params.id as string);

    return res.json(event);
  }

}

export const eventController = new EventController();