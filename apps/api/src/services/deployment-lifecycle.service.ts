import { Prisma } from "@cloudpilot/database";
import {
  canTransitionDeployment,
  isTerminalDeploymentStatus,
  type DeploymentLifecycleStatus,
} from "./deployment-state-machine.js";

export class InvalidDeploymentTransitionError extends Error {
  constructor(from: DeploymentLifecycleStatus, to: DeploymentLifecycleStatus) {
    super(`Deployment cannot transition from ${from} to ${to}.`);
    this.name = "InvalidDeploymentTransitionError";
  }
}

export async function transitionDeployment(
  tx: Prisma.TransactionClient,
  input: {
    deploymentId: string;
    workspaceId: string;
    actorId?: string;
    from: DeploymentLifecycleStatus;
    to: DeploymentLifecycleStatus;
    failureCode?: "BUILD_FAILED" | "DEPLOY_FAILED" | "HEALTH_CHECK_FAILED" | "TIMEOUT" | "CANCELLED" | "UNKNOWN";
    failureMessage?: string;
  },
) {
  if (!canTransitionDeployment(input.from, input.to)) {
    throw new InvalidDeploymentTransitionError(input.from, input.to);
  }

  const now = new Date();
  const updated = await tx.deployment.updateMany({
    where: {
      id: input.deploymentId,
      workspaceId: input.workspaceId,
      status: input.from,
    },
    data: {
      status: input.to,
      ...(input.to === "PREPARING" ? { startedAt: now } : {}),
      ...(isTerminalDeploymentStatus(input.to) ? { finishedAt: now } : {}),
      ...(input.failureCode ? { failureCode: input.failureCode } : {}),
      ...(input.failureMessage ? { failureMessage: input.failureMessage } : {}),
    },
  });

  if (updated.count !== 1) return null;

  await tx.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      action: "DEPLOYMENT_STATUS_CHANGED",
      entityType: "Deployment",
      entityId: input.deploymentId,
      metadata: { from: input.from, to: input.to },
    },
  });

  return tx.deployment.findFirst({
    where: { id: input.deploymentId, workspaceId: input.workspaceId },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      environment: true,
      status: true,
      triggerSource: true,
      requestedBranch: true,
      commitSha: true,
      commitMessage: true,
      queueJobId: true,
      buildConfigurationSnapshot: true,
      failureCode: true,
      failureMessage: true,
      previousDeploymentId: true,
      rollbackOfId: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      updatedAt: true,
    },
  });
}
