"use client";

import type { PersonaThread } from "@personaai/react";
import { MessageSquarePlus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ThreadsSidebar({
  open,
  variant,
  threads,
  activeThreadId,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}: {
  open: boolean;
  variant: "compact" | "full";
  threads: PersonaThread[];
  activeThreadId?: string;
  isLoading: boolean;
  onSelect: (threadId: string) => void;
  onCreate: () => void;
  onDelete: (threadId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      (t.title || `Thread ${t._id.slice(-6)}`).toLowerCase().includes(q),
    );
  }, [threads, query]);

  if (!open) return null;

  const isOverlayOnly = variant === "compact";

  return (
    <>
      {/* Backdrop for mobile (full) or compact overlay */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 z-20 bg-black/30 backdrop-blur-[1px] ${
          isOverlayOnly ? "block" : "block md:hidden"
        }`}
      />

      <aside
        aria-label="Assistant threads"
        className={`flex shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 ${
          isOverlayOnly
            ? "absolute inset-y-0 left-0 z-30 w-72 max-w-[85%] shadow-2xl"
            : "absolute inset-y-0 left-0 z-30 w-72 max-w-[82%] shadow-2xl md:static md:z-auto md:w-64 md:max-w-none md:bg-zinc-50/70 md:shadow-none dark:md:bg-zinc-900/40"
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            Threads ({threads.length})
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
            >
              <MessageSquarePlus className="size-3.5" />
              New
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close threads"
              className={`grid size-6 place-items-center rounded-md text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 ${
                isOverlayOnly ? "grid" : "grid md:hidden"
              }`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-200 p-2 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
            <Search className="size-3.5 shrink-0 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search threads…"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {isLoading && threads.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">Loading threads…</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-zinc-500">
              {query ? "No matching threads." : "No threads yet."}
            </p>
          ) : (
            filtered.map((t) => {
              const selected = t._id === activeThreadId;
              const time = formatRelativeTime(t.updatedAt || t.createdAt);
              return (
                <div
                  key={t._id}
                  className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                    selected
                      ? "bg-zinc-200/80 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-white"
                      : "text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(t._id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate">{t.title || `Thread ${t._id.slice(-6)}`}</p>
                    {time && (
                      <p className="mt-0.5 truncate font-mono text-[10px] font-normal text-zinc-400">
                        {time}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(t._id)}
                    aria-label="Delete thread"
                    title="Delete thread"
                    className="grid size-6 shrink-0 place-items-center rounded text-zinc-400 opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}
