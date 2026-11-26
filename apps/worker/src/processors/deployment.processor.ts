import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@cloudpilot/database";
import type { DeploymentJob, QueueJob } from "@cloudpilot/queue";
import { UnrecoverableError } from "bullmq";
import type { Job } from "bullmq";
import { workerEnv } from "../config/env.js";
import { workerLogger } from "../config/logger.js";

export interface DeploymentProcessorContext {
  signal: AbortSignal;
  isCancellationRequested(): Promise<boolean>;
}

export type ControlledDeploymentProcessor = (
  context: DeploymentProcessorContext,
) => Promise<void>;

interface ClaimedDeployment {
  id: string;
  workspaceId: string;
  executionAttempt: number;
  executionLeaseToken: string;
}

const infrastructureOnlyProcessor: ControlledDeploymentProcessor = async ({ signal }) => {
  if (signal.aborted) {
    throw new Error("Deployment processing was interrupted");
  }
};

async function claimDeployment(
  payload: DeploymentJob,
  maxAttempts: number,
): Promise<ClaimedDeployment | null> {
  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + workerEnv.DEPLOYMENT_EXECUTION_LEASE_MS);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedDeployment[]>`
      UPDATE "deployments"
      SET "status" = 'PREPARING'::"DeploymentStatus",
          "executionLeaseToken" = ${leaseToken}::uuid,
          "executionLeaseExpiresAt" = ${leaseExpiresAt},
          "executionAttempt" = "executionAttempt" + 1,
          "startedAt" = COALESCE("startedAt", ${now}),
          "updatedAt" = ${now}
      WHERE "id" = ${payload.deploymentId}::uuid
        AND "workspaceId" = ${payload.workspaceId}::uuid
        AND "projectId" = ${payload.projectId}::uuid
        AND "executionAttempt" < ${maxAttempts}
        AND (
          "status" IN ('QUEUED'::"DeploymentStatus", 'PENDING'::"DeploymentStatus")
          OR (
            "status" = 'PREPARING'::"DeploymentStatus"
            AND "executionLeaseExpiresAt" <= ${now}
          )
        )
        AND (
          "executionLeaseToken" IS NULL
          OR "executionLeaseExpiresAt" <= ${now}
        )
      RETURNING "id", "workspaceId", "executionAttempt", "executionLeaseToken"
    `;
    const claimed = rows[0] ?? null;
    if (!claimed) return null;

    await tx.auditLog.create({
      data: {
        workspaceId: payload.workspaceId,
        action: "DEPLOYMENT_EXECUTION_CLAIMED",
        entityType: "Deployment",
        entityId: payload.deploymentId,
        metadata: { attempt: claimed.executionAttempt },
      },
    });
    return claimed;
  });
}

async function failExpiredAttempt(payload: DeploymentJob, maxAttempts: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.deployment.updateMany({
      where: {
        id: payload.deploymentId,
        workspaceId: payload.workspaceId,
        projectId: payload.projectId,
        status: "PREPARING",
        executionAttempt: { gte: maxAttempts },
        executionLeaseExpiresAt: { lte: now },
      },
      data: {
        status: "FAILED",
        failureCode: "UNKNOWN",
        failureMessage: "Deployment processing stopped before it could complete.",
        executionLeaseToken: null,
        executionLeaseExpiresAt: null,
        finishedAt: now,
      },
    });
    if (updated.count !== 1) return;
    await tx.auditLog.create({
      data: {
        workspaceId: payload.workspaceId,
        action: "DEPLOYMENT_EXECUTION_LEASE_EXPIRED",
        entityType: "Deployment",
        entityId: payload.deploymentId,
        metadata: { attemptLimitReached: true },
      },
    });
  });
}

