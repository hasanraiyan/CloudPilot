"use client";

import * as React from "react";
import { Streamdown } from "streamdown";
import remarkGfm from "remark-gfm";
import { code } from "@streamdown/code";
import { cn } from "@/lib/utils";

/**
 * Every markdown render in the CloudPilot assistant goes through this wrapper.
 * `Streamdown` handles partial/incomplete markdown mid-stream (unclosed code
 * fences, half-written tables) and renders syntax-highlighted code blocks via
 * `@streamdown/code` + `remark-gfm`.
 */
export function MessageMarkdown({
  className,
  content,
  muted = false,
}: {
  className?: string;
  content: string;
  muted?: boolean;
}) {
  return (
    <Streamdown
      className={cn(
        "max-w-none text-xs/relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        muted ? "text-muted-foreground" : "text-foreground",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
        "[&_code:not(pre_code)]:rounded-sm [&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5 [&_code:not(pre_code)]:text-xs",
        "[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-sm [&_h1]:font-semibold",
        "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold",
        "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-xs [&_h3]:font-semibold",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_p]:my-2 [&_p:first-of-type]:mt-0! [&_p:first-child]:mt-0! [&_p:last-of-type]:mb-0! [&_p:last-child]:mb-0!",
        "[&_[data-streamdown=code-block-body]]:overflow-x-visible!",
        "[&_[data-streamdown=code-block-body]_pre]:whitespace-pre-wrap! [&_[data-streamdown=code-block-body]_pre]:break-words!",
        "[&_[data-streamdown=code-block-body]_code]:whitespace-pre-wrap! [&_[data-streamdown=code-block-body]_code]:break-words!",
        className,
      )}
      remarkPlugins={[remarkGfm]}
      plugins={{ code }}
      controls={{ table: false }}
      components={{
        table: ({ children, className: tableClassName, ...rest }) => (
          <div className="my-3 w-full overflow-x-auto">
            <table
              className={cn("w-full border-collapse text-left text-xs", tableClassName)}
              {...rest}
            >
              {children}
            </table>
          </div>
        ),
      }}
    >
      {content}
    </Streamdown>
  );
}
