"use client";

import { Bot, X } from "lucide-react";
import type { ReactNode } from "react";
import { useAssistantUi } from "./assistant-provider";
import { AssistantPanel } from "./assistant-panel";

export function AssistantShell({ children }: { children: ReactNode }) {
  const { isOpen, toggleOpen, layoutMode } = useAssistantUi();
  const showDockedSide = isOpen && layoutMode === "side";
  const showFloating = isOpen && layoutMode === "fab";

  return (
    <div className="flex min-w-0 flex-1">
      {/* Main page content (left side when docked) */}
      <div className="min-w-0 flex-1">{children}</div>

      {/* Docked right-side split panel on desktop */}
      {showDockedSide && (
        <aside
          aria-label="CloudPilot AI Assistant side panel"
          className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[390px] xl:w-[430px] lg:shrink-0 lg:border-l lg:border-zinc-200 dark:lg:border-zinc-800"
        >
          <AssistantPanel variant="compact" />
        </aside>
      )}

      {/* Floating popup drawer (FAB mode, or mobile fallback for side mode) */}
      {(showFloating || (isOpen && layoutMode === "side")) && (
        <div
          className={`${
            layoutMode === "side" ? "lg:hidden" : ""
          } fixed bottom-20 right-5 z-40 flex h-[min(640px,calc(100dvh-7rem))] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 shadow-2xl dark:border-zinc-800`}
        >
          <AssistantPanel variant="compact" />
        </div>
      )}

      {/* Floating Action Button (FAB) */}
      {!showDockedSide && (
        <button
          type="button"
          onClick={toggleOpen}
          aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
          className="fixed bottom-5 right-5 z-40 grid size-12 place-items-center rounded-full bg-zinc-950 text-white shadow-lg transition-transform hover:scale-105 dark:bg-white dark:text-zinc-950"
        >
          {isOpen ? <X className="size-5" /> : <Bot className="size-5" />}
        </button>
      )}
    </div>
  );
}
