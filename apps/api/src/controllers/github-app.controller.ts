import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cloudpilot/database";
import { env } from "../config/env.js";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";
import {
  exchangeGitHubOAuthCode,
  fetchGitHubUser,
  GitHubServiceError,
  listInstallationRepositories,
  listRepositoryBranches,
  verifyAppInstallation,
} from "../services/github-app.service.js";

const STATE_TTL_MS = 10 * 60 * 1000;
const projectImportSchema = z.object({
  projectName: z.string().trim().min(1).max(80),
  branch: z.string().trim().min(1).max(255),
}).strict();

type Membership = { workspaceId: string; role: string };
type GitHubIdentity = { id: number; login: string };
type UserInstallation = { id: number; account?: { id?: number } };

const hashState = (state: string) => createHash("sha256").update(state).digest("hex");
const stateValue = () => randomBytes(32).toString("base64url");
const canManage = (role: string) => role === "OWNER" || role === "ADMIN";
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";

function redirectUri(): string {
  if (env.GITHUB_INSTALLATION_OAUTH_CALLBACK_URL) return env.GITHUB_INSTALLATION_OAUTH_CALLBACK_URL;
  throw new GitHubServiceError(503, "GitHub App user authorization callback is not configured.");
}

function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function sendGitHubError(res: Response, error: unknown): void {
  if (error instanceof GitHubServiceError) {
    sendError(res, error.status, "GITHUB_INTEGRATION_ERROR", error.message);
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    sendError(res, 409, "GITHUB_RESOURCE_EXISTS", "This GitHub repository is already imported into this workspace.");
    return;
  }
  sendError(res, 503, "GITHUB_INTEGRATION_UNAVAILABLE", "GitHub integration is temporarily unavailable.");
}

async function currentMembership(req: Request): Promise<Membership | null> {
  const session = await prisma.session.findUnique({ where: { id: req.sessionId! }, select: { activeWorkspaceId: true } });
  if (session?.activeWorkspaceId) {
    const active = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: session.activeWorkspaceId, userId: req.userId! } },
      select: { workspaceId: true, role: true },
    });
    if (active) return active;
  }
  const first = await prisma.workspaceMember.findFirst({
    where: { userId: req.userId! }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, role: true },
  });
  if (first) await prisma.session.update({ where: { id: req.sessionId! }, data: { activeWorkspaceId: first.workspaceId } });
  return first;
}

async function createState(req: Request, workspaceId: string, purpose: "INSTALL_CALLBACK" | "INSTALL_AUTHORIZATION", installationId?: bigint) {
  const state = stateValue();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  await prisma.gitHubAppState.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }] } });
  await prisma.gitHubAppState.create({
    data: {
      stateHash: hashState(state),
      userId: req.userId!,
      sessionId: req.sessionId!,
      workspaceId,
      purpose,
      ...(installationId === undefined ? {} : { installationId }),
      expiresAt,
    },
  });
  return state;
}

async function consumeState(req: Request, value: unknown, purpose: "INSTALL_CALLBACK" | "INSTALL_AUTHORIZATION") {
  if (typeof value !== "string" || value.length < 32 || value.length > 200) return null;
  const stateHash = hashState(value);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.gitHubAppState.findUnique({ where: { stateHash } });
    if (!candidate || candidate.userId !== req.userId || candidate.sessionId !== req.sessionId || candidate.purpose !== purpose || candidate.expiresAt <= now || candidate.consumedAt) return null;
    const consumed = await tx.gitHubAppState.updateMany({
      where: { id: candidate.id, userId: req.userId, sessionId: req.sessionId, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return consumed.count === 1 ? candidate : null;
  });
}

function parseInstallationId(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) return null;
  try {
    const id = BigInt(value);
    return id > 0n ? id : null;
  } catch { return null; }
}

