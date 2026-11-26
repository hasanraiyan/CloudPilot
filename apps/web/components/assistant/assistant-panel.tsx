"use client";

import {
  buildMessageTimeline,
  useChat,
  useFeedback,
  useMcpConnections,
  useThreads,
  type PersonaFeedbackScore,
  type PersonaMcpConnection,
  type PersonaMessage,
} from "@personaai/react";
import {
  Bot,
  Check,
  Copy,
  MessageSquarePlus,
  PanelRight,
  PictureInPicture2,
  Plug,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  X,
  MessagesSquare,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAssistantUi } from "./assistant-provider";
import { ChatComposer } from "./chat-composer";
import { groupReasoning } from "./message-grouping";
import { MessageMarkdown } from "./message-markdown";
import { McpConnectBanner } from "./mcp-connect-banner";
import { McpConnectionsDialog } from "./mcp-connections-dialog";
import { ReasoningBlock } from "./reasoning-block";
import { ThinkingIndicator } from "./thinking-indicator";
import { ThreadsSidebar } from "./threads-sidebar";
import { ToolCallCard } from "./tool-call-card";

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      aria-label="Copy message"
      title="Copy message"
      className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-zinc-700 group-hover/msg:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function MessageFeedbackButtons({
  runId,
  rating,
  isPending,
  onRate,
}: {
  runId: string;
  rating?: PersonaFeedbackScore;
  isPending?: boolean;
  onRate: (runId: string, score: PersonaFeedbackScore) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        disabled={isPending}
        onClick={() => onRate(runId, 1)}
        aria-label="Helpful response"
        title="Helpful"
        aria-pressed={rating === 1}
        className={`grid size-6 place-items-center rounded transition-colors ${
          rating === 1
            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        }`}
      >
        <ThumbsUp className="size-3" />
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => onRate(runId, -1)}
        aria-label="Not helpful response"
        title="Not helpful"
        aria-pressed={rating === -1}
        className={`grid size-6 place-items-center rounded transition-colors ${
          rating === -1
            ? "bg-red-500/15 text-red-600 dark:text-red-400"
            : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        }`}
      >
        <ThumbsDown className="size-3" />
      </button>
    </div>
  );
}

