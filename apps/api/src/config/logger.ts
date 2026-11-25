import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.headers['x-csrf-token']",
      "req.url",
      "req.query.state",
      "req.query.code",
      "res.headers['set-cookie']",
      "res.headers.set-cookie",
      "res.headers.location",
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "secret",
    ],
    censor: "[REDACTED]",
  },
  ...(env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: true,
          },
        },
      }
    : {}),
});
