"use client";

import { PersonaProvider } from "@personaai/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CloudPilotFrontendTools } from "./frontend-tools";

export type AssistantLayoutMode = "fab" | "side";

type AssistantUiContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  layoutMode: AssistantLayoutMode;
  setLayoutMode: (mode: AssistantLayoutMode) => void;
  toggleLayoutMode: () => void;
  activeThreadId: string | undefined;
  setActiveThreadId: (id: string | undefined) => void;
  configured: boolean;
  agentId: string | null;
  tools: string[];
};

const AssistantUiContext = createContext<AssistantUiContextValue | null>(null);
const LAYOUT_STORAGE_KEY = "cloudpilot.assistant.layoutMode";

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [layoutMode, setLayoutModeState] = useState<AssistantLayoutMode>("fab");
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>(undefined);
  const [config, setConfig] = useState<{
    configured: boolean;
    agentId: string | null;
    tools: string[];
  }>({ configured: false, agentId: null, tools: [] });

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved === "fab" || saved === "side") {
        setLayoutModeState(saved);
      }
    } catch {
      // ignore storage access issues
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assistant/config", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { data?: { configured?: boolean; agentId?: string | null; tools?: string[] } } | null) => {
        if (cancelled || !payload?.data) return;
        setConfig({
          configured: Boolean(payload.data.configured),
          agentId: payload.data.agentId ?? null,
          tools: Array.isArray(payload.data.tools) ? payload.data.tools : [],
        });
      })
      .catch(() => {
        // leave unconfigured state
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLayoutMode = useCallback((mode: AssistantLayoutMode) => {
    setLayoutModeState(mode);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);

  const toggleOpen = useCallback(() => setIsOpen((v) => !v), []);
  const toggleLayoutMode = useCallback(() => {
    setLayoutMode(layoutMode === "fab" ? "side" : "fab");
  }, [layoutMode, setLayoutMode]);

  const uiValue = useMemo<AssistantUiContextValue>(
    () => ({
      isOpen,
      setIsOpen,
      toggleOpen,
      layoutMode,
      setLayoutMode,
      toggleLayoutMode,
      activeThreadId,
      setActiveThreadId,
      configured: config.configured,
      agentId: config.agentId,
      tools: config.tools,
    }),
    [isOpen, toggleOpen, layoutMode, setLayoutMode, toggleLayoutMode, activeThreadId, config],
  );

  return (
    <PersonaProvider baseUrl="/api/assistant" defaultAgentId={config.agentId ?? undefined}>
      <AssistantUiContext.Provider value={uiValue}>
        <CloudPilotFrontendTools />
        {children}
      </AssistantUiContext.Provider>
    </PersonaProvider>
  );
}

export function useAssistantUi() {
  const ctx = useContext(AssistantUiContext);
  if (!ctx) throw new Error("useAssistantUi must be used inside AssistantProvider");
  return ctx;
}
