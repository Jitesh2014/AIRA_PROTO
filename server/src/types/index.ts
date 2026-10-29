// server/src/types/index.ts
// Shared type definitions for LLM configuration and routing

export interface GroqConfig {
  apiKey: string;
  baseUrl: string;
  simpleModel: string;
  complexModel: string;
  intentModel: string;
  simpleTimeoutMs: number;
  complexTimeoutMs: number;
  intentTimeoutMs: number;
}

export interface OllamaConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

export interface LLMConfig {
  mode: "cloud" | "local";
  provider: "groq" | "openrouter" | "ollama";
  groq?: GroqConfig;
  ollama?: OllamaConfig;
}

export interface LLMCallOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  temperature?: number;
  maxTokens?: number;
}

export type LLMProvider = "groq" | "phi" | "qwen35" | "ollama" | "deepseek" | "none";
