import {
  QueueManager,
  createProducerConnection,
  type DiagnosticJob,
} from "@cloudpilot/queue";
import { env } from "../config/env.js";

export const redisProducerConnection = createProducerConnection(env.REDIS_URL);

export const queueManager = new QueueManager(
  redisProducerConnection,
  redisProducerConnection,
  {
    attempts: 3,
    backoffMs: 1000,
    completedRetention: 1000,
    failedRetention: 5000,
    executionTimeoutMs: 30000,
  },
  true,
);

export async function enqueueDiagnosticJob(
  payload: DiagnosticJob,
  jobId: string,
) {
  return queueManager.addJob("diagnostic", payload, QueueManager.validateJobId(jobId));
}

export async function disconnectQueueProducer(): Promise<void> {
  await queueManager.close();
}
