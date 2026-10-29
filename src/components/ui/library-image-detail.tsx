"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LibraryCover } from "@/components/ui/library-cover";

export interface LibraryItem {
  id: string;
  title: string;
  chapter?: string;
  subject: string;
  coverSeed: string;
  description: string;
  tags: string[];
  status?: string;
  fileName?: string;
  chunkCount?: number;
}

interface LibraryImageDetailProps {
  item: LibraryItem | null;
  onClose: () => void;
}

export function LibraryImageDetail({ item, onClose }: LibraryImageDetailProps) {
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [item, onClose]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="library-detail-title"
            className={cn(
              "aira-library-detail relative z-10 flex w-full max-w-4xl flex-col overflow-hidden",
              "rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl",
              "max-h-[90vh] lg:max-h-[85vh] lg:flex-row"
            )}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 32,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail view"
              className="aira-library-detail-close absolute right-4 top-4 z-20 rounded-lg border border-neutral-700 bg-neutral-800/80 p-2 text-neutral-400"
            >
              <X className="h-4 w-4" />
            </button>

            <motion.div
              className="flex flex-1 flex-col justify-center gap-4 p-6 pt-14 lg:p-10 lg:pr-6"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
            >
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-neutral-700 px-2.5 py-0.5 text-xs text-neutral-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h2
                id="library-detail-title"
                className="text-2xl font-semibold tracking-tight text-white sm:text-3xl"
              >
                {item.chapter?.trim() ? item.chapter : item.title}
              </h2>

              {item.chapter?.trim() && (
                <p className="text-sm text-neutral-500">{item.title}</p>
              )}

              <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-400 sm:text-base">
                {item.description}
              </p>

              {item.status && (
                <p className="text-xs capitalize text-neutral-500">
                  Index status:{" "}
                  <span
                    className={
                      item.status === "ready"
                        ? "text-emerald-400"
                        : item.status === "failed"
                          ? "text-red-400"
                          : "text-amber-400"
                    }
                  >
                    {item.status}
                  </span>
                </p>
              )}

              {item.chunkCount != null && item.chunkCount > 0 && (
                <p className="text-xs text-neutral-500">
                  {item.chunkCount.toLocaleString()} indexed sections in RAG
                </p>
              )}

              {item.fileName && (
                <p className="truncate text-xs text-neutral-600">
                  {item.fileName}
                </p>
              )}
            </motion.div>

            <motion.div
              className="relative h-56 shrink-0 overflow-hidden border-t border-neutral-800 lg:h-auto lg:min-h-[320px] lg:w-[45%] lg:border-l lg:border-t-0"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
            >
              <LibraryCover
                seed={item.coverSeed}
                title={item.title}
                chapter={item.chapter}
                subject={item.subject}
                size="detail"
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
