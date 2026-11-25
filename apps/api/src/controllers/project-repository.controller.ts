import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "@cloudpilot/database";
import { env } from "../config/env.js";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";
import {
  browseRepositoryFiles,
  detectRepositoryFramework,
  getCachedRepositoryMetadata,
  getCommitDetails,
  getCommitHistory,
  getLatestCommit,
  getRepositoryMetadata,
  getRepositoryLanguages,
  invalidateRepositoryCache,
  isRepositoryBranchAvailable,
  listRepositoryBranches,
  listRepositoryTags,
} from "../services/repository-intelligence.service.js";
import {
  branchNameSchema,
  branchUpdateSchema,
  commitShaSchema,
  projectIdSchema,
  repositoryFileQuerySchema,
  repositoryListQuerySchema,
} from "../validators/project-intelligence.validator.js";
import { GitHubServiceError, listInstallationRepositories, verifyAppInstallation } from "../services/github-app.service.js";

type ProjectRepositoryContext = {
  workspaceId: string;
  projectId: string;
  role: string;
  repository: {
    id: string;
    externalId: string;
    name: string;
    fullName: string | null;
    defaultBranch: string | null;
    selectedBranch: string | null;
    lastSyncedAt: Date | null;
  };
  installation: {
    id: string;
    installationId: bigint;
    githubAccountId: bigint;
    accountLogin: string;
    accountType: string;
    repositorySelection: string;
    status: string;
  };
  owner: string;
  repo: string;
  liveFullName: string;
  accessibleRepositoryId: number;
  metadata: Awaited<ReturnType<typeof getCachedRepositoryMetadata>>;
  permissions: Record<string, string>;
};

const isWorkspaceAdmin = (role: string) => role === "OWNER" || role === "ADMIN";

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function sendIntegrationError(res: Response, error: unknown): void {
  if (error instanceof GitHubServiceError) {
    const code = error.status === 429 ? "GITHUB_RATE_LIMITED" : error.status === 404 ? "REPOSITORY_NOT_FOUND" : "GITHUB_INTEGRATION_ERROR";
    sendError(res, error.status, code, error.message);
    return;
  }
  sendError(res, 503, "GITHUB_INTEGRATION_UNAVAILABLE", "GitHub repository data is temporarily unavailable.");
}

function parseFullName(value: string | null): { owner: string; repo: string } | null {
  if (!value) return null;
  const parts = value.split("/");
  if (parts.length !== 2 || parts.some((part) => !part || part === "." || part === ".." || !/^[A-Za-z0-9_.-]{1,100}$/u.test(part))) return null;
  return { owner: parts[0]!, repo: parts[1]! };
}

async function activeWorkspace(req: Request) {
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

async function getProjectRepositoryContext(req: Request, rawProjectId: unknown): Promise<ProjectRepositoryContext | null> {
  const projectId = projectIdSchema.safeParse(rawProjectId);
  const membership = await activeWorkspace(req);
  if (!projectId.success || !membership) return null;
  const project = await prisma.project.findFirst({
    where: { id: projectId.data, workspaceId: membership.workspaceId },
    select: {
      id: true,
      repository: {
        select: {
          id: true, provider: true, externalId: true, name: true, fullName: true, defaultBranch: true, selectedBranch: true, lastSyncedAt: true,
          installation: { select: { id: true, installationId: true, githubAccountId: true, accountLogin: true, accountType: true, repositorySelection: true, status: true } },
        },
      },
    },
  });
  const repository = project?.repository;
  const installation = repository?.installation;
  if (!project || !repository || repository.provider !== "GITHUB" || !installation || installation.status !== "ACTIVE") return null;
  const name = parseFullName(repository.fullName);
  const repositoryId = /^\d{1,19}$/u.test(repository.externalId) ? Number(repository.externalId) : NaN;
  if (!name || !Number.isSafeInteger(repositoryId) || repositoryId <= 0) return null;

  const expectedAppId = Number(env.GITHUB_APP_ID);
  let verified;
  try {
    verified = await verifyAppInstallation(installation.installationId);
  } catch (error) {
    if (error instanceof GitHubServiceError && error.status === 404) {
      await prisma.gitHubInstallation.updateMany({ where: { id: installation.id, workspaceId: membership.workspaceId }, data: { status: "REMOVED" } });
    }
    throw error;
  }
  if (verified.id !== Number(installation.installationId) || verified.appId !== expectedAppId || BigInt(verified.account.id) !== installation.githubAccountId) {
    await prisma.gitHubInstallation.updateMany({ where: { id: installation.id, workspaceId: membership.workspaceId }, data: { status: "REMOVED" } });
    return null;
  }
  if (verified.suspended_at) {
    await prisma.gitHubInstallation.updateMany({ where: { id: installation.id, workspaceId: membership.workspaceId }, data: { status: "SUSPENDED", suspendedAt: new Date(verified.suspended_at) } });
    return null;
  }

  // A fresh installation repository list is checked before any Redis value can be used.
  const accessibleRepositories = await listInstallationRepositories(installation.installationId);
  const accessible = accessibleRepositories.find((item) => item.id === repositoryId);
  if (!accessible) return null;
  const liveName = parseFullName(accessible.fullName);
  if (!liveName) throw new GitHubServiceError(502, "GitHub returned an invalid repository name.");
  const metadata = await getCachedRepositoryMetadata({
    workspaceId: membership.workspaceId,
    projectId: project.id,
    externalId: repository.externalId,
    installationId: installation.installationId,
    owner: liveName.owner,
    repo: liveName.repo,
  });
  if (metadata.id !== repositoryId) return null;
  return {
    workspaceId: membership.workspaceId,
    projectId: project.id,
    role: membership.role,
    repository,
    installation,
    owner: liveName.owner,
    repo: liveName.repo,
    liveFullName: accessible.fullName,
    accessibleRepositoryId: repositoryId,
    metadata,
    permissions: verified.permissions,
  };
}

function selectedBranch(context: ProjectRepositoryContext, requested?: string): string | null {
  return requested ?? context.repository.selectedBranch ?? context.metadata.defaultBranch;
}

function validateListQuery(req: Request, res: Response) {
  const parsed = repositoryListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid page, page size, branch, or search value.");
    return null;
  }
  return parsed.data;
}

