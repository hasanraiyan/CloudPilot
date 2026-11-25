import { createHash } from "node:crypto";
import { GitHubServiceError, createInstallationOctokit, mapGitHubError } from "./github-app.service.js";
import { redisProducerConnection } from "./queue-producer.js";

const GITHUB_REQUEST_TIMEOUT_MS = 12_000;
const MAX_PREVIEW_BYTES = 128 * 1024;
const CACHE_PREFIX = "cloudpilot:repo:v1";
const inFlight = new Map<string, Promise<unknown>>();

export type RepositoryMetadata = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  owner: { login: string; type: string; avatarUrl: string | null };
  visibility: "public" | "private" | "internal";
  isPrivate: boolean;
  defaultBranch: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssuesCount: number;
  sizeKb: number;
  lastPushedAt: string | null;
  lastUpdatedAt: string;
  repositoryUrl: string;
  isArchived: boolean;
};

export type RepositoryCommit = {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string | null;
  githubUsername: string | null;
  authorAvatar: string | null;
  timestamp: string | null;
  url: string;
  branch: string;
  verified: boolean | null;
  verificationReason: string | null;
};

type CommitResponse = {
  sha: string;
  commit: {
    message: string;
    author?: { name?: string | null; date?: string | null } | null;
    committer?: { name?: string | null; date?: string | null } | null;
    verification?: { verified?: boolean; reason?: string | null } | null;
  };
  author?: { login?: string; avatar_url?: string } | null;
  html_url: string;
};

export type RepositoryBranch = {
  name: string;
  isDefault: boolean;
  latestCommitSha: string;
  protected: boolean;
  url: string;
};

export type RepositoryFileEntry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink" | "submodule";
  size: number;
  extension: string | null;
  sha: string;
  url: string | null;
  previewable: boolean;
};

export type RepositoryDetection = {
  frameworks: Array<{ name: string; evidence: string[] }>;
  primaryFramework: string | null;
  runtime: string | null;
  packageManager: string | null;
  monorepo: boolean;
  suggestions: {
    rootDirectory: string | null;
    installCommand: string | null;
    buildCommand: string | null;
    startCommand: string | null;
    dockerfilePath: string | null;
    applicationPort: number | null;
  };
};

function requestOptions() {
  return { request: { timeout: GITHUB_REQUEST_TIMEOUT_MS } };
}

function cacheKey(workspaceId: string, projectId: string, externalId: string, topic: string, variant: unknown): string {
  const digest = createHash("sha256").update(JSON.stringify(variant)).digest("hex").slice(0, 40);
  return `${CACHE_PREFIX}:${workspaceId}:${projectId}:${externalId}:${topic}:${digest}`;
}

async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running) return running as Promise<T>;
  const promise = (async () => {
    try {
      const value = await redisProducerConnection.get(key);
      if (value) {
        try { return JSON.parse(value) as T; }
        catch { await redisProducerConnection.del(key).catch(() => undefined); }
      }
    } catch { /* Redis is an optional acceleration layer; GitHub remains authoritative. */ }
    const result = await load();
    try { await redisProducerConnection.set(key, JSON.stringify(result), "EX", ttlSeconds); }
    catch { /* Do not fail a repository read because Redis is unavailable. */ }
    return result;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export async function invalidateRepositoryCache(workspaceId: string, projectId: string, externalId: string): Promise<void> {
  const match = `${CACHE_PREFIX}:${workspaceId}:${projectId}:${externalId}:*`;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redisProducerConnection.scan(cursor, "MATCH", match, "COUNT", 100);
      cursor = next;
      if (keys.length) await redisProducerConnection.unlink(...keys);
    } while (cursor !== "0");
  } catch { /* In-memory request coalescing expires on its own; Redis invalidation is best effort. */ }
}

