"use client";

import { useEffect, useRef, useCallback } from "react";
import { useState } from "react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { ChatMarkdown } from "@/components/ui/chat-markdown";
import { sendChat, ApiError, formatModelLabel, type ChatSource, type WebSource } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  ListChecks,
  Code2,
  ArrowUpIcon,
  Paperclip,
  PlusIcon,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

function dedupeDisplaySources(sources: ChatSource[]): ChatSource[] {
  const seen = new Map<string, ChatSource>();

  for (const source of sources) {
    const key = `${source.book_title}:${source.chapter ?? ""}`.toLowerCase();
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...source });
      continue;
    }
    if (
      source.pages &&
      existing.pages &&
      !existing.pages.includes(source.pages)
    ) {
      existing.pages = `${existing.pages}, ${source.pages}`;
    } else if (source.pages && !existing.pages) {
      existing.pages = source.pages;
    }
  }

  return Array.from(seen.values());
}

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`;

      const newHeight = Math.max(
        minHeight,
        Math.min(
          textarea.scrollHeight,
          maxHeight ?? Number.POSITIVE_INFINITY
        )
      );

      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

const PLACEHOLDER_SUGGESTIONS = [
  "Summarize Chapter 5 from the Physics textbook...",
  "What is osmosis according to our Biology notes?",
  "Generate 5 MCQs from Chapter 3...",
  "Compare mitosis and meiosis from uploaded materials...",
  "Explain Newton's Laws using our class resources...",
  "What does the Chemistry book say about acids and bases?",
] as const;

function useTypingPlaceholder(active: boolean) {
  const [displayText, setDisplayText] = useState("");
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!active) {
      setDisplayText("");
      setSuggestionIndex(0);
      setIsDeleting(false);
      return;
    }

    const current = PLACEHOLDER_SUGGESTIONS[suggestionIndex];
    const typingSpeed = isDeleting ? 25 : 45;

    if (!isDeleting && displayText === current) {
      const pause = setTimeout(() => setIsDeleting(true), 2200);
      return () => clearTimeout(pause);
    }

    if (isDeleting && displayText === "") {
      const pause = setTimeout(() => {
        setIsDeleting(false);
        setSuggestionIndex((i) => (i + 1) % PLACEHOLDER_SUGGESTIONS.length);
      }, 400);
      return () => clearTimeout(pause);
    }

    const tick = setTimeout(() => {
      setDisplayText(
        isDeleting
          ? current.slice(0, displayText.length - 1)
          : current.slice(0, displayText.length + 1)
      );
    }, typingSpeed);

    return () => clearTimeout(tick);
  }, [displayText, isDeleting, suggestionIndex, active]);

  return displayText;
}

function AnimatedPlaceholder({ active }: { active: boolean }) {
  const text = useTypingPlaceholder(active);

  if (!active) return null;

  return (
    <div
      className="aira-placeholder-fade pointer-events-none absolute left-4 top-3 right-4 text-sm text-neutral-500 leading-relaxed"
      aria-hidden="true"
    >
      <span className="text-neutral-600">Example: </span>
      <span className="text-neutral-500 italic">{text}</span>
      <span className="aira-typing-cursor" />
    </div>
  );
}

interface ActionItem {
  icon: LucideIcon;
  label: string;
  delay: string;
  href?: string;
  prompt?: string;
}

const ACTION_BUTTONS: ActionItem[] = [
  {
    icon: BookOpen,
    label: "Summarization (topic / chapter)",
    delay: "aira-fade-up-delay-1",
    prompt: "Summarize the following topic/chapter: ",
  },
  {
    icon: ListChecks,
    label: "Question Generation",
    delay: "aira-fade-up-delay-2",
    prompt: "Generate questions for: ",
  },
  {
    icon: Code2,
    label: "Code Review",
    delay: "aira-fade-up-delay-3",
    href: "/terminal",
  },
];

export function VercelV0Chat() {
  const [value, setValue] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [webSources, setWebSources] = useState<WebSource[]>([]);
  const [webSupplemented, setWebSupplemented] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showFullAnswer, setShowFullAnswer] = useState(false);
  const isExpanded = isFocused || value.length > 0;
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: isExpanded ? 60 : 44,
    maxHeight: isExpanded ? 200 : 44,
  });

  useEffect(() => {
    if (!isExpanded && !value) {
      adjustHeight(true);
    } else if (isExpanded) {
      adjustHeight();
    }
  }, [isExpanded, value, adjustHeight]);

  const handleNewChat = () => {
    setReply(null);
    setSources([]);
    setWebSources([]);
    setWebSupplemented(false);
    setModelUsed(null);
    setSendError(null);
    setValue("");
    setShowFullAnswer(false);
    adjustHeight(true);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    const message = value.trim();
    if (!message || isSending) return;

    setIsSending(true);
    setSendError(null);
    setReply(null);
    setSources([]);
    setWebSources([]);
    setWebSupplemented(false);
    setModelUsed(null);
    setShowFullAnswer(false);

    try {
      const mode = message.startsWith("Summarize")
        ? "summarize"
        : message.startsWith("Generate questions")
          ? "questions"
          : undefined;
      const result = await sendChat(message, mode);
      setReply(result.reply);
      setSources(result.sources ?? []);
      setWebSources(result.web_sources ?? []);
      setWebSupplemented(result.web_supplemented ?? false);
      setModelUsed(result.model_used ?? null);
      setValue("");
      adjustHeight(true);
    } catch (err) {
      setSendError(
        err instanceof ApiError ? err.message : "Failed to send message."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleContainerClick = () => {
    textareaRef.current?.focus();
  };

  const handleActionClick = (item: ActionItem) => {
    if (!item.prompt) return;

    setValue(item.prompt);
    setIsFocused(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      adjustHeight();
    });
  };

  const hasValue = value.trim().length > 0;

  return (
    <div className="relative z-10 flex flex-col items-center w-full max-w-4xl mx-auto p-4 space-y-8">
      <h1 className="aira-fade-up text-4xl font-bold text-white tracking-tight">
        What can{" "}
        <span className="text-violet-400">AIRA</span>{" "}
        help you teach?
      </h1>

      <div className="w-full aira-fade-up-delay-1">
        <div
          onClick={handleContainerClick}
          className={cn(
            "aira-chat-column relative rounded-xl border border-neutral-800 bg-neutral-900/90 backdrop-blur-sm",
            isExpanded && "aira-chat-unfolded",
            isFocused && "ring-1 ring-violet-500/20"
          )}
        >
          <div
            className={cn(
              "aira-chat-input-wrap relative overflow-hidden",
              isExpanded ? "min-h-[60px]" : "min-h-[44px]"
            )}
          >
            <AnimatedPlaceholder active={!value} />
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder=""
              className={cn(
                "w-full px-4 resize-none bg-transparent border-none text-white text-sm",
                "focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                "placeholder:text-neutral-500 placeholder:text-sm",
                "transition-all duration-300 ease-out",
                isExpanded ? "py-3 min-h-[60px]" : "py-2.5 min-h-[44px]"
              )}
              style={{
                overflow: "hidden",
              }}
            />
          </div>

          <div className="aira-chat-toolbar-wrap">
            <div className="aira-chat-toolbar-inner">
              <div className="aira-chat-toolbar-content flex items-center justify-between p-3 border-t border-neutral-800/60">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    className="aira-icon-btn group p-2 hover:bg-violet-500/10 rounded-lg flex items-center gap-1"
                  >
                    <Paperclip className="w-4 h-4 text-white transition-transform duration-200 group-hover:rotate-12" />
                    <span className="text-xs text-zinc-400 hidden group-hover:inline transition-all duration-200 opacity-0 group-hover:opacity-100">
                      Attach
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    className="aira-icon-btn px-2 py-1 rounded-lg text-sm text-zinc-400 border border-dashed border-zinc-700 hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-300 flex items-center gap-1"
                  >
                    <PlusIcon className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                    Project
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void handleSend()}
                    disabled={!hasValue || isSending}
                    className={cn(
                      "aira-send-btn px-1.5 py-1.5 rounded-lg text-sm border flex items-center gap-1",
                      hasValue && !isSending
                        ? "aira-send-btn-active bg-white text-black border-white hover:bg-violet-50"
                        : "text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800"
                    )}
                  >
                    <ArrowUpIcon
                      className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        hasValue ? "text-black group-hover:-translate-y-0.5" : "text-zinc-400"
                      )}
                    />
                    <span className="sr-only">Send</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(reply || sendError || isSending) && (
          <div className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900/80 p-4">
            {(reply || isSending) && (
              <div className="mb-3 flex items-center justify-between border-b border-neutral-800 pb-2">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {isSending ? "Thinking…" : "Latest answer"}
                </p>
                {!isSending && reply && (
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-violet-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    New chat
                  </button>
                )}
              </div>
            )}
            {isSending && (
              <p className="text-sm text-neutral-400">
                AIRA is thinking… Retrieving from your materials (may take a
                minute on first run).
              </p>
            )}
            {sendError && (
              <p className="text-sm text-red-400" role="alert">
                {sendError}
              </p>
            )}
            {reply && !isSending && (
              <div className="space-y-4">
                <div className="relative">
                  <div
                    className={cn(
                      "rounded-lg border border-neutral-800 bg-neutral-950/30",
                      showFullAnswer
                        ? "max-h-none"
                        : "max-h-[420px] overflow-hidden"
                    )}
                  >
                    <div
                      className={cn(
                        "px-4 py-3",
                        showFullAnswer
                          ? ""
                          : "max-h-[420px] overflow-y-auto aira-scrollbars"
                      )}
                    >
                      <ChatMarkdown content={reply} />
                    </div>
                  </div>

                  {!showFullAnswer && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-lg bg-gradient-to-t from-neutral-900/95 to-transparent" />
                  )}

                  {reply.length > 900 && (
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowFullAnswer((v) => !v)}
                        className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 hover:text-white"
                      >
                        {showFullAnswer ? "Collapse" : "Expand"}
                      </button>
                    </div>
                  )}
                </div>
                {(modelUsed || webSupplemented) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {modelUsed && (
                      <p className="text-xs text-neutral-600">
                        Model: {formatModelLabel(modelUsed)}
                      </p>
                    )}
                    {webSupplemented && (
                      <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">
                        Supplemented from web
                      </span>
                    )}
                  </div>
                )}
                {sources.length > 0 && (
                  <div className="border-t border-neutral-800 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Textbook sources
                    </p>
                    <ul className="space-y-2">
                      {dedupeDisplaySources(sources).map((source, i) => (
                        <li
                          key={`${source.book_title}-${source.chapter}`}
                          className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400"
                        >
                          <span className="mr-2 font-mono text-violet-400">
                            [{i + 1}]
                          </span>
                          <span className="font-medium text-neutral-300">
                            {source.book_title}
                          </span>
                          {source.chapter && ` · Ch. ${source.chapter}`}
                          {source.pages && ` · p. ${source.pages}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {webSources.length > 0 && (
                  <div className="border-t border-neutral-800 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Web sources
                    </p>
                    <ul className="space-y-2">
                      {webSources.map((source, i) => (
                        <li
                          key={`${source.url}-${i}`}
                          className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400"
                        >
                          <span className="mr-2 font-mono text-sky-400">
                            [W{i + 1}]
                          </span>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sky-300 hover:underline"
                          >
                            {source.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {ACTION_BUTTONS.map((item) => {
            const Icon = item.icon;
            return (
              <ActionButton
                key={item.label}
                icon={
                  <Icon className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
                }
                label={item.label}
                className={item.delay}
                href={item.href}
                onClick={
                  item.href ? undefined : () => handleActionClick(item)
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  className?: string;
  href?: string;
  onClick?: () => void;
}

function ActionButton({
  icon,
  label,
  className,
  href,
  onClick,
}: ActionButtonProps) {
  const styles = cn(
    "aira-action-btn group flex items-center gap-2 px-4 py-2",
    "bg-neutral-900/80 backdrop-blur-sm",
    "hover:bg-neutral-800/90",
    "rounded-full border border-neutral-800",
    "text-neutral-400 hover:text-white",
    className
  );

  if (href) {
    return (
      <Link href={href} className={styles}>
        {icon}
        <span className="text-xs">{label}</span>
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={styles}>
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}
