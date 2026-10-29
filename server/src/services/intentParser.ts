import { config } from "../config.js";
import type { QueryIntent } from "./queryUnderstanding.js";

export interface ParsedTeacherIntent {
  intent?: QueryIntent | string;
  chapter?: string | null;
  teacher_context_anchor?: string | null;
  topic?: string | null;
  retrieval_query?: string | null;
  complexity?: "simple" | "complex" | string;
}

const INTENT_SYSTEM = `You parse teacher chat messages for AIRA, a Grade 6 textbook RAG assistant.
Return ONLY valid JSON with these fields:
- intent: "summarize" | "questions" | "general"
- chapter: string chapter number if mentioned (e.g. "5"), or null
- teacher_context_anchor: creative theme if teacher wants examples in a setting (FIFA, Doraemon, Avengers, Chandramukhi, cricket, etc.) or null. NOT generic words like "exercises" or "examples".
- topic: short curriculum topic if clear, or null
- complexity: "simple" for summarize, MCQs, define, explain one topic. "complex" for compare, analyze, themed retell, multi-part, or weak/vague requests.

Rules:
- "summarize chapter 5 with Chandramukhi" → intent summarize, chapter 5, anchor Chandramukhi, complexity complex
- "generate questions chapter 4" → intent questions, chapter 4, complexity simple
- "explain variables" → intent general, topic variables, complexity simple`;

export function isIntentParserConfigured(): boolean {
  return config.llmMode === "cloud" && Boolean(config.groqApiKey);
}

function extractJsonObject(text: string): ParsedTeacherIntent | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as ParsedTeacherIntent;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as ParsedTeacherIntent;
    } catch {
      return null;
    }
  }
}

function normalizeIntent(raw?: string, mode?: string): QueryIntent {
  if (mode === "summarize" || mode === "questions") return mode;
  if (raw === "summarize" || raw === "questions") return raw;
  return "general";
}

export async function parseTeacherIntent(
  message: string,
  mode?: string
): Promise<ParsedTeacherIntent | null> {
  if (!isIntentParserConfigured()) return null;

  try {
    const url = `${config.groqBaseUrl}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.groqApiKey}`,
      },
      body: JSON.stringify({
        model: config.groqIntentModel,
        temperature: 0.1,
        max_tokens: 256,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INTENT_SYSTEM },
          {
            role: "user",
            content: `Mode button: ${mode ?? "none"}\nMessage: ${message}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(config.groqIntentTimeoutMs),
    });

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      console.warn("Intent parser failed:", data.error?.message);
      return null;
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = extractJsonObject(content);
    if (!parsed) return null;

    return {
      intent: normalizeIntent(
        typeof parsed.intent === "string" ? parsed.intent : undefined,
        mode
      ),
      chapter: parsed.chapter?.toString().trim() || undefined,
      teacher_context_anchor:
        parsed.teacher_context_anchor?.trim() || undefined,
      topic: parsed.topic?.trim() || undefined,
      retrieval_query: parsed.retrieval_query?.trim() || undefined,
      complexity: parsed.complexity === "complex" ? "complex" : "simple",
    };
  } catch (err) {
    console.warn("Intent parser error:", err);
    return null;
  }
}
