import { Queue, Worker } from "bullmq";
import fs from "node:fs/promises";

import {
  getRedisConnectionConfig,
  isRedisAvailable,
  getRedis,
} from "../db/redis.js";
import { Book } from "../models/Book.js";
import { School } from "../models/School.js";
import { indexBook } from "./rag.js";

const QUEUE_NAME = "aira-indexing";

let queue: Queue | null = null;
let worker: Worker | null = null;

async function bumpSchoolContentVersion(schoolId: string): Promise<string> {
  const version = `v${Date.now()}`;
  await School.findByIdAndUpdate(schoolId, { contentVersion: version });
  return version;
}

async function processBook(bookId: string): Promise<void> {
  const book = await Book.findById(bookId);
  if (!book) return;

  await Book.findByIdAndUpdate(bookId, {
    indexStatus: "processing",
    indexError: null,
  });

  try {
    await fs.access(book.filePath);

    const result = await indexBook({
      bookId: book._id.toString(),
      schoolId: book.schoolId.toString(),
      filePath: book.filePath,
      metadata: {
        title: book.title,
        subject: book.subject,
        class: book.class,
        chapter: book.chapter ?? "",
        contentType: book.contentType ?? "book",
      },
    });

    await Book.findByIdAndUpdate(bookId, {
      indexStatus: "ready",
      extractionMethod: result.extractionMethod,
      indexError: null,
    });

    await bumpSchoolContentVersion(book.schoolId.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    await Book.findByIdAndUpdate(bookId, {
      indexStatus: "failed",
      indexError: message,
    });
  }
}

export function startIndexingWorker(): void {
  if (!isRedisAvailable()) {
    console.warn("Indexing queue disabled — Redis not available");
    return;
  }

  if (!getRedis()) return;

  const connection = getRedisConnectionConfig();

  queue = new Queue(QUEUE_NAME, { connection });

  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processBook(job.data.bookId as string);
    },
    { connection }
  );

  worker.on("failed", (job, err) => {
    console.error(`Indexing job ${job?.id} failed:`, err.message);
  });

  console.log("Indexing worker started");
}

export async function enqueueBookIndexing(bookId: string): Promise<void> {
  if (queue) {
    await queue.add("index-book", { bookId }, { attempts: 2 });
    return;
  }

  // Fallback without Redis: process in background
  void processBook(bookId);
}
