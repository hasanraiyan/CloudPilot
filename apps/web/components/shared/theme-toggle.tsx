"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className={
          compact
            ? "grid size-8 place-items-center rounded-md text-zinc-500"
            : "grid size-9 place-items-center rounded-lg border border-zinc-200 text-zinc-600 dark:border-zinc-800"
        }
      >
        <Monitor className="size-4" />
      </button>
    );
  }

  const nextTheme = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <button
      type="button"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      onClick={() => setTheme(nextTheme)}
      className={
        compact
          ? "grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-800 dark:hover:text-white"
          : "grid size-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
      }
    >
      <Icon className="size-4" />
    </button>
  );
}
