import { z } from "zod";

const queueEnvSchema = z.object({
  REDIS_URL: z.string().trim().min(1),
  QUEUE_PREFIX: z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/u).default("cloudpilot"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  DEPLOYMENT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
  DEPLOYMENT_OUTBOX_PUBLISH_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  WORKER_HEARTBEAT_TTL_SECONDS: z.coerce.number().int().min(2).max(300).default(20),
  QUEUE_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  QUEUE_BACKOFF_MS: z.coerce.number().int().min(100).max(3600000).default(1000),
  QUEUE_BACKOFF_JITTER: z.coerce.number().min(0).max(1).default(0.25),
  QUEUE_COMPLETED_RETENTION: z.coerce.number().int().min(1).default(1000),
  QUEUE_FAILED_RETENTION: z.coerce.number().int().min(1).default(5000),
  QUEUE_EXECUTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(30000),
}).superRefine((value, context) => {
  if (value.QUEUE_COMPLETED_RETENTION > 100000) {
    context.addIssue({ code: "custom", path: ["QUEUE_COMPLETED_RETENTION"], message: "Must not exceed 100000" });
  }
  if (value.QUEUE_FAILED_RETENTION > 100000) {
    context.addIssue({ code: "custom", path: ["QUEUE_FAILED_RETENTION"], message: "Must not exceed 100000" });
  }
});

export type QueueEnv = z.infer<typeof queueEnvSchema>;

export function parseQueueEnv(source: NodeJS.ProcessEnv = process.env): QueueEnv {
  const parsed = queueEnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid queue environment configuration: ${details}`);
  }
  return Object.freeze(parsed.data);
}
