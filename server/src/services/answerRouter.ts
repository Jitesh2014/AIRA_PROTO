import type { QueryIntent } from "./queryUnderstanding.js";
import {
  anchorInSources,
  needsExternalSupplement,
  needsLiveWebData,
  stripOffCurriculumAnchors,
} from "./queryUnderstanding.js";
import type { RagSource } from "./rag.js";

const LOW_RAG_SCORE = 0.65;

function sourcesMatchQuestion(question: string, sources: RagSource[]): boolean {
  const stop = new Set([
    "about",
    "chapter",
    "explain",
    "describe",
    "generate",
    "please",
    "question",
    "summarize",
    "tell",
    "what",
    "when",
    "where",
    "which",
    "using",
    "context",
  ]);

  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !stop.has(t));

  if (terms.length === 0) return sources.length > 0;

  const blob = sources
    .map((s) => `${s.snippet} ${s.book_title}`)
    .join(" ")
    .toLowerCase();

  return terms.some((term) => blob.includes(term));
}

export function ragFullyCoversQuestion(input: {
  question: string;
  sources: RagSource[];
  topScore: number;
}): boolean {
  return (
    input.topScore >= LOW_RAG_SCORE &&
    input.sources.length > 0 &&
    sourcesMatchQuestion(input.question, input.sources)
  );
}

/**
 * Web when chapter is known and RAG is insufficient.
 * When the teacher names a custom context (FIFA etc.), the LLM applies it — no Tavily
 * unless they explicitly need live web facts (latest news, from the internet).
 */
export function shouldUseWebSearch(input: {
  chapter?: string;
  intent: QueryIntent;
  question: string;
  sources: RagSource[];
  topScore: number;
  webSearchAvailable: boolean;
  teacherContextAnchor?: string;
}): boolean {
  if (!input.webSearchAvailable) return false;
  if (!input.chapter?.trim()) return false;

  if (input.intent === "summarize" || input.intent === "questions") {
    return false;
  }

  const anchor = input.teacherContextAnchor?.trim();
  if (anchor && !anchorInSources(anchor, input.sources)) {
    return needsLiveWebData(input.question);
  }

  const curriculumQuestion =
    stripOffCurriculumAnchors(input.question) || input.question;

  const covered = ragFullyCoversQuestion(input);
  const coveredCurriculum = ragFullyCoversQuestion({
    ...input,
    question: curriculumQuestion,
  });

  if (covered || coveredCurriculum) {
    return false;
  }

  return (
    input.sources.length === 0 ||
    input.topScore < LOW_RAG_SCORE ||
    needsExternalSupplement(input.question)
  );
}
