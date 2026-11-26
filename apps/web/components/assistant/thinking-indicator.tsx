"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const CLAUDE_SPINNER_BASE = ["·", "✢", "*", "✶", "✻", "✽"];
const CLAUDE_SPINNER_FRAMES = [
  ...CLAUDE_SPINNER_BASE,
  ...[...CLAUDE_SPINNER_BASE].reverse(),
];

export function ThinkingIndicator({ className }: { className?: string }) {
  const [frame, setFrame] = React.useState(0);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % CLAUDE_SPINNER_FRAMES.length),
      120,
    );
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const start = Date.now();
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Thinking"
      className={cn(
        "inline-flex select-none items-center gap-2 py-2 text-xs leading-none text-muted-foreground",
        className,
      )}
    >
      <span className="w-4 text-center font-mono text-sm text-foreground" aria-hidden>
        {CLAUDE_SPINNER_FRAMES[frame]}
      </span>
      <span className="font-medium tracking-tight">
        Thinking
        {elapsed > 2 ? ` · ${elapsed}s` : <span className="animate-pulse">…</span>}
      </span>
    </div>
  );
}