async function verifyInstallationRecord(req: Request, rawId: unknown) {
  const installationId = parseInstallationId(rawId);
  const member = await currentMembership(req);
  if (!installationId || !member) return { error: { status: 404, code: "INSTALLATION_NOT_FOUND", message: "GitHub installation not found." } } as const;
  const installation = await prisma.gitHubInstallation.findFirst({ where: { installationId, workspaceId: member.workspaceId, status: "ACTIVE" } });
  if (!installation) return { error: { status: 404, code: "INSTALLATION_NOT_FOUND", message: "GitHub installation not found." } } as const;
  const identity = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "GITHUB", providerAccountId: installation.authorizedGithubUserId } },
    select: { userId: true },
  });
  if (installation.authorizedUserId !== req.userId || identity?.userId !== req.userId) {
    return { error: { status: 403, code: "GITHUB_IDENTITY_REQUIRED", message: "Reconnect this installation with its authorized GitHub identity." } } as const;
  }
  try {
    const verified = await verifyAppInstallation(installationId);
    if (BigInt(verified.id) !== installationId || BigInt(verified.account.id) !== installation.githubAccountId) {
      return { error: { status: 404, code: "INSTALLATION_NOT_FOUND", message: "GitHub installation not found." } } as const;
    }
    if (verified.suspended_at) {
      await prisma.gitHubInstallation.updateMany({ where: { id: installation.id }, data: { status: "SUSPENDED", suspendedAt: new Date(verified.suspended_at) } });
      return { error: { status: 403, code: "INSTALLATION_SUSPENDED", message: "This GitHub installation is suspended." } } as const;
    }
  } catch (error) {
    return { error: error instanceof GitHubServiceError
      ? { status: error.status, code: "GITHUB_INTEGRATION_ERROR", message: error.message }
      : { status: 503, code: "GITHUB_INTEGRATION_UNAVAILABLE", message: "GitHub integration is temporarily unavailable." } } as const;
  }
  return { installation, member } as const;
}

async function startInstallation(req: Request, res: Response): Promise<void> {
  if (!env.GITHUB_APP_SLUG || !env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET || !env.GITHUB_INSTALLATION_OAUTH_CALLBACK_URL) {
    if (req.get("accept")?.includes("text/html")) {
      const frontend = env.corsOrigins[0] ?? "http://localhost:3000";
      res.redirect(302, `${frontend}/dashboard/projects?github=configuration`);
      return;
    }
    sendError(res, 503, "GITHUB_APP_NOT_CONFIGURED", "GitHub App installation and user authorization settings are incomplete."); return;
  }
  try {
    const member = await currentMembership(req);
    if (!member || !canManage(member.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required."); return; }
    const state = await createState(req, member.workspaceId, "INSTALL_CALLBACK");
    const destination = new URL(`https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new`);
    destination.searchParams.set("state", state);
    res.redirect(302, destination.toString());
  } catch (error) { sendGitHubError(res, error); }
}

async function installationCallback(req: Request, res: Response): Promise<void> {
  try {
    const state = await consumeState(req, req.query.state, "INSTALL_CALLBACK");
    const installationId = parseInstallationId(req.query.installation_id);
    if (!state || !installationId || !["install", "update"].includes(String(req.query.setup_action))) {
      sendError(res, 400, "INVALID_INSTALLATION_CALLBACK", "The GitHub installation callback is invalid or expired."); return;
    }
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: state.workspaceId, userId: req.userId! } }, select: { role: true },
    });
    if (!membership || !canManage(membership.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required."); return; }
    await verifyAppInstallation(installationId);
    const authorizationState = await createState(req, state.workspaceId, "INSTALL_AUTHORIZATION", installationId);
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID!);
    authorize.searchParams.set("redirect_uri", redirectUri());
    authorize.searchParams.set("state", authorizationState);
    res.redirect(302, authorize.toString());
  } catch (error) { sendGitHubError(res, error); }
}