async function getRepository(req: Request, res: Response) {
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    res.json({ success: true, data: {
      ...context.metadata,
      selectedBranch: context.repository.selectedBranch ?? context.metadata.defaultBranch,
      installation: { accountLogin: context.installation.accountLogin, accountType: context.installation.accountType, status: context.installation.status, repositorySelection: context.installation.repositorySelection },
      appPermissions: context.permissions,
      lastRefreshedAt: context.repository.lastSyncedAt,
    } });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getCommits(req: Request, res: Response) {
  const query = validateListQuery(req, res); if (!query) return;
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const branch = selectedBranch(context, query.branch);
    if (!branch) { res.json({ success: true, data: { items: [], page: query.page, perPage: query.per_page, hasNextPage: false, branch: null } }); return; }
    const data = await getCommitHistory({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, branch, page: query.page, perPage: query.per_page });
    res.json({ success: true, data });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getLatest(req: Request, res: Response) {
  const query = validateListQuery(req, res); if (!query) return;
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const branch = selectedBranch(context, query.branch);
    if (!branch) { res.json({ success: true, data: null }); return; }
    const data = await getLatestCommit({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, branch });
    res.json({ success: true, data });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getCommit(req: Request, res: Response) {
  const sha = commitShaSchema.safeParse(req.params.sha);
  if (!sha.success) { sendError(res, 400, "INVALID_COMMIT_SHA", "Commit SHA must be 7 to 40 hexadecimal characters."); return; }
  const branchQuery = repositoryListQuerySchema.pick({ branch: true }).safeParse(req.query);
  if (!branchQuery.success) { sendError(res, 400, "INVALID_BRANCH", "Enter a valid Git branch name."); return; }
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const branch = selectedBranch(context, branchQuery.data.branch) ?? "unknown";
    const data = await getCommitDetails({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, sha: sha.data, branch });
    res.json({ success: true, data });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getBranches(req: Request, res: Response) {
  const query = validateListQuery(req, res); if (!query) return;
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const data = await listRepositoryBranches({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, defaultBranch: context.metadata.defaultBranch, page: query.page, perPage: query.per_page, search: query.search });
    res.json({ success: true, data: { ...data, selectedBranch: context.repository.selectedBranch ?? context.metadata.defaultBranch } });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getTags(req: Request, res: Response) {
  const query = validateListQuery(req, res); if (!query) return;
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const data = await listRepositoryTags({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, page: query.page, perPage: query.per_page });
    res.json({ success: true, data });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getFiles(req: Request, res: Response) {
  const query = repositoryFileQuerySchema.safeParse(req.query);
  if (!query.success) { sendError(res, 400, "INVALID_REPOSITORY_PATH", "The requested branch or repository path is invalid."); return; }
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const branch = selectedBranch(context, query.data.branch);
    if (!branch) { res.json({ success: true, data: { kind: "directory", path: query.data.path, entries: [], breadcrumbs: [], selectedBranch: null, emptyRepository: true } }); return; }
    const data = await browseRepositoryFiles({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, path: query.data.path, branch });
    res.json({ success: true, data: { ...data, selectedBranch: branch, emptyRepository: false } });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getLanguages(req: Request, res: Response) {
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const data = await getRepositoryLanguages({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo });
    res.json({ success: true, data });
  } catch (error) { sendIntegrationError(res, error); }
}

async function getDetection(req: Request, res: Response) {
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    const branch = selectedBranch(context);
    const data = branch
      ? await detectRepositoryFramework({ workspaceId: context.workspaceId, projectId: context.projectId, externalId: context.repository.externalId, installationId: context.installation.installationId, owner: context.owner, repo: context.repo, branch })
      : { frameworks: [], primaryFramework: null, runtime: null, packageManager: null, monorepo: false, suggestions: { rootDirectory: null, installCommand: null, buildCommand: null, startCommand: null, dockerfilePath: null } };
    res.json({ success: true, data: { ...data, branch, selectedBranch: context.repository.selectedBranch ?? context.metadata.defaultBranch } });
  } catch (error) { sendIntegrationError(res, error); }
}

async function refreshRepository(req: Request, res: Response) {
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    if (!isWorkspaceAdmin(context.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required to refresh repository metadata."); return; }
    await invalidateRepositoryCache(context.workspaceId, context.projectId, context.repository.externalId);
    const freshMetadata = await getRepositoryMetadata(context.installation.installationId, context.owner, context.repo);
    if (freshMetadata.id !== context.accessibleRepositoryId) {
      sendError(res, 404, "REPOSITORY_NOT_FOUND", "The linked GitHub repository is no longer accessible.");
      return;
    }
    const refreshedAt = new Date();
    await prisma.repository.update({
      where: { id: context.repository.id },
      data: {
        name: freshMetadata.name, fullName: freshMetadata.fullName, description: freshMetadata.description,
        githubOwnerLogin: freshMetadata.owner.login, githubOwnerType: freshMetadata.owner.type,
        defaultBranch: freshMetadata.defaultBranch, language: freshMetadata.language, isPrivate: freshMetadata.isPrivate,
        stars: freshMetadata.stars, forks: freshMetadata.forks, openIssuesCount: freshMetadata.openIssuesCount,
        sizeKb: freshMetadata.sizeKb, lastPushedAt: freshMetadata.lastPushedAt ? new Date(freshMetadata.lastPushedAt) : null,
        githubUpdatedAt: new Date(freshMetadata.lastUpdatedAt), isArchived: freshMetadata.isArchived, lastSyncedAt: refreshedAt,
      },
    });
    await prisma.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: req.userId!, action: "PROJECT_REPOSITORY_REFRESHED", entityType: "Repository", entityId: context.repository.id, metadata: { repositoryId: context.repository.externalId } } });
    res.json({ success: true, data: { ...freshMetadata, selectedBranch: context.repository.selectedBranch ?? freshMetadata.defaultBranch, lastRefreshedAt: refreshedAt } });
  } catch (error) { sendIntegrationError(res, error); }
}

async function updateBranch(req: Request, res: Response) {
  const input = branchUpdateSchema.safeParse(req.body);
  if (!input.success) { sendError(res, 400, "INVALID_BRANCH", "Enter a valid Git branch name."); return; }
  try {
    const context = await getProjectRepositoryContext(req, req.params.projectId);
    if (!context) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "No accessible GitHub repository is linked to this project."); return; }
    if (!isWorkspaceAdmin(context.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required to change the project branch."); return; }
    const branch = branchNameSchema.safeParse(input.data.branch);
    if (!branch.success) { sendError(res, 400, "INVALID_BRANCH", "Enter a valid Git branch name."); return; }
    const available = await isRepositoryBranchAvailable({ installationId: context.installation.installationId, owner: context.owner, repo: context.repo, branch: branch.data });
    if (!available) { sendError(res, 400, "BRANCH_NOT_FOUND", "This branch is not currently available in the GitHub repository."); return; }
    await prisma.$transaction(async (tx) => {
      await tx.repository.updateMany({ where: { id: context.repository.id, workspaceId: context.workspaceId }, data: { selectedBranch: branch.data } });
      await tx.auditLog.create({ data: { workspaceId: context.workspaceId, actorId: req.userId!, action: "PROJECT_REPOSITORY_BRANCH_CHANGED", entityType: "Repository", entityId: context.repository.id, metadata: { previousBranch: context.repository.selectedBranch, branch: branch.data } } });
    });
    await invalidateRepositoryCache(context.workspaceId, context.projectId, context.repository.externalId);
    res.json({ success: true, data: { selectedBranch: branch.data, defaultBranch: context.metadata.defaultBranch } });
  } catch (error) { sendIntegrationError(res, error); }
}

export const projectRepositoryRouter = Router();
projectRepositoryRouter.use(requireAuth);
projectRepositoryRouter.get("/:projectId/repository", getRepository);
projectRepositoryRouter.get("/:projectId/repository/commits/latest", getLatest);
projectRepositoryRouter.get("/:projectId/repository/commits/:sha", getCommit);
projectRepositoryRouter.get("/:projectId/repository/commits", getCommits);
projectRepositoryRouter.get("/:projectId/repository/branches", getBranches);
projectRepositoryRouter.get("/:projectId/repository/tags", getTags);
projectRepositoryRouter.get("/:projectId/repository/files", getFiles);
projectRepositoryRouter.get("/:projectId/repository/languages", getLanguages);
projectRepositoryRouter.get("/:projectId/repository/detection", getDetection);
projectRepositoryRouter.post("/:projectId/repository/refresh", requireCsrf, refreshRepository);
projectRepositoryRouter.patch("/:projectId/repository/branch", requireCsrf, updateBranch);
