// server/src/services/llmRouter.ts

/**
 * LLM Router — Routes queries to appropriate Groq models
 *
 * Routing priority (in order):
 *  1. Code review               → groq_complex
 *  2. Question generation (MCQ) → groq_complex
 *  3. Summarization             → groq_simple
 *  4. Explicit complexity hint  → groq_complex / groq_simple
 *  5. Teacher context anchor    → groq_complex
 *  6. Generation requests       → groq_simple / groq_complex (keyword-based)
 *  7. Low retrieval score       → groq_complex (more reasoning needed)
 *  8. Complex keywords          → groq_complex
 *  9. Multi-part questions      → groq_complex
 * 10. Simple factual patterns   → groq_simple
 * 11. High retrieval score      → groq_simple (context is enough)
 * 12. Default                   → groq_simple
 *
 * When Groq is NOT the primary provider, routing degrades gracefully:
 *  - cloud mode non-groq  → "phi" (simple) / "qwen35" (complex)
 *  - local mode           → "qwen" (simple) / "deepseek" (complex)
 */

import { config } from "../config.js";

// ============================================
// TYPES
// ============================================

export type RoutedModel =
  | "groq_simple"
  | "groq_complex"
  | "phi"
  | "qwen35"
  | "qwen"
  | "deepseek";

export interface RouteOptions {
  mode?: string;
  topRetrievalScore?: number;
  teacherContextAnchor?: string;
  complexityHint?: "simple" | "complex";
}

// ============================================
// KEYWORD TABLES
// ============================================

const COMPLEX_KEYWORDS = [
  "compare", "contrast", "difference between", "analyze", "analyse",
  "explain why", "justify", "evaluate", "essay", "report", "project",
  "lesson plan",
];

const SIMPLE_GENERATION_KEYWORDS = [
  "mcq", "mcqs", "multiple choice", "summary", "summarize",
  "flashcard", "flashcards", "notes", "note", "worksheet",
];

const COMPLEX_GENERATION_KEYWORDS = [
  "essay", "analysis", "analyse", "analyze", "report",
  "comparison", "compare", "contrast", "project", "evaluate", "lesson plan",
];

const SIMPLE_QA_PATTERNS = [
  /^what is\b/i,
  /^define\b/i,
  /^meaning of\b/i,
  /^who is\b/i,
  /^when did\b/i,
  /^where is\b/i,
  /^how many\b/i,
  /^list\b/i,
  /^name\b/i,
];

const LOW_RETRIEVAL_THRESHOLD = 0.65;
const HIGH_RETRIEVAL_THRESHOLD = 0.85;

// ============================================
// PROVIDER HELPERS
// ============================================

function isGroqPrimary(): boolean {
  return config.llmProvider === "groq" || Boolean(config.groqApiKey);
}

function isCloudMode(): boolean {
  return config.llmMode === "cloud";
}

/**
 * Maps a logical tier (simple | complex) to the correct RoutedModel
 * based on the active provider and mode.
 * 
 * ✅ FIXED: Properly maps complex to groq_complex (mixtral-8x7b-32768)
 */
function toLegacyModel(tier: "simple" | "complex"): RoutedModel {
  // Groq is active — map to groq_simple / groq_complex
  if (isCloudMode() && isGroqPrimary()) {
    // ✅ FIXED: Use separate models for simple and complex
    return tier === "simple" ? "groq_simple" : "groq_complex";
  }

  // Cloud mode, non-Groq provider (OpenRouter / etc.)
  if (isCloudMode()) {
    return tier === "simple" ? "phi" : "qwen35";
  }

  // Local mode (Ollama + DeepSeek)
  return tier === "simple" ? "qwen" : "deepseek";
}

// ============================================
// CLASSIFICATION HELPERS
// ============================================

function isGenerationRequest(query: string, mode?: string): boolean {
  if (
    mode === "questions" ||
    mode === "summarize" ||
    mode === "flashcards" ||
    mode === "notes"
  ) {
    return true;
  }
  const n = query.toLowerCase();
  return (
    /\b(generate|create|make|write|prepare)\b/.test(n) &&
    /\b(mcq|question|summary|flashcard|notes?|worksheet)\b/.test(n)
  );
}

function isSimpleGeneration(query: string, mode?: string): boolean {
  if (
    mode === "summarize" ||
    mode === "flashcards" ||
    mode === "notes"
  ) {
    return true;
  }
  // Question generation is complex (needs rich output)
  if (mode === "questions") return false;

  const n = query.toLowerCase();
  if (COMPLEX_GENERATION_KEYWORDS.some((kw) => n.includes(kw))) return false;
  return SIMPLE_GENERATION_KEYWORDS.some((kw) => n.includes(kw));
}

function hasComplexKeyword(query: string): boolean {
  const n = query.trim().toLowerCase();
  return COMPLEX_KEYWORDS.some((kw) => n.includes(kw));
}

