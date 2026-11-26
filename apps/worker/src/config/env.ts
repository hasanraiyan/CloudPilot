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
  DEPLOYMENT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  QUEUE_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  QUEUE_BACKOFF_MS: z.coerce.number().int().min(100).max(3600000).default(1000),
  QUEUE_BACKOFF_JITTER: z.coerce.number().min(0).max(1).default(0.25),
  QUEUE_COMPLETED_RETENTION: z.coerce.number().int().min(1).default(1000),
  QUEUE_FAILED_RETENTION: z.coerce.number().int().min(1).default(5000),
  QUEUE_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(30000),
  DEPLOYMENT_EXECUTION_LEASE_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(5000),
  WORKER_HEARTBEAT_TTL_SECONDS: z.coerce.number().int().min(2).max(300).default(20),
}).superRefine((value, context) => {
  if (value.DEPLOYMENT_EXECUTION_LEASE_MS <= value.QUEUE_EXECUTION_TIMEOUT_MS) {
    context.addIssue({
      code: "custom",
      path: ["DEPLOYMENT_EXECUTION_LEASE_MS"],
      message: "Must be longer than QUEUE_EXECUTION_TIMEOUT_MS",
    });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid worker environment configuration: ${details}`);
}

export const workerEnv = Object.freeze(parsed.data);
