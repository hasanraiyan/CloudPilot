import { Redis as IORedis } from "ioredis";
import { Queue } from "bullmq";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { parseQueueEnv } from "./config/env.js";

config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
const queueEnv = parseQueueEnv();

const connection = new IORedis(queueEnv.REDIS_URL, { maxRetriesPerRequest: 1 });
const queue = new Queue("diagnostic", { connection, prefix: queueEnv.QUEUE_PREFIX });
const suffix = `${Date.now()}`;

const jobs = [
  { name: "success", payload: { kind: "diagnostic", correlationId: `success-${suffix}` }, id: `diagnostic-success-${suffix}` },
  { name: "deduplicate", payload: { kind: "diagnostic", correlationId: `dedupe-${suffix}` }, id: `diagnostic-dedupe-${suffix}` },
  { name: "transient", payload: { kind: "diagnostic", correlationId: `transient-${suffix}`, transientFailureOnce: true }, id: `diagnostic-transient-${suffix}` },
  { name: "permanent", payload: { kind: "diagnostic", correlationId: `permanent-${suffix}`, permanentFailure: true }, id: `diagnostic-permanent-${suffix}` },
  { name: "deadline", payload: { kind: "diagnostic", correlationId: `deadline-${suffix}`, blockForMs: 5000 }, id: `diagnostic-deadline-${suffix}` },
  { name: "invalid", payload: { kind: "diagnostic", correlationId: "" }, id: `diagnostic-invalid-${suffix}` },
] as const;

for (const item of jobs) {
  const permanent = item.name === "permanent" || item.name === "invalid";
  await queue.add("diagnostic", item.payload, {
    jobId: item.id,
    attempts: permanent ? 1 : item.name === "deadline" ? 1 : 3,
    backoff: { type: "exponential", delay: 500 },
  });
  await queue.add("diagnostic", item.payload, {
    jobId: item.id,
    attempts: permanent ? 1 : item.name === "deadline" ? 1 : 3,
    backoff: { type: "exponential", delay: 500 },
  });
}

await new Promise((resolve) => setTimeout(resolve, 5000));

const results: Record<string, unknown> = {};
for (const item of jobs) {
  const job = await queue.getJob(item.id);
  results[item.name] = job
    ? { id: job.id, state: await job.getState(), attemptsMade: job.attemptsMade }
    : { id: item.id, state: "not_found" };
}

console.log(JSON.stringify(results));
for (const item of jobs) {
  const job = await queue.getJob(item.id);
  if (job) await job.remove();
}
await queue.close();
await connection.quit();
