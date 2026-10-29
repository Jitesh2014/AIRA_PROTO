import {
  fetchRagCatalog,
  type RagCatalog,
  type RagCatalogChapter,
} from "./rag.js";
import {
  parseTeacherIntent,
  type ParsedTeacherIntent,
} from "./intentParser.js";

export type QueryIntent = "summarize" | "questions" | "general";

export interface ResolvedQuery {
  original: string;
  normalized: string;
  retrievalQuery: string;
  chapter?: string;
  chapterLabel?: string;
  topicHint?: string;
  intent: QueryIntent;
  /** True when a chapter/topic could be resolved for scoped retrieval */
  chapterRelated: boolean;
  /** Teacher-named example context (e.g. FIFA World Cup) — may not be in the textbook */
  teacherContextAnchor?: string;
  /** Extra context for the LLM about how we interpreted a messy prompt */
  resolutionNote?: string;
  /** Groq intent complexity hint for model routing */
  complexityHint?: "simple" | "complex";
}

const TYPO_FIXES: Array<[RegExp, string]> = [
  [/\bchap+e*r+\b/gi, "chapter"],
  [/\bchapteer\b/gi, "chapter"],
  [/\bchpter\b/gi, "chapter"],
  [/\bchater\b/gi, "chapter"],
  [/\bchptr\b/gi, "chapter"],
  [/\bsumm?ar[iy]ze?\b/gi, "summarize"],
  [/\bsumarise\b/gi, "summarize"],
  [/\bques+tions?\b/gi, "questions"],
  [/\bqustions?\b/gi, "questions"],
  [/\bquizes?\b/gi, "quizzes"],
  [/\bgenrate\b/gi, "generate"],
  [/\bgenarate\b/gi, "generate"],
  [/\bexplian\b/gi, "explain"],
  [/\bcomparision\b/gi, "comparison"],
  [/\btpoic\b/gi, "topic"],
  [/\bmathe\b/gi, "math"],
  [/\bisi\b/gi, "is"],
  [/\bwhta\b/gi, "what"],
  [/\bwaht\b/gi, "what"],
];

let catalogCache: { catalog: RagCatalog; fetchedAt: number } | null = null;
const CATALOG_TTL_MS = 5 * 60 * 1000;

async function getCatalog(): Promise<RagCatalog | null> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return catalogCache.catalog;
  }
  const catalog = await fetchRagCatalog();
  if (catalog) {
    catalogCache = { catalog, fetchedAt: now };
  }
  return catalog;
}