export async function getRepositoryMetadata(installationId: bigint, owner: string, repo: string): Promise<RepositoryMetadata> {
  const octokit = await createInstallationOctokit(installationId);
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo, ...requestOptions() });
    const ownerInfo = data.owner;
    if (!ownerInfo) throw new GitHubServiceError(502, "GitHub returned repository metadata without an owner.");
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      owner: { login: ownerInfo.login, type: ownerInfo.type, avatarUrl: ownerInfo.avatar_url ?? null },
      visibility: data.visibility === "internal" || data.visibility === "private" || data.visibility === "public"
        ? data.visibility
        : data.private ? "private" : "public",
      isPrivate: data.private,
      defaultBranch: data.default_branch,
      language: data.language,
      stars: data.stargazers_count,
      forks: data.forks_count,
      openIssuesCount: data.open_issues_count,
      sizeKb: data.size,
      lastPushedAt: data.pushed_at,
      lastUpdatedAt: data.updated_at,
      repositoryUrl: data.html_url,
      isArchived: data.archived,
    };
  } catch (error) { throw mapGitHubError(error); }
}

export async function getCachedRepositoryMetadata(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint; owner: string; repo: string;
}): Promise<RepositoryMetadata> {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "metadata", {});
  return cached(key, 60, () => getRepositoryMetadata(input.installationId, input.owner, input.repo));
}

function mapCommit(commit: CommitResponse, branch: string): RepositoryCommit {
  const details = commit.commit;
  const message = details.message;
  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message,
    authorName: details.author?.name ?? details.committer?.name ?? null,
    githubUsername: commit.author?.login ?? null,
    authorAvatar: commit.author?.avatar_url ?? null,
    timestamp: details.author?.date ?? details.committer?.date ?? null,
    url: commit.html_url,
    branch,
    verified: details.verification?.verified ?? null,
    verificationReason: details.verification?.reason ?? null,
  };
}

export async function getCommitHistory(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint;
  owner: string; repo: string; branch: string; page: number; perPage: number;
}) {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "commits", { branch: input.branch, page: input.page, perPage: input.perPage });
  return cached(key, 30, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const response = await octokit.rest.repos.listCommits({ owner: input.owner, repo: input.repo, sha: input.branch, page: input.page, per_page: input.perPage, ...requestOptions() });
      return {
        items: response.data.map((item) => mapCommit(item, input.branch)),
        page: input.page,
        perPage: input.perPage,
        hasNextPage: /rel="next"/u.test(response.headers.link ?? ""),
        branch: input.branch,
      };
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
      if (status === 409) return { items: [], page: input.page, perPage: input.perPage, hasNextPage: false, branch: input.branch };
      throw mapGitHubError(error);
    }
  });
}

export async function getLatestCommit(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint;
  owner: string; repo: string; branch: string;
}): Promise<RepositoryCommit | null> {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "latest", input.branch);
  return cached(key, 20, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const response = await octokit.rest.repos.listCommits({ owner: input.owner, repo: input.repo, sha: input.branch, page: 1, per_page: 1, ...requestOptions() });
      const item = response.data[0];
      return item ? mapCommit(item, input.branch) : null;
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
      if (status === 409) return null;
      throw mapGitHubError(error);
    }
  });
}

export async function getCommitDetails(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint;
  owner: string; repo: string; sha: string; branch: string;
}) {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "commit", { sha: input.sha, branch: input.branch });
  return cached(key, 60, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const params = { owner: input.owner, repo: input.repo, ref: input.sha, per_page: 100, ...requestOptions() };
      const { data, headers } = await octokit.rest.repos.getCommit(params);
      const files = [...(data.files ?? [])];
      let hasMoreFiles = /rel="next"/u.test(headers.link ?? "");
      for (let page = 2; hasMoreFiles && page <= 30; page++) {
        const response = await octokit.rest.repos.getCommit({ ...params, page });
        files.push(...(response.data.files ?? []));
        hasMoreFiles = /rel="next"/u.test(response.headers.link ?? "");
      }
      const details = data.commit;
      return {
        ...mapCommit(data, input.branch),
        stats: data.stats ?? null,
        files: files.map((file) => ({ filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions, changes: file.changes, url: file.blob_url })),
        filesTruncated: hasMoreFiles,
        parents: data.parents.map((parent) => parent.sha),
        committerName: details.committer?.name ?? null,
      };
    } catch (error) { throw mapGitHubError(error); }
  });
}

