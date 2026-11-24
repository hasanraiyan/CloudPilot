import type { Request, Response } from "express";
import { checkDatabaseHealth } from "@cloudpilot/database";
import { checkRedisHealth } from "@cloudpilot/queue";
import { redisProducerConnection } from "../services/queue-producer.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/api-error.js";
import { successResponse } from "../utils/api-response.js";

function healthData(status: "healthy" | "live" | "not_ready") {
  return {
    service: "CloudPilot API",
    version: env.API_VERSION,
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

export function getHealth(_req: Request, res: Response): void {
  res.status(200).json(successResponse(healthData("healthy")));
}

export function getLiveness(_req: Request, res: Response): void {
  res.status(200).json(successResponse(healthData("live")));
}

export async function getReadiness(_req: Request, res: Response): Promise<void> {
  const database = await checkDatabaseHealth(1500);
  let redis;
  try {
    if (redisProducerConnection.status !== "ready") {
      await redisProducerConnection.connect();
    }
    redis = await checkRedisHealth(redisProducerConnection, 1500);
  } catch {
    redis = { healthy: false, latencyMs: 0 };
  }

  if (!database.healthy || !redis.healthy) {
    throw new ApiError(
      503,
      "Required dependencies are unavailable.",
      "DEPENDENCY_NOT_READY",
      {
        database: database.healthy ? "healthy" : "unavailable",
        redis: redis.healthy ? "healthy" : "unavailable",
      },
    );
  }

  res.status(200).json(
    successResponse({
      ...healthData("healthy"),
      dependencies: {
        status: "ready",
        database: "healthy",
        redis: redis.healthy ? "healthy" : "unavailable",
      },
    }),
  );
}