function isMultiPartQuestion(query: string): boolean {
  const trimmed = query.trim();
  // Multiple question marks
  if ((trimmed.match(/\?/g) || []).length > 1) return true;
  // Explicit compound question
  if (
    /\b(compare|contrast|difference|explain|analyze)\b/i.test(trimmed) &&
    /\band\b/i.test(trimmed)
  ) {
    return true;
  }
  // Long question with "and" conjunction
  return trimmed.length > 120 && /\band\b/i.test(trimmed);
}

function isSimpleFactual(query: string): boolean {
  return SIMPLE_QA_PATTERNS.some((pattern) => pattern.test(query.trim()));
}

// ============================================
// MAIN ROUTING FUNCTION
// ============================================

export function routeModel(
  query: string,
  options: RouteOptions = {}
): RoutedModel {
  const { mode, topRetrievalScore, teacherContextAnchor, complexityHint } =
    options;

  const preview = query.substring(0, 60);
  console.log(` [routeModel] query="${preview}..." mode=${mode ?? "—"}`);

  // ── 1. CODE REVIEW ───────────────────────────────────────────────────────
  if (mode === "code-review" || /\breview\s+code\b/i.test(query)) {
    console.log(" [routeModel] rule=code-review → complex");
    return toLegacyModel("complex");
  }

  // ── 2. QUESTION GENERATION (MCQ / generate) ──────────────────────────────
  if (
    mode === "questions" ||
    /\b(mcq|mcqs|generate\s+questions?|create\s+questions?)\b/i.test(query)
  ) {
    console.log(" [routeModel] rule=question-generation → complex");
    return toLegacyModel("complex");
  }

  // ── 3. SUMMARIZATION ─────────────────────────────────────────────────────
  if (
    mode === "summarize" ||
    /\bsummar[iy](ze|se|y)\b/i.test(query)
  ) {
    console.log(" [routeModel] rule=summarize → simple");
    return toLegacyModel("simple");
  }

  // ── 4. EXPLICIT COMPLEXITY HINT ──────────────────────────────────────────
  if (complexityHint === "complex") {
    console.log(" [routeModel] rule=complexityHint=complex → complex");
    return toLegacyModel("complex");
  }
  if (complexityHint === "simple") {
    console.log(" [routeModel] rule=complexityHint=simple → simple");
    return toLegacyModel("simple");
  }

  // ── 5. TEACHER CONTEXT ANCHOR → extra depth needed ───────────────────────
  if (teacherContextAnchor?.trim()) {
    console.log(" [routeModel] rule=teacherContext → complex");
    return toLegacyModel("complex");
  }

  // ── 6. GENERATION REQUESTS (generic) ─────────────────────────────────────
  if (isGenerationRequest(query, mode)) {
    const tier = isSimpleGeneration(query, mode) ? "simple" : "complex";
    console.log(` [routeModel] rule=generation → ${tier}`);
    return toLegacyModel(tier);
  }

  // ── 7. LOW RETRIEVAL SCORE → more reasoning needed ───────────────────────
  if (
    topRetrievalScore !== undefined &&
    topRetrievalScore < LOW_RETRIEVAL_THRESHOLD
  ) {
    console.log(
      ` [routeModel] rule=low-retrieval(${topRetrievalScore.toFixed(2)}) → complex`
    );
    return toLegacyModel("complex");
  }

  // ── 8. COMPLEX KEYWORDS ───────────────────────────────────────────────────
  if (hasComplexKeyword(query)) {
    console.log(" [routeModel] rule=complex-keyword → complex");
    return toLegacyModel("complex");
  }

  // ── 9. MULTI-PART QUESTION ────────────────────────────────────────────────
  if (isMultiPartQuestion(query)) {
    console.log(" [routeModel] rule=multi-part → complex");
    return toLegacyModel("complex");
  }

  // ── 10. SIMPLE FACTUAL ────────────────────────────────────────────────────
  if (isSimpleFactual(query)) {
    console.log(" [routeModel] rule=simple-factual → simple");
    return toLegacyModel("simple");
  }

  // ── 11. HIGH RETRIEVAL SCORE → context is rich, fast model is fine ────────
  if (
    topRetrievalScore !== undefined &&
    topRetrievalScore > HIGH_RETRIEVAL_THRESHOLD
  ) {
    console.log(
      ` [routeModel] rule=high-retrieval(${topRetrievalScore.toFixed(2)}) → simple`
    );
    return toLegacyModel("simple");
  }

  // ── 12. DEFAULT ────────────────────────────────────────────────────────────
  console.log(" [routeModel] rule=default → simple");
  return toLegacyModel("simple");
}

// ============================================
// UTILITY
// ============================================

/** Returns true when a model is the "large / expensive" tier */
export function isLargeModel(model: RoutedModel): boolean {
  return model === "qwen35" || model === "deepseek" || model === "groq_complex";
}