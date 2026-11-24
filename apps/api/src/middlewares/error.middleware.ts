import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/api-error.js";
import { errorResponse } from "../utils/api-response.js";

function isInvalidJsonError(error: unknown): error is SyntaxError & { status: number } {
  return error instanceof SyntaxError && "status" in error && error.status === 400;
}

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = "An unexpected error occurred.";
  let details: unknown;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (isInvalidJsonError(error)) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Request body contains invalid JSON.";
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed.";
    details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  }

  if (statusCode >= 500) {
    logger.error(
      { err: error, requestId: req.requestId, method: req.method, url: req.originalUrl },
      "Unhandled request error",
    );
  } else {
    logger.warn(
      { requestId: req.requestId, method: req.method, url: req.originalUrl, statusCode, code },
      "Request error",
    );
  }

  const bodyDetails =
    env.NODE_ENV === "production" && statusCode >= 500 ? undefined : details;

  res.status(statusCode).json(errorResponse(code, message, bodyDetails));
}
