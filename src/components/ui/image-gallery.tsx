"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LibraryImageDetail,
  type LibraryItem,
} from "@/components/ui/library-image-detail";
import { LibraryCover } from "@/components/ui/library-cover";

interface ImageGalleryProps {
  title?: string;
  description?: string;
  items?: LibraryItem[];
  className?: string;
}

export function ImageGallery({
  title = "Explore the Library",
  description = "Books, notes, and study materials — each with its own cover.",
  items = [],
  className,
}: ImageGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);

  return (
    <>
      <section
        className={cn(
          "flex w-full flex-col items-center justify-start py-12",
          className
        )}
      >
        <div className="max-w-3xl px-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">{description}</p>
        </div>

        <div className="mt-10 grid w-full max-w-5xl grid-cols-2 gap-4 px-4 sm:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedItem(item)}
              className="aira-library-card group overflow-hidden rounded-xl border border-neutral-800 text-left"
            >
              <div className="h-48 transition-transform duration-300 group-hover:scale-[1.02] sm:h-64">
                <LibraryCover
                  seed={item.coverSeed}
                  title={item.title}
                  chapter={item.chapter}
                  subject={item.subject}
                  size="card"
                />
              </div>
              <div className="border-t border-neutral-800 bg-neutral-900/80 px-3 py-2.5 transition-colors duration-200 group-hover:bg-neutral-800/80">
                <p className="truncate text-sm font-medium text-white transition-colors group-hover:text-violet-300">
                  {item.chapter?.trim() ? item.chapter : item.title}
                </p>
                {item.chapter?.trim() && (
                  <p className="truncate text-xs text-neutral-500">
                    {item.title}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      <LibraryImageDetail
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}
