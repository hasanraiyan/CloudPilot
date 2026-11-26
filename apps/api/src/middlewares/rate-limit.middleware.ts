import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.NODE_ENV === "development" ? Math.max(env.RATE_LIMIT_MAX, 2000) : env.RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, _res, _next, options) => {
    throw new ApiError(
      options.statusCode,
      "Too many requests. Please try again later.",
      "RATE_LIMIT_EXCEEDED",
    );
  },
});
