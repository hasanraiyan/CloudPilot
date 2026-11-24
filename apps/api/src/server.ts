import type { Server } from "node:http";
import { createServer } from "node:http";
import { disconnectDatabase } from "@cloudpilot/database";
import { disconnectQueueProducer } from "./services/queue-producer.js";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

const app = createApp();
const httpServer: Server = createServer(app);
let isShuttingDown = false;

function shutdown(exitCode: number, signal: string): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");
  const timeout = setTimeout(() => {
    logger.error({ signal }, "Graceful shutdown timeout exceeded");
    process.exit(1);
  }, 10_000);
  timeout.unref();

  httpServer.close(async (error) => {
    clearTimeout(timeout);
    if (error) {
      logger.error({ err: error, signal }, "Server shutdown failed");
      process.exit(1);
    }
    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      logger.error({ err: disconnectError, signal }, "Database disconnection failed");
      process.exit(1);
    }
    try {
      await disconnectQueueProducer();
    } catch (disconnectError) {
      logger.error({ err: disconnectError, signal }, "Queue disconnection failed");
      process.exit(1);
    }
    logger.info({ signal }, "Graceful shutdown completed");
    process.exit(exitCode);
  });
}

httpServer.on("error", (error) => {
  logger.fatal({ err: error }, "HTTP server failed to start");
  process.exit(1);
});

httpServer.listen(env.PORT, env.HOST, () => {
  logger.info(
    {
      host: env.HOST,
      port: env.PORT,
      environment: env.NODE_ENV,
      apiVersion: env.API_VERSION,
    },
    "CloudPilot API started",
  );
});

process.on("SIGINT", () => shutdown(0, "SIGINT"));
process.on("SIGTERM", () => shutdown(0, "SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "Unhandled promise rejection");
  shutdown(1, "unhandledRejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception");
  shutdown(1, "uncaughtException");
});
