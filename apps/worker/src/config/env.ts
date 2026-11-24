import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.string().trim().min(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  QUEUE_PREFIX: z.string().trim().min(1).default("cloudpilot"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  QUEUE_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  QUEUE_BACKOFF_MS: z.coerce.number().int().min(100).max(3600000).default(1000),
  QUEUE_COMPLETED_RETENTION: z.coerce.number().int().min(1).default(1000),
  QUEUE_FAILED_RETENTION: z.coerce.number().int().min(1).default(5000),
  QUEUE_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(30000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid worker environment configuration: ${details}`);
}

export const workerEnv = Object.freeze(parsed.data);