async function settleClaim(
  payload: DeploymentJob,
  leaseToken: string,
  failureMessage: string,
): Promise<"failed" | "cancelled" | "stale"> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const cancelled = await tx.deployment.updateMany({
      where: {
        id: payload.deploymentId,
        workspaceId: payload.workspaceId,
        projectId: payload.projectId,
        status: "CANCELLING",
        executionLeaseToken: leaseToken,
      },
      data: {
        status: "CANCELLED",
        failureCode: "CANCELLED",
        failureMessage: "Deployment cancellation was acknowledged by the worker.",
        executionLeaseToken: null,
        executionLeaseExpiresAt: null,
        finishedAt: now,
      },
    });
    if (cancelled.count === 1) {
      await tx.auditLog.create({
        data: {
          workspaceId: payload.workspaceId,
          action: "DEPLOYMENT_CANCELLATION_ACKNOWLEDGED",
          entityType: "Deployment",
          entityId: payload.deploymentId,
          metadata: { source: "worker" },
        },
      });
      return "cancelled";
    }

    const failed = await tx.deployment.updateMany({
      where: {
        id: payload.deploymentId,
        workspaceId: payload.workspaceId,
        projectId: payload.projectId,
        status: "PREPARING",
        executionLeaseToken: leaseToken,
      },
      data: {
        status: "FAILED",
        failureCode: "UNKNOWN",
        failureMessage,
        executionLeaseToken: null,
        executionLeaseExpiresAt: null,
        finishedAt: now,
      },
    });
    if (failed.count !== 1) return "stale";
    await tx.auditLog.create({
      data: {
        workspaceId: payload.workspaceId,
        action: "DEPLOYMENT_STATUS_CHANGED",
        entityType: "Deployment",
        entityId: payload.deploymentId,
        metadata: { from: "PREPARING", to: "FAILED" },
      },
    });
    return "failed";
  });
}

export async function processDeploymentJob(
  job: Job<QueueJob>,
  payload: DeploymentJob,
  signal: AbortSignal,
  processor: ControlledDeploymentProcessor = infrastructureOnlyProcessor,
): Promise<{ status: "skipped" | "failed" | "cancelled" }> {
  const event = await prisma.deploymentOutboxEvent.findFirst({
    where: {
      id: payload.eventId,
      workspaceId: payload.workspaceId,
      projectId: payload.projectId,
      deploymentId: payload.deploymentId,
      eventType: "DEPLOYMENT_REQUESTED",
    },
    select: { id: true, jobId: true },
  });
  if (!event || event.jobId !== job.id) {
    throw new UnrecoverableError("Deployment queue event is invalid");
  }

  const deployment = await prisma.deployment.findFirst({
    where: {
      id: payload.deploymentId,
      workspaceId: payload.workspaceId,
      projectId: payload.projectId,
    },
    select: { status: true },
  });
  if (!deployment || ["CANCELLED", "CANCELLING", "FAILED", "SUCCEEDED", "STOPPED", "ROLLED_BACK"].includes(deployment.status)) {
    return { status: "skipped" };
  }

  const claimed = await claimDeployment(payload, workerEnv.QUEUE_JOB_ATTEMPTS);
  if (!claimed) {
    await failExpiredAttempt(payload, workerEnv.QUEUE_JOB_ATTEMPTS);
    return { status: "skipped" };
  }

  const context: DeploymentProcessorContext = {
    signal,
    async isCancellationRequested() {
      const current = await prisma.deployment.findFirst({
        where: {
          id: payload.deploymentId,
          workspaceId: payload.workspaceId,
          projectId: payload.projectId,
        },
        select: { status: true },
      });
      return !current || current.status === "CANCELLING" || current.status === "CANCELLED" || signal.aborted;
    },
  };

  try {
    await processor(context);
    if (await context.isCancellationRequested()) {
      const settled = await settleClaim(
        payload,
        claimed.executionLeaseToken,
        "Deployment execution is not configured on this worker.",
      );
      return { status: settled === "cancelled" ? "cancelled" : "skipped" };
    }
    const settled = await settleClaim(
      payload,
      claimed.executionLeaseToken,
      "Deployment execution is not configured on this worker.",
    );
    if (settled === "stale") return { status: "skipped" };
    return { status: settled };
  } catch (error) {
    await settleClaim(
      payload,
      claimed.executionLeaseToken,
      "Deployment infrastructure processing failed.",
    );
    workerLogger.error(
      { deploymentId: payload.deploymentId, errorName: error instanceof Error ? error.name : "UnknownError" },
      "Controlled deployment processing failed",
    );
    throw new UnrecoverableError("Controlled deployment processing failed");
  }
}
