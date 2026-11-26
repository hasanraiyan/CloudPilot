import { z } from "zod";
import type { Redis } from "ioredis";

const workerCapabilitiesSchema = z.object({
  diagnostic: z.boolean(),
  deploymentQueue: z.boolean(),
  sourceRetrieval: z.boolean(),
  dockerBuild: z.boolean(),
  containerExecution: z.boolean(),
}).strict();

export const workerHeartbeatSchema = z.object({
  workerId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
  role: z.enum(["diagnostic", "deployment"]),
  version: z.string().min(1).max(40),
  capabilities: workerCapabilitiesSchema,
  startupAt: z.string().datetime(),
  lastHeartbeatAt: z.string().datetime(),
  available: z.boolean(),
  draining: z.boolean(),
  concurrency: z.number().int().min(1).max(100),
}).strict().superRefine((heartbeat, context) => {
  const expectedCapability = heartbeat.role === "diagnostic" ? "diagnostic" : "deploymentQueue";
  if (!heartbeat.capabilities[expectedCapability]) {
    context.addIssue({ code: "custom", path: ["capabilities", expectedCapability], message: "Capability does not match worker role" });
  }
});

export type WorkerHeartbeat = z.infer<typeof workerHeartbeatSchema>;

export interface WorkerRegistryOptions {
  prefix: string;
  ttlSeconds: number;
}

function validateOptions(options: WorkerRegistryOptions): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(options.prefix)) {
    throw new Error("Worker registry prefix is invalid");
  }
  if (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < 2 || options.ttlSeconds > 300) {
    throw new Error("Worker heartbeat TTL must be between 2 and 300 seconds");
  }
}

function workerIndexKey(prefix: string, role: WorkerHeartbeat["role"]): string {
  return `${prefix}:worker-heartbeats:${role}`;
}

function workerKey(prefix: string, role: WorkerHeartbeat["role"], workerId: string): string {
  return `${prefix}:worker-heartbeat:${role}:${workerId}`;
}

export async function publishWorkerHeartbeat(
  connection: Redis,
  options: WorkerRegistryOptions,
  heartbeat: WorkerHeartbeat,
): Promise<void> {
  const parsed = workerHeartbeatSchema.parse(heartbeat);
  validateOptions(options);
  const key = workerKey(options.prefix, parsed.role, parsed.workerId);
  await connection.set(key, JSON.stringify(parsed), "EX", options.ttlSeconds);
  await connection.sadd(workerIndexKey(options.prefix, parsed.role), key);
}

export async function listWorkerHeartbeats(
  connection: Redis,
  options: WorkerRegistryOptions,
  role: WorkerHeartbeat["role"],
): Promise<WorkerHeartbeat[]> {
  validateOptions(options);
  const indexKey = workerIndexKey(options.prefix, role);
  const keys = await connection.smembers(indexKey);
  if (keys.length === 0) return [];

  const values = await connection.mget(...keys);
  const live: WorkerHeartbeat[] = [];
  const expired: string[] = [];
  for (const [index, raw] of values.entries()) {
    const key = keys[index];
    if (!key) continue;
    if (!raw) {
      expired.push(key);
      continue;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("Worker heartbeat data is invalid");
    }
    const parsed = workerHeartbeatSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error("Worker heartbeat data is invalid");
    }
    if (parsed.data.role !== role) {
      throw new Error("Worker heartbeat role does not match its registry");
    }
    live.push(parsed.data);
  }
  if (expired.length) await connection.srem(indexKey, ...expired);
  return live;
}

export async function removeWorkerHeartbeat(
  connection: Redis,
  options: WorkerRegistryOptions,
  heartbeat: Pick<WorkerHeartbeat, "workerId" | "role">,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(heartbeat.workerId)) {
    throw new Error("Worker identifier is invalid");
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(options.prefix)) {
    throw new Error("Worker registry prefix is invalid");
  }
  const key = workerKey(options.prefix, heartbeat.role, heartbeat.workerId);
  await connection.del(key);
  await connection.srem(workerIndexKey(options.prefix, heartbeat.role), key);
}
