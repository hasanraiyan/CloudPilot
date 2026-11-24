import { Redis as IORedis } from "ioredis";

export interface RedisConnectionOptions {
  url: string;
  timeoutMs?: number;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
  name?: string;
}

export function createRedisConnection(options: RedisConnectionOptions): IORedis {
  return new IORedis(options.url, {
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? null,
    enableReadyCheck: options.enableReadyCheck ?? true,
    connectTimeout: options.timeoutMs ?? 5000,
    lazyConnect: true,
    ...(options.name ? { connectionName: options.name } : {}),
  });
}

export function createProducerConnection(url: string): IORedis {
  return createRedisConnection({
    url,
    timeoutMs: 3000,
    maxRetriesPerRequest: 1,
    name: "cloudpilot-producer",
  });
}

export function createWorkerConnection(url: string): IORedis {
  return createRedisConnection({
    url,
    timeoutMs: 5000,
    maxRetriesPerRequest: null,
    name: "cloudpilot-worker",
  });
}

export async function checkRedisHealth(
  connection: IORedis,
  timeoutMs = 1500,
): Promise<{ healthy: boolean; latencyMs: number }> {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Redis health check timed out")), timeoutMs);
  });

  try {
    await Promise.race([connection.ping(), timeout]);
    return { healthy: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { healthy: false, latencyMs: Math.round(performance.now() - startedAt) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
