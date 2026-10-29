import mongoose, { Schema, type InferSchemaType } from "mongoose";

const sourceSchema = new Schema(
  {
    bookTitle: String,
    chapter: String,
    pages: String,
    snippet: String,
  },
  { _id: false }
);

const chatMessageSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    sources: [sourceSchema],
    modelUsed: { type: String, default: "stub" },
    creditsUsed: { type: Number, default: 0 },
    /** True only when Ollama/DeepSeek actually wrote the answer */
    llmGenerated: { type: Boolean, default: false },
    cached: { type: Boolean, default: false },
    filters: {
      subject: String,
      class: String,
      bookId: String,
    },
  },
  { timestamps: true }
);

export type ChatMessageDocument = InferSchemaType<typeof chatMessageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
