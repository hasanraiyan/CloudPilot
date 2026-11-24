import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header("x-request-id");
  const requestId = incomingId?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
}
