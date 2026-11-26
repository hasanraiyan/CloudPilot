import { prisma } from "@cloudpilot/database";
import { QUEUE_NAMES, QueueManager } from "@cloudpilot/queue";

const activeOrRecoverableStatuses = ["QUEUED", "PENDING", "PREPARING", "CANCELLING", "CANCELLED"] as const;

export async function reconcileDeploymentQueue(
  queueManager: QueueManager,
  limit = 25,
): Promise<{ inspected: number; republished: number; cancelled: number; failed: number; removed: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Reconciliation batch size must be between 1 and 100");
  }
  const events = await prisma.deploymentOutboxEvent.findMany({
    where: {
      status: "PUBLISHED",
      deployment: { is: { status: { in: [...activeOrRecoverableStatuses] } } },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      deploymentId: true,
      jobId: true,
      deployment: {
        select: {
          status: true,
          executionLeaseToken: true,
          executionLeaseExpiresAt: true,
        },
      },
    },
  });

  const summary = { inspected: events.length, republished: 0, cancelled: 0, failed: 0, removed: 0 };
  const now = new Date();
  const queue = queueManager.getQueue(QUEUE_NAMES.deployment);
  for (const event of events) {
    const job = await queue.getJob(event.jobId);
    const jobState = job ? await job.getState() : null;
    const deployment = event.deployment;

    if (deployment.status === "CANCELLED") {
      if (job && ["waiting", "delayed", "paused", "prioritized"].includes(jobState ?? "")) {
        await job.remove();
        summary.removed += 1;
      }
      await prisma.deploymentOutboxEvent.updateMany({
        where: { id: event.id, status: "PUBLISHED" },
        data: { status: "DEAD", lastErrorCode: "DEPLOYMENT_CANCELLED" },
      });
      continue;
    }

    if (deployment.status === "CANCELLING") {
      const leaseExpired = !deployment.executionLeaseToken
        || !deployment.executionLeaseExpiresAt
        || deployment.executionLeaseExpiresAt <= now;
      if (leaseExpired && jobState !== "active") {
        const updated = await prisma.$transaction(async (tx) => {
          const result = await tx.deployment.updateMany({
            where: {
              id: event.deploymentId,
              workspaceId: event.workspaceId,
              projectId: event.projectId,
              status: "CANCELLING",
              ...(deployment.executionLeaseToken
                ? { executionLeaseToken: deployment.executionLeaseToken }
                : {}),
            },
            data: {
              status: "CANCELLED",
              failureCode: "CANCELLED",
              failureMessage: "Deployment cancellation was recovered by reconciliation.",
              executionLeaseToken: null,
              executionLeaseExpiresAt: null,
              finishedAt: now,
            },
          });
          if (result.count !== 1) return false;
          await tx.auditLog.create({
            data: {
              workspaceId: event.workspaceId,
              action: "DEPLOYMENT_CANCELLATION_RECOVERED",
              entityType: "Deployment",
              entityId: event.deploymentId,
              metadata: { source: "reconciliation" },
            },
          });
          return true;
        });
        if (updated) summary.cancelled += 1;
      }
      continue;
    }

    if (deployment.status === "PREPARING") {
      const leaseExpired = !deployment.executionLeaseToken
        || !deployment.executionLeaseExpiresAt
        || deployment.executionLeaseExpiresAt <= now;
      if (!leaseExpired || jobState === "active" || jobState === "waiting" || jobState === "delayed") continue;
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.deployment.updateMany({
          where: {
            id: event.deploymentId,
            workspaceId: event.workspaceId,
            projectId: event.projectId,
            status: "PREPARING",
            ...(deployment.executionLeaseToken
              ? { executionLeaseToken: deployment.executionLeaseToken }
              : {}),
            executionLeaseExpiresAt: deployment.executionLeaseExpiresAt
              ? { lte: now }
              : null,
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
        if (result.count !== 1) return false;
        await tx.auditLog.create({
          data: {
            workspaceId: event.workspaceId,
            action: "DEPLOYMENT_EXECUTION_LEASE_EXPIRED",
            entityType: "Deployment",
            entityId: event.deploymentId,
            metadata: { source: "reconciliation" },
          },
        });
        return true;
      });
      if (updated) summary.failed += 1;
      continue;
    }

    if (!job) {
      const updated = await prisma.deploymentOutboxEvent.updateMany({
        where: { id: event.id, status: "PUBLISHED" },
        data: {
          status: "PENDING",
          nextAttemptAt: now,
          publishedAt: null,
          lastErrorCode: "QUEUE_JOB_MISSING",
        },
      });
      if (updated.count === 1) summary.republished += 1;
      continue;
    }

    if (jobState === "failed") {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.deployment.updateMany({
          where: {
            id: event.deploymentId,
            workspaceId: event.workspaceId,
            projectId: event.projectId,
            status: { in: ["QUEUED", "PENDING"] },
          },
          data: {
            status: "FAILED",
            failureCode: "UNKNOWN",
            failureMessage: "Deployment queue processing could not be completed.",
            finishedAt: now,
          },
        });
        if (result.count !== 1) return false;
        await tx.auditLog.create({
          data: {
            workspaceId: event.workspaceId,
            action: "DEPLOYMENT_QUEUE_PROCESSING_FAILED",
            entityType: "Deployment",
            entityId: event.deploymentId,
            metadata: { source: "reconciliation" },
          },
        });
        return true;
      });
      if (updated) summary.failed += 1;
      continue;
    }

    await prisma.deploymentOutboxEvent.updateMany({
      where: { id: event.id, status: "PUBLISHED" },
      data: { updatedAt: now },
    });
  }

  return summary;
}