export async function listRepositoryBranches(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint;
  owner: string; repo: string; defaultBranch: string | null; page: number; perPage: number; search: string;
}) {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "branches", { page: input.page, perPage: input.perPage, search: input.search.toLowerCase() });
  return cached(key, 45, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      if (input.search) {
        const all = await octokit.paginate(octokit.rest.repos.listBranches, { owner: input.owner, repo: input.repo, per_page: 100, ...requestOptions() });
        const filtered = all.filter((branch) => branch.name.toLowerCase().includes(input.search.toLowerCase()));
        const start = (input.page - 1) * input.perPage;
        return {
          items: filtered.slice(start, start + input.perPage).map((branch) => ({ name: branch.name, isDefault: branch.name === input.defaultBranch, latestCommitSha: branch.commit.sha, protected: branch.protected, url: `https://github.com/${input.owner}/${input.repo}/tree/${encodeURIComponent(branch.name)}` })),
          page: input.page, perPage: input.perPage, hasNextPage: filtered.length > start + input.perPage, total: filtered.length,
        };
      }
      const response = await octokit.rest.repos.listBranches({ owner: input.owner, repo: input.repo, page: input.page, per_page: input.perPage, ...requestOptions() });
      return {
        items: response.data.map((branch) => ({ name: branch.name, isDefault: branch.name === input.defaultBranch, latestCommitSha: branch.commit.sha, protected: branch.protected, url: `https://github.com/${input.owner}/${input.repo}/tree/${encodeURIComponent(branch.name)}` })),
        page: input.page, perPage: input.perPage, hasNextPage: /rel="next"/u.test(response.headers.link ?? ""),
      };
    } catch (error) { throw mapGitHubError(error); }
  });
}

export async function listRepositoryTags(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint;
  owner: string; repo: string; page: number; perPage: number;
}) {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "tags", { page: input.page, perPage: input.perPage });
  return cached(key, 60, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const response = await octokit.rest.repos.listTags({ owner: input.owner, repo: input.repo, page: input.page, per_page: input.perPage, ...requestOptions() });
      return {
        items: response.data.map((tag) => ({ name: tag.name, commitSha: tag.commit.sha, url: `https://github.com/${input.owner}/${input.repo}/tree/${encodeURIComponent(tag.name)}` })),
        page: input.page, perPage: input.perPage, hasNextPage: /rel="next"/u.test(response.headers.link ?? ""),
      };
    } catch (error) { throw mapGitHubError(error); }
  });
}

export async function isRepositoryBranchAvailable(input: { installationId: bigint; owner: string; repo: string; branch: string }): Promise<boolean> {
  const octokit = await createInstallationOctokit(input.installationId);
  try {
    const branches = await octokit.paginate(octokit.rest.repos.listBranches, { owner: input.owner, repo: input.repo, per_page: 100, ...requestOptions() });
    return branches.some((branch) => branch.name === input.branch);
  } catch (error) { throw mapGitHubError(error); }
}

