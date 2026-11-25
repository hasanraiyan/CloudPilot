"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type RepositoryOverview = {
  id: number; name: string; fullName: string; description: string | null;
  owner: { login: string; type: string; avatarUrl: string | null };
  visibility: "public" | "private" | "internal"; isPrivate: boolean;
  defaultBranch: string | null; selectedBranch: string | null; language: string | null;
  stars: number; forks: number; openIssuesCount: number; sizeKb: number;
  lastPushedAt: string | null; lastUpdatedAt: string; repositoryUrl: string; isArchived: boolean;
  installation: { accountLogin: string; accountType: string; status: string; repositorySelection: string };
  appPermissions: Record<string, string>; lastRefreshedAt: string | null;
};
export type Commit = {
  sha: string; shortSha: string; message: string; authorName: string | null;
  githubUsername: string | null; authorAvatar: string | null; timestamp: string | null;
  url: string; branch: string; verified: boolean | null; verificationReason: string | null;
};
export type CommitDetail = Commit & {
  stats: { additions?: number; deletions?: number; total?: number } | null;
  filesTruncated: boolean;
  files: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; url: string | null }>;
};
export type RepositoryBranch = { name: string; isDefault: boolean; latestCommitSha: string; protected: boolean; url: string };
export type RepositoryEntry = { name: string; path: string; type: "file" | "directory" | "symlink" | "submodule"; size: number; extension: string | null; sha: string; url: string | null; previewable: boolean };
export type RepositoryFiles = { kind: "directory" | "file" | "symlink" | "submodule"; path: string; entries: RepositoryEntry[]; breadcrumbs: Array<{ name: string; path: string }>; selectedBranch: string; size?: number; preview?: string | null; previewUnavailableReason?: string | null; url?: string | null };
export type LanguageStats = { languages: Array<{ name: string; bytes: number; percentage: number }>; totalBytes: number };
export type RepositoryDetection = { frameworks: Array<{ name: string; evidence: string[] }>; primaryFramework: string | null; runtime: string | null; packageManager: string | null; monorepo: boolean; suggestions: { rootDirectory: string | null; installCommand: string | null; buildCommand: string | null; startCommand: string | null; dockerfilePath: string | null; applicationPort: number | null }; branch?: string | null; selectedBranch?: string | null };
export type Page<T> = { items: T[]; page: number; perPage: number; hasNextPage: boolean; branch: string };
export type BuildConfiguration = { id?: string; projectId?: string; framework: string | null; runtime: string | null; packageManager: string | null; rootDirectory: string | null; installCommand: string | null; buildCommand: string | null; startCommand: string | null; dockerfilePath: string | null; applicationPort: number | null; buildTimeoutSeconds: number | null; environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION" | "PREVIEW" | null; createdAt?: string; updatedAt?: string };
export type BuildConfigResult = { saved: boolean; configuration: BuildConfiguration | null };

const root = (project: string) => `/projects/${encodeURIComponent(project)}`;
export const repositoryKeys = {
  all: (workspace: string | undefined, project: string) => ["repo", workspace, project] as const,
  repository: (workspace: string | undefined, project: string) => [...repositoryKeys.all(workspace, project), "metadata"] as const,
  branches: (workspace: string | undefined, project: string) => [...repositoryKeys.all(workspace, project), "branches"] as const,
  files: (workspace: string | undefined, project: string, branch: string, path: string) => [...repositoryKeys.all(workspace, project), "files", branch, path] as const,
  commits: (workspace: string | undefined, project: string, branch: string, page: number) => [...repositoryKeys.all(workspace, project), "commits", branch, page] as const,
  latest: (workspace: string | undefined, project: string, branch: string) => [...repositoryKeys.all(workspace, project), "latest", branch] as const,
  detail: (workspace: string | undefined, project: string, sha: string, branch: string) => [...repositoryKeys.all(workspace, project), "commit", sha, branch] as const,
  languages: (workspace: string | undefined, project: string) => [...repositoryKeys.all(workspace, project), "languages"] as const,
  detection: (workspace: string | undefined, project: string, branch: string) => [...repositoryKeys.all(workspace, project), "detection", branch] as const,
  config: (workspace: string | undefined, project: string) => ["build-config", workspace, project] as const,
};

export function useRepository(project: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.repository(workspace, project), queryFn: () => apiFetch<RepositoryOverview>(`${root(project)}/repository`), enabled: Boolean(project && workspace) });
}
export function useBranches(project: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.branches(workspace, project), queryFn: () => apiFetch<{ items: RepositoryBranch[]; selectedBranch: string | null }>(`${root(project)}/repository/branches?per_page=100`), enabled: Boolean(project && workspace) });
}
export function useRepositoryFiles(project: string, branch: string, path: string, workspace?: string) {
  const params = new URLSearchParams({ branch, path });
  return useQuery({ queryKey: repositoryKeys.files(workspace, project, branch, path), queryFn: () => apiFetch<RepositoryFiles>(`${root(project)}/repository/files?${params}`), enabled: Boolean(project && branch && workspace) });
}
export function useCommits(project: string, branch: string, page: number, workspace?: string) {
  const params = new URLSearchParams({ branch, page: String(page), per_page: "20" });
  return useQuery({ queryKey: repositoryKeys.commits(workspace, project, branch, page), queryFn: () => apiFetch<Page<Commit>>(`${root(project)}/repository/commits?${params}`), enabled: Boolean(project && branch && workspace) });
}
export function useLatestCommit(project: string, branch: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.latest(workspace, project, branch), queryFn: () => apiFetch<Commit | null>(`${root(project)}/repository/commits/latest?branch=${encodeURIComponent(branch)}`), enabled: Boolean(project && branch && workspace) });
}
export function useCommitDetail(project: string, sha: string, branch: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.detail(workspace, project, sha, branch), queryFn: () => apiFetch<CommitDetail>(`${root(project)}/repository/commits/${encodeURIComponent(sha)}?branch=${encodeURIComponent(branch)}`), enabled: Boolean(project && sha && branch && workspace) });
}
export function useRepositoryLanguages(project: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.languages(workspace, project), queryFn: () => apiFetch<LanguageStats>(`${root(project)}/repository/languages`), enabled: Boolean(project && workspace) });
}
export function useRepositoryDetection(project: string, branch: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.detection(workspace, project, branch), queryFn: () => apiFetch<RepositoryDetection>(`${root(project)}/repository/detection`), enabled: Boolean(project && branch && workspace) });
}
export function useBuildConfiguration(project: string, workspace?: string) {
  return useQuery({ queryKey: repositoryKeys.config(workspace, project), queryFn: () => apiFetch<BuildConfigResult>(`${root(project)}/build-config`), enabled: Boolean(project && workspace) });
}
export function useSaveBuildConfiguration(project: string, workspace?: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (configuration: Omit<BuildConfiguration, "id" | "projectId" | "createdAt" | "updatedAt">) => apiFetch<BuildConfigResult>(`${root(project)}/build-config`, { method: "PUT", body: JSON.stringify(configuration) }), onSuccess: () => client.invalidateQueries({ queryKey: repositoryKeys.config(workspace, project) }) });
}
export function useResetBuildConfiguration(project: string, workspace?: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => apiFetch<BuildConfigResult>(`${root(project)}/build-config`, { method: "DELETE" }), onSuccess: () => client.invalidateQueries({ queryKey: repositoryKeys.config(workspace, project) }) });
}
export function useRefreshRepository(project: string, workspace?: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: () => apiFetch<RepositoryOverview>(`${root(project)}/repository/refresh`, { method: "POST" }), onSuccess: () => client.invalidateQueries({ queryKey: repositoryKeys.all(workspace, project) }) });
}
export function useChangeProjectBranch(project: string, workspace?: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (branch: string) => apiFetch<{ selectedBranch: string; defaultBranch: string | null }>(`${root(project)}/repository/branch`, { method: "PATCH", body: JSON.stringify({ branch }) }), onSuccess: () => client.invalidateQueries({ queryKey: repositoryKeys.all(workspace, project) }) });
}