async function installationAuthorizationCallback(req: Request, res: Response): Promise<void> {
  const frontendProjects = `${env.corsOrigins[0] ?? "http://localhost:3000"}/dashboard/projects`;
  try {
    const state = await consumeState(req, req.query.state, "INSTALL_AUTHORIZATION");
    if (!state?.installationId) { res.redirect(`${frontendProjects}?github=invalid_state`); return; }
    if (typeof req.query.error === "string") { res.redirect(`${frontendProjects}?github=authorization_denied`); return; }
    if (typeof req.query.code !== "string" || req.query.code.length > 512) { res.redirect(`${frontendProjects}?github=authorization_failed`); return; }

    const token = await exchangeGitHubOAuthCode(req.query.code, redirectUri());
    const identity = await fetchGitHubUser<GitHubIdentity>(token, "/user");
    if (!Number.isSafeInteger(identity.id) || identity.id <= 0 || typeof identity.login !== "string") {
      res.redirect(`${frontendProjects}?github=authorization_failed`); return;
    }
    const authorizedInstallation = await fetchGitHubUser<UserInstallation>(token, `/user/installations/${state.installationId.toString()}`);
    if (BigInt(authorizedInstallation.id) !== state.installationId) { res.redirect(`${frontendProjects}?github=installation_forbidden`); return; }

    const appInstallation = await verifyAppInstallation(state.installationId);
    if (authorizedInstallation.account?.id !== appInstallation.account.id) { res.redirect(`${frontendProjects}?github=installation_forbidden`); return; }
    const accountId = String(identity.id);

    await prisma.$transaction(async (tx) => {
      const membership = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: state.workspaceId, userId: req.userId! } } });
      if (!membership || !canManage(membership.role)) throw new GitHubServiceError(403, "Workspace administrator access required.");
      const account = await tx.account.findUnique({
        where: { provider_providerAccountId: { provider: "GITHUB", providerAccountId: accountId } }, select: { userId: true },
      });
      if (account && account.userId !== req.userId) throw new GitHubServiceError(403, "This GitHub identity is linked to another CloudPilot user.");
      const existing = await tx.gitHubInstallation.findUnique({ where: { installationId: state.installationId! } });
      if (existing && existing.workspaceId !== state.workspaceId) throw new GitHubServiceError(409, "This GitHub installation is already connected to another workspace.");
      if (!account) await tx.account.create({ data: { userId: req.userId!, provider: "GITHUB", providerAccountId: accountId } });
      await tx.gitHubInstallation.upsert({
        where: { installationId: state.installationId! },
        create: {
          workspaceId: state.workspaceId,
          installationId: state.installationId!,
          githubAccountId: BigInt(appInstallation.account.id),
          accountLogin: appInstallation.account.login,
          accountType: appInstallation.account.type,
          repositorySelection: appInstallation.repository_selection === "all" ? "ALL" : "SELECTED",
          status: appInstallation.suspended_at ? "SUSPENDED" : "ACTIVE",
          suspendedAt: appInstallation.suspended_at ? new Date(appInstallation.suspended_at) : null,
          authorizedGithubUserId: accountId,
          authorizedUserId: req.userId!,
          installedByUserId: req.userId!,
        },
        update: {
          githubAccountId: BigInt(appInstallation.account.id),
          accountLogin: appInstallation.account.login,
          accountType: appInstallation.account.type,
          repositorySelection: appInstallation.repository_selection === "all" ? "ALL" : "SELECTED",
          status: appInstallation.suspended_at ? "SUSPENDED" : "ACTIVE",
          suspendedAt: appInstallation.suspended_at ? new Date(appInstallation.suspended_at) : null,
          authorizedGithubUserId: accountId,
          authorizedUserId: req.userId!,
          installedByUserId: req.userId!,
        },
      });
    });
    res.redirect(`${frontendProjects}?github=connected`);
  } catch (error) {
    if (error instanceof GitHubServiceError && error.status === 403) { res.redirect(`${frontendProjects}?github=installation_forbidden`); return; }
    if (error instanceof GitHubServiceError && error.status === 409) { res.redirect(`${frontendProjects}?github=workspace_conflict`); return; }
    if (error instanceof GitHubServiceError && error.status === 429) { res.redirect(`${frontendProjects}?github=rate_limited`); return; }
    res.redirect(`${frontendProjects}?github=connection_failed`);
  }
}

async function listInstallations(req: Request, res: Response): Promise<void> {
  const member = await currentMembership(req);
  if (!member) { res.json({ success: true, data: [] }); return; }
  const installations = await prisma.gitHubInstallation.findMany({
    where: { workspaceId: member.workspaceId }, orderBy: { accountLogin: "asc" },
    select: { installationId: true, githubAccountId: true, accountLogin: true, accountType: true, repositorySelection: true, status: true, authorizedUserId: true, createdAt: true },
  });
  res.json({ success: true, data: installations.map((item) => ({
    id: item.installationId.toString(), accountId: item.githubAccountId.toString(), accountLogin: item.accountLogin,
    accountType: item.accountType, repositorySelection: item.repositorySelection, status: item.status,
    canAccess: item.authorizedUserId === req.userId, createdAt: item.createdAt,
  })) });
}

async function listRepositories(req: Request, res: Response): Promise<void> {
  const result = await verifyInstallationRecord(req, req.params.id);
  if ("error" in result) { sendError(res, result.error.status, result.error.code, result.error.message); return; }
  try {
    const repositories = await listInstallationRepositories(result.installation.installationId);
    const imported = await prisma.repository.findMany({ where: { workspaceId: result.member.workspaceId, provider: "GITHUB" }, select: { externalId: true } });
    const importedIds = new Set(imported.map((item) => item.externalId));
    res.json({ success: true, data: repositories.map(({ cloneUrl: _cloneUrl, ...repository }) => ({ ...repository, imported: importedIds.has(String(repository.id)) })) });
  } catch (error) { sendGitHubError(res, error); }
}

