import { Router } from "express";

import { config } from "../config.js";
import { pingRedis } from "../db/redis.js";
import { isIntentParserConfigured } from "../services/intentParser.js";
import {
  getOllamaStatus,
  isCloudLlmConfigured,
  isDeepSeekConfigured,
  isOllamaConfigured,
} from "../services/llm.js";

export const healthRouter = Router();

healthRouter.get("/api/health", async (_req, res) => {
  const ollama = await getOllamaStatus();
  const redisConfigured = Boolean(config.redisUrl);
  const redisConnected = redisConfigured && (await pingRedis());

  res.json({
    status: "ok",
    service: "aira-server",
    redis: {
      configured: redisConfigured,
      connected: redisConnected,
      label: redisConnected
        ? "Redis Cloud"
        : redisConfigured
          ? "Not connected"
          : "REDIS_URL not set",
    },
    llm_mode: config.llmMode,
    cloud_llm: {
      configured: isCloudLlmConfigured(),
      groq_intent: isIntentParserConfigured(),
      phi: Boolean(config.phiApiKey && config.phiBaseUrl),
      qwen35: Boolean(config.qwenApiKey && config.qwenBaseUrl),
    },
    ollama: {
      configured: isOllamaConfigured(),
      running: ollama.running,
      model_ready: ollama.modelReady,
      models: ollama.models,
    },
    deepseek_configured: isDeepSeekConfigured(),
  });
});
