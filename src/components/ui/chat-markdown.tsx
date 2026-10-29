"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatChatMarkdown } from "@/lib/format-chat-markdown";
import { cn } from "@/lib/utils";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-5 text-lg font-semibold text-white first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-4 border-b border-neutral-800 pb-1.5 text-base font-semibold text-violet-200 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-violet-300/90 first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 text-sm leading-relaxed text-neutral-200 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-100">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm text-neutral-200 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-4 list-decimal space-y-3 pl-5 text-sm text-neutral-200 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed [&>ul]:mt-2 [&>ul]:mb-0">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-violet-500/50 pl-4 text-sm italic text-neutral-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-neutral-800" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children, ...props }) => {
    const text = String(children).replace(/\n$/, "");
    const isBlock = Boolean(className) || text.includes("\n");

    if (!isBlock) {
      return (
        <code
          className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-violet-200"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <code
        className={cn(
          "block px-3 py-2 font-mono text-xs leading-relaxed text-neutral-300",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 last:mb-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="aira-chat-table-wrap my-4 overflow-x-auto rounded-lg border border-neutral-700/80 bg-neutral-950/60">
      <table className="aira-chat-table w-full min-w-[280px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-neutral-800/90">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-neutral-800/80">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-neutral-800/30">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 align-top text-sm leading-relaxed text-neutral-300">
      {children}
    </td>
  ),
};

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div className={cn("aira-chat-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {formatChatMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
