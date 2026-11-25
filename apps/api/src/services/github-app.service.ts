import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { env } from "../config/env.js";

export class GitHubServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GitHubServiceError";
  }
}

export interface GitHubRepositoryRecord {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  language: string | null;
  defaultBranch: string;
  cloneUrl: string;
}

export interface VerifiedGitHubInstallation {
  id: number;
  appId: number;
  account: { id: number; login: string; type: string };
  repository_selection: "all" | "selected";
  suspended_at: string | null;
  permissions: Record<string, string>;
}

export async function createGitHubApp(): Promise<App<{ Octokit: typeof Octokit }>> {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY_PATH) {
    throw new GitHubServiceError(503, "GitHub App integration is not configured.");
  }
  const privateKeyPath = resolve(env.GITHUB_APP_PRIVATE_KEY_PATH);
  let privateKey: string;
  try {
    privateKey = await readFile(privateKeyPath, "utf8");
    const parsedKey = createPrivateKey(privateKey);
    if (parsedKey.asymmetricKeyType !== "rsa") throw new Error("Unsupported key type");
  } catch {
    throw new GitHubServiceError(503, "GitHub App private key is unavailable or invalid.");
  }
  return new App<{ Octokit: typeof Octokit }>({ appId: env.GITHUB_APP_ID, privateKey, Octokit });
}

function installationIdNumber(installationId: bigint): number {
  const value = Number(installationId);
  if (!Number.isSafeInteger(value) || value <= 0) throw new GitHubServiceError(400, "Invalid installation identifier.");
  return value;
}

export async function verifyAppInstallation(installationId: bigint): Promise<VerifiedGitHubInstallation> {
  const app = await createGitHubApp();
  try {
    const response = await app.octokit.request("GET /app/installations/{installation_id}", {
      installation_id: installationIdNumber(installationId),
    });
    const account = response.data.account;
    if (!account || !("login" in account) || !("type" in account)) throw new GitHubServiceError(502, "GitHub returned invalid installation metadata.");
    return {
      id: response.data.id,
      appId: response.data.app_id,
      account: { id: Number(account.id), login: account.login, type: account.type },
      repository_selection: response.data.repository_selection,
      suspended_at: response.data.suspended_at,
      permissions: Object.fromEntries(Object.entries(response.data.permissions).map(([key, value]) => [key, String(value)])),
    };
  } catch (error) {
    throw mapGitHubError(error);
  }
}

export async function createInstallationOctokit(installationId: bigint) {
  const app = await createGitHubApp();
  try {
    return await app.getInstallationOctokit(installationIdNumber(installationId));
  } catch (error) {
    throw mapGitHubError(error);
  }
}

export async function listInstallationRepositories(installationId: bigint): Promise<GitHubRepositoryRecord[]> {
  const octokit = await createInstallationOctokit(installationId);
  try {
    const repositories = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
    return repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      language: repository.language,
      defaultBranch: repository.default_branch,
      cloneUrl: repository.clone_url,
    }));
  } catch (error) {
    throw mapGitHubError(error);
  }
}

export async function listRepositoryBranches(installationId: bigint, owner: string, repository: string) {
  const octokit = await createInstallationOctokit(installationId);
  try {
    return await octokit.paginate(octokit.rest.repos.listBranches, {
      owner,
      repo: repository,
      per_page: 100,
    });
  } catch (error) {
    throw mapGitHubError(error);
  }
}

export interface UserAuthorizedInstallation {
  id: number;
  app_id: number;
  account: { id: number; login: string; type: string };
  repository_selection: "all" | "selected";
  suspended_at: string | null;
}

export async function listUserAuthorizedInstallations(accessToken: string): Promise<UserAuthorizedInstallation[]> {
  const octokit = new Octokit({ auth: accessToken });
  try {
    const installations = await octokit.paginate(octokit.rest.apps.listInstallationsForAuthenticatedUser, { per_page: 100 });
    return installations.flatMap((installation): UserAuthorizedInstallation[] => {
      const account = installation.account;
      if (!account || !("type" in account) || !account.login) return [];
      return [{
        id: installation.id,
        app_id: installation.app_id,
        account: { id: account.id, login: account.login, type: account.type },
        repository_selection: installation.repository_selection,
        suspended_at: installation.suspended_at,
      }];
    });
  } catch (error) {
    throw mapGitHubError(error);
  }
}

export async function exchangeGitHubOAuthCode(code: string, redirectUri: string): Promise<string> {
  if (!env.GITHUB_APP_CLIENT_ID || !env.GITHUB_APP_CLIENT_SECRET) {
    throw new GitHubServiceError(503, "GitHub user authorization is not configured.");
  }
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: env.GITHUB_APP_CLIENT_ID, client_secret: env.GITHUB_APP_CLIENT_SECRET, code, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new GitHubServiceError(response.status, "GitHub authorization could not be completed.");
    const payload = await response.json() as { access_token?: string; error?: string };
    if (!payload.access_token) throw new GitHubServiceError(401, "GitHub authorization was declined or expired.");
    return payload.access_token;
  } catch (error) {
    if (error instanceof GitHubServiceError) throw error;
    throw new GitHubServiceError(503, "GitHub authorization service is unavailable.");
  }
}

export async function fetchGitHubUser<T>(accessToken: string, path: string): Promise<T> {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new GitHubServiceError(response.status, "GitHub could not verify this account's installation access.");
    return await response.json() as T;
  } catch (error) {
    if (error instanceof GitHubServiceError) throw error;
    throw new GitHubServiceError(503, "GitHub API is unavailable.");
  }
}

export function mapGitHubError(error: unknown): GitHubServiceError {
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : 503;
  const headers = typeof error === "object" && error !== null && "response" in error && error.response && typeof error.response === "object" && "headers" in error.response
    ? error.response.headers as Record<string, string | undefined>
    : undefined;
  if ((status === 403 || status === 429) && (headers?.["x-ratelimit-remaining"] === "0" || headers?.["retry-after"])) {
    return new GitHubServiceError(429, "GitHub API rate limit reached. Try again later.");
  }
  if (status === 404) return new GitHubServiceError(404, "The GitHub installation or repository is unavailable.");
  if (status === 401 || status === 403) return new GitHubServiceError(403, "GitHub denied access to this installation or repository.");
  if (status === 429) return new GitHubServiceError(429, "GitHub API rate limit reached. Try again later.");
  if (status >= 500) return new GitHubServiceError(503, "GitHub API is temporarily unavailable.");
  return new GitHubServiceError(502, "GitHub could not complete this request.");
}
