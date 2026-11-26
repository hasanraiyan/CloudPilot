import { DeploymentOutboxPublisher } from "./deployment-outbox.service.js";
import { logger } from "../config/logger.js";
import { queueEnv, queueManager } from "./queue-producer.js";
import { reconcileDeploymentQueue } from "./deployment-reconciliation.service.js";

export interface DeploymentOutboxRuntimeStatus {
  running: boolean;
  lastSuccessfulRunAt: string | null;
  lastErrorCode: string | null;
  lastPublishedCount: number;
}

export class DeploymentOutboxRuntime {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private status: DeploymentOutboxRuntimeStatus = {
    running: false,
    lastSuccessfulRunAt: null,
    lastErrorCode: null,
    lastPublishedCount: 0,
  };

  constructor(
    private readonly publisher: DeploymentOutboxPublisher,
    private readonly onError: (error: unknown) => void,
  ) {}

  getStatus(): DeploymentOutboxRuntimeStatus {
    return { ...this.status };
  }

  start(intervalMs: number): void {
    if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 60_000) {
      throw new Error("Outbox publisher interval must be between 100 and 60000 ms");
    }
    if (this.timer) return;
    this.status = { ...this.status, running: true };
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inFlight;
    this.status = { ...this.status, running: false };
  }

  private async tick(): Promise<void> {
    if (!this.status.running || this.inFlight) return;
    this.inFlight = this.publisher.publishBatch(25).then(async (result) => {
      await reconcileDeploymentQueue(queueManager, 25);
      this.status = {
        ...this.status,
        lastSuccessfulRunAt: new Date().toISOString(),
        lastErrorCode: null,
        lastPublishedCount: result.published,
      };
    }).catch((error: unknown) => {
      this.status = { ...this.status, lastErrorCode: "OUTBOX_PUBLISH_FAILED" };
      this.onError(error);
    }).finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
  }
}

export const deploymentOutboxRuntime = new DeploymentOutboxRuntime(
  new DeploymentOutboxPublisher(queueManager),
  (error) => {
    logger.warn(
      { errorName: error instanceof Error ? error.name : "UnknownError" },
      "Deployment outbox publisher iteration failed",
    );
  },
);
