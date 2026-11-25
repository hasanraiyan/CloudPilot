import { Prisma, prisma } from "@cloudpilot/database";
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
  InvalidDeploymentTransitionError,
  transitionDeployment,
} from "../services/deployment-lifecycle.service.js";

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

  const deployment = await prisma.deployment.findFirst({
    where: {
      id: deploymentId.data,
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
    select: { status: true },
  });
  if (!deployment) {
    sendError(res, 404, "DEPLOYMENT_NOT_FOUND", "Deployment not found in this project.");
    return;
  }
  if (deployment.status !== "QUEUED" && deployment.status !== "PENDING") {
    sendError(res, 409, "DEPLOYMENT_NOT_CANCELLABLE", "Only queued deployments can be cancelled in this phase.");
    return;
  }

  try {
    const updated = await prisma.$transaction((tx) =>
      transitionDeployment(tx, {
        deploymentId: deploymentId.data,
        workspaceId: scope.workspaceId,
        actorId: req.userId!,
        from: deployment.status,
        to: "CANCELLED",
        failureCode: "CANCELLED",
        failureMessage: "Deployment was cancelled by a workspace administrator.",
      }),
    );
    if (!updated) {
      sendError(res, 409, "DEPLOYMENT_STATE_CONFLICT", "Deployment state changed; refresh and try again.");
      return;
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof InvalidDeploymentTransitionError) {
      sendError(res, 409, "DEPLOYMENT_STATE_CONFLICT", "Deployment state changed; refresh and try again.");
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      sendError(res, 404, "DEPLOYMENT_NOT_FOUND", "Deployment not found in this project.");
      return;
    }
    throw error;
  }
}

export const projectDeploymentRouter = Router();
projectDeploymentRouter.use(requireAuth);
projectDeploymentRouter.post("/:projectId/deployments", requireCsrf, createDeployment);
projectDeploymentRouter.get("/:projectId/deployments", listDeployments);
projectDeploymentRouter.get("/:projectId/deployments/:deploymentId", getDeployment);
projectDeploymentRouter.post("/:projectId/deployments/:deploymentId/cancel", requireCsrf, cancelDeployment);