function extensionOf(path: string): string | null {
  const name = path.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

const previewExtensions = new Set(["txt", "md", "markdown", "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "js", "jsx", "ts", "tsx", "mjs", "cjs", "css", "scss", "html", "xml", "py", "go", "java", "sh", "ps1", "sql", "tf", "hcl", "lock", "gradle", "properties", "gitignore", "dockerignore"]);

export function isSensitiveRepositoryPath(path: string): boolean {
  return path.split("/").some((part) => {
    const name = part.toLowerCase();
    return name === ".env" || name.startsWith(".env.") || name.startsWith(".env-") ||
      [".npmrc", ".pypirc", ".netrc", ".git-credentials", ".dockercfg", "credentials", "secrets"].includes(name) ||
      /(?:credential|secret|private[-_]?key)/u.test(name) || /\.(?:pem|key|p12|pfx|p7b|p7c|jks|keystore|kdb|kbx|p8|gpg|asc)$/u.test(name);
  });
}

function previewSecretDetected(content: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{24,}|github_pat_[A-Za-z0-9_]{24,})\b|(?:password|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']{12,}/iu.test(content);
}

export async function browseRepositoryFiles(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint;
  owner: string; repo: string; path: string; branch: string;
}) {
  if (isSensitiveRepositoryPath(input.path)) throw new GitHubServiceError(403, "This path is hidden because it may contain credentials or private keys.");
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "files", { path: input.path, branch: input.branch });
  return cached(key, 20, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const response = await octokit.rest.repos.getContent({ owner: input.owner, repo: input.repo, path: input.path || "", ref: input.branch, ...requestOptions() });
      if (Array.isArray(response.data)) {
        const entries: RepositoryFileEntry[] = response.data.filter((item) => !isSensitiveRepositoryPath(item.path)).map((item) => {
          const type: RepositoryFileEntry["type"] = item.type === "dir" ? "directory" : item.type === "symlink" ? "symlink" : item.type === "submodule" ? "submodule" : "file";
          return {
            name: item.name, path: item.path, type, size: item.size, extension: extensionOf(item.path), sha: item.sha,
            url: item.html_url, previewable: type === "file" && item.size <= MAX_PREVIEW_BYTES && previewExtensions.has(extensionOf(item.path) ?? ""),
          };
        }).sort((a, b) => (a.type === "directory" ? 0 : 1) - (b.type === "directory" ? 0 : 1) || a.name.localeCompare(b.name));
        return { kind: "directory" as const, path: input.path, entries, breadcrumbs: input.path ? input.path.split("/").map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join("/") })) : [] };
      }
      if (response.data.type !== "file") {
        return { kind: response.data.type as "symlink" | "submodule", path: response.data.path, preview: null, previewUnavailableReason: "unsupported_type", url: response.data.html_url };
      }
      const file = response.data;
      if (file.path !== input.path || isSensitiveRepositoryPath(file.path)) {
        throw new GitHubServiceError(403, "This path cannot be previewed safely.");
      }
      let preview: string | null = null;
      let previewUnavailableReason: string | null = null;
      if (file.size > MAX_PREVIEW_BYTES) previewUnavailableReason = "file_too_large";
      else if (!previewExtensions.has(extensionOf(file.path) ?? "")) previewUnavailableReason = "unsupported_file_type";
      else if (file.encoding !== "base64" || typeof file.content !== "string") previewUnavailableReason = "unsupported_encoding";
      else {
        const bytes = Buffer.from(file.content.replace(/\s/gu, ""), "base64");
        if (bytes.length > MAX_PREVIEW_BYTES) previewUnavailableReason = "file_too_large";
        else {
          try {
            const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            if (text.includes("\u0000")) previewUnavailableReason = "binary_file";
            else if (previewSecretDetected(text)) previewUnavailableReason = "possible_secret_detected";
            else preview = text;
          } catch { previewUnavailableReason = "unsupported_encoding"; }
        }
      }
      return { kind: "file" as const, path: file.path, size: file.size, extension: extensionOf(file.path), sha: file.sha, url: file.html_url, preview, previewUnavailableReason };
    } catch (error) { throw mapGitHubError(error); }
  });
}

export async function getRepositoryLanguages(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint; owner: string; repo: string;
}) {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "languages", {});
  return cached(key, 120, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const { data } = await octokit.rest.repos.listLanguages({ owner: input.owner, repo: input.repo, ...requestOptions() });
      const totalBytes = Object.values(data).reduce((total, value) => total + value, 0);
      return {
        totalBytes,
        languages: Object.entries(data).map(([name, bytes]) => ({ name, bytes, percentage: totalBytes ? Number(((bytes / totalBytes) * 100).toFixed(2)) : 0 })).sort((a, b) => b.bytes - a.bytes),
      };
    } catch (error) { throw mapGitHubError(error); }
  });
}

type RootFile = { name: string; path: string; type: string };

async function readDetectionFile(octokit: Awaited<ReturnType<typeof createInstallationOctokit>>, owner: string, repo: string, path: string, branch: string): Promise<string | null> {
  if (isSensitiveRepositoryPath(path)) return null;
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: branch, ...requestOptions() });
    if (Array.isArray(data) || data.type !== "file" || data.size > 64 * 1024 || data.encoding !== "base64") return null;
    const bytes = Buffer.from(data.content.replace(/\s/gu, ""), "base64");
    if (bytes.length > 64 * 1024) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : null;
    if (status === 404) return null;
    throw mapGitHubError(error);
  }
}