export function normalizeTeacherQuery(raw: string): string {
  let text = raw.trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of TYPO_FIXES) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function extractChapterNumber(text: string): string | undefined {
  const patterns = [
    /\bchapter\s*[#:]?\s*(\d+)\b/i,
    /\bch\.?\s*(\d+)\b/i,
    /\bunit\s*[#:]?\s*(\d+)\b/i,
    /\blesson\s*(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return undefined;
}

export function extractTopicHint(text: string): string | undefined {
  const patterns = [
    /(?:for|about|on|from|regarding|covering)\s*[:\-]?\s*(.+)$/i,
    /(?:summarize|summarise|explain|generate\s+questions?\s+for)\s*[:\-]?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const hint = match[1]
      .trim()
      .replace(/[.?!]+$/, "")
      .trim();
    if (hint.length >= 2) return hint;
  }

  return undefined;
}

export function detectIntent(text: string, mode?: string): QueryIntent {
  if (mode === "summarize" || mode === "questions") {
    return mode;
  }

  const lower = text.toLowerCase();
  if (
    /\b(summarize|summarise|summary|overview|main points)\b/.test(lower)
  ) {
    return "summarize";
  }
  if (
    /\b(generate|create|make|write).{0,20}\b(questions?|mcqs?|quiz)\b/.test(
      lower
    ) ||
    /\b(questions?|mcqs?)\s+for\b/.test(lower)
  ) {
    return "questions";
  }
  return "general";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/** Map curriculum topics to catalog chapter numbers (legacy Grade 6 CS). */
const TOPIC_CHAPTER_RULES: Array<{ pattern: RegExp; chapter: string; label: string }> = [
  { pattern: /\b(algorithmic thinking|algorithms?|flowcharts?|pseudocode|think like cod)/i, chapter: "3", label: "Think Like Coders" },
  { pattern: /\b(excel|spreadsheet|worksheet|formula|sum\(|average\()/i, chapter: "1", label: "Excel to Excel" },
  { pattern: /\b(vr|ar\b|virtual reality|augmented reality|beyond the reality|metaverse|mixed reality)/i, chapter: "2", label: "Beyond the Reality" },
  {
    pattern:
      /\b(makecode|make code|microbit|remainder problem|modulo|divisible by|nested conditional|odd or even)/i,
    chapter: "4",
    label: "Make code with Makecode",
  },
  { pattern: /\b(python|print\(|variables?\b.*python)/i, chapter: "5", label: "Meet the python" },
  { pattern: /\b(simple app|mobile app|app inventor)/i, chapter: "6", label: "Simple App" },
  { pattern: /\b(web ?page|html|css|website)/i, chapter: "7", label: "Web Page" },
  { pattern: /\b(prevent accidents|computer vision|self[- ]driving|road safety)/i, chapter: "8", label: "Prevent accidents" },
  { pattern: /\b(data to wisdom|big data|datasets?)/i, chapter: "9", label: "Data to Wisdom" },
  { pattern: /\b(black hat|cybersecurity|phishing|malware|hacking)/i, chapter: "10", label: "Beware of Black Hats" },
  { pattern: /\b(g develop|game develop|angry birds|temple run)/i, chapter: "11", label: "G Develop" },
];

export function detectTopicChapter(text: string): { chapter: string; label: string } | undefined {
  for (const rule of TOPIC_CHAPTER_RULES) {
    if (rule.pattern.test(text)) {
      return { chapter: rule.chapter, label: rule.label };
    }
  }
  return undefined;
}

/** User explicitly asks for content beyond the textbook (real-life examples, etc.). */
export function needsExternalSupplement(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(real[- ]?life|daily life|everyday|outside the textbook|on the internet|from the web|from online|latest|current events?|more examples?|extra examples?|additional examples?|beyond the book|in the real world)\b/.test(
    lower
  );
}

/** Named topics teachers often use as custom examples (not always in the textbook). */
const KNOWN_CONTEXT_ANCHORS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bfifa\s+world\s+cup\b/i, label: "FIFA World Cup" },
  { pattern: /\bfifa\b/i, label: "FIFA" },
  { pattern: /\bworld\s+cup\b/i, label: "World Cup" },
  { pattern: /\bipl\b/i, label: "IPL" },
  { pattern: /\bcricket\s+world\s+cup\b/i, label: "Cricket World Cup" },
  { pattern: /\bpremier\s+league\b/i, label: "Premier League" },
  { pattern: /\bolympics?\b/i, label: "Olympics" },
  { pattern: /\bsuper\s+bowl\b/i, label: "Super Bowl" },
  { pattern: /\buefa\b/i, label: "UEFA" },
  { pattern: /\bdoraemon\b/i, label: "Doraemon" },
  { pattern: /\bdoremon\b/i, label: "Doraemon" },
  { pattern: /\bnobita\b/i, label: "Doraemon" },
  { pattern: /\bavengers\b/i, label: "Avengers" },
  { pattern: /\bmarvel\b/i, label: "Marvel" },
  { pattern: /\bharry\s*potter\b/i, label: "Harry Potter" },
  { pattern: /\bstar\s*wars\b/i, label: "Star Wars" },
  { pattern: /\bspider[- ]?man\b/i, label: "Spider-Man" },
  { pattern: /\biron\s*man\b/i, label: "Iron Man" },
  { pattern: /\bdora\s+the\s+explor\w*/i, label: "Dora the Explorer" },
  { pattern: /\bchandramukhi\b/i, label: "Chandramukhi" },
  { pattern: /\bchendramukhi\b/i, label: "Chandramukhi" },
];

const ANCHOR_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "chapter",
  "about",
]);

const OFF_CURRICULUM_ANCHOR =
  /\b(fifa|world\s*cup|ipl\b|premier\s*league|messi|ronaldo|neymar|olympics?|euro\s*\d{4}|cricket\s*world\s*cup|super\s*bowl|nba|nfl\b|uefa)\b/gi;

function cleanAnchorPhrase(raw: string): string {
  return raw
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+version$/i, "")
    .replace(/\s+style$/i, "")
    .replace(/\s+theme$/i, "")
    .replace(/\s+as\s+(?:an?\s+)?example$/i, "")
    .replace(/[.?!,]+$/, "")
    .trim();
}

/** Normal teacher phrasing — not a creative theme (avoids "with exercises", etc.). */
function isGenericTeacherPhrase(anchor: string): boolean {
  const lower = anchor.toLowerCase().trim();
  return (
    /^(exercises?|examples?|activities|answers?|mcqs?|quizzes?|worksheets?|notes?|diagrams?|images?|pictures?|slides?|the following|more details?|step[- ]by[- ]step|real[- ]?life examples?|detailed examples?|practical examples?|hands[- ]on|answer key|solutions?|hints?|options?)$/i.test(
      lower
    ) ||
    /^(topic|chapter|unit|lesson)\s*\d*$/i.test(lower) ||
    /^\d+$/.test(lower)
  );
}

function normalizeAnchorLabel(cleaned: string): string {
  const lower = cleaned.toLowerCase();
  if (/^dora\s+the\s+explor/.test(lower)) return "Dora the Explorer";
  if (/^chand?ramukhi/.test(lower)) return "Chandramukhi";
  if (lower === "avengers" || lower === "marvel") {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  for (const { pattern, label } of KNOWN_CONTEXT_ANCHORS) {
    if (pattern.test(cleaned)) return label;
  }
  return cleaned;
}

const TEACHER_CONTEXT_STRIP_PATTERNS = [
  /\bin (?:an?\s+)?[\w\s'-]+\s+version\b/gi,
  /\bin (?:an?\s+)?[\w\s'-]+\s+style\b/gi,
  /\bas (?:an?\s+)?[\w\s'-]+\s+(?:version|story|tale)\b/gi,
  /\bwith\s+(?!chapter\b|ch\.?\s*#?\s*\d\b)[\w\s'-]+?(?=[.?!,]|$)/gi,
  /\bin the context of\s+[\w\s'-]+?(?=[.?!,]|$)/gi,
  /\b(?:relate|related)\s+(?:to|with)\s+[\w\s'-]+?(?:'s|’s)?\s*context/gi,
  /\bwith\s+[\w\s'-]+?(?:'s|’s)\s*context/gi,
];

/** Strip teacher theme from vector-search text — keeps chapter/topic for RAG. */
export function buildCurriculumRetrievalQuery(
  normalized: string,
  opts: {
    chapter?: string;
    chapterLabel?: string;
    teacherContextAnchor?: string;
    intent?: QueryIntent;
  }
): string {
  let text = normalized;

  for (const pattern of TEACHER_CONTEXT_STRIP_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  const anchor = opts.teacherContextAnchor;
  if (anchor) {
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), " ");
  }

  text = text.replace(/\s+/g, " ").trim();

  const parts: string[] = [];
  if (text.length >= 3) parts.push(text);
  if (opts.chapter) {
    parts.push(`chapter ${opts.chapter}`);
    if (opts.chapterLabel) parts.push(opts.chapterLabel);
  }
  if (opts.intent === "summarize" && opts.chapter) {
    parts.push("summary overview key points");
  }

  return (
    parts.join(" — ") ||
    `chapter ${opts.chapter ?? ""} ${opts.chapterLabel ?? ""}`.trim()
  );
}

/** Extract the teacher's chosen real-world context (FIFA, Doraemon, their school, etc.). */
export function detectTeacherContextAnchor(text: string): string | undefined {
  const phrasePatterns = [
    /\bin (?:an?\s+)?(.+?)\s+version\b/i,
    /\bin (?:an?\s+)?(.+?)\s+style\b/i,
    /\bas (?:an?\s+)?(.+?)\s+(?:version|story|tale)\b/i,
    /\bin the context of\s+(.+?)(?:[.?!,]|$)/i,
    /\b(?:relate|related)\s+(?:to|with)\s+(.+?)(?:'s|’s)?\s*context/i,
    /\bwith\s+(.+?)(?:'s|’s)\s*context/i,
    /\b(.+?)(?:'s|’s)\s*context\b/i,
    /\bwith\s+(?!chapter\b|ch\.?\s*#?\s*\d\b)(.+?)(?:[.?!,]|$)/i,
    /\bwith\s+(?:the\s+)?(.+?)\s+as\s+(?:an?\s+)?example/i,
    /\busing\s+(?:the\s+)?(.+?)(?:\s+as\s+(?:an?\s+)?example)?(?:[.?!,]|$)/i,
    /\brelated to\s+(?:the\s+)?(.+?)(?:[.?!,]|$)/i,
    /\bframe(?:d)?\s+(?:in|around|using)\s+(.+?)(?:[.?!,]|$)/i,
  ];

  for (const pattern of phrasePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const cleaned = cleanAnchorPhrase(match[1]);
      if (
        cleaned.length >= 3 &&
        cleaned.length <= 80 &&
        !isGenericTeacherPhrase(cleaned)
      ) {
        const lower = cleaned.toLowerCase();
        if (
          !/^(chapter|ch|unit|lesson|topic|it|this|that|the|sources?)$/i.test(
            lower
          ) &&
          !/^ch\.?\s*#?\s*\d+$/i.test(lower)
        ) {
          return normalizeAnchorLabel(cleaned);
        }
      }
    }
  }

  for (const { pattern, label } of KNOWN_CONTEXT_ANCHORS) {
    if (pattern.test(text)) return label;
  }

  return undefined;
}

export function stripOffCurriculumAnchors(text: string): string {
  return text.replace(OFF_CURRICULUM_ANCHOR, " ").replace(/\s+/g, " ").trim();
}

/** Whether the teacher's context appears in retrieved textbook snippets. */
export function anchorInSources(
  anchor: string,
  sources: Array<{ snippet: string; book_title?: string }>
): boolean {
  const blob = sources
    .map((s) => `${s.snippet} ${s.book_title ?? ""}`)
    .join(" ")
    .toLowerCase();
  const lower = anchor.toLowerCase();

  if (blob.includes(lower)) return true;

  const tokens = lower
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !ANCHOR_STOP_WORDS.has(t));
  if (tokens.length === 0) return false;

  return tokens.every((token) => blob.includes(token));
}

/** Only these need live web data — not plain "real-life example". */
export function needsLiveWebData(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(on the internet|from the web|from online|latest|current events?|news about|recent)\b/.test(
    lower
  );
}

function scoreChapterEntry(hint: string, entry: RagCatalogChapter): number {
  const blob = `${entry.title} ${entry.source_file} ${entry.chapter}`.toLowerCase();
  const hintLower = hint.toLowerCase().trim();
  let score = 0;

  if (hintLower && blob.includes(hintLower)) {
    score += 8;
  }

  const hintTokens = tokenize(hint);
  const chapterOnly = /^\d+$/.test(hintLower);

  if (chapterOnly && entry.chapter === hintLower) {
    score += 10;
  }

  for (const token of hintTokens) {
    if (blob.includes(token)) score += 2;
  }

  return score;
}

async function resolveChapterFromHint(
  hint: string,
  catalog: RagCatalog | null
): Promise<{ chapter?: string; note?: string }> {
  if (!catalog?.chapters?.length) return {};

  const numeric = extractChapterNumber(hint) ?? (/^\d+$/.test(hint) ? hint : undefined);
  if (numeric) {
    const exists = catalog.chapters.some((c) => c.chapter === numeric);
    if (exists) {
      return {
        chapter: numeric,
        note: `Interpreted request as Chapter ${numeric}.`,
      };
    }
  }

  let best: RagCatalogChapter | null = null;
  let bestScore = 0;

  for (const entry of catalog.chapters) {
    const score = scoreChapterEntry(hint, entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best && bestScore >= 4) {
    return {
      chapter: best.chapter,
      note: `Matched "${hint}" to Chapter ${best.chapter}: ${best.title}.`,
    };
  }

  return {};
}

function mergeParsedIntent(
  base: ResolvedQuery,
  parsed: ParsedTeacherIntent
): ResolvedQuery {
  const chapter =
    parsed.chapter?.toString().trim() ||
    extractChapterNumber(base.normalized) ||
    base.chapter;

  const teacherContextAnchor =
    parsed.teacher_context_anchor?.trim() ||
    base.teacherContextAnchor ||
    detectTeacherContextAnchor(base.normalized);

  const intent: QueryIntent =
    parsed.intent === "summarize" ||
    parsed.intent === "questions" ||
    parsed.intent === "general"
      ? parsed.intent
      : base.intent;

  const retrievalQuery =
    parsed.retrieval_query?.trim() ||
    buildCurriculumRetrievalQuery(base.normalized, {
      chapter,
      chapterLabel: base.chapterLabel,
      teacherContextAnchor,
      intent,
    }) ||
    base.retrievalQuery;

  const noteParts = [
    base.resolutionNote,
    parsed.topic ? `Topic: ${parsed.topic}.` : "",
    parsed.complexity === "complex" ? "Routed to complex model." : "",
    teacherContextAnchor ? `Theme: ${teacherContextAnchor}.` : "",
    "Groq intent applied.",
  ].filter(Boolean);

  return {
    ...base,
    intent,
    chapter,
    teacherContextAnchor,
    retrievalQuery,
    resolutionNote: noteParts.join(" ").trim() || base.resolutionNote,
  };
}

export async function resolveTeacherQuery(
  raw: string,
  mode?: string
): Promise<ResolvedQuery> {
  const normalized = normalizeTeacherQuery(raw);
  const intent = detectIntent(normalized, mode);
  const topicHint = extractTopicHint(normalized);

  let chapter = extractChapterNumber(normalized);
  let chapterLabel: string | undefined;
  let resolutionNote: string | undefined;

  const topicChapter = detectTopicChapter(normalized);

  if (!chapter && topicHint) {
    const catalog = await getCatalog();
    const resolved = await resolveChapterFromHint(topicHint, catalog);
    chapter = resolved.chapter ?? chapter;
    resolutionNote = resolved.note;
    if (chapter && catalog?.chapters) {
      chapterLabel = catalog.chapters.find((c) => c.chapter === chapter)?.title;
    }
  } else if (chapter) {
    resolutionNote = `Using Chapter ${chapter} from the teacher's message.`;
    const catalog = await getCatalog();
    chapterLabel = catalog?.chapters.find((c) => c.chapter === chapter)?.title;
  }

  if (topicChapter) {
    if (!chapter) {
      chapter = topicChapter.chapter;
      chapterLabel = topicChapter.label;
      resolutionNote = `Matched topic to Chapter ${topicChapter.chapter}: ${topicChapter.label}.`;
    } else if (chapter !== topicChapter.chapter) {
      resolutionNote =
        `${resolutionNote ?? ""} Note: "${topicChapter.label}" is often in Ch. ${topicChapter.chapter}, but the teacher asked for Chapter ${chapter} — using Chapter ${chapter}.`.trim();
      chapterLabel = chapterLabel ?? topicChapter.label;
    } else {
      chapterLabel = chapterLabel ?? topicChapter.label;
    }
  } else if (chapter) {
    resolutionNote = resolutionNote ?? `Using Chapter ${chapter} from the teacher's message.`;
  }

  const teacherContextAnchor = detectTeacherContextAnchor(normalized);

  if (teacherContextAnchor) {
    resolutionNote =
      `${resolutionNote ?? ""} Teacher theme: **${teacherContextAnchor}** — retell examples/questions in this context (textbook facts only for curriculum).`.trim();
  }

  const retrievalQuery = buildCurriculumRetrievalQuery(normalized, {
    chapter,
    chapterLabel,
    teacherContextAnchor,
    intent,
  });

  let result: ResolvedQuery = {
    original: raw,
    normalized,
    retrievalQuery,
    chapter,
    chapterLabel,
    topicHint,
    intent,
    chapterRelated: Boolean(chapter),
    teacherContextAnchor,
    resolutionNote,
  };

  const parsed = await parseTeacherIntent(raw, mode);
  if (parsed) {
    result = mergeParsedIntent(result, parsed);
    if (parsed.complexity === "complex") {
      result.complexityHint = "complex";
    }
  }

  return result;
}
