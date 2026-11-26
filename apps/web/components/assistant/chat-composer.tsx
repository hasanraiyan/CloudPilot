"use client";

import * as React from "react";
import { ArrowUp, Square } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";

/**
 * Text-only auto-resizing composer modeled after Persona's `ChatComposer`.
 * Uses `InputGroup` + `InputGroupTextarea` + `InputGroupAddon` so the trailing
 * action row keeps a steady height whether idle or streaming.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = "Ask about projects, builds, deployments…",
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const hasText = value.trim().length > 0;

  const submit = () => {
    if (disabled || isStreaming || !hasText) return;
    onSend();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative"
    >
      <InputGroup>
        <InputGroupTextarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="max-h-40"
        />

        <InputGroupAddon align="block-end" className="justify-between">
          <span className="font-mono text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for newline
          </span>

          {isStreaming ? (
            <InputGroupButton
              type="button"
              variant="default"
              size="icon-sm"
              aria-label="Stop generating"
              onClick={onStop}
            >
              <Square className="size-3.5 fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              aria-label="Send message"
              className={
                !hasText || disabled
                  ? "pointer-events-none opacity-40"
                  : undefined
              }
            >
              <ArrowUp className="size-4" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