function MessageBubble({
  message,
  reasoningPhases,
  rating,
  feedbackPending,
  onRate,
}: {
  message: PersonaMessage;
  reasoningPhases?: PersonaMessage[];
  rating?: PersonaFeedbackScore;
  feedbackPending?: boolean;
  onRate: (runId: string, score: PersonaFeedbackScore) => void;
}) {
  if (message.role === "reasoning") return null;
  const isUser = message.role === "user";
  const reasoning = reasoningPhases ?? [];
  const hasLiveReasoning = reasoning.some((r) => r.isStreaming);
  const hasToolCalls = (message.toolCalls?.length ?? 0) > 0;
  const isEmptyStreaming =
    !!message.isStreaming && !message.content?.trim() && !hasToolCalls;

  if (isUser) {
    return (
      <div className="group/msg flex flex-col items-end gap-1">
        <div className="max-w-[90%] rounded-xl bg-zinc-950 px-3.5 py-2.5 text-[13px] leading-relaxed text-white dark:bg-zinc-100 dark:text-zinc-950">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>
    );
  }

  const timeline = buildMessageTimeline(message, [...reasoning, message]);

  return (
    <div className="group/msg flex flex-col items-start gap-1">
      <div className="w-full space-y-2 py-0.5 text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100">
        {timeline.map((block) => {
          if (block.type === "reasoning") {
            return <ReasoningBlock key={block.key} reasoning={block.message} />;
          }
          if (block.type === "tool") {
            return <ToolCallCard key={block.key} toolCall={block.toolCall} />;
          }
          return block.content ? (
            <MessageMarkdown key={block.key} content={block.content} />
          ) : null;
        })}
        {isEmptyStreaming && !hasLiveReasoning ? <ThinkingIndicator /> : null}
      </div>
      {!message.isStreaming && message.content && (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
          <CopyMessageButton text={message.content} />
          {message.runId && (
            <MessageFeedbackButtons
              runId={message.runId}
              rating={rating}
              isPending={feedbackPending}
              onRate={onRate}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantPanel({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const {
    layoutMode,
    toggleLayoutMode,
    setIsOpen,
    activeThreadId,
    setActiveThreadId,
    configured,
    agentId,
  } = useAssistantUi();

  const [showThreads, setShowThreads] = useState(variant === "full");
  const [showConnections, setShowConnections] = useState(false);
  const [blockedMcpIds, setBlockedMcpIds] = useState<Set<string>>(() => new Set());
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const { threads, isLoading: threadsLoading, refetch: refetchThreads, createThread, deleteThread } =
    useThreads(configured);

  const {
    connections,
    unconnected,
    isLoading: connectionsLoading,
    disconnect: disconnectMcp,
  } = useMcpConnections({
    agentId: agentId ?? undefined,
    autoFetch: configured,
  });

  const { rate, ratings, pending: feedbackPending } = useFeedback();

  const handleRate = (runId: string, score: PersonaFeedbackScore) => {
    void rate(runId, score).catch(() => {
      // ignore transient feedback errors
    });
  };

  const handleConnectMcp = (connection: PersonaMcpConnection) => {
    if (connection.authorizeUrl) {
      window.location.href = connection.authorizeUrl;
    }
  };

  const { messages, isLoading, error, sendMessage, stop } = useChat({
    agentId: agentId ?? undefined,
    threadId: activeThreadId,
    onThreadCreated: (newThreadId) => {
      setActiveThreadId(newThreadId);
      void refetchThreads();
    },
    onMcpAuthRequired: (servers) => {
      setBlockedMcpIds(new Set(servers.map((s) => s.mcpId)));
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  const handleNewThread = async () => {
    if (!configured) {
      setActiveThreadId(undefined);
      return;
    }
    try {
      const created = await createThread(agentId ?? undefined);
      setActiveThreadId(created._id);
      if (variant === "compact") setShowThreads(false);
    } catch {
      setActiveThreadId(undefined);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteThread(threadId);
      if (activeThreadId === threadId) {
        setActiveThreadId(undefined);
      }
    } catch {
      // handled by hook state
    }
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading || !configured) return;
    setInput("");
    await sendMessage(trimmed);
  };

  const groupedMessages = groupReasoning(messages);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
            <Bot className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">CloudPilot Assistant</p>
            <p className="truncate font-mono text-[10px] text-zinc-500">
              {activeThreadId ? `Thread ${activeThreadId.slice(-6)}` : "New conversation"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {configured && (
            <button
              type="button"
              onClick={() => setShowConnections(true)}
              title="MCP Connections"
              aria-label="MCP Connections"
              className="relative grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <Plug className="size-4" />
              {unconnected.length > 0 && (
                <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowThreads((v) => !v)}
            title="Toggle threads"
            aria-label="Toggle threads"
            className={`grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
              showThreads ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-white" : ""
            }`}
          >
            <MessagesSquare className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleNewThread()}
            title="New thread"
            aria-label="New thread"
            className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <MessageSquarePlus className="size-4" />
          </button>
          {variant === "compact" && (
            <>
              <button
                type="button"
                onClick={toggleLayoutMode}
                title={layoutMode === "fab" ? "Dock to right side" : "Switch to floating FAB"}
                aria-label={layoutMode === "fab" ? "Dock to right side" : "Switch to floating FAB"}
                className="hidden size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 lg:grid dark:hover:bg-zinc-900"
              >
                {layoutMode === "fab" ? (
                  <PanelRight className="size-4" />
                ) : (
                  <PictureInPicture2 className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close assistant"
                aria-label="Close assistant"
                className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X className="size-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body: responsive threads sidebar + chat */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <ThreadsSidebar
          open={showThreads}
          variant={variant}
          threads={threads}
          activeThreadId={activeThreadId}
          isLoading={threadsLoading}
          onSelect={(id) => {
            setActiveThreadId(id);
            if (variant === "compact") setShowThreads(false);
          }}
          onCreate={() => void handleNewThread()}
          onDelete={(id) => void handleDeleteThread(id)}
          onClose={() => setShowThreads(false)}
        />

        {/* Chat column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!configured && (
            <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Set <code className="font-mono">PERSONA_CREDENTIAL</code> and{" "}
              <code className="font-mono">PERSONA_AGENT_ID</code> in <code className="font-mono">.env</code>{" "}
              to enable live Persona AI responses.
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {groupedMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Bot className="mb-2 size-8 text-zinc-400" />
                <p className="text-sm font-medium">Ask CloudPilot Assistant</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Inspect projects, repositories, deployments, or navigate the dashboard.
                </p>
              </div>
            ) : (
              groupedMessages.map(({ message: msg, reasoningPhases }) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  reasoningPhases={reasoningPhases}
                  rating={msg.runId ? ratings[msg.runId] : undefined}
                  feedbackPending={msg.runId ? feedbackPending[msg.runId] : false}
                  onRate={handleRate}
                />
              ))
            )}
            {isLoading &&
              groupedMessages[groupedMessages.length - 1]?.message.role === "user" && (
                <div className="px-1">
                  <ThinkingIndicator />
                </div>
              )}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error.message}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* MCP connect banner + text-only composer */}
          <McpConnectBanner
            connections={unconnected}
            blockedMcpIds={blockedMcpIds}
            onConnect={handleConnectMcp}
          />
          <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSend={() => void handleSubmit()}
              onStop={stop}
              isStreaming={isLoading}
              disabled={!configured}
              placeholder={
                configured
                  ? "Ask about projects, builds, deployments…"
                  : "Configure Persona keys in .env…"
              }
            />
          </div>
        </div>
      </div>
      <McpConnectionsDialog
        open={showConnections}
        onOpenChange={setShowConnections}
        connections={connections}
        onConnect={handleConnectMcp}
        onRevoke={disconnectMcp}
        isLoading={connectionsLoading}
      />
    </div>
  );
}
