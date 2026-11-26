"use client";

import type { PersonaMcpConnection } from "@personaai/react";
import { ExternalLink, KeyRound, X } from "lucide-react";

const STATUS_HINTS: Partial<Record<NonNullable<PersonaMcpConnection["status"]>, string>> = {
  needs_auth: "Access was revoked or expired",
  expired: "Your sign-in expired",
  not_connected: "Hasn't been connected yet",
};

export function McpConnectBanner({
  connections,
  blockedMcpIds,
  onConnect,
}: {
  connections: PersonaMcpConnection[];
  blockedMcpIds?: ReadonlySet<string>;
  onConnect: (connection: PersonaMcpConnection) => void;
}) {
  if (connections.length === 0) return null;
  const blocked = connections.some((c) => blockedMcpIds?.has(c.mcpId));

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-3 mb-2 overflow-hidden rounded-xl border border-zinc-200 bg-white text-xs dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-start gap-2.5 border-b border-zinc-200 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
          <KeyRound className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
            {blocked ? "Some tools were skipped in this reply" : "Connect accounts to unlock more tools"}
          </p>
          <p className="text-[11px] text-zinc-500">
            {blocked
              ? "This assistant can't use these MCP tools until you connect your account."
              : "Connect your CloudPilot MCP account to enable workspace tools."}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {connections.map((c) => {
          const hint = STATUS_HINTS[c.status ?? "not_connected"];
          const needsReconnect = c.status === "needs_auth" || c.status === "expired";
          return (
            <li key={c.mcpId} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
                {hint && <p className="truncate text-[11px] text-zinc-500">{hint}</p>}
              </div>
              <button
                type="button"
                disabled={!c.authorizeUrl}
                onClick={() => onConnect(c)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  needsReconnect
                    ? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950"
                    : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {needsReconnect ? "Reconnect" : "Connect"}
                <ExternalLink className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function McpConnectionNotice({
  message,
  kind,
  onDismiss,
}: {
  message: string;
  kind: "success" | "error";
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className={`mx-3 mt-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
        kind === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
      }`}
    >
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notice" className="opacity-70 hover:opacity-100">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
