"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MessageMarkdown } from "./message-markdown";
import type { PersonaMessage } from "@personaai/react";

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function ReasoningBlock({
  reasoning,
  className,
}: {
  reasoning: PersonaMessage;
  className?: string;
}) {
  const isStreaming = !!reasoning.isStreaming;
  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  const open = manualOpen ?? isStreaming;

  const [mountedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!isStreaming) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isStreaming]);

  const liveElapsed = formatElapsed(Math.max(0, now - mountedAt));
  const hasContent = !!reasoning.content?.trim();

  return (
    <div
      className={cn(
        "max-w-full select-text text-muted-foreground",
        !open && "-mb-0.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        aria-expanded={open}
        className="group flex cursor-pointer select-none items-center py-0.5 text-xs font-medium text-foreground/90 transition-colors hover:text-foreground focus-visible:outline-none"
      >
        <span className="text-xs font-medium text-foreground/90 transition-colors group-hover:text-foreground">
          {isStreaming ? (
            <span className="inline-flex items-center gap-1">
              <span>Thinking</span>
              <span className="animate-pulse">…</span>
            </span>
          ) : hasContent ? (
            "Thoughts"
          ) : (
            "Thinking"
          )}
        </span>
      </button>

      {open ? (
        <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
          {hasContent ? (
            <MessageMarkdown
              muted
              content={reasoning.content}
              className="text-[11px] leading-relaxed [&_p]:my-1.5"
            />
          ) : (
            <span className="text-[11px] text-muted-foreground/70">
              {isStreaming ? `Started ${liveElapsed} ago` : "No reasoning captured."}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
