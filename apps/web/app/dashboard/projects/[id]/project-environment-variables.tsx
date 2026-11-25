"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";

const environments = { DEVELOPMENT: "Development", PREVIEW: "Preview", PRODUCTION: "Production", STAGING: "Staging" } as const;
type Environment = keyof typeof environments;
type Variable = { id: string; key: string; environment: Environment; updatedAt: string };
type Action = { kind: "create" } | { kind: "replace" | "delete"; variable: Variable };
const inputClass = "h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";

export function EnvironmentVariables({ projectId }: { projectId: string }) {
  const { activeWorkspace } = useDashboard();
  const client = useQueryClient();
  const [scope, setScope] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const canManage = activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "ADMIN";
  const path = `/projects/${encodeURIComponent(projectId)}/environment-variables`;
  const queryPrefix = ["environment-variables", activeWorkspace?.id, projectId];
  const variables = useQuery({
    queryKey: [...queryPrefix, scope],
    enabled: Boolean(activeWorkspace),
    queryFn: () => apiFetch<{ variables: Variable[]; count: number }>(scope ? `${path}?environment=${encodeURIComponent(scope)}` : path),
  });
  async function submit(form: FormData) {
    if (!action || pending) return;
    setError("");
    setPending(true);
    try {
      if (action.kind === "delete") {
        await apiFetch(`${path}/${action.variable.id}`, { method: "DELETE" });
      } else {
        const body = action.kind === "create"
          ? { key: form.get("key"), environment: form.get("environment"), value: form.get("value") }
          : { value: form.get("value") };
        await apiFetch(action.kind === "create" ? path : `${path}/${action.variable.id}`, {
          method: action.kind === "create" ? "POST" : "PATCH",
          body: JSON.stringify(body),
        });
      }
      setFeedback(action.kind === "delete" ? "Variable deleted." : action.kind === "replace" ? "Value replaced." : "Variable added.");
      if (action.kind === "delete") trigger.current = searchInput.current;
      setAction(null);
      await client.invalidateQueries({ queryKey: queryPrefix });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The request failed.");
    } finally {
      setPending(false);
    }
  }
  const open = (next: Action, button: HTMLElement) => {
    trigger.current = button;
    setAction(next);
    setFeedback("");
    setError("");
  };
  const rows = variables.data?.variables.filter(({ key }) => key.toLowerCase().includes(search.trim().toLowerCase())) ?? [];

  return <Card>
    <CardHeader className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><CardTitle>Environment variables</CardTitle><CardDescription>{variables.data ? `${variables.data.count} configured in ${scope ? environments[scope as Environment] : "all environments"}` : "Manage deployment settings and secrets."}</CardDescription></div>
        {canManage && <Button onClick={(event) => open({ kind: "create" }, event.currentTarget)}>Add Variable</Button>}
      </div>
    </CardHeader>
    <CardContent className="space-y-3 pt-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium">Search names<input ref={searchInput} className={inputClass} type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="space-y-1 text-xs font-medium">Environment<select className={inputClass} value={scope} onChange={(event) => setScope(event.target.value)}><option value="">All environments</option>{Object.entries(environments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {feedback && <p role="status" className="text-sm">{feedback}</p>}
      {variables.isPending && <p role="status" className="text-sm text-muted-foreground">Loading variables…</p>}
      {variables.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{variables.error.message}<Button size="sm" variant="outline" onClick={() => void variables.refetch()}>Retry</Button></div>}
      {variables.isSuccess && (rows.length ? <ul className="divide-y border-y">{rows.map((variable) => <li key={variable.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0"><p className="font-mono text-sm break-all">{variable.key}</p><p className="text-xs text-muted-foreground">{environments[variable.environment]} · Updated {new Date(variable.updatedAt).toLocaleDateString()}</p></div>
        {canManage && <div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={(event) => open({ kind: "replace", variable }, event.currentTarget)}>Replace value</Button><Button size="sm" variant="ghost" onClick={(event) => open({ kind: "delete", variable }, event.currentTarget)}>Delete</Button></div>}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No matching variables.</p>)}
    </CardContent>
    <Dialog open={Boolean(action)} onOpenChange={(isOpen) => { if (!isOpen && !pending) setAction(null); }}>
      {action && <DialogContent onCloseAutoFocus={(event) => {
        event.preventDefault();
        (trigger.current?.isConnected ? trigger.current : searchInput.current)?.focus();
      }}>
        <DialogTitle>{action.kind === "create" ? "Add Variable" : action.kind === "replace" ? "Replace value" : "Delete variable"}</DialogTitle>
        <DialogDescription className="break-all">{action.kind === "create" ? "The value is encrypted when saved." : `${action.variable.key} · ${environments[action.variable.environment]}`}</DialogDescription>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          void submit(new FormData(event.currentTarget));
        }}>
          {action.kind === "create" && <>
            <label className="block space-y-1 text-sm">Name<input className={inputClass} name="key" required maxLength={128} pattern="[A-Za-z_][A-Za-z0-9_]*" title="Start with a letter or underscore and use letters, digits or underscores." /></label>
            <label className="block space-y-1 text-sm">Environment<select name="environment" className={inputClass} defaultValue={scope || "DEVELOPMENT"}>{Object.entries(environments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </>}
          {action.kind === "delete" ? <p className="text-sm">Delete this variable from its environment?</p> : <label className="block space-y-1 text-sm">Secret value<input className={inputClass} name="value" type="password" autoComplete="new-password" maxLength={16384} /></label>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setAction(null)}>Cancel</Button>
            <Button type="submit" disabled={pending} variant={action.kind === "delete" ? "destructive" : "default"}>{pending ? "Working…" : action.kind === "delete" ? "Delete variable" : "Save variable"}</Button>
          </div>
        </form>
      </DialogContent>}
    </Dialog>
  </Card>;
}
