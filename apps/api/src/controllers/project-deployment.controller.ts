import { prisma } from "@cloudpilot/database";
import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";
import {
  canManage,
  resolveProject,
  sendError,
} from "./project-build-configuration.controller.js";
import {
  createDeploymentSchema,
  deploymentIdSchema,
  deploymentListQuerySchema,
  idempotencyKeySchema,
} from "../validators/deployment.validator.js";
import {
  getDeploymentReadiness,
} from "../services/deployment-readiness.service.js";
import { removeQueuedDeploymentJob } from "../services/queue-producer.js";
import { logger } from "../config/logger.js";

const deploymentSelect = {
  id: true,
  projectId: true,
  environment: true,
  status: true,
  triggerSource: true,
  requestedBranch: true,
  gitRef: true,
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
} as const;

async function createDeployment(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  if (!canManage(scope.role)) {
    sendError(res, 403, "FORBIDDEN", "Workspace administrator access required to deploy this project.");
    return;
  }

  async function getReadiness(req: Request, res: Response): Promise<void> {
    res.set("Cache-Control", "no-store");
    const scope = await resolveProject(req, res);
    if (!scope) return;
    const readiness = await getDeploymentReadiness(scope.workspaceId, scope.projectId);
    res.json({ success: true, data: readiness });
  }

  const request = createDeploymentSchema.safeParse(req.body);
  if (!request.success) {
    sendError(res, 400, "INVALID_DEPLOYMENT_REQUEST", "Choose a valid branch and deployment environment.");
    return;
  }
  const key = idempotencyKeySchema.safeParse(req.get("Idempotency-Key"));
  if (!key.success) {
    sendError(res, 400, "IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.");
    return;
  }

  const existing = await prisma.deployment.findFirst({
    where: {
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      environment: request.data.environment,
      idempotencyKey: key.data,
    },
    select: deploymentSelect,
  });
  if (existing) {
    if (request.data.branch && existing.requestedBranch !== request.data.branch) {
      sendError(res, 409, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used for a different branch.");
      return;
    }
    res.status(200).json({ success: true, data: existing, idempotent: true });
    return;
  }

  sendError(
    res,
    503,
    "DEPLOYMENT_WORKER_UNAVAILABLE",
    "Deployment creation is disabled because no compatible deployment worker is registered.",
  );
}

async function getReadiness(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  const readiness = await getDeploymentReadiness(scope.workspaceId, scope.projectId);
  res.json({ success: true, data: readiness });
}

async function listDeployments(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  const query = deploymentListQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendError(res, 400, "INVALID_DEPLOYMENT_QUERY", "Use a valid status, page, and page size.");
    return;
  }

  const where = {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    ...(query.data.status ? { status: query.data.status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.deployment.count({ where }),
    prisma.deployment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.data.page - 1) * query.data.perPage,
      take: query.data.perPage,
      select: deploymentSelect,
    }),
  ]);
  res.json({
    success: true,
    data: {
      items,
      page: query.data.page,
      perPage: query.data.perPage,
      total,
      totalPages: Math.ceil(total / query.data.perPage),
    },
  });
}

async function getDeployment(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  const deploymentId = deploymentIdSchema.safeParse(req.params.deploymentId);
  if (!deploymentId.success) {
    sendError(res, 404, "DEPLOYMENT_NOT_FOUND", "Deployment not found in this project.");
    return;
  }

  const deployment = await prisma.deployment.findFirst({
    where: {
      id: deploymentId.data,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
    select: deploymentSelect,
  });
  if (!deployment) {
    sendError(res, 404, "DEPLOYMENT_NOT_FOUND", "Deployment not found in this project.");
    return;
  }
  res.json({ success: true, data: deployment });
}

async function cancelDeployment(req: Request, res: Response): Promise<void> {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  if (!canManage(scope.role)) {
    sendError(res, 403, "FORBIDDEN", "Workspace administrator access required to cancel this deployment.");
    return;
  }
  const deploymentId = deploymentIdSchema.safeParse(req.params.deploymentId);
  if (!deploymentId.success) {
    sendError(res, 404, "DEPLOYMENT_NOT_FOUND", "Deployment not found in this project.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.deployment.findFirst({
      where: {
        id: deploymentId.data,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
      select: { status: true, queueJobId: true },
    });
    if (!current) return { kind: "not_found" as const };
    const queued = current.status === "QUEUED" || current.status === "PENDING";
    if (!queued && current.status !== "PREPARING") return { kind: "conflict" as const };
    const nextStatus = queued ? "CANCELLED" : "CANCELLING";
    const now = new Date();
    const updated = await tx.deployment.updateMany({
      where: {
        id: deploymentId.data,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        status: current.status,
      },
      data: {
        status: nextStatus,
        failureCode: "CANCELLED",
        failureMessage: queued
          ? "Deployment was cancelled by a workspace administrator."
          : "Cancellation was requested; the worker will stop cooperatively.",
        ...(queued ? {
          finishedAt: now,
          executionLeaseToken: null,
          executionLeaseExpiresAt: null,
        } : {}),
      },
    });
    if (updated.count !== 1) return { kind: "conflict" as const };
    if (queued) {
      await tx.deploymentOutboxEvent.updateMany({
        where: {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          deploymentId: deploymentId.data,
          status: { in: ["PENDING", "PUBLISHING"] },
        },
        data: {
          status: "DEAD",
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: "DEPLOYMENT_CANCELLED",
        },
      });
    }
    await tx.auditLog.create({
      data: {
        workspaceId: scope.workspaceId,
        actorId: req.userId!,
        action: "DEPLOYMENT_CANCELLATION_REQUESTED",
        entityType: "Deployment",
        entityId: deploymentId.data,
        metadata: { from: current.status, to: nextStatus },
      },
    });
    const deployment = await tx.deployment.findFirst({
      where: {
        id: deploymentId.data,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      },
      select: deploymentSelect,
    });
    return { kind: "updated" as const, deployment, queued, queueJobId: current.queueJobId };
  });
  if (result.kind === "not_found") {
    sendError(res, 404, "DEPLOYMENT_NOT_FOUND", "Deployment not found in this project.");
    return;
  }
  if (result.kind === "conflict" || !result.deployment) {
    sendError(res, 409, "DEPLOYMENT_STATE_CONFLICT", "Deployment state changed or is not cancellable.");
    return;
  }
  if (result.queued && result.queueJobId) {
    try {
      await removeQueuedDeploymentJob(result.queueJobId);
    } catch (error) {
      logger.warn(
        { deploymentId: deploymentId.data, errorName: error instanceof Error ? error.name : "UnknownError" },
        "Queued deployment job removal deferred to reconciliation",
      );
    }
  }
  res.json({ success: true, data: result.deployment });
}

export const projectDeploymentRouter = Router();
projectDeploymentRouter.use(requireAuth);
projectDeploymentRouter.post("/:projectId/deployments", requireCsrf, createDeployment);
projectDeploymentRouter.get("/:projectId/deployment-readiness", getReadiness);
projectDeploymentRouter.get("/:projectId/deployments", listDeployments);
projectDeploymentRouter.get("/:projectId/deployments/:deploymentId", getDeployment);
projectDeploymentRouter.post("/:projectId/deployments/:deploymentId/cancel", requireCsrf, cancelDeployment);