async function listBranches(req: Request, res: Response): Promise<void> {
  const result = await verifyInstallationRecord(req, req.params.id);
  const repositoryId = parseInstallationId(req.params.repositoryId);
  if ("error" in result) { sendError(res, result.error.status, result.error.code, result.error.message); return; }
  if (!repositoryId) { sendError(res, 400, "INVALID_REPOSITORY", "Invalid GitHub repository identifier."); return; }
  try {
    const repositories = await listInstallationRepositories(result.installation.installationId);
    const repository = repositories.find((item) => BigInt(item.id) === repositoryId);
    if (!repository) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "Repository is not accessible through this installation."); return; }
    const [owner, name] = repository.fullName.split("/");
    if (!owner || !name) { sendError(res, 502, "GITHUB_INVALID_RESPONSE", "GitHub returned invalid repository metadata."); return; }
    const branches = await listRepositoryBranches(result.installation.installationId, owner, name);
    res.json({ success: true, data: branches.map((branch) => ({ name: branch.name, protected: branch.protected, commitSha: branch.commit.sha })) });
  } catch (error) { sendGitHubError(res, error); }
}

async function importRepository(req: Request, res: Response): Promise<void> {
  const result = await verifyInstallationRecord(req, req.params.id);
  const repositoryId = parseInstallationId(req.params.repositoryId);
  const parsed = projectImportSchema.safeParse(req.body);
  if ("error" in result) { sendError(res, result.error.status, result.error.code, result.error.message); return; }
  if (!repositoryId || !parsed.success) { sendError(res, 400, "VALIDATION_ERROR", "Enter a valid project name and branch."); return; }
  if (!canManage(result.member.role)) { sendError(res, 403, "FORBIDDEN", "Workspace administrator access required."); return; }

  try {
    const repositories = await listInstallationRepositories(result.installation.installationId);
    const repository = repositories.find((item) => BigInt(item.id) === repositoryId);
    if (!repository) { sendError(res, 404, "REPOSITORY_NOT_FOUND", "Repository is not accessible through this installation."); return; }
    const [owner, name] = repository.fullName.split("/");
    if (!owner || !name) { sendError(res, 502, "GITHUB_INVALID_RESPONSE", "GitHub returned invalid repository metadata."); return; }
    const branches = await listRepositoryBranches(result.installation.installationId, owner, name);
    if (!branches.some((branch) => branch.name === parsed.data.branch)) { sendError(res, 400, "BRANCH_NOT_FOUND", "Selected branch no longer exists in GitHub."); return; }
    const project = await prisma.$transaction(async (tx) => {
      const existing = await tx.repository.findUnique({
        where: { workspaceId_provider_externalId: { workspaceId: result.member.workspaceId, provider: "GITHUB", externalId: String(repository.id) } },
        select: { id: true },
      });
      if (existing) throw new GitHubServiceError(409, "This repository is already imported into the active workspace.");
      const base = slugify(parsed.data.projectName);
      let slug = base;
      let suffix = 2;
      while (await tx.project.findUnique({ where: { workspaceId_slug: { workspaceId: result.member.workspaceId, slug } }, select: { id: true } })) slug = `${base}-${suffix++}`;
      return tx.project.create({
        data: {
          workspaceId: result.member.workspaceId,
          name: parsed.data.projectName,
          slug,
          description: `Imported from ${repository.fullName}`,
          repository: { create: {
            provider: "GITHUB",
            externalId: String(repository.id),
            name: repository.name,
            fullName: repository.fullName,
            installation: { connect: { workspaceId_id: { workspaceId: result.member.workspaceId, id: result.installation.id } } },
            defaultBranch: repository.defaultBranch,
            selectedBranch: parsed.data.branch,
            language: repository.language,
            isPrivate: repository.private,
          } },
        },
        select: { id: true, name: true, slug: true, createdAt: true, repository: { select: { fullName: true, selectedBranch: true, defaultBranch: true, language: true, isPrivate: true } } },
      });
    });
    res.status(201).json({ success: true, data: project });
  } catch (error) { sendGitHubError(res, error); }
}

export const githubAppRouter = Router();
githubAppRouter.use(requireAuth);
githubAppRouter.get("/installations/start", startInstallation);
githubAppRouter.get("/installations/callback", installationCallback);
githubAppRouter.get("/installations/authorize/callback", installationAuthorizationCallback);
githubAppRouter.get("/installations", listInstallations);
githubAppRouter.get("/installations/:id/repositories", listRepositories);
githubAppRouter.get("/installations/:id/repositories/:repositoryId/branches", listBranches);
githubAppRouter.post("/installations/:id/repositories/:repositoryId/import", requireCsrf, importRepository);
