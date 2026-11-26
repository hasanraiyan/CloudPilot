import { z } from "zod";
import { prisma } from "@cloudpilot/database";
import type { CloudPilotMcpContext, CloudPilotMcpTool } from "./types.js";

async function resolveDefaultWorkspaceId(userId: string): Promise<string | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}

async function assertProjectAccess(projectId: string, ctx: CloudPilotMcpContext) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      repository: {
        select: {
          id: true,
          provider: true,
          name: true,
          fullName: true,
          defaultBranch: true,
          selectedBranch: true,
          language: true,
          isPrivate: true,
          installation: { select: { accountLogin: true, status: true } },
        },
      },
      buildConfiguration: true,
    },
  });
  if (!project) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: ctx.userId } },
    select: { role: true },
  });
  if (!membership) return null;
  return project;
}

export const projectsMcpTools: CloudPilotMcpTool[] = [
  {
    name: "cloudpilot_list_projects",
    description: "List all projects in the authenticated user's CloudPilot workspace with repository and deployment counts.",
    handler: async (_args, ctx) => {
      const workspaceId = await resolveDefaultWorkspaceId(ctx.userId);
      if (!workspaceId) return { projects: [], message: "No workspace found for this user." };

      const projects = await prisma.project.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          repository: {
            select: { fullName: true, selectedBranch: true, defaultBranch: true, language: true },
          },
          _count: { select: { deployments: true, environmentVariables: true } },
        },
      });
      return { workspaceId, projects };
    },
  },
  {
    name: "cloudpilot_get_project",
    description: "Get detailed configuration for a CloudPilot project including its linked repository, branch, and build configuration.",
    inputSchema: {
      projectId: z.string().describe("UUID of the CloudPilot project"),
    },
    handler: async (args, ctx) => {
      const projectId = String(args.projectId ?? "").trim();
      if (!projectId) return { error: "projectId is required" };
      const project = await assertProjectAccess(projectId, ctx);
      if (!project) return { error: "Project not found or access denied" };
      return { project };
    },
  },
  {
    name: "cloudpilot_list_env_keys",
    description: "List environment variable key names and target environments for a project (never returns secret values).",
    inputSchema: {
      projectId: z.string().describe("UUID of the CloudPilot project"),
    },
    handler: async (args, ctx) => {
      const projectId = String(args.projectId ?? "").trim();
      if (!projectId) return { error: "projectId is required" };
      const project = await assertProjectAccess(projectId, ctx);
      if (!project) return { error: "Project not found or access denied" };
      const keys = await prisma.environmentVariable.findMany({
        where: { projectId },
        orderBy: [{ environment: "asc" }, { key: "asc" }],
        select: { id: true, key: true, environment: true, createdAt: true, updatedAt: true },
      });
      return { projectId, keys };
    },
  },
  {
    name: "cloudpilot_list_deployments",
    description: "List recent deployments and their statuses for a CloudPilot project.",
    inputSchema: {
      projectId: z.string().describe("UUID of the CloudPilot project"),
    },
    handler: async (args, ctx) => {
      const projectId = String(args.projectId ?? "").trim();
      if (!projectId) return { error: "projectId is required" };
      const project = await assertProjectAccess(projectId, ctx);
      if (!project) return { error: "Project not found or access denied" };
      const deployments = await prisma.deployment.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          status: true,
          environment: true,
          triggerSource: true,
          failureCode: true,
          createdAt: true,
          startedAt: true,
          finishedAt: true,
        },
      });
      return { projectId, deployments };
    },
  },
];
