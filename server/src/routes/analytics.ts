import { Router } from "express";
import mongoose, { type FilterQuery } from "mongoose";

import { config } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isRedisAvailable } from "../db/redis.js";
import { Book } from "../models/Book.js";
import { ChatMessage, type ChatMessageDocument } from "../models/ChatMessage.js";
import { School } from "../models/School.js";
import { User } from "../models/User.js";
import { estimateCredits, isSmallBillingModel } from "../services/credits.js";
import {
  getLlmInfraLabel,
  getLlmStatusHint,
  getOllamaStatus,
  isCloudLlmConfigured,
  isDeepSeekConfigured,
  normalizeBillingModel,
} from "../services/llm.js";
import {
  getCacheStorage,
  getDatabaseStorageBytes,
  getServerStorageBytes,
} from "../services/storage-stats.js";
import { isRagServiceConfigured } from "../services/rag.js";

export const analyticsRouter = Router();

function maskMongoUri(uri: string): string {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
}

async function getInfrastructureStatus() {
  const ollama = await getOllamaStatus();
  const ollamaReady = ollama.running && ollama.modelReady;
  const uri = config.mongodbUri;
  const isAtlas = uri.includes("mongodb.net");
  const isLocal =
    uri.includes("localhost") || uri.includes("127.0.0.1");

  let mongodbType: "atlas" | "local" | "custom" | "not_connected" =
    "not_connected";
  if (mongoose.connection.readyState === 1) {
    if (isAtlas) mongodbType = "atlas";
    else if (isLocal) mongodbType = "local";
    else mongodbType = "custom";
  }

  return {
    mongodb: {
      connected: mongoose.connection.readyState === 1,
      type: mongodbType,
      label:
        mongodbType === "atlas"
          ? "MongoDB Atlas"
          : mongodbType === "local"
            ? "Local MongoDB (dev)"
            : mongodbType === "custom"
              ? "MongoDB"
              : "Not connected",
      uri: maskMongoUri(uri),
    },
    redis: {
      connected: isRedisAvailable(),
      label: isRedisAvailable() ? "Redis" : "Not connected",
    },
    qdrant: {
      connected: isRagServiceConfigured(),
      label: isRagServiceConfigured()
        ? "RAG service configured"
        : "Not connected (set RAG_SERVICE_URL)",
    },
    llm: {
      connected:
        isCloudLlmConfigured() ||
        ollamaReady ||
        isDeepSeekConfigured(),
      label: getLlmInfraLabel(ollama),
      status_hint: getLlmStatusHint(ollama),
      ollama_running: ollama.running,
      ollama_model_ready: ollama.modelReady,
      cloud_configured: isCloudLlmConfigured(),
    },
  };
}

function creditsForMessage(msg: {
  modelUsed?: string | null;
  cached?: boolean | null;
  creditsUsed?: number | null;
  question: string;
  answer: string;
}): number {
  if (msg.creditsUsed != null && msg.creditsUsed > 0) return msg.creditsUsed;
  if (msg.cached) return 0;
  return estimateCredits(
    normalizeBillingModel(msg.modelUsed ?? "phi"),
    msg.question,
    msg.answer
  );
}

const llmAnsweredFilter = (
  filter: FilterQuery<ChatMessageDocument>
): FilterQuery<ChatMessageDocument> => ({
  ...filter,
  llmGenerated: true,
});

async function getModelUsage(filter: FilterQuery<ChatMessageDocument>) {
  const usageFilter = llmAnsweredFilter(filter);
  const cached_requests = await ChatMessage.countDocuments({
    ...filter,
    cached: true,
  });

  const messages = await ChatMessage.find(usageFilter)
    .select("modelUsed creditsUsed question answer")
    .lean();

  let small_requests = 0;
  let large_requests = 0;
  let small_credits = 0;
  let large_credits = 0;
  let total_credits = 0;

  const cloudMode = isCloudLlmConfigured();
  const largeIntegrated = cloudMode || isDeepSeekConfigured();
  const smallName = cloudMode ? "Phi-4-mini" : "Qwen3-4B (Ollama)";
  const largeName = cloudMode ? "Qwen3.5-9B" : "DeepSeek";

  for (const msg of messages) {
    const billingModel = normalizeBillingModel(msg.modelUsed ?? "phi");
    const credits = creditsForMessage({ ...msg, modelUsed: billingModel });

    if (isSmallBillingModel(billingModel)) {
      small_requests += 1;
      small_credits += credits;
    } else {
      large_requests += 1;
      large_credits += credits;
    }

    total_credits += credits;
  }

  return {
    small_model: {
      name: smallName,
      requests: small_requests,
      credits: small_credits,
    },
    large_model: {
      name: largeIntegrated ? largeName : `${largeName} (not integrated)`,
      requests: large_requests,
      credits: large_credits,
      integrated: largeIntegrated,
    },
    cached_requests,
    total_credits,
  };
}

