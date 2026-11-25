import { Router } from "express";
import type { Request, Response } from "express";
import { Prisma, prisma } from "@cloudpilot/database";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";
import { projectIdSchema, buildConfigurationSchema } from "../validators/project-intelligence.validator.js";

export const canManage = (role: string) => role === "OWNER" || role === "ADMIN";
const configSelect = {
  id: true,
  projectId: true,
  framework: true,
  runtime: true,
  packageManager: true,
  rootDirectory: true,
  installCommand: true,
  buildCommand: true,
  startCommand: true,
  dockerfilePath: true,
  applicationPort: true,
  buildTimeoutSeconds: true,
  environment: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function currentWorkspace(req: Request) {
  const session = await prisma.session.findUnique({ where: { id: req.sessionId! }, select: { activeWorkspaceId: true } });
  let membership = session?.activeWorkspaceId
    ? await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: session.activeWorkspaceId, userId: req.userId! } }, select: { workspaceId: true, role: true } })
    : null;
  if (!membership) {
    membership = await prisma.workspaceMember.findFirst({ where: { userId: req.userId! }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, role: true } });
    if (membership && session) await prisma.session.update({ where: { id: req.sessionId! }, data: { activeWorkspaceId: membership.workspaceId } });
  }
  return membership;
}

export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

export async function resolveProject(req: Request, res: Response) {
  const projectId = projectIdSchema.safeParse(req.params.projectId);
  const membership = await currentWorkspace(req);
  if (!projectId.success || !membership) {
    sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found in the active workspace.");
    return null;
  }
  const project = await prisma.project.findFirst({ where: { id: projectId.data, workspaceId: membership.workspaceId }, select: { id: true } });
  if (!project) {
    sendError(res, 404, "PROJECT_NOT_FOUND", "Project not found in the active workspace.");
    return null;
  }
  return { projectId: project.id, workspaceId: membership.workspaceId, role: membership.role };
}

async function getConfiguration(req: Request, res: Response): Promise<void> {
  const scope = await resolveProject(req, res);
  if (!scope) return;
  const configuration = await prisma.projectBuildConfiguration.findUnique({
    where: { workspaceId_projectId: { workspaceId: scope.workspaceId, projectId: scope.projectId } },
    select: configSelect,
  });
  res.json({ success: true, data: { saved: Boolean(configuration), configuration } });
}

async function saveConfiguration(req: Request, res: Response): Promise<void> {
  const scope = await resolveProject(req, res);
  if (!scope) return;
  if (!canManage(scope.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required to save build configuration."); return; }
  const parsed = buildConfigurationSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "BUILD_CONFIGURATION_INVALID", parsed.error.issues[0]?.message ?? "Build configuration is invalid.");
    return;
  }
  const fields = Object.keys(parsed.data);
  const values = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
  try {
    const configuration = await prisma.$transaction(async (tx) => {
      const saved = await tx.projectBuildConfiguration.upsert({
        where: { workspaceId_projectId: { workspaceId: scope.workspaceId, projectId: scope.projectId } },
        create: { workspaceId: scope.workspaceId, projectId: scope.projectId, ...values } as Prisma.ProjectBuildConfigurationUncheckedCreateInput,
        update: values as Prisma.ProjectBuildConfigurationUncheckedUpdateInput,
        select: configSelect,
      });
      await tx.auditLog.create({
        data: {
          workspaceId: scope.workspaceId,
          actorId: req.userId!,
          action: "PROJECT_BUILD_CONFIGURATION_SAVED",
          entityType: "ProjectBuildConfiguration",
          entityId: saved.id,
          metadata: { fields },
        },
      });
      return saved;
    });
    res.json({ success: true, data: { saved: true, configuration } });
  } catch {
    sendError(res, 503, "BUILD_CONFIGURATION_UNAVAILABLE", "Build configuration could not be saved.");
  }
}

async function resetConfiguration(req: Request, res: Response): Promise<void> {
  const scope = await resolveProject(req, res);
  if (!scope) return;
  if (!canManage(scope.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required to reset build configuration."); return; }
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.projectBuildConfiguration.findUnique({ where: { workspaceId_projectId: { workspaceId: scope.workspaceId, projectId: scope.projectId } }, select: { id: true } });
      if (!existing) return;
      await tx.projectBuildConfiguration.delete({ where: { workspaceId_projectId: { workspaceId: scope.workspaceId, projectId: scope.projectId } } });
      await tx.auditLog.create({
        data: {
          workspaceId: scope.workspaceId,
          actorId: req.userId!,
          action: "PROJECT_BUILD_CONFIGURATION_RESET",
          entityType: "ProjectBuildConfiguration",
          entityId: existing.id,
          metadata: { projectId: scope.projectId },
        },
      });
    });
    res.json({ success: true, data: { saved: false, configuration: null } });
  } catch {
    sendError(res, 503, "BUILD_CONFIGURATION_UNAVAILABLE", "Build configuration could not be reset.");
  }
}

export const projectBuildConfigurationRouter = Router();
projectBuildConfigurationRouter.use(requireAuth);
projectBuildConfigurationRouter.get("/:projectId/build-config", getConfiguration);
projectBuildConfigurationRouter.put("/:projectId/build-config", requireCsrf, saveConfiguration);
projectBuildConfigurationRouter.delete("/:projectId/build-config", requireCsrf, resetConfiguration);
