import { randomUUID } from "node:crypto";
import {
  QUEUE_NAMES,
  QueueManager,
  createWorkerConnection,
  publishWorkerHeartbeat,
  type DiagnosticJob,
  type QueueJob,
  queuePayloadSchemas,
} from "@cloudpilot/queue";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";
import { workerEnv } from "./config/env.js";
import { workerLogger } from "./config/logger.js";
import { processDiagnosticJob } from "./processors/diagnostic.processor.js";
import { processDeploymentJob } from "./processors/deployment.processor.js";

const workerConnection = createWorkerConnection(workerEnv.REDIS_URL);
const workerId = `worker-${randomUUID()}`;
const startupAt = new Date().toISOString();
const heartbeatOptions = {
  prefix: workerEnv.QUEUE_PREFIX,
  ttlSeconds: workerEnv.WORKER_HEARTBEAT_TTL_SECONDS,
};
const queueManager = new QueueManager(workerConnection, workerConnection, {
  attempts: workerEnv.QUEUE_JOB_ATTEMPTS,
  backoffMs: workerEnv.QUEUE_BACKOFF_MS,
  completedRetention: workerEnv.QUEUE_COMPLETED_RETENTION,
  failedRetention: workerEnv.QUEUE_FAILED_RETENTION,
  executionTimeoutMs: workerEnv.QUEUE_EXECUTION_TIMEOUT_MS,
  backoffJitter: workerEnv.QUEUE_BACKOFF_JITTER,
}, false, workerEnv.QUEUE_PREFIX);
let shuttingDown = false;

function publishHeartbeat(role: "diagnostic" | "deployment", available: boolean, draining: boolean): void {
  const isDeploymentWorker = role === "deployment";
  void publishWorkerHeartbeat(workerConnection, heartbeatOptions, {
    workerId,
    role,
    version: "0.1.0",
    capabilities: {
      diagnostic: !isDeploymentWorker,
      deploymentQueue: isDeploymentWorker,
      sourceRetrieval: false,
      dockerBuild: false,
      containerExecution: false,
    },
    startupAt,
    lastHeartbeatAt: new Date().toISOString(),
    available,
    draining,
    concurrency: isDeploymentWorker
      ? workerEnv.DEPLOYMENT_WORKER_CONCURRENCY
      : workerEnv.WORKER_CONCURRENCY,
  }).catch((error: unknown) => {
    workerLogger.warn(
      { role, errorName: error instanceof Error ? error.name : "UnknownError" },
      "Worker heartbeat update failed",
    );
  });
}

workerConnection.on("error", (error) => {
  workerLogger.error({ err: error }, "Worker Redis connection error");
});

workerConnection.on("ready", () => {
  workerLogger.info("Worker Redis connection ready");
});

const worker = queueManager.createWorker(
  QUEUE_NAMES.diagnostic,
  async (job: Job<QueueJob>, _token, signal) => {
    const parsed = queuePayloadSchemas.diagnostic.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid diagnostic job payload: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    }
    const result = await processDiagnosticJob(job as Job<DiagnosticJob>, signal);
    workerLogger.info(
      { jobId: job.id, correlationId: job.data.kind === "diagnostic" ? job.data.correlationId : undefined, attempts: job.attemptsStarted },
      "Diagnostic job completed",
    );
    return result;
  },
  workerEnv.WORKER_CONCURRENCY,
);
const deploymentWorker = queueManager.createWorker(
  QUEUE_NAMES.deployment,
  async (job: Job<QueueJob>, _token, signal) => {
    const parsed = queuePayloadSchemas.deployment.safeParse(job.data);
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid deployment job payload: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    }
    return processDeploymentJob(job, parsed.data, signal ?? new AbortController().signal);
  },
  workerEnv.DEPLOYMENT_WORKER_CONCURRENCY,
);

worker.on("completed", (job) => {
  workerLogger.info({ jobId: job.id, queue: QUEUE_NAMES.diagnostic }, "Job completed");
});

worker.on("failed", (job, error) => {
  workerLogger.warn(
    { jobId: job?.id, queue: QUEUE_NAMES.diagnostic, errorName: error.name },
    "Job failed",
  );
});

worker.on("stalled", (jobId) => {
  workerLogger.warn({ jobId, queue: QUEUE_NAMES.diagnostic }, "Job stalled");
});

worker.on("error", (error) => {
  workerLogger.error({ err: error }, "Worker error");
});

deploymentWorker.on("completed", (job) => {
  workerLogger.info({ jobId: job.id, queue: QUEUE_NAMES.deployment }, "Deployment infrastructure job completed");
});

deploymentWorker.on("failed", (job, error) => {
  workerLogger.warn(
    { jobId: job?.id, queue: QUEUE_NAMES.deployment, errorName: error.name },
    "Deployment infrastructure job failed",
  );
});

deploymentWorker.on("stalled", (jobId) => {
  workerLogger.warn({ jobId, queue: QUEUE_NAMES.deployment }, "Deployment job stalled");
});

deploymentWorker.on("error", (error) => {
  workerLogger.error({ err: error }, "Deployment worker error");
});

publishHeartbeat("diagnostic", true, false);
publishHeartbeat("deployment", true, false);
const heartbeatTimer = setInterval(() => {
  const available = workerConnection.status === "ready" && !shuttingDown;
  publishHeartbeat("diagnostic", available, shuttingDown);
  publishHeartbeat("deployment", available, shuttingDown);
}, workerEnv.WORKER_HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  workerLogger.info({ signal }, "Worker graceful shutdown started");
  clearInterval(heartbeatTimer);
  publishHeartbeat("diagnostic", false, true);
  publishHeartbeat("deployment", false, true);

  const timeout = setTimeout(() => {
    workerLogger.error({ signal }, "Worker graceful shutdown timeout exceeded");
    process.exit(1);
  }, 10000);
  timeout.unref();

  try {
    await queueManager.close();
    await workerConnection.quit();
    clearTimeout(timeout);
    workerLogger.info({ signal }, "Worker graceful shutdown completed");
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    workerLogger.error({ err: error, signal }, "Worker graceful shutdown failed");
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  workerLogger.fatal({ err: error }, "Uncaught worker exception");
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  workerLogger.fatal({ err: reason }, "Unhandled worker rejection");
  void shutdown("unhandledRejection");
});