async function countCitationLinks(
  filter: FilterQuery<ChatMessageDocument>
): Promise<number> {
  const result = await ChatMessage.aggregate<{ total: number }>([
    { $match: filter },
    { $unwind: "$sources" },
    { $count: "total" },
  ]);
  return result[0]?.total ?? 0;
}

analyticsRouter.get(
  "/api/analytics",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const schoolFilter: FilterQuery<ChatMessageDocument> =
      typeof req.query.school_id === "string"
        ? { schoolId: req.query.school_id }
        : {};

    const bookFilter =
      typeof req.query.school_id === "string"
        ? { schoolId: req.query.school_id }
        : {};

    const userSchoolFilter =
      typeof req.query.school_id === "string"
        ? { schoolId: req.query.school_id }
        : {};

    const [
      schoolCount,
      teacherCount,
      adminCount,
      totalUserCount,
      inactiveTeachers,
      bookCount,
      readyBooks,
      questionCount,
      materialsBytes,
      schools,
      modelUsage,
      citationLinks,
      serverBytes,
      databaseBytes,
      cacheStorage,
    ] = await Promise.all([
      School.countDocuments({ active: true }),
      User.countDocuments({ role: "teacher", active: true, ...userSchoolFilter }),
      User.countDocuments({ role: "super_admin", active: true }),
      User.countDocuments(
        typeof req.query.school_id === "string"
          ? { $or: [{ role: "super_admin" }, userSchoolFilter] }
          : {}
      ),
      User.countDocuments({ role: "teacher", active: false, ...userSchoolFilter }),
      Book.countDocuments(bookFilter),
      Book.countDocuments({ ...bookFilter, indexStatus: "ready" }),
      ChatMessage.countDocuments(llmAnsweredFilter(schoolFilter)),
      Book.aggregate<{ total: number }>([
        ...(Object.keys(bookFilter).length
          ? [{ $match: bookFilter }]
          : []),
        { $group: { _id: null, total: { $sum: "$fileSize" } } },
      ]),
      School.find().sort({ name: 1 }),
      getModelUsage(schoolFilter),
      countCitationLinks(schoolFilter),
      getServerStorageBytes(),
      getDatabaseStorageBytes(),
      getCacheStorage(),
    ]);

    const materials_storage_bytes = materialsBytes[0]?.total ?? 0;
    const total_storage_bytes =
      serverBytes + databaseBytes + cacheStorage.bytes;

    const perSchool = await Promise.all(
      schools.map(async (school) => {
        const sid = school._id;
        const sf = { schoolId: sid };
        const [teachers, books, questions, storage, usage, links] =
          await Promise.all([
            User.countDocuments({ role: "teacher", schoolId: sid, active: true }),
            Book.countDocuments({ schoolId: sid }),
            ChatMessage.countDocuments(llmAnsweredFilter(sf)),
            Book.aggregate<{ total: number }>([
              { $match: { schoolId: sid } },
              { $group: { _id: null, total: { $sum: "$fileSize" } } },
            ]),
            getModelUsage(sf),
            countCitationLinks(sf),
          ]);

        return {
          school_id: sid.toString(),
          school_name: school.name,
          teachers,
          books,
          questions,
          citation_links: links,
          storage_bytes: storage[0]?.total ?? 0,
          model_usage: usage,
        };
      })
    );

    const infrastructure = await getInfrastructureStatus();
    const mongoConnected = infrastructure.mongodb.connected;

    res.json({
      infrastructure,
      global: {
        schools: schoolCount,
        teachers: teacherCount,
        admins: adminCount,
        users_total: totalUserCount,
        users_inactive_teachers: inactiveTeachers,
        books: bookCount,
        books_ready: readyBooks,
        questions: questionCount,
        citation_links: citationLinks,
        materials_storage_bytes,
        storage: {
          total_bytes: mongoConnected
            ? total_storage_bytes
            : serverBytes + cacheStorage.bytes,
          server_bytes: serverBytes,
          server_label: "Local disk (server/uploads/)",
          cache_bytes: cacheStorage.bytes,
          cache_keys: cacheStorage.keys,
          cache_available: cacheStorage.available,
          database_bytes: mongoConnected ? databaseBytes : null,
          database_available: mongoConnected,
          materials_bytes: mongoConnected ? materials_storage_bytes : null,
          materials_available: mongoConnected,
        },
        model_usage: modelUsage,
      },
      per_school: perSchool,
    });
  }
);
