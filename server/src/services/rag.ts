// server/src/services/rag.ts

/**
 * RAG integration — calls the Python rag-service when RAG_SERVICE_URL is set.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { shouldUseWebSearch } from "./answerRouter.js";
import { buildFormattedFallbackAnswer } from "./answerFormatter.js";
import { generateAnswer, modelDisplayName } from "./llm.js";
import { routeModel } from "./llmRouter.js";
import type { QueryIntent } from "./queryUnderstanding.js";
import { detectTopicChapter, extractChapterNumber } from "./queryUnderstanding.js";
import {
  formatWebContext,
  isWebSearchConfigured,
  searchWebForChapter,
  type WebSearchResult,
} from "./webSearch.js";
import { parseQuestionRequest, formatQuestionRequest, ParsedQuestionRequest } from './questionParser.js';

// ============================================
// TYPES
// ============================================

export interface RagSource {
  book_title: string;
  chapter: string;
  pages: string;
  snippet: string;
}

export interface RagQueryInput {
  question: string;
  retrievalQuery?: string;
  resolutionNote?: string;
  chapterLabel?: string;
  chapterRelated?: boolean;
  teacherContextAnchor?: string;
  schoolId: string;
  complexityHint?: "simple" | "complex";
  filters?: {
    subject?: string;
    class?: string;
    bookId?: string;
    chapter?: string;
  };
  mode?: string;
}

export interface RagQueryResult {
  answer: string;
  sources: RagSource[];
  web_sources?: any[];
  web_supplemented?: boolean;
  model_used: string;
  top_retrieval_score: number;
  llm_generated: boolean;
}

export interface IndexBookInput {
  bookId: string;
  schoolId: string;
  filePath: string;
  metadata: {
    title: string;
    subject: string;
    class: string;
    chapter: string;
    contentType: string;
  };
}

interface RagQueryResponse {
  results: Array<{
    book_title: string;
    chapter: string;
    pages: string;
    snippet: string;
    score: number;
    book_id: string;
  }>;
  top_score: number;
  context: string;
  summary?: string;
}

export interface RagCatalogChapter {
  chapter: string;
  title: string;
  subject: string;
  class: string;
  source_file: string;
  chunks: number;
}

export interface RagCatalog {
  collection: string;
  total_chunks: number;
  chapters: RagCatalogChapter[];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function ragHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  if (config.ragApiKey) {
    headers["X-RAG-Key"] = config.ragApiKey;
  }
  return headers;
}

function snippetRelevance(snippet: string, question?: string): number {
  if (!question?.trim()) return snippet.length;
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  const lower = snippet.toLowerCase();
  let score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 12 : 0), 0);
  if (/\b\w+\s+is a\b/i.test(snippet)) score += 40;
  return score + snippet.length * 0.001;
}

export function dedupeSourcesByChapter(
  sources: RagSource[],
  question?: string
): RagSource[] {
  const byChapter = new Map<string, RagSource>();

  for (const source of sources) {
    const key = `${source.book_title}:${source.chapter}`.toLowerCase();
    const existing = byChapter.get(key);

    if (!existing) {
      byChapter.set(key, { ...source });
      continue;
    }

    if (source.pages && existing.pages && !existing.pages.includes(source.pages)) {
      existing.pages = `${existing.pages}, ${source.pages}`;
    } else if (source.pages && !existing.pages) {
      existing.pages = source.pages;
    }

    if (snippetRelevance(source.snippet, question) > snippetRelevance(existing.snippet, question)) {
      existing.snippet = source.snippet;
    }
  }

  return Array.from(byChapter.values());
}

function cleanRagText(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  cleaned = cleaned.replace(/©\s*SuperTeacher\s*Edureforms\s*Pvt\.\s*Ltd\.?/gi, '');
  cleaned = cleaned.replace(/SuperTeacher\s*Edureforms\s*Pvt\.\s*Ltd\.?/gi, '');
  cleaned = cleaned.replace(/Edureforms/gi, '');
  cleaned = cleaned.replace(/Recall\s+Recall/gi, '');
  cleaned = cleaned.replace(/for More\.\.\./gi, '');
  cleaned = cleaned.replace(/For More\.\.\./gi, '');
  cleaned = cleaned.replace(/ScanScan/gi, '');
  cleaned = cleaned.replace(/scan\s*scan/gi, '');
  cleaned = cleaned.replace(/\[PAGE\s+\d+\]/gi, '');
  cleaned = cleaned.replace(/Page\s+\d+/gi, '');
  cleaned = cleaned.replace(/\[CHAPTER_START\].*?\[CHAPTER_END\]/gi, '');
  cleaned = cleaned.replace(/\[TABLE START\].*?\[TABLE END\]/gi, '');
  cleaned = cleaned.replace(/\[FORMULA\].*?\[\/FORMULA\]/gi, '');
  cleaned = cleaned.replace(/\[CODE\].*?\[\/CODE\]/gi, '');
  cleaned = cleaned.replace(/END OF CHAPTER.*$/gm, '');
  cleaned = cleaned.replace(/CHAPTER\s*\d+\s*:\s*.*$/gm, '');
  cleaned = cleaned.replace(/LEARNING OBJECTIVES.*$/gm, '');
  cleaned = cleaned.replace(/Source:.*$/gm, '');
  cleaned = cleaned.replace(/Total Pages:.*$/gm, '');
  cleaned = cleaned.replace(/Tables Found:.*$/gm, '');
  cleaned = cleaned.replace(/Formulas Found:.*$/gm, '');
  cleaned = cleaned.replace(/Code Blocks Found:.*$/gm, '');
  cleaned = cleaned.replace(/Title:.*$/gm, '');
  
  cleaned = cleaned.replace(/^\s*\d+\s*\/\s*\d+\s*/g, '');
  cleaned = cleaned.replace(/^\s*\d+\s*[\+\-\*\/]\s*\d+\s*/g, '');
  cleaned = cleaned.replace(/^\s*\d+\s*\/\s*/g, '');
  
  cleaned = cleaned.replace(/\b\d+\s*\/\s*\d+\s*\*\s*\d+\b/g, '');
  cleaned = cleaned.replace(/\b\d+\s*\+\s*\d+\s*\*\s*\d+\b/g, '');
  cleaned = cleaned.replace(/\b\d+\s*[\/\+\*\-]\s*\d+\s*[\/\+\*\-]\s*\d+\b/g, '');
  cleaned = cleaned.replace(/\b\d+\s*[\/\+\*\-]\s*\d+\b/g, '');
  
  cleaned = cleaned.replace(/ﬁ/g, 'fi');
  cleaned = cleaned.replace(/ﬂ/g, 'fl');
  cleaned = cleaned.replace(/’/g, "'");
  cleaned = cleaned.replace(/“/g, '"');
  cleaned = cleaned.replace(/”/g, '"');
  cleaned = cleaned.replace(/ø/g, 'o');
  cleaned = cleaned.replace(/Ÿ/g, "'");
  cleaned = cleaned.replace(/¢/g, '');
  cleaned = cleaned.replace(/Å/g, '');
  cleaned = cleaned.replace(/Ã/g, '');
  cleaned = cleaned.replace(/¸/g, '');
  cleaned = cleaned.replace(/î¢e/g, 'The');
  cleaned = cleaned.replace(/e/g, 'The');
  cleaned = cleaned.replace(/oowchart/gi, 'flowchart');
  cleaned = cleaned.replace(/A,owchart/gi, 'flowchart');
  
  cleaned = cleaned.replace(/_{5,}/g, '');
  cleaned = cleaned.replace(/_{3,4}/g, ' ');
  cleaned = cleaned.replace(/_{2,}/g, ' ');
  
  const sentences = cleaned.match(/[^.!?]*[.!?]/g) || [];
  
  const meaningful = sentences.filter(s => {
    const trimmed = s.trim();
    return trimmed.length > 15 && 
           /[a-zA-Z]/.test(trimmed) &&
           !trimmed.includes('___') &&
           !trimmed.includes('_ _ _') &&
           trimmed.split(' ').length > 2;
  });
  
  if (meaningful.length > 0) {
    cleaned = meaningful.join(' ');
  } else {
    cleaned = cleaned.replace(/[@#\$%\^&\*\(\)\{\}\[\]|\\;:'",<>\/?]/g, '');
    cleaned = cleaned.replace(/[•●○◆◇■□▶▸]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.trim();
  }
  
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned;
}

function mapRagResults(data: RagQueryResponse): RagSource[] {
  return data.results.map((r) => ({
    book_title: r.book_title || 'Textbook',
    chapter: r.chapter || 'Unknown',
    pages: r.pages || '',
    snippet: cleanRagText(r.snippet || ''),
  }));
}

function buildContextFromSources(sources: RagSource[]): string {
  return sources
    .map((s, i) => {
      const pages = s.pages ? `, p. ${s.pages}` : "";
      return `[Source ${i + 1} — ${s.book_title}${s.chapter ? `, Ch. ${s.chapter}` : ""}${pages}]\n${s.snippet}`;
    })
    .join("\n\n");
}

function buildAnswerFromRetrieval(
  question: string,
  context: string,
  sources: RagSource[],
  _modelLabel: string,
  summary?: string
): string {
  if (sources.length === 0) {
    return (
      "I couldn't find relevant material in your school's library for this question. " +
      "Make sure books are uploaded and indexed, or try rephrasing your question."
    );
  }

  return buildFormattedFallbackAnswer({
    question,
    context,
    sources,
    summary,
  });
}

async function callRagService(input: {
  question: string;
  schoolId: string;
  bookId?: string;
  subject?: string;
  class?: string;
  chapter?: string;
}): Promise<RagQueryResponse | null> {
  let chapterParam = input.chapter;
  if (chapterParam) {
    chapterParam = chapterParam.replace(/^chapter\s+/i, '').trim();
    const numMatch = chapterParam.match(/\d+/);
    if (numMatch) {
      chapterParam = numMatch[0];
    }
  }
  
  console.log(`[callRagService] Querying: chapter=${chapterParam || 'none'}, question=${input.question.substring(0, 50)}...`);
  
  const response = await fetch(`${config.ragServiceUrl}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...ragHeaders(),
    },
    body: JSON.stringify({
      question: input.question,
      school_id: input.schoolId,
      book_id: input.bookId,
      subject: input.subject,
      class: input.class,
      chapter: chapterParam,
      // Use more chunks for summary/question queries to give LLM richer context
      top_k: input.question && /\b(summarize|summary|overview|generate|create|mcq)\b/i.test(input.question) ? 30 : 20,
    }),
    signal: AbortSignal.timeout(600_000),
  });

  if (!response.ok) {
    console.error("RAG query failed:", await response.text());
    return null;
  }

  return (await response.json()) as RagQueryResponse;
}

export function isRagServiceConfigured(): boolean {
  return Boolean(config.ragServiceUrl);
}

export async function fetchRagCatalog(): Promise<any | null> {
  if (!config.ragServiceUrl) return null;

  try {
    const response = await fetch(`${config.ragServiceUrl}/catalog`, {
      headers: ragHeaders(),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.warn("RAG catalog fetch failed:", err);
    return null;
  }
}

export async function checkRagHealth(): Promise<boolean> {
  if (!config.ragServiceUrl) return false;

  try {
    const response = await fetch(`${config.ragServiceUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

// ============================================
// EXTRACT CHAPTERS
// ============================================

function extractMultipleChapters(query: string): number[] {
    const chapters: number[] = [];

    console.log(`[extractMultipleChapters] Processing: "${query}"`);

    // 1. Range: "chapters 3 to 6" / "chapters 3-6" / "chapters 3 through 6"
    const rangePatterns = [
        /chapters?\s+(\d+)\s*(?:to|through|–|-)\s*(\d+)/i,
    ];

    for (const pattern of rangePatterns) {
        const match = query.match(pattern);
        if (match) {
            const start = parseInt(match[1]);
            const end = parseInt(match[2]);
            console.log(`[extractMultipleChapters] Found range: ${start} to ${end}`);
            for (let i = start; i <= end; i++) chapters.push(i);
            return chapters;
        }
    }

    // 2. Specific list: "chapters 3, 4 and 5" / "chapters 3 and 4" / "chapters 3,4,5"
    //    Grab everything after "chapters" and parse numbers separated by comma/and/space
    const listMatch = query.match(/chapters?\s+([\d,\s]+(?:(?:and|&)\s*\d+)*)/i);
    if (listMatch) {
        const raw = listMatch[1].replace(/\b(?:and|&)\b/gi, ',');
        const nums = raw
            .split(/[,\s]+/)
            .map(Number)
            .filter(n => !isNaN(n) && n >= 1 && n <= 20);
        const unique = [...new Set(nums)];
        if (unique.length > 0) {
            console.log(`[extractMultipleChapters] Found list: ${unique.join(', ')}`);
            return unique;
        }
    }

    // 3. Single chapter
    const singlePatterns = [
        /chapter\s+(\d+)/i,
        /ch\.?\s*(\d+)/i,
    ];

    for (const pattern of singlePatterns) {
        const match = query.match(pattern);
        if (match) {
            console.log(`[extractMultipleChapters] Found single chapter: ${match[1]}`);
            return [parseInt(match[1])];
        }
    }

    console.log(`[extractMultipleChapters] No chapters found`);
    return chapters;
}

// ============================================
// DETECT QUESTION GENERATION
// ============================================

function isQuestionGenerationQuery(query: string): boolean {
    // Explicit generation keywords + question keyword
    const hasGenerationWord = /\b(generate|create|make|produce|write|prepare)\b/i.test(query);
    const hasQuestionWord = /\bquestions?\b/i.test(query);

    // Explicit question type keywords (no "generate" needed — e.g. "5 MCQs from chapter 3")
    const hasQuestionType = /(?:mcqs?|multiple\s+choice|long\s+(?:answer\s+)?questions?|short\s+(?:answer\s+)?questions?|very\s+short|hot\s+questions?|hots?)/i.test(query);

    // Count + type pattern like "5 MCQs", "10 short", "3 long"
    const hasCountAndType = /\d+\s*(?:mcqs?|long|short|very\s+short|hot|hots?)/i.test(query);

    return (hasGenerationWord && hasQuestionWord) || hasQuestionType || hasCountAndType;
}

function detectQuestionType(query: string): 'mcq' | 'long' | 'short' | 'hot' | 'all' {
    if (/mcq|multiple\s+choice/i.test(query)) return 'mcq';
    if (/long|detailed|essay/i.test(query)) return 'long';
    if (/short/i.test(query)) return 'short';
    if (/hot|key|important/i.test(query)) return 'hot';
    return 'all';
}

// ============================================
// HANDLE COMPLEX QUESTION REQUEST
// ============================================

async function handleComplexQuestionRequest(
    input: RagQueryInput,
    parsed: ParsedQuestionRequest
): Promise<RagQueryResult> {
    console.log(` [rag.ts] Handling complex question request`);
    
    const allSources: RagSource[] = [];
    const chapterContents: Record<string, string> = {};
    
    for (const chapter of parsed.chapters) {
        try {
            const data = await callRagService({
                question: `chapter ${chapter}`,
                schoolId: input.schoolId,
                bookId: input.filters?.bookId,
                subject: input.filters?.subject,
                class: input.filters?.class,
                chapter: String(chapter),
            });
            
            if (data && data.results.length > 0) {
                const sources = mapRagResults(data);
                allSources.push(...sources);
                chapterContents[String(chapter)] = sources.map(s => s.snippet).join('\n');
                console.log(` [rag.ts] Chapter ${chapter} found ${sources.length} sources`);
            } else {
                const fallbackData = await callRagService({
                    question: `chapter ${chapter}`,
                    schoolId: input.schoolId,
                    bookId: input.filters?.bookId,
                    subject: input.filters?.subject,
                    class: input.filters?.class,
                    chapter: undefined,
                });
                if (fallbackData && fallbackData.results.length > 0) {
                    const sources = mapRagResults(fallbackData);
                    allSources.push(...sources);
                    chapterContents[String(chapter)] = sources.map(s => s.snippet).join('\n');
                    console.log(` [rag.ts] Chapter ${chapter} found ${sources.length} sources via fallback`);
                }
            }
        } catch (err) {
            console.error(` [rag.ts] Error fetching chapter ${chapter}:`, err);
        }
    }
    
    if (allSources.length === 0) {
        const chaptersStr = parsed.chapters.join(', ');
        return {
            answer: `I couldn't find content for chapters ${chaptersStr} in your library. Please make sure these chapters have been uploaded and indexed.`,
            sources: [],
            model_used: "synthesizer",
            top_retrieval_score: 0,
            llm_generated: false,
        };
    }
    
    const dedupedSources = dedupeSourcesByChapter(allSources, input.question);
    const context = buildContextFromSources(dedupedSources);
    
    const model = "groq_complex";
    const { buildMixedQuestionPrompt } = await import('./llm.js');
    const prompt = buildMixedQuestionPrompt(input.question, context, dedupedSources, parsed);
    
    const generated = await generateAnswer({
        model,
        question: prompt,
        context,
        sources: dedupedSources,
        resolutionNote: `Questions from chapters ${parsed.chapters.join(', ')}`,
        chapterLabel: `chapters ${parsed.chapters.join(', ')}`,
        teacherContextAnchor: input.teacherContextAnchor,
        webContext: undefined,
        intent: "questions",
    });
    
    if (generated) {
        return {
            answer: generated.answer,
            sources: dedupedSources,
            model_used: generated.model_used,
            top_retrieval_score: 1.0,
            llm_generated: true,
        };
    }
    
    return {
        answer: buildAnswerFromRetrieval(input.question, context, dedupedSources, "synthesizer", ""),
        sources: dedupedSources,
        model_used: "synthesizer",
        top_retrieval_score: 1.0,
        llm_generated: false,
    };
}

// ============================================
// HANDLE MULTIPLE CHAPTERS SUMMARIZATION
// ============================================

async function handleMultipleChaptersSummary(
    input: RagQueryInput,
    chapters: number[]
): Promise<RagQueryResult> {
    console.log(`[handleMultipleChaptersSummary] Processing chapters: ${chapters.join(', ')}`);
    
    const allSources: RagSource[] = [];
    const chapterContents: Record<string, string> = {};
    const foundChapters: number[] = [];
    const missingChapters: number[] = [];
    
    for (const chapter of chapters) {
        try {
            console.log(`[handleMultipleChaptersSummary] Fetching chapter ${chapter}...`);
            
            let data = await callRagService({
                question: `chapter ${chapter}`,
                schoolId: input.schoolId,
                bookId: input.filters?.bookId,
                subject: input.filters?.subject,
                class: input.filters?.class,
                chapter: String(chapter),
            });
            
            if (!data || data.results.length === 0) {
                console.log(`[handleMultipleChaptersSummary] Chapter ${chapter} - no results with filter, trying without...`);
                data = await callRagService({
                    question: `chapter ${chapter}`,
                    schoolId: input.schoolId,
                    bookId: input.filters?.bookId,
                    subject: input.filters?.subject,
                    class: input.filters?.class,
                    chapter: undefined,
                });
            }
            
            if (data && data.results.length > 0) {
                const sources = mapRagResults(data);
                allSources.push(...sources);
                chapterContents[String(chapter)] = sources.map(s => s.snippet).join('\n');
                foundChapters.push(chapter);
                console.log(`[handleMultipleChaptersSummary] Chapter ${chapter} found ${sources.length} sources`);
            } else {
                console.log(`[handleMultipleChaptersSummary] Chapter ${chapter} - NO sources found`);
                missingChapters.push(chapter);
            }
        } catch (err) {
            console.error(`[handleMultipleChaptersSummary] Error fetching chapter ${chapter}:`, err);
            missingChapters.push(chapter);
        }
    }
    
    console.log(`[handleMultipleChaptersSummary] Found: ${foundChapters.join(', ')}, Missing: ${missingChapters.join(', ')}`);
    
    if (allSources.length === 0) {
        return {
            answer: `I couldn't find content for chapters ${chapters.join(', ')} in your library. Please make sure these chapters have been uploaded and indexed.`,
            sources: [],
            model_used: "synthesizer",
            top_retrieval_score: 0,
            llm_generated: false,
        };
    }
    
    const dedupedSources = dedupeSourcesByChapter(allSources, input.question);
    const context = buildContextFromSources(dedupedSources);
    
    let chapterContext = '';
    for (const chapter of foundChapters) {
        if (chapterContents[String(chapter)]) {
            const snippet = chapterContents[String(chapter)].substring(0, 800);
            chapterContext += `=== Chapter ${chapter} ===\n${snippet}\n\n`;
        }
    }
    
    const enhancedQuestion = `Summarize chapters ${foundChapters.join(', ')}. 
    ${missingChapters.length > 0 ? `NOTE: Chapters ${missingChapters.join(', ')} were not found in the database.` : ''}
    
    Chapter Content:
    ${chapterContext}
    
    Please provide a clear, organized summary for each chapter, covering the key concepts, main ideas, and important takeaways.`;
    
    const model = "groq_simple";
    
    const generated = await generateAnswer({
        model,
        question: enhancedQuestion,
        context,
        sources: dedupedSources,
        resolutionNote: `Summary of chapters ${foundChapters.join(', ')}`,
        chapterLabel: `chapters ${foundChapters.join(', ')}`,
        teacherContextAnchor: input.teacherContextAnchor,
        webContext: undefined,
        intent: "summarize",
    });
    
    if (generated) {
        let finalAnswer = generated.answer;
        if (missingChapters.length > 0) {
            finalAnswer += `\n\n---\n\n**Note:** Content for Chapter ${missingChapters.join(', ')} could not be found in the database. Please ensure these chapters are indexed.`;
        }
        return {
            answer: finalAnswer,
            sources: dedupedSources,
            model_used: generated.model_used,
            top_retrieval_score: 1.0,
            llm_generated: true,
        };
    }
    
    return {
        answer: buildAnswerFromRetrieval(input.question, context, dedupedSources, "synthesizer", ""),
        sources: dedupedSources,
        model_used: "synthesizer",
        top_retrieval_score: 1.0,
        llm_generated: false,
    };
}

// ============================================
// HANDLE MULTIPLE CHAPTERS QUESTIONS
// ============================================

async function handleMultipleChaptersQuestions(
    input: RagQueryInput,
    chapters: number[]
): Promise<RagQueryResult> {
    console.log(`[handleMultipleChaptersQuestions] Processing chapters: ${chapters.join(', ')}`);
    
    const allSources: RagSource[] = [];
    const chapterContents: Record<string, string> = {};
    const foundChapters: number[] = [];
    const missingChapters: number[] = [];
    
    for (const chapter of chapters) {
        try {
            console.log(`[handleMultipleChaptersQuestions] Fetching chapter ${chapter}...`);
            
            let data = await callRagService({
                question: `chapter ${chapter}`,
                schoolId: input.schoolId,
                bookId: input.filters?.bookId,
                subject: input.filters?.subject,
                class: input.filters?.class,
                chapter: String(chapter),
            });
            
            if (!data || data.results.length === 0) {
                console.log(`[handleMultipleChaptersQuestions] Chapter ${chapter} - no results with filter, trying without...`);
                data = await callRagService({
                    question: `chapter ${chapter}`,
                    schoolId: input.schoolId,
                    bookId: input.filters?.bookId,
                    subject: input.filters?.subject,
                    class: input.filters?.class,
                    chapter: undefined,
                });
            }
            
            if (data && data.results.length > 0) {
                const sources = mapRagResults(data);
                allSources.push(...sources);
                chapterContents[String(chapter)] = sources.map(s => s.snippet).join('\n');
                foundChapters.push(chapter);
                console.log(`[handleMultipleChaptersQuestions] Chapter ${chapter} found ${sources.length} sources`);
            } else {
                console.log(`[handleMultipleChaptersQuestions] Chapter ${chapter} - NO sources found`);
                missingChapters.push(chapter);
            }
        } catch (err) {
            console.error(`[handleMultipleChaptersQuestions] Error fetching chapter ${chapter}:`, err);
            missingChapters.push(chapter);
        }
    }
    
    console.log(`[handleMultipleChaptersQuestions] Found: ${foundChapters.join(', ')}, Missing: ${missingChapters.join(', ')}`);
    
    if (allSources.length === 0) {
        return {
            answer: `I couldn't find content for chapters ${chapters.join(', ')} in your library. Please make sure these chapters have been uploaded and indexed.`,
            sources: [],
            model_used: "synthesizer",
            top_retrieval_score: 0,
            llm_generated: false,
        };
    }
    
    const dedupedSources = dedupeSourcesByChapter(allSources, input.question);
    const context = buildContextFromSources(dedupedSources);
    
    let chapterContext = '';
    for (const chapter of foundChapters) {
        if (chapterContents[String(chapter)]) {
            const snippet = chapterContents[String(chapter)].substring(0, 800);
            chapterContext += `=== Chapter ${chapter} ===\n${snippet}\n\n`;
        }
    }
    
    const questionType = detectQuestionType(input.question);
    const count = chapters.length * 5;
    
    const enhancedQuestion = `Generate ${questionType === 'mcq' ? 'multiple choice' : questionType === 'long' ? 'long answer' : 'short'} questions from chapters ${foundChapters.join(', ')}. 
    
    ${missingChapters.length > 0 ? `NOTE: Chapters ${missingChapters.join(', ')} were not found in the database.` : ''}
    
    Chapter Content:
    ${chapterContext}
    
    Number of questions: ${count}
    Type: ${questionType === 'mcq' ? 'MCQs with 4 options each' : questionType === 'long' ? 'Detailed long-answer questions' : 'Short-answer questions'}`;
    
    const model = "groq_complex";
    
    const generated = await generateAnswer({
        model,
        question: enhancedQuestion,
        context,
        sources: dedupedSources,
        resolutionNote: `Questions from chapters ${foundChapters.join(', ')}`,
        chapterLabel: `chapters ${foundChapters.join(', ')}`,
        teacherContextAnchor: input.teacherContextAnchor,
        webContext: undefined,
        intent: "questions",
    });
    
    if (generated) {
        let finalAnswer = generated.answer;
        if (missingChapters.length > 0) {
            finalAnswer += `\n\n---\n\n**Note:** Content for Chapter ${missingChapters.join(', ')} could not be found in the database. Please ensure these chapters are indexed.`;
        }
        return {
            answer: finalAnswer,
            sources: dedupedSources,
            model_used: generated.model_used,
            top_retrieval_score: 1.0,
            llm_generated: true,
        };
    }
    
    return {
        answer: buildAnswerFromRetrieval(input.question, context, dedupedSources, "synthesizer", ""),
        sources: dedupedSources,
        model_used: "synthesizer",
        top_retrieval_score: 1.0,
        llm_generated: false,
    };
}

// ============================================
// SINGLE CHAPTER HANDLING
// ============================================

async function handleSingleChapter(
    input: RagQueryInput,
    chapter: string
): Promise<RagQueryResult> {
    console.log(`[handleSingleChapter] Processing chapter: ${chapter}`);
    
    if (!config.ragServiceUrl) {
        console.log(" [rag.ts] RAG service URL not configured");
        return queryRagStub(input);
    }

    try {
        const retrievalQuestion = input.retrievalQuery ?? input.question;
        const isQuestionGen = isQuestionGenerationQuery(input.question);
        const isSummarizeQuery = /\b(summarize|summary|overview)\b/i.test(input.question);
        
        const ragCallBase = {
            schoolId: input.schoolId,
            bookId: input.filters?.bookId,
            subject: input.filters?.subject,
            class: input.filters?.class,
        };

        console.log(" [rag.ts] Calling RAG service...");
        
        let data = await callRagService({
            question: retrievalQuestion,
            ...ragCallBase,
            chapter: chapter,
        });

        console.log(` [rag.ts] RAG returned ${data?.results?.length || 0} results`);

        if (!data) {
            console.log(" [rag.ts] No data from RAG");
            return queryRagStub(input);
        }

        let allSources = mapRagResults(data);

        if (allSources.length === 0) {
            // Try without chapter filter
            const broad = await callRagService({
                question: `${retrievalQuestion} chapter ${chapter}`,
                ...ragCallBase,
                chapter: undefined,
            });
            if (broad && broad.results.length > 0) {
                allSources = mapRagResults(broad).filter(s => s.chapter === chapter);
                if (allSources.length === 0) {
                    allSources = mapRagResults(broad);
                }
            }
        }

        if (allSources.length === 0) {
            return {
                answer: `I couldn't find **Chapter ${chapter}** in your library. Please make sure this chapter has been uploaded and indexed.`,
                sources: [],
                model_used: "synthesizer",
                top_retrieval_score: 0,
                llm_generated: false,
            };
        }

        let sources = dedupeSourcesByChapter(allSources, retrievalQuestion);
        console.log(` [rag.ts] Final sources: ${sources.length}`);

        let model = routeModel(input.question, {
            mode: input.mode,
            topRetrievalScore: data.top_score,
            teacherContextAnchor: input.teacherContextAnchor,
            complexityHint: input.complexityHint,
        });

        if (isQuestionGen) {
            model = "groq_complex";
            console.log(" [rag.ts] Question generation detected, using complex model");
        } else if (isSummarizeQuery) {
            model = "groq_simple";
            console.log(" [rag.ts] Summarization detected, using simple model");
        }

        console.log(` [rag.ts] Model selected: ${model}`);

        const llmSources = sources;
        const llmContext = buildContextFromSources(llmSources);

        console.log(" [rag.ts] Calling generateAnswer...");
        console.log(` [rag.ts] Context length: ${llmContext.length}`);
        console.log(` [rag.ts] Sources count: ${llmSources.length}`);

        const enhancedQuestion = isQuestionGen 
            ? `${input.question}\n\nType of questions: ${detectQuestionType(input.question)}`
            : input.question;

        const generated = await generateAnswer({
            model,
            question: enhancedQuestion,
            context: llmContext,
            sources: llmSources,
            resolutionNote: input.resolutionNote,
            chapterLabel: input.chapterLabel,
            teacherContextAnchor: input.teacherContextAnchor,
            webContext: undefined,
            intent: isQuestionGen ? "questions" : isSummarizeQuery ? "summarize" : "general",
        });

        console.log(` [rag.ts] generateAnswer result: ${generated ? 'SUCCESS' : 'FAILED'}`);

        if (generated) {
            console.log(" [rag.ts] Using LLM generated answer");
            return {
                answer: generated.answer,
                sources,
                model_used: generated.model_used,
                top_retrieval_score: data.top_score,
                llm_generated: true,
            };
        }

        console.log(" [rag.ts] LLM failed, using fallback");
        return {
            answer: buildAnswerFromRetrieval(
                input.question,
                llmContext,
                sources,
                modelDisplayName(model),
                data.summary
            ),
            sources,
            model_used: model,
            top_retrieval_score: data.top_score,
            llm_generated: false,
        };
    } catch (err) {
        console.error(" [rag.ts] Error:", err);
        return queryRagStub(input);
    }
}

// ============================================
// MAIN QUERY RAG FUNCTION
// ============================================

export async function queryRag(input: RagQueryInput): Promise<RagQueryResult> {
    console.log(" [rag.ts] queryRag STARTED for:", input.question);
    
    // Check intent FIRST
    const isSummarizeQuery = /\b(summarize|summary|overview)\b/i.test(input.question);
    const isQuestionGen = isQuestionGenerationQuery(input.question);
    
    console.log(` [rag.ts] Is Summarize Query: ${isSummarizeQuery}`);
    console.log(` [rag.ts] Is Question Generation: ${isQuestionGen}`);
    
    // Check for complex question request (multiple types from multiple chapters)
    // Only if it's NOT a summarize query
    if (!isSummarizeQuery) {
        const parsedRequest = parseQuestionRequest(input.question);
        if (parsedRequest && parsedRequest.totalQuestions > 0) {
            console.log(` [rag.ts] Parsed complex request:`, parsedRequest);
            return await handleComplexQuestionRequest(input, parsedRequest);
        }
    }
    
    // Extract chapters
    const chapters = extractMultipleChapters(input.question);
    
    console.log(` [rag.ts] Chapters found: ${chapters.length > 0 ? chapters.join(', ') : 'none'}`);
    
    // Handle based on chapters and intent
    if (chapters.length > 1) {
        if (isSummarizeQuery) {
            console.log(` [rag.ts] Multiple chapters for summarization: ${chapters.join(', ')}`);
            return await handleMultipleChaptersSummary(input, chapters);
        } else if (isQuestionGen) {
            console.log(` [rag.ts] Multiple chapters for questions: ${chapters.join(', ')}`);
            return await handleMultipleChaptersQuestions(input, chapters);
        } else {
            // Default to summary for multiple chapters
            console.log(` [rag.ts] Multiple chapters, defaulting to summarization: ${chapters.join(', ')}`);
            return await handleMultipleChaptersSummary(input, chapters);
        }
    }
    
    // Single chapter
    if (chapters.length === 1) {
        console.log(` [rag.ts] Single chapter: ${chapters[0]}`);
        return await handleSingleChapter(input, String(chapters[0]));
    }
    
    // No chapters detected, use existing flow
    const chapterFilter = input.filters?.chapter;
    
    if (!config.ragServiceUrl) {
        console.log(" [rag.ts] RAG service URL not configured");
        return queryRagStub(input);
    }

    try {
        const retrievalQuestion = input.retrievalQuery ?? input.question;
        const ragCallBase = {
            schoolId: input.schoolId,
            bookId: input.filters?.bookId,
            subject: input.filters?.subject,
            class: input.filters?.class,
        };

        console.log(" [rag.ts] Calling RAG service...");
        
        let data = await callRagService({
            question: retrievalQuestion,
            ...ragCallBase,
            chapter: chapterFilter,
        });

        console.log(` [rag.ts] RAG returned ${data?.results?.length || 0} results`);

        if (!data) {
            console.log(" [rag.ts] No data from RAG");
            return queryRagStub(input);
        }

        let allSources = mapRagResults(data);

        if (allSources.length === 0) {
            return {
                answer: `I couldn't find relevant material in your library for this question. Please try rephrasing or make sure books are uploaded.`,
                sources: [],
                model_used: "synthesizer",
                top_retrieval_score: 0,
                llm_generated: false,
            };
        }

        let sources = dedupeSourcesByChapter(allSources, retrievalQuestion);
        console.log(` [rag.ts] Final sources: ${sources.length}`);

        let model = routeModel(input.question, {
            mode: input.mode,
            topRetrievalScore: data.top_score,
            teacherContextAnchor: input.teacherContextAnchor,
            complexityHint: input.complexityHint,
        });

        if (isQuestionGen) {
            model = "groq_complex";
        } else if (isSummarizeQuery) {
            model = "groq_simple";
        }

        console.log(` [rag.ts] Model selected: ${model}`);

        const llmSources = sources;
        const llmContext = buildContextFromSources(llmSources);

        console.log(" [rag.ts] Calling generateAnswer...");
        console.log(` [rag.ts] Context length: ${llmContext.length}`);
        console.log(` [rag.ts] Sources count: ${llmSources.length}`);

        const generated = await generateAnswer({
            model,
            question: input.question,
            context: llmContext,
            sources: llmSources,
            resolutionNote: input.resolutionNote,
            chapterLabel: input.chapterLabel,
            teacherContextAnchor: input.teacherContextAnchor,
            webContext: undefined,
            intent: isQuestionGen ? "questions" : isSummarizeQuery ? "summarize" : "general",
        });

        console.log(` [rag.ts] generateAnswer result: ${generated ? 'SUCCESS' : 'FAILED'}`);

        if (generated) {
            console.log(" [rag.ts] Using LLM generated answer");
            return {
                answer: generated.answer,
                sources,
                model_used: generated.model_used,
                top_retrieval_score: data.top_score,
                llm_generated: true,
            };
        }

        console.log(" [rag.ts] LLM failed, using fallback");
        return {
            answer: buildAnswerFromRetrieval(
                input.question,
                llmContext,
                sources,
                modelDisplayName(model),
                data.summary
            ),
            sources,
            model_used: model,
            top_retrieval_score: data.top_score,
            llm_generated: false,
        };
    } catch (err) {
        console.error(" [rag.ts] Error:", err);
        return queryRagStub(input);
    }
}

// ============================================
// HELPER: SOURCES MATCH QUESTION
// ============================================

const QUERY_STOPWORDS = new Set([
  "about",
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
]);

function questionTerms(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !QUERY_STOPWORDS.has(t));
}

function sourcesMatchQuestion(
  question: string,
  sources: RagSource[],
  curriculumQuestion?: string
): boolean {
  const terms = questionTerms(curriculumQuestion ?? question);
  if (terms.length === 0) return true;

  const blob = sources
    .map((s) => `${s.snippet} ${s.book_title}`)
    .join(" ")
    .toLowerCase();

  return terms.some((term) => blob.includes(term));
}

// ============================================
// STUB
// ============================================

function queryRagStub(input: RagQueryInput): RagQueryResult {
  const model = routeModel(input.question, {
    mode: input.mode,
    topRetrievalScore: undefined,
  });

  return {
    answer:
      `**AIRA (RAG service offline)**\n\n` +
      `Start the Python RAG service and set \`RAG_SERVICE_URL\` on the API server.\n\n` +
      `**Question:** ${input.question}\n` +
      `**Routed model:** ${modelDisplayName(model)}`,
    sources: [],
    model_used: model,
    top_retrieval_score: 0,
    llm_generated: false,
  };
}

// ============================================
// INDEX AND DELETE FUNCTIONS
// ============================================

export async function indexBook(input: IndexBookInput): Promise<{
  extractionMethod: "digital" | "ocr";
}> {
  if (!config.ragServiceUrl) {
    console.log(`[RAG stub] index book ${input.bookId} at ${input.filePath}`);
    return { extractionMethod: "digital" };
  }

  const buffer = await fs.readFile(input.filePath);
  const form = new FormData();
  form.append(
    "file",
    new File([buffer], path.basename(input.filePath), {
      type: "application/pdf",
    })
  );
  form.append("school_id", input.schoolId);
  form.append("book_id", input.bookId);
  form.append("title", input.metadata.title);
  form.append("subject", input.metadata.subject);
  form.append("class", input.metadata.class);
  form.append("chapter", input.metadata.chapter);
  form.append("content_type", input.metadata.contentType);

  const response = await fetch(`${config.ragServiceUrl}/index`, {
    method: "POST",
    headers: ragHeaders(),
    body: form,
    signal: AbortSignal.timeout(600_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "RAG indexing failed");
  }

  const data = (await response.json()) as { chunks_indexed?: number };
  console.log(
    `[RAG] indexed book ${input.bookId}: ${data.chunks_indexed ?? 0} chunks`
  );

  return { extractionMethod: "digital" };
}

export async function deleteBookVectors(
  schoolId: string,
  bookId: string
): Promise<void> {
  if (!config.ragServiceUrl) return;

  try {
    const url = new URL(
      `${config.ragServiceUrl}/books/${encodeURIComponent(bookId)}`
    );
    url.searchParams.set("school_id", schoolId);

    const response = await fetch(url, {
      method: "DELETE",
      headers: ragHeaders(),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      console.warn("Failed to delete RAG vectors:", await response.text());
    }
  } catch (err) {
    console.warn("RAG delete vectors failed:", err);
  }
}