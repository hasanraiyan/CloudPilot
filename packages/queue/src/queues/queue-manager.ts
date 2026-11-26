import { Queue, Worker } from "bullmq";
import type { Job, Processor } from "bullmq";
import type { Redis as IORedis } from "ioredis";
import { queuePayloadSchemas, type QueueJob } from "../contracts/jobs.js";
import { QUEUE_NAMES, type QueueName } from "../config/queues.js";

export interface QueuePolicy {
  attempts: number;
  backoffMs: number;
  completedRetention: number;
  failedRetention: number;
  executionTimeoutMs: number;
  backoffJitter?: number;
}

export class TransientJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientJobError";
  }
}

export class QueueManager {
  readonly queues: Partial<Record<QueueName, Queue<QueueJob>>> = {};
  readonly workers: Worker<QueueJob>[] = [];
  private closed = false;

  constructor(
    private readonly producerConnection: IORedis,
    private readonly workerConnection: IORedis,
    private readonly policy: QueuePolicy = {
      attempts: 3,
      backoffMs: 1000,
      completedRetention: 1000,
      failedRetention: 5000,
      executionTimeoutMs: 30000,
    },
    private readonly closeConnections = false,
    private readonly prefix = "cloudpilot",
  ) {
    this.validatePolicy();
  }

  private validatePolicy(): void {
    if (!Number.isInteger(this.policy.attempts) || this.policy.attempts < 1 || this.policy.attempts > 20) {
      throw new Error("Queue attempts must be an integer between 1 and 20");
    }
    if (!Number.isInteger(this.policy.backoffMs) || this.policy.backoffMs < 100 || this.policy.backoffMs > 3600000) {
      throw new Error("Queue backoff must be an integer between 100 and 3600000 ms");
    }
    if (!Number.isInteger(this.policy.completedRetention) || this.policy.completedRetention < 1) {
      throw new Error("Completed retention must be a positive integer");
    }
    if (!Number.isInteger(this.policy.failedRetention) || this.policy.failedRetention < 1) {
      throw new Error("Failed retention must be a positive integer");
    }
    if (!Number.isInteger(this.policy.executionTimeoutMs) || this.policy.executionTimeoutMs < 100 || this.policy.executionTimeoutMs > 3600000) {
      throw new Error("Execution timeout must be an integer between 100 and 3600000 ms");
    }
    if (this.policy.backoffJitter !== undefined && (!Number.isFinite(this.policy.backoffJitter) || this.policy.backoffJitter < 0 || this.policy.backoffJitter > 1)) {
      throw new Error("Queue backoff jitter must be between 0 and 1");
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(this.prefix)) {
      throw new Error("Queue prefix must contain only letters, numbers, '_' or '-'");
    }
  }

  static validateJobId(jobId: string): string {
    const trimmed = jobId.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed) || trimmed.length > 128) {
      throw new Error("BullMQ job IDs must contain only letters, numbers, '_' or '-'");
    }
    return trimmed;
  }

  static deterministicJobId(
    queueName: QueueName,
    parts: readonly (string | number)[],
  ): string {
    const encoded = parts
      .map((part) => String(part).trim().replace(/[^A-Za-z0-9_-]/g, "_"))
      .filter((part) => part.length > 0)
      .join("-");
    return QueueManager.validateJobId(`${queueName}-${encoded}`);
  }

  static validatePayload(name: QueueName, payload: unknown): QueueJob {
    return queuePayloadSchemas[name].parse(payload);
  }

  getQueue(name: QueueName): Queue<QueueJob> {
    const existing = this.queues[name];
    if (existing) return existing;
    const queue = new Queue<QueueJob>(name, { connection: this.producerConnection, prefix: this.prefix });
    this.queues[name] = queue;
    return queue;
  }

  addJob(name: QueueName, payload: QueueJob, jobId: string): Promise<Job<QueueJob>> {
    const parsed = QueueManager.validatePayload(name, payload);
    const validatedJobId = QueueManager.validateJobId(jobId);
    const attempts =
      parsed.kind === "diagnostic" && parsed.permanentFailure
        ? 1
        : parsed.kind === "diagnostic" || parsed.kind === "deployment"
          ? this.policy.attempts
          : 1;
    return this.getQueue(name).add(name, parsed, {
      jobId: validatedJobId,
      attempts,
      backoff: { type: "exponential", delay: this.policy.backoffMs, jitter: this.policy.backoffJitter ?? 0.25 },
      removeOnComplete: { count: this.policy.completedRetention },
      removeOnFail: { count: this.policy.failedRetention },
    });
  }

  createWorker(
    name: QueueName,
    processor: Processor<QueueJob>,
    concurrency: number,
  ): Worker<QueueJob> {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
      throw new Error("Worker concurrency must be an integer between 1 and 100");
    }
    let worker: Worker<QueueJob>;
    const wrappedProcessor: Processor<QueueJob> = async (job, token, signal) => {
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        worker?.cancelJob(job.id ?? "", "Execution deadline exceeded");
      }, this.policy.executionTimeoutMs);

      try {
        const result = await processor(job, token, signal);
        if (timedOut) {
          throw new Error("Execution deadline exceeded");
        }
        return result;
      } finally {
        clearTimeout(deadline);
      }
    };

    worker = new Worker<QueueJob>(name, wrappedProcessor, {
      connection: this.workerConnection,
      concurrency,
      lockDuration: Math.max(30000, this.policy.executionTimeoutMs * 2),
      prefix: this.prefix,
      maxStalledCount: 1,
    });
    this.workers.push(worker);
    return worker;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const closeResources = async (): Promise<void> => {
      await Promise.allSettled(this.workers.map((worker) => worker.close()));
      await Promise.allSettled(
        Object.values(this.queues).map((queue) => queue?.close()),
      );
      if (!this.closeConnections) return;

      const connections = new Set([this.producerConnection, this.workerConnection]);
      await Promise.all(
        [...connections].map(async (connection) => {
          if (connection.status !== "end" && connection.status !== "close") {
            await connection.quit();
          }
        }),
      );
    };

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const boundedClose = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("Queue shutdown timeout exceeded")), 10000);
    });

    try {
      await Promise.race([closeResources(), boundedClose]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
