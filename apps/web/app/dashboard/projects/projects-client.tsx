"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  FolderKanban, Plus, Search, LayoutGrid, List, MoreHorizontal, Pencil, Trash2,
  GitBranch, RefreshCw, LoaderCircle, LockKeyhole, Globe2, CircleCheck,
  CircleAlert, Cable, ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { apiFetch, API_BASE } from "@/lib/api";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { GitHubIcon } from "@/components/shared/github-icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Project = {
  id: string; name: string; description: string | null; slug: string; updatedAt: string;
  _count?: { deployments: number };
  repository?: { fullName: string | null; selectedBranch: string | null; defaultBranch: string | null; language: string | null; isPrivate: boolean } | null;
};
type Installation = { id: string; accountLogin: string; accountType: string; repositorySelection: "ALL" | "SELECTED"; status: string; canAccess: boolean };
type GitHubRepository = { id: number; name: string; fullName: string; private: boolean; language: string | null; defaultBranch: string; imported: boolean };
type Branch = { name: string; protected: boolean; commitSha: string };

export default function ProjectsPage() {
  const { activeWorkspace } = useDashboard();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [installations, setInstallations] = useState<Installation[]>([]);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [repositorySearch, setRepositorySearch] = useState("");
  const [selectedRepository, setSelectedRepository] = useState<GitHubRepository | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [projectName, setProjectName] = useState("");
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await apiFetch<Project[]>(`/projects?q=${encodeURIComponent(search)}`));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load projects.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  const refreshConnections = useCallback(async (): Promise<Installation[]> => {
    setConnectionLoading(true);
    try {
      const rows = await apiFetch<Installation[]>("/github/installations");
      setInstallations(rows);
      setConnectionError("");
      return rows;
    } catch (cause) {
      setConnectionError(cause instanceof Error ? cause.message : "Could not load GitHub connection status.");
      return [];
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  const loadRepositories = useCallback(async (id: string) => {
    if (!id) { setRepositories([]); return; }
    setRepositoryLoading(true);
    setRepositories([]);
    setSelectedRepository(null);
    setBranches([]);
    setSelectedBranch("");
    setImportError("");
    try {
      setRepositories(await apiFetch<GitHubRepository[]>(`/github/installations/${encodeURIComponent(id)}/repositories`));
    } catch (cause) {
      setImportError(cause instanceof Error ? cause.message : "Could not load GitHub repositories.");
    } finally {
      setRepositoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProjects(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeWorkspace?.id, loadProjects]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshConnections(); }, 0);
    return () => window.clearTimeout(timer);
  }, [activeWorkspace?.id, refreshConnections]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("github");
      if (!status) return;
      window.history.replaceState({}, "", window.location.pathname);
      if (status === "connected") {
        setNotice("GitHub App connected. Loading authorized repositories…");
        void refreshConnections().then(async (rows) => {
          const first = rows.find((row) => row.status === "ACTIVE" && row.canAccess);
          if (!first) return;
          setInstallationId(first.id);
          setImportDialogOpen(true);
          await loadRepositories(first.id);
        });
        return;
      }
      const messages: Record<string, string> = {
        configuration: "GitHub App authorization settings are incomplete. Check the App client ID, secret, and callback URL.",
        authorization_denied: "GitHub authorization was cancelled.",
        authorization_failed: "GitHub authorization could not be completed. Try again.",
        installation_required: "This GitHub identity has no accessible CloudPilot App installation. Install the App, then connect again.",
        installation_forbidden: "The authorized GitHub identity cannot access this installation.",
        identity_conflict: "This GitHub identity is linked to another CloudPilot account.",
        workspace_conflict: "This installation is already connected to a different workspace.",
        rate_limited: "GitHub rate limited this request. Wait a moment and retry.",
        invalid_state: "The GitHub authorization expired. Start the connection again.",
      };
      setError(messages[status] ?? "GitHub could not finish connecting. Check access and try again.");
      void refreshConnections();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRepositories, refreshConnections]);

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => sort === "name"
    ? a.name.localeCompare(b.name)
    : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [projects, sort]);
  const usableInstallations = installations.filter((row) => row.status === "ACTIVE" && row.canAccess);
  const filteredRepositories = useMemo(() => repositories.filter((repository) => repository.fullName.toLowerCase().includes(repositorySearch.toLowerCase())), [repositories, repositorySearch]);
  const connectionStatus = connectionLoading ? "loading" : connectionError ? "error" : usableInstallations.length ? "connected" : installations.length ? "authorization-required" : "disconnected";

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { name: String(form.get("name")), description: String(form.get("description") || "") };
    try {
      if (editing) await apiFetch(`/projects/${editing.id}`, { method: "PATCH", body: JSON.stringify(input) });
      else await apiFetch("/projects", { method: "POST", body: JSON.stringify(input) });
      setProjectDialogOpen(false);
      setEditing(null);
      await loadProjects();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project."); }
  }

  async function removeProject(project: Project) {
    if (!window.confirm(`Delete “${project.name}”? This permanently removes the project and its deployment records.`)) return;
    try { await apiFetch(`/projects/${project.id}`, { method: "DELETE" }); await loadProjects(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete project."); }
  }

  async function openImporter() {
    setImportDialogOpen(true);
    setImportError("");
    setRepositorySearch("");
    setSelectedRepository(null);
    setBranches([]);
    setSelectedBranch("");
    const rows = await refreshConnections();
    const first = rows.find((row) => row.status === "ACTIVE" && row.canAccess);
    setInstallationId(first?.id ?? "");
    if (first) await loadRepositories(first.id);
  }

  async function openConnectionManager() {
    setManageDialogOpen(true);
    await refreshConnections();
  }

  async function chooseRepository(repository: GitHubRepository) {
    setSelectedRepository(repository);
    setProjectName(repository.name);
    setBranches([]);
    setSelectedBranch("");
    setBranchLoading(true);
    setImportError("");
    try {
      const rows = await apiFetch<Branch[]>(`/github/installations/${encodeURIComponent(installationId)}/repositories/${repository.id}/branches`);
      setBranches(rows);
      setSelectedBranch(rows.find((branch) => branch.name === repository.defaultBranch)?.name ?? rows[0]?.name ?? "");
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : "Could not load repository branches."); }
    finally { setBranchLoading(false); }
  }

  async function importRepository() {
    if (!selectedRepository || !selectedBranch || !projectName.trim()) return;
    setImportLoading(true);
    setImportError("");
    try {
      await apiFetch(`/github/installations/${encodeURIComponent(installationId)}/repositories/${selectedRepository.id}/import`, {
        method: "POST", body: JSON.stringify({ projectName: projectName.trim(), branch: selectedBranch }),
      });
      setImportDialogOpen(false);
      setNotice(`${selectedRepository.fullName} imported as ${projectName.trim()}.`);
      await loadProjects();
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : "Could not import this repository."); }
    finally { setImportLoading(false); }
  }

  function beginAuthorization() { window.open(`${API_BASE}/github/installations/start`, "_self"); }
  function installGitHubApp() { window.open(`${API_BASE}/github/installations/install`, "_self"); }

  return (
    <DashboardPageShell breadcrumb="Projects" title="Projects" description="Create, import, and organize projects in your active workspace.">
      {notice && <div role="status" className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
      {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[190px] flex-1 items-center gap-2 rounded-lg border bg-white px-3 dark:bg-zinc-950"><Search className="size-4 text-zinc-400" /><input aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className="w-full bg-transparent text-sm outline-none" /></label>
        <select aria-label="Sort projects" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-xs dark:bg-zinc-950"><option value="updated">Recently updated</option><option value="name">Name</option></select>
        <button onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} className="grid size-10 place-items-center rounded-lg border"><LayoutGrid className="size-4" /></button>
        <button onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} className="grid size-10 place-items-center rounded-lg border"><List className="size-4" /></button>
        <button onClick={() => void openImporter()} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-muted"><GitHubIcon className="size-4" />Import GitHub Repository</button>
        <button onClick={() => { setEditing(null); setProjectDialogOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-xs font-medium text-white dark:bg-white dark:text-zinc-950"><Plus className="size-4" />New Project</button>
      </div>

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 dark:bg-zinc-950" aria-label="GitHub App connection">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-900"><GitHubIcon className="size-4" /></span>
          <div className="min-w-0"><p className="text-sm font-medium">GitHub App</p><p className="text-xs text-zinc-500">
            {connectionStatus === "loading" ? "Checking connection…" : connectionStatus === "error" ? connectionError : connectionStatus === "connected" ? `${usableInstallations.length} authorized account${usableInstallations.length === 1 ? "" : "s"} connected` : connectionStatus === "authorization-required" ? "Installation found; authorize your GitHub identity to continue." : "Connect an existing installation or install the App."}
          </p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void openConnectionManager()} className="h-9 rounded-md border px-3 text-xs">Manage GitHub connection</button>
          <button onClick={beginAuthorization} className="h-9 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950"><Cable className="mr-1 inline size-3.5" />Connect GitHub App</button>
        </div>
      </section>

      {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl border bg-zinc-50 dark:bg-zinc-900" />)}</div>
        : sortedProjects.length ? <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>{sortedProjects.map((project) => (
          <article key={project.id} className={`rounded-xl border bg-white p-4 dark:bg-zinc-950 ${view === "list" ? "flex items-center gap-4" : ""}`}>
            <div className="flex items-start justify-between"><Link href={`/dashboard/projects/${project.id}`} className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><FolderKanban className="size-4" /></span><span className="min-w-0"><b className="block truncate text-sm">{project.name}</b><span className="block truncate text-xs text-zinc-500">{project.repository?.fullName ?? project.slug}</span></span></Link><details className="relative"><summary aria-label={`Actions for ${project.name}`} className="grid size-8 cursor-pointer list-none place-items-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border bg-white p-1 shadow-lg dark:bg-zinc-900"><button onClick={() => { setEditing(project); setProjectDialogOpen(true); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"><Pencil className="size-3" />Edit</button><button onClick={() => void removeProject(project)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Trash2 className="size-3" />Delete</button></div></details></div>
            <p className="mt-4 min-h-8 text-xs text-zinc-500">{project.description || "No description provided."}</p>
            {project.repository && <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-zinc-500"><span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">{project.repository.isPrivate ? <LockKeyhole className="size-3" /> : <Globe2 className="size-3" />}{project.repository.isPrivate ? "Private" : "Public"}</span>{project.repository.language && <span className="rounded-full border px-2 py-1">{project.repository.language}</span>}{project.repository.selectedBranch && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1"><GitBranch className="size-3" />{project.repository.selectedBranch}</span>}</div>}
            <div className="mt-3 flex justify-between border-t pt-3 text-[10px] text-zinc-500"><span>{project._count?.deployments ?? 0} deployments</span><span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span></div>
          </article>
        ))}</div>
          : <div className="rounded-xl border border-dashed py-16 text-center"><FolderKanban className="mx-auto size-7 text-zinc-400" /><p className="mt-3 text-sm font-medium">{search ? "No matching projects" : "No projects yet"}</p><p className="mt-1 text-xs text-zinc-500">Create a project or import an accessible GitHub repository.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => { setEditing(null); setProjectDialogOpen(true); }} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs"><Plus className="size-3" />New Project</button><button onClick={() => void openImporter()} className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950"><GitHubIcon className="size-3" />Import Repository</button></div></div>}

      <Dialog open={projectDialogOpen} onOpenChange={(value) => { setProjectDialogOpen(value); if (!value) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit project" : "Create project"}</DialogTitle><DialogDescription>Project data is stored in {activeWorkspace?.name ?? "your workspace"}.</DialogDescription></DialogHeader><form id="project-form" onSubmit={saveProject} className="space-y-4"><label className="block text-xs font-medium">Project name<input required name="name" maxLength={80} defaultValue={editing?.name ?? ""} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" /></label><label className="block text-xs font-medium">Description<textarea name="description" maxLength={500} defaultValue={editing?.description ?? ""} className="mt-2 min-h-24 w-full rounded-md border bg-background p-3 text-sm" /></label></form><DialogFooter><button form="project-form" className="h-9 rounded-md bg-zinc-950 px-4 text-xs text-white dark:bg-white dark:text-zinc-950">{editing ? "Save changes" : "Create project"}</button></DialogFooter></DialogContent></Dialog>

      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Manage GitHub connection</DialogTitle><DialogDescription>Review App installations linked to {activeWorkspace?.name ?? "this workspace"}. Connect authorizes the signed-in GitHub identity without reinstalling the App.</DialogDescription></DialogHeader>
        {connectionLoading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking connections…</div> : connectionError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{connectionError}</div> : installations.length ? <div className="space-y-2">{installations.map((installation) => <div key={installation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{installation.accountLogin} <span className="text-xs font-normal text-muted-foreground">{installation.accountType.toLowerCase()}</span></p><p className="mt-1 text-xs text-muted-foreground">{installation.status === "ACTIVE" ? installation.repositorySelection === "ALL" ? "All repositories" : "Selected repositories" : installation.status.toLowerCase()}</p></div><span className={`inline-flex items-center gap-1 text-xs ${installation.canAccess && installation.status === "ACTIVE" ? "text-emerald-700" : "text-amber-700"}`}>{installation.canAccess && installation.status === "ACTIVE" ? <><CircleCheck className="size-4" />Connected</> : <><CircleAlert className="size-4" />Authorization required</>}</span></div>)}</div> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No GitHub App installations are linked to this workspace yet.</div>}
        <div className="flex flex-wrap gap-2"><button onClick={() => void refreshConnections()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs"><RefreshCw className="size-3.5" />Refresh status</button><button onClick={beginAuthorization} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs"><Cable className="size-3.5" />Connect existing installation</button><button onClick={installGitHubApp} className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950"><ArrowUpRight className="size-3.5" />Install a new App</button></div>
      </DialogContent></Dialog>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><GitHubIcon className="size-5" />Import a GitHub repository</DialogTitle><DialogDescription>Repositories are fetched from GitHub using the selected, verified App installation.</DialogDescription></DialogHeader>
        {connectionLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading GitHub connection status…</div>
          : connectionError ? <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-800"><p>{connectionError}</p><button onClick={() => void openImporter()} className="h-9 rounded-md border border-red-300 px-3 text-xs">Retry</button></div>
            : !usableInstallations.length ? <div className="rounded-xl border border-dashed p-8 text-center"><GitHubIcon className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{installations.length ? "Authorize the existing installation" : "No connected GitHub installation"}</p><p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">{installations.length ? "Connect with the GitHub identity that has access to this installation. The App will not be reinstalled." : "Connect an App already installed for your GitHub account, or install a new App."}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={beginAuthorization} className="h-9 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950">Connect GitHub App</button><button onClick={installGitHubApp} className="h-9 rounded-md border px-3 text-xs">Install a new App</button></div></div>
              : <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">GitHub account<select aria-label="GitHub account" value={installationId} onChange={(event) => { setInstallationId(event.target.value); void loadRepositories(event.target.value); }} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm">{usableInstallations.map((row) => <option key={row.id} value={row.id}>{row.accountLogin} · {row.accountType.toLowerCase()}</option>)}</select></label><div className="text-xs"><span className="font-medium">Repository access</span><p className="mt-1.5 rounded-md border px-3 py-2 text-muted-foreground">{installations.find((row) => row.id === installationId)?.repositorySelection === "ALL" ? "All repositories" : "Selected repositories"}</p></div></div>
                <label className="flex h-10 items-center gap-2 rounded-md border px-3"><Search className="size-4 text-muted-foreground" /><input aria-label="Search repositories" value={repositorySearch} onChange={(event) => setRepositorySearch(event.target.value)} placeholder="Search accessible repositories" className="w-full bg-transparent text-sm outline-none" /></label>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">{repositoryLoading ? <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Fetching repositories from GitHub…</div> : filteredRepositories.length ? filteredRepositories.map((repository) => <button disabled={repository.imported} onClick={() => void chooseRepository(repository)} key={repository.id} className={`flex w-full items-start justify-between gap-3 rounded-md p-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 ${selectedRepository?.id === repository.id ? "bg-muted" : ""}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{repository.fullName}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">{repository.private ? <span className="inline-flex items-center gap-1"><LockKeyhole className="size-3" />Private</span> : <span className="inline-flex items-center gap-1"><Globe2 className="size-3" />Public</span>}{repository.language && <span>{repository.language}</span>}<span className="inline-flex items-center gap-1"><GitBranch className="size-3" />{repository.defaultBranch}</span></span></span>{repository.imported ? <span className="shrink-0 text-[10px] text-muted-foreground">Already imported</span> : selectedRepository?.id === repository.id ? <span className="shrink-0 text-[10px] text-blue-600">Selected</span> : null}</button>) : <p className="p-8 text-center text-xs text-muted-foreground">{repositories.length ? "No repositories match your search." : "No repositories are available through this installation."}</p>}</div>
                {selectedRepository && <div className="grid gap-3 border-t pt-4 sm:grid-cols-2"><label className="text-xs font-medium">Project name<input aria-label="Project name" value={projectName} maxLength={80} onChange={(event) => setProjectName(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" /></label><label className="text-xs font-medium">Branch{branchLoading ? <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md border px-3 font-normal text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Loading branches…</span> : <select aria-label="Branch" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm">{branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? " · protected" : ""}</option>)}</select>}</label></div>}
              </div>}
        {importError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{importError}</p>}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><button onClick={() => setImportDialogOpen(false)} className="h-9 rounded-md border px-4 text-xs">Cancel</button>{usableInstallations.length > 0 && <button disabled={!selectedRepository || !selectedBranch || branchLoading || importLoading || !projectName.trim()} onClick={() => void importRepository()} className="h-9 rounded-md bg-zinc-950 px-4 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{importLoading ? "Importing…" : "Import project"}</button>}</DialogFooter>
      </DialogContent></Dialog>
    </DashboardPageShell>
  );
}
