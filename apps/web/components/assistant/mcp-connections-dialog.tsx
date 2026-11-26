"use client";

import type { PersonaMcpConnection } from "@personaai/react";
import { ExternalLink, Plug, Unplug } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type McpStatus = NonNullable<PersonaMcpConnection["status"]>;

const STATUS_LABELS: Record<McpStatus, string> = {
  connected: "Connected",
  expired: "Expired",
  needs_auth: "Needs auth",
  not_connected: "Not connected",
};

const STATUS_DOTS: Record<McpStatus, string> = {
  connected: "bg-emerald-500",
  expired: "bg-red-500",
  needs_auth: "bg-red-500",
  not_connected: "bg-zinc-400",
};

function statusOf(connection: PersonaMcpConnection): McpStatus {
  return connection.status ?? (connection.connected ? "connected" : "not_connected");
}

function formatExpiry(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Expires ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function McpConnectionsDialog({
  open,
  onOpenChange,
  connections,
  onConnect,
  onRevoke,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: PersonaMcpConnection[];
  onConnect: (connection: PersonaMcpConnection) => void;
  onRevoke: (mcpId: string) => Promise<void>;
  isLoading?: boolean;
}) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRevoke = async (mcpId: string) => {
    setRevokingId(mcpId);
    setError(null);
    try {
      await onRevoke(mcpId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect MCP.");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Plug className="size-4 text-zinc-500" />
            MCP Connections
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Connect or revoke per-user OAuth MCP tools for this assistant.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 divide-y divide-zinc-200 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden dark:divide-zinc-800">
          {isLoading && connections.length === 0 ? (
            <p className="p-4 text-xs text-zinc-500">Loading MCP connections…</p>
          ) : connections.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-500">
              No user-mode OAuth MCP connectors are attached to this agent.
            </div>
          ) : (
            connections.map((c) => {
              const status = statusOf(c);
              const expiry = formatExpiry(c.expiresAt);
              const initial = c.name.trim().charAt(0).toUpperCase() || "?";
              return (
                <div key={c.mcpId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      {initial}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{c.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <span className={`size-1.5 rounded-full ${STATUS_DOTS[status]}`} />
                        <span>{STATUS_LABELS[status]}</span>
                        {expiry && <span>· {expiry}</span>}
                      </div>
                    </div>
                  </div>

                  {status === "connected" ? (
                    <button
                      type="button"
                      disabled={revokingId === c.mcpId}
                      onClick={() => void handleRevoke(c.mcpId)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      <Unplug className="size-3" />
                      {revokingId === c.mcpId ? "Revoking…" : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!c.authorizeUrl}
                      onClick={() => onConnect(c)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-950"
                    >
                      {status === "needs_auth" || status === "expired" ? "Reconnect" : "Connect"}
                      <ExternalLink className="size-3" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
