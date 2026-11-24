import pino from "pino";
import { workerEnv } from "./env.js";

export const workerLogger = pino({
  level: workerEnv.LOG_LEVEL,
  redact: {
    paths: ["password", "token", "authorization", "cookie", "secret", "accessToken", "refreshToken"],
    censor: "[REDACTED]",
  },
  ...(workerEnv.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true, singleLine: true } } }
    : {}),
});
