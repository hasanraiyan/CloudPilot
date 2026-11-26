"use client";

import * as React from "react";
import { AlertCircle, ChevronDown, Loader2, Wrench } from "lucide-react";
import { useRenderToolCall, type PersonaToolCall } from "@personaai/react";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  cloudpilot_list_projects: "Listing projects",
  cloudpilot_get_project: "Reading project details",
  cloudpilot_list_env_keys: "Listing environment keys",
  cloudpilot_list_deployments: "Listing deployments",
  navigate_to_page: "Navigating to page",
  open_project_section: "Opening project section",
  get_current_context: "Reading current context",
  write_todos: "Planning next steps",
  web_search: "Searching the web",
  search_web: "Searching the web",
};

function humanizeToolName(name: string): string {
  // Strip MCP server prefix if present (e.g. "cloudpilot__cloudpilot_list_projects")
  const base = name.includes("__") ? name.split("__").pop() ?? name : name;
  return (
    TOOL_LABELS[base] ??
    base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatJson(raw: string | undefined): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function RequestResponseBlock({
  label,
  text,
  isError = false,
}: {
  label: string;
  text: string | undefined;
  isError?: boolean;
}) {
  if (!text || !text.trim()) return null;
  const formatted = formatJson(text);

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <pre
        className={cn(
          "max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border px-2.5 py-2 font-mono text-[11px] leading-relaxed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isError
            ? "border-red-200 bg-red-50/70 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300",
        )}
      >
        {formatted}
      </pre>
    </div>
  );
}

export function ToolCallCard({ toolCall }: { toolCall: PersonaToolCall }) {
  const renderToolCall = useRenderToolCall();
  const customUi = renderToolCall(toolCall);
  const [open, setOpen] = React.useState(false);

  if (customUi) {
    return <div className="w-full p-px">{customUi}</div>;
  }

  const isError = !!toolCall.isError;
  const isPending = toolCall.result === undefined && !isError;
  const label = humanizeToolName(toolCall.toolName);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border bg-white text-xs dark:bg-zinc-950",
        isError
          ? "border-red-300 dark:border-red-900/60"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded border border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {isError ? (
            <AlertCircle className="size-3.5 text-red-500" />
          ) : isPending ? (
            <Loader2 className="size-3.5 animate-spin text-blue-600 dark:text-blue-400" />
          ) : (
            <Wrench className="size-3.5" />
          )}
        </span>

        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            isError ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100",
          )}
        >
          {label}
          {isPending ? "…" : ""}
        </span>

        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-zinc-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-2.5 border-t border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <RequestResponseBlock label="Input" text={toolCall.args} />
          <RequestResponseBlock label="Result" text={toolCall.result} isError={isError} />
        </div>
      )}
    </div>
  );
}
