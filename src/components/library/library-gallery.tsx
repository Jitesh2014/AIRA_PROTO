"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { ImageGallery } from "@/components/ui/image-gallery";
import type { LibraryItem } from "@/components/ui/library-image-detail";
import {
  ApiError,
  listLibrary,
  type LibraryBook,
  type RagCatalogChapter,
} from "@/lib/api";
import { getAuthRole } from "@/lib/auth";

function bookToLibraryItem(book: LibraryBook): LibraryItem {
  const tags = [
    book.subject,
    `Class ${book.class}`,
    book.content_type.replace("_", " "),
  ];

  if (book.chapter?.trim()) tags.push(book.chapter);

  const description = [
    `${book.subject} · Class ${book.class}`,
    book.chapter?.trim() ? `Chapter: ${book.chapter}` : null,
    "",
    "Uploaded study material indexed for AIRA. Use this content in chat, summaries, and question generation.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    id: book.id,
    title: book.title,
    chapter: book.chapter,
    subject: book.subject,
    coverSeed: `${book.id}-${book.title}-${book.chapter ?? ""}`,
    description,
    tags,
    status: book.index_status,
    fileName: book.file_name,
  };
}

function catalogToLibraryItem(entry: RagCatalogChapter): LibraryItem {
  const chapterLabel = entry.chapter.match(/^\d+$/)
    ? `Chapter ${entry.chapter}`
    : entry.chapter;

  const description = [
    `${entry.subject} · Class ${entry.class}`,
    entry.source_file ? `Source: ${entry.source_file}` : null,
    "",
    `Included in AIRA RAG with ${entry.chunks} indexed sections. Ask questions, generate MCQs, or summarize this chapter in chat.`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    id: `rag-ch-${entry.chapter}`,
    title: entry.title,
    chapter: chapterLabel,
    subject: entry.subject,
    coverSeed: `rag-${entry.chapter}-${entry.title}`,
    description,
    tags: [
      entry.subject,
      `Class ${entry.class}`,
      chapterLabel,
      `${entry.chunks} sections`,
    ],
    status: "ready",
    chunkCount: entry.chunks,
    fileName: entry.source_file || undefined,
  };
}

export function LibraryGallery() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = getAuthRole() === "super_admin";

  useEffect(() => {
    void (async () => {
      try {
        const res = await listLibrary();
        const bookItems = res.books.map(bookToLibraryItem);
        const ragItems = res.rag.chapters.map(catalogToLibraryItem);

        const seen = new Set(bookItems.map((b) => b.chapter?.toLowerCase()));
        const merged = [
          ...bookItems,
          ...ragItems.filter(
            (r) => !seen.has(r.chapter?.toLowerCase() ?? "")
          ),
        ];

        setItems(merged);

        if (res.rag.chapters.length > 0) {
          setSummary(
            `${res.rag.chapters.length} chapters · ${res.rag.total_chunks.toLocaleString()} indexed sections from Grade 6 Computer Science`
          );
        } else if (bookItems.length > 0) {
          setSummary(`${bookItems.length} uploaded material(s)`);
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to load library"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const description = useMemo(() => {
    if (summary) return summary;
    return isAdmin
      ? "Uploaded books and RAG-indexed chapters — each with a unique cover."
      : "Your school's materials — open any chapter to see what's included.";
  }, [summary, isAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-16 text-center text-sm text-red-400">{error}</p>
    );
  }

  if (items.length === 0) {
    return (
      <section className="flex w-full flex-col items-center py-12">
        <div className="max-w-3xl px-4 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Explore the Library
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            No materials indexed yet. Upload books from the admin dashboard or
            connect the RAG service.
          </p>
        </div>
      </section>
    );
  }

  return (
    <ImageGallery
      title="Explore the Library"
      description={description}
      items={items}
    />
  );
}
