// server/src/config.ts

import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("[Config] Loading environment variables...");

export const config = {
  port: Number(process.env.PORT ?? 8000),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
  mongodbUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017/aira",
  redisUrl: process.env.REDIS_URL?.trim() ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "aira-dev-secret-change-in-production",
  jwtExpireDays: Number(process.env.JWT_EXPIRE_DAYS ?? 7),
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL ?? "admin@aira.com",
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD ?? "change-me",
  superAdminName: process.env.SUPER_ADMIN_NAME ?? "Super Admin",
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR ?? path.join(__dirname, "..", "uploads")
  ),
  authSkipPassword: process.env.AUTH_SKIP_PASSWORD === "true",
  
  // RAG Service
  ragServiceUrl: (process.env.RAG_SERVICE_URL ?? "").replace(/\/$/, ""),
  ragApiKey: process.env.RAG_API_KEY ?? "",

  // ============================================
  // LLM MODE
  // ============================================
  llmMode: (process.env.LLM_MODE ?? "cloud").toLowerCase() as "cloud" | "local",
  llmProvider: process.env.LLM_PROVIDER ?? "groq",

  // ============================================
  // GROQ CONFIG - VERIFIED WORKING MODELS
  // ============================================
  groqApiKey: process.env.GROQ_API_KEY?.trim() ?? "",
  groqBaseUrl: (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, ""),
  
  // Use GPT-OSS models (verified working)
  groqSimpleModel: process.env.GROQ_SIMPLE_MODEL ?? "openai/gpt-oss-20b",
  groqComplexModel: process.env.GROQ_COMPLEX_MODEL ?? "openai/gpt-oss-120b",
  groqIntentModel: process.env.GROQ_INTENT_MODEL ?? "openai/gpt-oss-20b",
  
  groqSimpleTimeoutMs: Number(process.env.GROQ_SIMPLE_TIMEOUT_MS ?? 30000),
  groqComplexTimeoutMs: Number(process.env.GROQ_COMPLEX_TIMEOUT_MS ?? 60000),
  groqIntentTimeoutMs: Number(process.env.GROQ_INTENT_TIMEOUT_MS ?? 15000),

  // ============================================
  // OLLAMA (Fallback)
  // ============================================
  ollamaEnabled: process.env.OLLAMA_ENABLED !== "false",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  ollamaQwenModel: process.env.OLLAMA_QWEN_MODEL ?? "llama3.2:3b",
  ollamaApiKey: process.env.OLLAMA_API_KEY ?? "ollama",
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 30000),

  // ============================================
  // DISABLED
  // ============================================
  phiApiKey: process.env.PHI_API_KEY?.trim() ?? "",
  phiBaseUrl: (process.env.PHI_BASE_URL ?? "").replace(/\/$/, ""),
  phiModel: process.env.PHI_MODEL ?? "Phi-4-mini",
  phiApiVersion: process.env.PHI_API_VERSION ?? "2024-05-01-preview",
  phiTimeoutMs: Number(process.env.PHI_TIMEOUT_MS ?? 120000),

  qwenApiKey: process.env.QWEN_API_KEY?.trim() ?? "",
  qwenBaseUrl: (process.env.QWEN_BASE_URL ?? "https://api.deepinfra.com/v1/openai").replace(/\/$/, ""),
  qwenModel: process.env.QWEN_MODEL ?? "Qwen/Qwen3.5-9B",
  qwenTimeoutMs: Number(process.env.QWEN_TIMEOUT_MS ?? 180000),

  deepseekApiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
  deepseekBaseUrl: (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, ""),
  deepseekModel: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  deepseekTimeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS ?? 120000),

  webSearchEnabled: process.env.WEB_SEARCH_ENABLED === "true",
  tavilyApiKey: process.env.TAVILY_API_KEY?.trim() ?? "",
  webSearchTimeoutMs: Number(process.env.WEB_SEARCH_TIMEOUT_MS ?? 15000),
};

// Debug output (remove in production)
console.log(`[Config] GROQ_API_KEY loaded: ${config.groqApiKey ? 'YES' : 'NO'}`);
if (config.groqApiKey) {
    console.log(`[Config] API Key starts with: ${config.groqApiKey.substring(0, 10)}...`);
}
console.log(`[Config] Models: Simple=${config.groqSimpleModel}, Complex=${config.groqComplexModel}`);