"use client";

import * as React from "react";
import type { PersonaAttachment } from "@personaai/react";
import { ArrowUp, FileImage, Loader2, Paperclip, Square, Upload, X } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Text + image-attachment composer modeled after Persona's `ChatComposer`.
 * Image attachment controls (paperclip, paste, drag-drop) are enabled
 * automatically when the active agent has `imageInputEnabled: true`.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = "Ask about projects, builds, deployments…",
  imageInput = false,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  isUploadingAttachments = false,
  attachmentError,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  imageInput?: boolean;
  attachments?: PersonaAttachment[];
  onAddAttachments?: (files: FileList | File[] | null) => void;
  onRemoveAttachment?: (id: string) => void;
  isUploadingAttachments?: boolean;
  attachmentError?: string | null;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const hasText = value.trim().length > 0;
  const hasReadyAttachments = (attachments ?? []).some((a) => a.status === "ready");
  const canSend =
    !disabled &&
    !isStreaming &&
    !isUploadingAttachments &&
    (hasText || (imageInput && hasReadyAttachments));

  const submit = () => {
    if (!canSend) return;
    onSend();
  };

  const addImages = (files: FileList | File[] | null) => {
    if (!imageInput || !onAddAttachments || !files) return;
    onAddAttachments(files);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    if (!imageInput || !onAddAttachments) return;
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) {
      e.preventDefault();
      addImages(files);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onPaste={handlePaste}
      onDragEnter={(e) => {
        if (!imageInput) return;
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(e) => {
        if (!imageInput) return;
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!imageInput) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        if (!imageInput) return;
        e.preventDefault();
        setIsDragging(false);
        addImages(e.dataTransfer?.files ?? null);
      }}
      className="relative"
    >
      {imageInput && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              addImages(Array.from(e.target.files));
              e.target.value = "";
            }
          }}
        />
      )}

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-400 bg-white/95 dark:border-zinc-600 dark:bg-zinc-950/95">
          <Upload className="mb-1 size-5 text-zinc-700 dark:text-zinc-300" />
          <span className="text-xs font-medium">Drop images to attach</span>
          <span className="text-[10px] text-zinc-500">PNG, JPG, WEBP, GIF (max 5 MB)</span>
        </div>
      )}

      <InputGroup>
        {attachments && attachments.length > 0 && (
          <InputGroupAddon align="block-start" className="flex-wrap gap-2 pb-2 pt-1">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative flex max-w-[200px] items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-1.5 pr-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                  {att.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <FileImage className="size-3.5 text-zinc-400" />
                  )}
                  {att.status === "uploading" && (
                    <div className="absolute inset-0 grid place-items-center bg-white/75 dark:bg-zinc-950/75">
                      <Loader2 className="size-3 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 leading-tight">
                  <p className="max-w-[105px] truncate text-[11px] font-medium" title={att.name}>
                    {att.name}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    {att.status === "error" ? "Failed" : formatFileSize(att.size)}
                  </p>
                </div>

                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(att.id)}
                    aria-label={`Remove ${att.name}`}
                    className="ml-auto grid size-4 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </InputGroupAddon>
        )}

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
          <div className="flex items-center gap-1.5">
            {imageInput && (
              <InputGroupButton
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Attach images"
                title="Attach images (PNG, JPEG, WebP, GIF)"
                disabled={disabled || isStreaming || (attachments?.length ?? 0) >= 4}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" />
              </InputGroupButton>
            )}
            {attachmentError ? (
              <span className="max-w-[200px] truncate text-[11px] text-red-500" title={attachmentError}>
                {attachmentError}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">
                Enter to send · Shift+Enter for newline
              </span>
            )}
          </div>

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
              className={!canSend ? "pointer-events-none opacity-40" : undefined}
            >
              <ArrowUp className="size-4" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
