"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FolderKanban, Plus, Search, LayoutGrid, List, MoreHorizontal, Pencil, Trash2, GitBranch, RefreshCw, LoaderCircle, LockKeyhole, Globe2, GitFork } from "lucide-react";
import Link from "next/link";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { apiFetch, API_BASE } from "@/lib/api";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { GitHubIcon } from "@/components/shared/github-icon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Project = { id: string; name: string; description: string | null; slug: string; updatedAt: string; _count?: { deployments: number }; repository?: { fullName: string | null; selectedBranch: string | null; defaultBranch: string | null; language: string | null; isPrivate: boolean } | null };
type Installation = { id: string; accountLogin: string; accountType: string; repositorySelection: "ALL" | "SELECTED"; status: string; canAccess: boolean };
type GitHubRepository = { id: number; name: string; fullName: string; private: boolean; language: string | null; defaultBranch: string; imported: boolean };
type Branch = { name: string; protected: boolean; commitSha: string };

export default function ProjectsPage() {
  const { activeWorkspace } = useDashboard();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [installationId, setInstallationId] = useState("");
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [projectName, setProjectName] = useState("");
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [branchLoading, setBranchLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProjects(await apiFetch<Project[]>(`/projects?q=${encodeURIComponent(search)}`)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load projects."); }
    finally { setLoading(false); }
  }, [search]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [activeWorkspace?.id, load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("github");
      if (status === "connected") setNotice("GitHub App connected. Choose a repository to import.");
      else if (status === "configuration") setError("GitHub App authorization settings are incomplete. Add the GitHub App client ID, secret, and authorization callback URL to the local environment, then restart the API.");
      else if (status && status !== "invalid_state") setError(status === "identity_conflict" ? "This GitHub identity is linked to another CloudPilot account." : "GitHub could not finish connecting. Check access and try again.");
      if (status) window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const sorted = useMemo(() => [...projects].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [projects, sort]);
  const filteredRepositories = useMemo(() => repositories.filter((repository) => repository.fullName.toLowerCase().includes(repoSearch.toLowerCase())), [repositories, repoSearch]);
  const accessibleInstallations = installations.filter((installation) => installation.status === "ACTIVE" && installation.canAccess);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input = { name: String(form.get("name")), description: String(form.get("description") || "") };
    try { if (editing) await apiFetch(`/projects/${editing.id}`, { method: "PATCH", body: JSON.stringify(input) }); else await apiFetch("/projects", { method: "POST", body: JSON.stringify(input) }); setOpen(false); setEditing(null); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save project."); }
  }
  async function remove(project: Project) {
    if (!window.confirm(`Delete “${project.name}”? This permanently removes the project and its deployment records.`)) return;
    try { await apiFetch(`/projects/${project.id}`, { method: "DELETE" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete project."); }
  }
  async function openImporter() {
    setImportOpen(true); setError(""); setRepoSearch(""); setSelectedRepo(null); setBranches([]); setSelectedBranch("");
    setConnectionLoading(true);
    try {
      const rows = await apiFetch<Installation[]>("/github/installations");
      setInstallations(rows);
      const available = rows.find((row) => row.status === "ACTIVE" && row.canAccess);
      setInstallationId(available?.id ?? "");
      if (available) await loadRepositories(available.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load GitHub connections."); }
    finally { setConnectionLoading(false); }
  }
  async function loadRepositories(id: string) {
    if (!id) { setRepositories([]); return; }
    setRepoLoading(true); setRepositories([]); setSelectedRepo(null); setBranches([]); setSelectedBranch("");
    try { setRepositories(await apiFetch<GitHubRepository[]>(`/github/installations/${encodeURIComponent(id)}/repositories`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load GitHub repositories."); }
    finally { setRepoLoading(false); }
  }
  async function selectRepository(repository: GitHubRepository) {
    setSelectedRepo(repository); setProjectName(repository.name); setBranches([]); setSelectedBranch(""); setBranchLoading(true); setError("");
    try {
      const rows = await apiFetch<Branch[]>(`/github/installations/${encodeURIComponent(installationId)}/repositories/${repository.id}/branches`);
      setBranches(rows);
      const preferred = rows.find((branch) => branch.name === repository.defaultBranch)?.name ?? rows[0]?.name ?? "";
      setSelectedBranch(preferred);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load repository branches."); }
    finally { setBranchLoading(false); }
  }
  async function importRepository() {
    if (!selectedRepo || !selectedBranch || !projectName.trim()) return;
    setImporting(true); setError("");
    try {
      await apiFetch(`/github/installations/${encodeURIComponent(installationId)}/repositories/${selectedRepo.id}/import`, { method: "POST", body: JSON.stringify({ projectName: projectName.trim(), branch: selectedBranch }) });
      setImportOpen(false); setNotice(`${selectedRepo.fullName} imported as ${projectName.trim()}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import this repository."); }
    finally { setImporting(false); }
  }
  function connectGitHub() { window.open(`${API_BASE}/github/installations/start`, "_self"); }

  return <DashboardPageShell breadcrumb="Projects" title="Projects" description="Create, import, and organize projects in your active workspace.">
    {notice && <div role="status" className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <label className="flex h-10 min-w-[190px] flex-1 items-center gap-2 rounded-lg border bg-white px-3 dark:bg-zinc-950"><Search className="size-4 text-zinc-400" /><input aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects" className="w-full bg-transparent text-sm outline-none" /></label>
      <select aria-label="Sort projects" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-lg border bg-white px-3 text-xs dark:bg-zinc-950"><option value="updated">Recently updated</option><option value="name">Name</option></select>
      <button onClick={() => setView("grid")} aria-label="Grid view" aria-pressed={view === "grid"} className="grid size-10 place-items-center rounded-lg border"><LayoutGrid className="size-4" /></button>
      <button onClick={() => setView("list")} aria-label="List view" aria-pressed={view === "list"} className="grid size-10 place-items-center rounded-lg border"><List className="size-4" /></button>
      <button onClick={openImporter} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium hover:bg-muted"><GitHubIcon className="size-4" />Import GitHub Repository</button>
      <button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-950 px-4 text-xs font-medium text-white dark:bg-white dark:text-zinc-950"><Plus className="size-4" />New Project</button>
    </div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 dark:bg-zinc-950">
      <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-zinc-100 dark:bg-zinc-900"><GitHubIcon className="size-4" /></span><div><p className="text-sm font-medium">GitHub App</p><p className="text-xs text-zinc-500">{installations.length ? `${installations.length} connection${installations.length === 1 ? "" : "s"} available` : "Connect an account to import repositories."}</p></div></div>
      <div className="flex gap-2"><button onClick={() => void openImporter()} className="h-9 rounded-md border px-3 text-xs">Manage GitHub connection</button><button onClick={connectGitHub} className="h-9 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950"><GitFork className="mr-1 inline size-3.5" />Connect GitHub App</button></div>
    </div>
    {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30">{error}<button onClick={() => void load()} aria-label="Retry" className="ml-3"><RefreshCw className="size-4" /></button></div>}
    {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-xl border bg-zinc-50 dark:bg-zinc-900" />)}</div> : sorted.length ? <div className={view === "grid" ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>{sorted.map((project) => <article key={project.id} className={`rounded-xl border bg-white p-4 dark:bg-zinc-950 ${view === "list" ? "flex items-center gap-4" : ""}`}><div className="flex items-start justify-between"><Link href={`/dashboard/projects/${project.id}`} className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><FolderKanban className="size-4" /></span><span className="min-w-0"><b className="block truncate text-sm">{project.name}</b><span className="block truncate text-xs text-zinc-500">{project.repository?.fullName ?? project.slug}</span></span></Link><details className="relative"><summary aria-label={`Actions for ${project.name}`} className="grid size-8 cursor-pointer list-none place-items-center rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"><MoreHorizontal className="size-4" /></summary><div className="absolute right-0 z-10 mt-1 w-32 rounded-lg border bg-white p-1 shadow-lg dark:bg-zinc-900"><button onClick={() => { setEditing(project); setOpen(true); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"><Pencil className="size-3" />Edit</button><button onClick={() => void remove(project)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-xs text-red-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"><Trash2 className="size-3" />Delete</button></div></details></div><p className="mt-4 min-h-8 text-xs text-zinc-500">{project.description || "No description provided."}</p>{project.repository && <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-zinc-500"><span className="inline-flex items-center gap-1 rounded-full border px-2 py-1">{project.repository.isPrivate ? <LockKeyhole className="size-3" /> : <Globe2 className="size-3" />}{project.repository.isPrivate ? "Private" : "Public"}</span>{project.repository.language && <span className="rounded-full border px-2 py-1">{project.repository.language}</span>}{project.repository.selectedBranch && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1"><GitBranch className="size-3" />{project.repository.selectedBranch}</span>}</div>}<div className="mt-3 flex justify-between border-t pt-3 text-[10px] text-zinc-500"><span>{project._count?.deployments ?? 0} deployments</span><span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span></div></article>)}</div> : <div className="rounded-xl border border-dashed py-16 text-center"><FolderKanban className="mx-auto size-7 text-zinc-400" /><p className="mt-3 text-sm font-medium">{search ? "No matching projects" : "No projects yet"}</p><p className="mt-1 text-xs text-zinc-500">Create a project or import an accessible GitHub repository.</p><div className="mt-4 flex justify-center gap-2"><button onClick={() => { setEditing(null); setOpen(true); }} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs"><Plus className="size-3" />New Project</button><button onClick={openImporter} className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950"><GitHubIcon className="size-3" />Import Repository</button></div></div>}

    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>{editing ? "Edit project" : "Create project"}</DialogTitle><DialogDescription>Project data is stored in {activeWorkspace?.name ?? "your workspace"}.</DialogDescription></DialogHeader><form id="project-form" onSubmit={save} className="space-y-4"><label className="block text-xs font-medium">Project name<input required name="name" maxLength={80} defaultValue={editing?.name ?? ""} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" /></label><label className="block text-xs font-medium">Description<textarea name="description" maxLength={500} defaultValue={editing?.description ?? ""} className="mt-2 min-h-24 w-full rounded-md border bg-background p-3 text-sm" /></label></form><DialogFooter><button form="project-form" className="h-9 rounded-md bg-zinc-950 px-4 text-xs text-white dark:bg-white dark:text-zinc-950">{editing ? "Save changes" : "Create project"}</button></DialogFooter></DialogContent></Dialog>

    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><GitHubIcon className="size-5" />Import a GitHub repository</DialogTitle><DialogDescription>CloudPilot only lists repositories accessible to the selected GitHub App installation.</DialogDescription></DialogHeader>
      {connectionLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading GitHub connections…</div> : !accessibleInstallations.length ? <div className="rounded-xl border border-dashed p-8 text-center"><GitHubIcon className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No authorized GitHub connection</p><p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Connect the GitHub App, then approve your GitHub identity so CloudPilot can verify installation access.</p>{installations.length > 0 && <p className="mt-2 text-xs text-amber-700">A workspace member connected the installation. Continue with that authorized CloudPilot and GitHub identity.</p>}<button onClick={connectGitHub} className="mt-4 h-9 rounded-md bg-zinc-950 px-3 text-xs text-white dark:bg-white dark:text-zinc-950">Connect GitHub App</button></div> : <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">GitHub account<select aria-label="GitHub account" value={installationId} onChange={(event) => { setInstallationId(event.target.value); void loadRepositories(event.target.value); }} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm">{accessibleInstallations.map((item) => <option key={item.id} value={item.id}>{item.accountLogin} · {item.accountType.toLowerCase()}</option>)}</select></label><div className="text-xs"><span className="font-medium">Repository access</span><p className="mt-1.5 rounded-md border px-3 py-2 text-muted-foreground">{installations.find((item) => item.id === installationId)?.repositorySelection === "ALL" ? "All repositories" : "Selected repositories"}</p></div></div>
        <label className="flex h-10 items-center gap-2 rounded-md border px-3"><Search className="size-4 text-muted-foreground" /><input aria-label="Search repositories" value={repoSearch} onChange={(event) => setRepoSearch(event.target.value)} placeholder="Search accessible repositories" className="w-full bg-transparent text-sm outline-none" /></label>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1">{repoLoading ? <div className="flex items-center justify-center gap-2 p-8 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Fetching repositories from GitHub…</div> : filteredRepositories.length ? filteredRepositories.map((repository) => <button disabled={repository.imported} onClick={() => void selectRepository(repository)} key={repository.id} className={`flex w-full items-start justify-between gap-3 rounded-md p-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 ${selectedRepo?.id === repository.id ? "bg-muted" : ""}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{repository.fullName}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">{repository.private ? <span className="inline-flex items-center gap-1"><LockKeyhole className="size-3" />Private</span> : <span className="inline-flex items-center gap-1"><Globe2 className="size-3" />Public</span>}{repository.language && <span>{repository.language}</span>}<span className="inline-flex items-center gap-1"><GitBranch className="size-3" />{repository.defaultBranch}</span></span></span>{repository.imported ? <span className="shrink-0 text-[10px] text-muted-foreground">Already imported</span> : selectedRepo?.id === repository.id ? <span className="shrink-0 text-[10px] text-blue-600">Selected</span> : null}</button>) : <p className="p-8 text-center text-xs text-muted-foreground">{repositories.length ? "No repositories match your search." : "No repositories are available through this installation."}</p>}</div>
        {selectedRepo && <div className="grid gap-3 border-t pt-4 sm:grid-cols-2"><label className="text-xs font-medium">Project name<input aria-label="Project name" value={projectName} maxLength={80} onChange={(event) => setProjectName(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm" /></label><label className="text-xs font-medium">Branch{branchLoading ? <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md border px-3 font-normal text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Loading branches…</span> : <select aria-label="Branch" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm">{branches.map((branch) => <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? " · protected" : ""}</option>)}</select>}</label></div>}
      </div>}
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row"><button onClick={() => setImportOpen(false)} className="h-9 rounded-md border px-4 text-xs">Cancel</button>{accessibleInstallations.length > 0 && <button disabled={!selectedRepo || !selectedBranch || branchLoading || importing || !projectName.trim()} onClick={() => void importRepository()} className="h-9 rounded-md bg-zinc-950 px-4 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{importing ? "Importing…" : "Import project"}</button>}</DialogFooter>
    </DialogContent></Dialog>
  </DashboardPageShell>;
}