export async function detectRepositoryFramework(input: {
  workspaceId: string; projectId: string; externalId: string; installationId: bigint; owner: string; repo: string; branch: string;
}): Promise<RepositoryDetection> {
  const key = cacheKey(input.workspaceId, input.projectId, input.externalId, "detection", { branch: input.branch, version: 2 });
  return cached(key, 300, async () => {
    const octokit = await createInstallationOctokit(input.installationId);
    try {
      const rootResponse = await octokit.rest.repos.getContent({ owner: input.owner, repo: input.repo, path: "", ref: input.branch, ...requestOptions() });
      const root: RootFile[] = Array.isArray(rootResponse.data) ? rootResponse.data.map((item) => ({ name: item.name, path: item.path, type: item.type })) : [];
      const rootNames = new Set(root.map((file) => file.name.toLowerCase()));
      const packageCandidates = ["package.json"];
      const workspaceDirectories = root.filter((file) => file.type === "dir" && ["apps", "packages", "services", "frontend", "web", "api", "server", "client"].includes(file.name.toLowerCase())).slice(0, 8);
      for (const directory of workspaceDirectories) {
        const { data } = await octokit.rest.repos.getContent({ owner: input.owner, repo: input.repo, path: directory.path, ref: input.branch, ...requestOptions() });
        if (Array.isArray(data)) {
          for (const child of data.filter((item) => item.type === "dir").slice(0, 10)) packageCandidates.push(`${child.path}/package.json`);
          if (data.some((item) => item.name === "package.json" && item.type === "file")) packageCandidates.push(`${directory.path}/package.json`);
        }
      }
      const configNames = ["requirements.txt", "pyproject.toml", "pom.xml", "go.mod", "Dockerfile", "docker-compose.yml", "compose.yaml", "next.config.js", "next.config.mjs", "next.config.ts", "vite.config.js", "vite.config.ts", "pnpm-workspace.yaml"];
      const configPaths = root.filter((file) => file.type === "file" && configNames.some((name) => name.toLowerCase() === file.name.toLowerCase())).map((file) => file.path);
      const filePaths = [...new Set([...packageCandidates, ...configPaths])].slice(0, 20);
      const contents = await Promise.all(filePaths.map(async (path) => [path, await readDetectionFile(octokit, input.owner, input.repo, path, input.branch)] as const));
      const contentByPath = new Map(contents.filter((entry): entry is readonly [string, string] => entry[1] !== null));
      const evidence = new Map<string, Set<string>>();
      const add = (framework: string, proof: string) => { const set = evidence.get(framework) ?? new Set<string>(); set.add(proof); evidence.set(framework, set); };
      const packageEntries = [...contentByPath.entries()].filter(([path]) => path.endsWith("package.json"));
      const allPackages: Array<{ path: string; value: Record<string, unknown> }> = [];
      for (const [path, content] of packageEntries) {
        try {
          const parsed: unknown = JSON.parse(content);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            allPackages.push({ path, value: parsed as Record<string, unknown> });
          }
        } catch { /* Invalid package manifests are not evidence. */ }
      }
      const dependencies = new Set<string>();
      for (const { value } of allPackages) {
        for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
          const map = value[field];
          if (typeof map === "object" && map !== null) for (const name of Object.keys(map)) dependencies.add(name);
        }
      }
      if (dependencies.has("next") || rootNames.has("next.config.js") || rootNames.has("next.config.ts") || rootNames.has("next.config.mjs")) add("Next.js", "Next.js dependency or configuration");
      if (dependencies.has("react")) add("React", "React dependency");
      if (dependencies.has("vue") || rootNames.has("vite.config.ts") && dependencies.has("@vitejs/plugin-vue")) add("Vue.js", "Vue dependency or Vite Vue plugin");
      if (dependencies.has("@angular/core")) add("Angular", "Angular core dependency");
      if (dependencies.has("express")) add("Express.js", "Express dependency");
      if (dependencies.has("fastapi") || contentByPath.get("requirements.txt")?.toLowerCase().includes("fastapi") || contentByPath.get("pyproject.toml")?.toLowerCase().includes("fastapi")) add("FastAPI", "FastAPI dependency declaration");
      if (dependencies.has("flask") || contentByPath.get("requirements.txt")?.toLowerCase().includes("flask")) add("Flask", "Flask dependency declaration");
      if (dependencies.has("django") || contentByPath.get("requirements.txt")?.toLowerCase().includes("django") || contentByPath.get("pyproject.toml")?.toLowerCase().includes("django")) add("Django", "Django dependency declaration");
      if (contentByPath.get("pom.xml")?.includes("spring-boot")) add("Spring Boot", "Spring Boot dependency in pom.xml");
      if (contentByPath.has("go.mod")) add("Go", "go.mod present");
      if (contentByPath.has("requirements.txt") || contentByPath.has("pyproject.toml")) add("Python", "Python dependency manifest present");
      if (contentByPath.has("Dockerfile") || [...rootNames].some((name) => name.startsWith("dockerfile")) || contentByPath.has("docker-compose.yml") || contentByPath.has("compose.yaml")) add("Docker", "Dockerfile or Compose manifest present");
      if (!evidence.size && rootNames.has("index.html")) add("Static website", "Root index.html without framework manifests");

      const frameworks = [...evidence.entries()].map(([name, proofs]) => ({ name, evidence: [...proofs] }));
      const primaryOrder = ["Next.js", "Angular", "Vue.js", "React", "Express.js", "FastAPI", "Flask", "Django", "Spring Boot", "Go", "Python", "Static website", "Docker"];
      const primaryFramework = primaryOrder.find((name) => evidence.has(name)) ?? null;
      const rootPackage = allPackages.find(({ path }) => path === "package.json")?.value;
      const nestedPackages = allPackages.filter(({ path }) => path !== "package.json");
      const monorepo = Boolean(nestedPackages.length > 1 || rootPackage?.workspaces || ["pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json"].some((name) => rootNames.has(name)));
      const app = nestedPackages.length === 1 && (monorepo || !rootPackage) ? nestedPackages[0] : undefined;
      const manifest = app?.value ?? (monorepo ? undefined : rootPackage);
      const scripts = manifest?.scripts && typeof manifest.scripts === "object" ? manifest.scripts as Record<string, unknown> : {};
      const declaredManager = manifest?.packageManager ?? rootPackage?.packageManager;
      const managerName = typeof declaredManager === "string" ? declaredManager.split("@")[0] : null;
      const packageManager = managerName && ["npm", "pnpm", "yarn", "bun"].includes(managerName) ? managerName
        : rootNames.has("pnpm-lock.yaml") ? "pnpm" : rootNames.has("yarn.lock") ? "yarn"
        : rootNames.has("package-lock.json") ? "npm" : rootNames.has("bun.lock") || rootNames.has("bun.lockb") ? "bun" : null;
      const engines = manifest?.engines && typeof manifest.engines === "object" ? manifest.engines as Record<string, unknown> : {};
      const runtime = typeof engines.node === "string" ? `Node.js ${engines.node}` : packageEntries.length ? "Node.js" : contentByPath.has("go.mod") ? "Go" : contentByPath.has("pom.xml") ? "Java" : contentByPath.has("pyproject.toml") || contentByPath.has("requirements.txt") ? "Python" : null;
      const dockerfilePath = monorepo ? null : root.find((file) => file.type === "file" && file.name.toLowerCase() === "dockerfile")?.path ?? null;
      const dockerfile = dockerfilePath ? contentByPath.get(dockerfilePath) : undefined;
      const exposedPorts = new Set(Array.from(dockerfile?.matchAll(/^\s*EXPOSE[ \t]+(\d+)(?:\/tcp)?[ \t]*(?:#.*)?$/gimu) ?? [], ([, port]) => Number(port)));
      const exposedPort = exposedPorts.size === 1 ? exposedPorts.values().next().value : undefined;
      const applicationPort = exposedPort && exposedPort > 0 && exposedPort <= 65535 ? exposedPort : null;
      const buildCommand = typeof scripts.build === "string" ? `${packageManager ?? "npm"} run build` : null;
      const installCommand = packageManager ? packageManager === "npm" ? rootNames.has("package-lock.json") ? "npm ci" : "npm install" : packageManager === "pnpm" ? rootNames.has("pnpm-lock.yaml") ? "pnpm install --frozen-lockfile" : "pnpm install" : packageManager === "yarn" ? rootNames.has("yarn.lock") ? "yarn install --immutable" : "yarn install" : "bun install" : null;
      const startCommand = typeof scripts.start === "string" ? `${packageManager ?? "npm"} run start` : null;
      return {
        frameworks,
        primaryFramework,
        runtime,
        packageManager,
        monorepo,
        suggestions: {
          rootDirectory: app?.path.slice(0, -"/package.json".length) ?? (!monorepo && (rootPackage || primaryFramework) ? "." : null),
          installCommand: monorepo ? null : installCommand, buildCommand, startCommand, dockerfilePath, applicationPort,
        },
      };
    } catch (error) { throw mapGitHubError(error); }
  });
}
