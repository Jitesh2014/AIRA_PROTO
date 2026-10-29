import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const INDEX_STATUSES = ["queued", "processing", "ready", "failed"] as const;
export type IndexStatus = (typeof INDEX_STATUSES)[number];

export const CONTENT_TYPES = ["book", "notes", "question_bank"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

const bookSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    class: { type: String, required: true, trim: true },
    chapter: { type: String, default: "", trim: true },
    contentType: { type: String, enum: CONTENT_TYPES, default: "book" },
    fileName: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    indexStatus: { type: String, enum: INDEX_STATUSES, default: "queued" },
    indexError: { type: String, default: null },
    extractionMethod: { type: String, enum: ["digital", "ocr", null], default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export type BookDocument = InferSchemaType<typeof bookSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Book = mongoose.model("Book", bookSchema);
