import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";

import { config } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Book, CONTENT_TYPES } from "../models/Book.js";
import { School } from "../models/School.js";
import { enqueueBookIndexing } from "../services/indexing.js";
import { deleteBookVectors } from "../services/rag.js";

export const booksRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files are allowed"));
  },
});

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
    file_size: book.fileSize,
    index_status: book.indexStatus,
    index_error: book.indexError,
    extraction_method: book.extractionMethod,
    created_at: book.createdAt,
    updated_at: book.updatedAt,
  };
}

booksRouter.get("/api/books", requireAuth, async (req, res) => {
  const user = req.user!;

  const filter: Record<string, unknown> = {};

  if (user.role === "teacher") {
    if (!user.schoolId) {
      res.status(403).json({ detail: "No school assigned" });
      return;
    }
    filter.schoolId = user.schoolId;
    filter.indexStatus = "ready";
  } else if (typeof req.query.school_id === "string") {
    filter.schoolId = req.query.school_id;
  }

  if (typeof req.query.subject === "string") filter.subject = req.query.subject;
  if (typeof req.query.class === "string") filter.class = req.query.class;

  const books = await Book.find(filter).sort({ createdAt: -1 });
  res.json({ books: books.map(serializeBook) });
});

booksRouter.post(
  "/api/books/upload",
  requireAuth,
  requireRole("super_admin"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({
          detail: err instanceof Error ? err.message : "Upload failed",
        });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const parsed = z
        .object({
          school_id: z.string().min(1),
          title: z.string().min(1).max(300),
          subject: z.string().min(1).max(120),
          class: z.string().min(1).max(40),
          chapter: z.string().max(200).optional(),
          content_type: z.enum(CONTENT_TYPES).default("book"),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({ detail: "Invalid upload metadata" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ detail: "PDF file is required" });
        return;
      }

      const school = await School.findById(parsed.data.school_id);
      if (!school || !school.active) {
        res.status(400).json({ detail: "School not found" });
        return;
      }

      const bookId = new mongoose.Types.ObjectId();
      const dir = path.join(
        config.uploadDir,
        school._id.toString(),
        bookId.toString()
      );
      await fs.mkdir(dir, { recursive: true });

      const safeName = path.basename(req.file.originalname) || "upload.pdf";
      const filePath = path.join(dir, safeName);
      await fs.writeFile(filePath, req.file.buffer);

      const book = await Book.create({
        _id: bookId,
        schoolId: school._id,
        title: parsed.data.title,
        subject: parsed.data.subject,
        class: parsed.data.class,
        chapter: parsed.data.chapter ?? "",
        contentType: parsed.data.content_type,
        fileName: safeName,
        filePath,
        fileSize: req.file.size,
        indexStatus: "queued",
        uploadedBy: new mongoose.Types.ObjectId(req.user!.id),
      });

      await enqueueBookIndexing(book._id.toString());

      res.status(201).json(serializeBook(book));
    } catch (err) {
      console.error("Upload failed:", err);
      res.status(500).json({
        detail: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }
);

booksRouter.post(
  "/api/books/:id/reindex",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book) {
      res.status(404).json({ detail: "Book not found" });
      return;
    }

    book.indexStatus = "queued";
    book.indexError = null;
    await book.save();
    await enqueueBookIndexing(book._id.toString());

    res.json(serializeBook(book));
  }
);

booksRouter.delete(
  "/api/books/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book) {
      res.status(404).json({ detail: "Book not found" });
      return;
    }

    try {
      await fs.rm(path.dirname(book.filePath), { recursive: true, force: true });
    } catch {
      // file may already be gone
    }

    await deleteBookVectors(book.schoolId.toString(), book._id.toString());
    await book.deleteOne();

    res.json({ ok: true });
  }
);
