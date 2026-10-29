import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import { Book } from "../models/Book.js";
import { fetchRagCatalog } from "../services/rag.js";

export const libraryRouter = Router();

function serializeBook(book: InstanceType<typeof Book>) {
  return {
    id: book._id.toString(),
    school_id: book.schoolId.toString(),
    title: book.title,
    subject: book.subject,
    class: book.class,
    chapter: book.chapter ?? "",
    content_type: book.contentType,
    file_name: book.fileName,
    index_status: book.indexStatus,
  };
}

libraryRouter.get("/api/library", requireAuth, async (req, res) => {
  const user = req.user!;
  const bookFilter: Record<string, unknown> = {};

  if (user.role === "teacher") {
    if (!user.schoolId) {
      res.status(403).json({ detail: "No school assigned" });
      return;
    }
    bookFilter.schoolId = user.schoolId;
    bookFilter.indexStatus = "ready";
  }

  const books = await Book.find(bookFilter).sort({ createdAt: -1 });
  const rag = await fetchRagCatalog();

  res.json({
    books: books.map(serializeBook),
    rag: rag ?? { collection: "", total_chunks: 0, chapters: [] },
  });
});
