import { config } from "../config.js";
import type { RoutedModel } from "./llmRouter.js";
import type { RagSource } from "./rag.js";
import type { ParsedQuestionRequest } from "./questionParser.js";


export function buildMixedQuestionPrompt(
    question: string,
    context: string,
    sources: RagSource[],
    parsed: ParsedQuestionRequest
): string {
    const citationIndex = sources
        .map((s, i) => {
            const pages = s.pages ? `, p. ${s.pages}` : "";
            return `[${i + 1}] ${s.book_title}${s.chapter ? ` — Ch. ${s.chapter}` : ""}${pages}`;
        })
        .join("\n");

    const excerptBlock = context.trim() ||
        sources
            .map((s, i) => {
                const pages = s.pages ? `, p. ${s.pages}` : "";
                return `[${i + 1}] ${s.book_title}${s.chapter ? ` — Ch. ${s.chapter}` : ""}${pages}\n${s.snippet}`;
            })
            .join("\n\n");

    // Build type instructions
    let typeInstructions = '';
    const typeMap: Record<string, string> = {
        mcq: `### MCQ Questions (${parsed.types.mcq || 0})
Each MCQ should have 4 options (A, B, C, D) with ONE correct answer. Include the answer with explanation.`,
        veryShort: `### Very Short Questions (${parsed.types.veryShort || 0})
Each very short question should have a single-word or one-sentence answer.`,
        short: `### Short Questions (${parsed.types.short || 0})
Each short question should require a 2-3 sentence answer.`,
        long: `### Long Questions (${parsed.types.long || 0})
Each long question should require a detailed, multi-sentence answer. Include HOTS, Case Study, or Competency Based types.`,
        hot: `### Hot Questions (${parsed.types.hot || 0})
Each hot question should require critical thinking, analysis, or evaluation.`
    };

    const typeKeys = ['mcq', 'veryShort', 'short', 'long', 'hot'] as const;
    for (const key of typeKeys) {
        const count = parsed.types[key];
        if (count && count > 0) {
            typeInstructions += `\n${typeMap[key] || `### ${key} Questions (${count})`}\n`;
        }
    }

    const chapterText = parsed.chapters.length === 1 
        ? `Chapter ${parsed.chapters[0]}`
        : `Chapters ${parsed.chapters.join(', ')}`;

    // Build the format section
    let formatSection = '';
    for (const key of typeKeys) {
        const count = parsed.types[key];
        if (count && count > 0) {
            const label = key === 'mcq' ? 'MCQ' : 
                          key === 'veryShort' ? 'Very Short' :
                          key === 'short' ? 'Short' :
                          key === 'long' ? 'Long' : 'Hot';
            const questionNumbers = Array.from({ length: count }, (_, i) => `${i+1}. [Question text]`).join('\n');
            formatSection += `## ${label} Questions\n${questionNumbers}\n\n`;
        }
    }

    return `
Question: ${question}

Source index (cite as [1], [2], etc.):
${citationIndex || "(no textbook excerpts)"}

Textbook excerpts:
${excerptBlock || "(none)"}

Task: Generate questions from ${chapterText} based on the textbook content above.

${typeInstructions}

CRITICAL RULES:
1. Generate EXACTLY the number of questions specified for each type
2. Each question MUST be based directly on the textbook content
3. Number questions sequentially within each section
4. Include textbook citations as [1], [2] etc.

Format your response as:
### Questions from ${chapterText}

${formatSection}
`;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential backoff for rate-limited LLM calls.
 * Delays: attempt 1 → ~10s, attempt 2 → ~30s, attempt 3 → ~60s (with ±20% jitter).
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    label = 'LLM'
): Promise<T> {
    const baseDelaysMs = [10_000, 30_000, 60_000];
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const isRateLimit = msg.includes('rate_limit') || msg.includes('Rate limit') ||
                                msg.includes('429') || msg.includes('Too Many Requests');
            const isFatal = msg.includes('decommissioned') || msg.includes('model_not_found') ||
                            msg.includes('invalid_api_key') || attempt >= retries;

            if (isFatal) {
                console.warn(` [${label}] Fatal error, not retrying: ${msg}`);
                throw err;
            }

            if (isRateLimit) {
                const base = baseDelaysMs[Math.min(attempt, baseDelaysMs.length - 1)];
                const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
                const delay = Math.round(base + jitter);
                console.warn(` [${label}] Rate limit hit (attempt ${attempt + 1}/${retries}), retrying in ${delay}ms...`);
                await sleep(delay);
                continue;
            }

            // Non-rate-limit, non-fatal — retry with short delay
            const delay = 2000 * (attempt + 1);
            console.warn(` [${label}] Error (attempt ${attempt + 1}/${retries}), retrying in ${delay}ms: ${msg}`);
            await sleep(delay);
        }
    }
    throw new Error(`[${label}] All ${retries} retry attempts exhausted`);
}

function extractQuestionCount(question: string): number {
    const match = question.match(/(\d+)\s*(?:mcq|questions?|long|short|hot)/i);
    if (match) {
        return parseInt(match[1]);
    }
    
    if (/hot\s+questions?/i.test(question)) return 5;
    if (/long\s+questions?/i.test(question)) return 3;
    if (/short\s+questions?/i.test(question)) return 5;
    if (/mcq|multiple\s+choice/i.test(question)) return 5;
    
    const mixedMatch = question.match(/(\d+)\s*long\s*(?:and|,)?\s*(\d+)\s*short/i);
    if (mixedMatch) {
        return parseInt(mixedMatch[1]) + parseInt(mixedMatch[2]);
    }
    
    return 5;
}

function extractQuestionTypeDistribution(question: string): string[] {
    const lower = question.toLowerCase();
    
    if (lower.includes('mcq') || lower.includes('multiple choice')) {
        return ['concept', 'application', 'competency', 'reasoning', 'output'];
    }
    
    if (lower.includes('short')) {
        return ['concept', 'application', 'competency', 'hots', 'reasoning'];
    }
    
    if (lower.includes('long')) {
        return ['hots', 'case_study', 'competency', 'creative', 'data_interpretation', 'real_life'];
    }
    
    if (lower.includes('hot') || lower.includes('key')) {
        return ['concept_check', 'application', 'competency', 'reasoning', 'troubleshooting'];
    }
    
    return ['concept', 'application', 'competency', 'reasoning', 'output'];
}

function detectQuestionTypeFromPrompt(question: string): 'mcq' | 'long' | 'short' | 'hot' | 'mixed' {
    if (/(\d+)\s*long\s*(?:and|,)?\s*(\d+)\s*short/i.test(question)) {
        return 'mixed';
    }
    
    if (/hot\s+questions?|key\s+questions?|important\s+questions?/i.test(question)) {
        return 'hot';
    }
    
    if (/mcq|multiple\s+choice/i.test(question)) return 'mcq';
    if (/long|detailed|essay/i.test(question)) return 'long';
    if (/short/i.test(question)) return 'short';
    
    return 'long';
}

function extractChapterNumbersFromPrompt(question: string): number[] {
    const chapters: number[] = [];
    const match = question.match(/chapters?\s+([\d,\s]+)/i);
    if (match) {
        const numbers = match[1].split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
        chapters.push(...numbers);
    }
    return chapters;
}

function parseMixedQuestionRequest(question: string): { longCount: number; shortCount: number; isMixed: boolean } {
    const lower = question.toLowerCase();
    
    const match = lower.match(/(\d+)\s*long\s*(?:and|,)?\s*(\d+)\s*short/i);
    if (match) {
        return {
            longCount: parseInt(match[1]),
            shortCount: parseInt(match[2]),
            isMixed: true
        };
    }
    
    return { longCount: 0, shortCount: 0, isMixed: false };
}

const SYSTEM_PROMPT = `You are AIRA, a teacher assistant for Indian schools.
Answer the teacher's question using the numbered textbook sources provided.

Your goal: one response should be enough — the teacher should not need follow-up questions.

Rules:
- Be clear, accurate, and age-appropriate for the class level implied by the material.
- When sources contain the topic, give a COMPLETE teaching brief: overview, key concepts, steps or rules, and examples/activities from the text.
- Textbook excerpts may contain minor OCR typos (e.g. "flowchart" shown as "A,owchart") — interpret them sensibly.
- Use definitions, explanations, PROJECT activities, and numbered steps from the sources — do not skip details that are in the excerpts.
- Cite textbook facts as [1], [2], etc. — cite once per section or at the end of a bullet list.
- Write in plain markdown with headings and bullet lists.
- NEVER paste raw source headers like [Source 1 — score: 0.48] or pipe-heavy OCR text.
- Output the final answer only. Do not include internal reasoning or think tags.`;

function buildSystemPrompt(teacherContextAnchor?: string): string {
    return SYSTEM_PROMPT + "\n- Do not invent curriculum facts not supported by the sources.";
}

export function isGroqConfigured(): boolean {
    return Boolean(config.groqApiKey) && Boolean(config.groqBaseUrl);
}

export function isCloudLlmConfigured(): boolean {
    return isGroqConfigured() || 
        (Boolean(config.phiApiKey) && Boolean(config.phiBaseUrl)) ||
        (Boolean(config.qwenApiKey) && Boolean(config.qwenBaseUrl));
}

export function isOllamaConfigured(): boolean {
    return config.ollamaEnabled && Boolean(config.ollamaBaseUrl);
}

export function isDeepSeekConfigured(): boolean {
    return Boolean(config.deepseekApiKey);
}

export interface OllamaStatus {
    running: boolean;
    modelReady: boolean;
    models: string[];
}

let ollamaStatusCache: OllamaStatus | null = null;
let ollamaCheckedAt = 0;

export async function getOllamaStatus(): Promise<OllamaStatus> {
    if (!isOllamaConfigured()) {
        return { running: false, modelReady: false, models: [] };
    }

    const now = Date.now();
    if (ollamaStatusCache && now - ollamaCheckedAt < 30_000) {
        return ollamaStatusCache;
    }

    const empty: OllamaStatus = { running: false, modelReady: false, models: [] };

    try {
        const tagsUrl = config.ollamaBaseUrl.replace(/\/v1\/?$/, "") + "/api/tags";
        const response = await fetch(tagsUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            ollamaStatusCache = empty;
        } else {
            const data = (await response.json()) as { models?: Array<{ name?: string }> };
            const names = (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
            ollamaStatusCache = {
                running: true,
                modelReady: names.some((n) => n.toLowerCase().includes("qwen")),
                models: names,
            };
        }
    } catch {
        ollamaStatusCache = empty;
    }

    ollamaCheckedAt = now;
    return ollamaStatusCache;
}

export function getLlmInfraLabel(ollama?: OllamaStatus): string {
    if (isGroqConfigured()) {
        return `Groq (${config.groqSimpleModel} + ${config.groqComplexModel})`;
    }
    if (isCloudLlmConfigured()) {
        return "Cloud LLMs configured";
    }
    if (ollama?.running && ollama.modelReady) {
        return "Ollama — Qwen3-4B (local)";
    }
    if (ollama?.running && !ollama.modelReady) {
        return "Ollama running — pull qwen3:4b";
    }
    return "Pending (set GROQ_API_KEY or Ollama)";
}

export function getLlmStatusHint(ollama?: OllamaStatus): string {
    if (isGroqConfigured()) return "Groq configured and ready";
    if (ollama?.running && ollama.modelReady) return "Ollama ready";
    if (ollama?.running && !ollama.modelReady) {
        return `Ollama is up but ${config.ollamaQwenModel} is missing. Run: ollama pull ${config.ollamaQwenModel}`;
    }
    return "Set GROQ_API_KEY or enable Ollama";
}

interface ChatCompletionResponse {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
}

async function chatCompletion(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: Array<{ role: string; content: string }>,
    timeoutMs: number
): Promise<string> {
    const base = baseUrl.replace(/\/$/, "");
    const url = `${base}/chat/completions`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };

    console.log(` [LLM] POST ${url} | model=${model} | timeout=${timeoutMs}ms`);

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.35,
            max_tokens: 4096,
            stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    const data = (await response.json()) as ChatCompletionResponse;

    if (!response.ok) {
        console.error(` [LLM] Error response from ${model}:`, data);
        throw new Error(data.error?.message ?? `LLM request failed (${response.status})`);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
        throw new Error("LLM returned an empty response");
    }

    console.log(` [LLM] ${model} → ${content.length} chars`);
    return content;
}

export interface GenerateAnswerInput {
    model: RoutedModel;
    question: string;
    context: string;
    sources: RagSource[];
    resolutionNote?: string;
    chapterLabel?: string;
    teacherContextAnchor?: string;
    webContext?: string;
    intent?: "summarize" | "questions" | "general";
}

export interface GenerateAnswerResult {
    answer: string;
    model_used: RoutedModel | "synthesizer";
    llm_provider: "groq" | "phi" | "qwen35" | "ollama" | "deepseek" | "none";
}

function buildUserPrompt(question: string, context: string, sources: RagSource[]): string {
    const isQuestionGen = /generate|create|make|produce\s+questions?/i.test(question);
    
    if (isQuestionGen) {
        const citationIndex = sources
            .map((s, i) => {
                const pages = s.pages ? `, p. ${s.pages}` : "";
                return `[${i + 1}] ${s.book_title}${s.chapter ? ` — Ch. ${s.chapter}` : ""}${pages}`;
            })
            .join("\n");

        const excerptBlock = context.trim() ||
            sources
                .map((s, i) => {
                    const pages = s.pages ? `, p. ${s.pages}` : "";
                    return `[${i + 1}] ${s.book_title}${s.chapter ? ` — Ch. ${s.chapter}` : ""}${pages}\n${s.snippet}`;
                })
                .join("\n\n");
        
        const questionType = detectQuestionTypeFromPrompt(question);
        const requestedCount = extractQuestionCount(question);
        const mixedRequest = parseMixedQuestionRequest(question);
        const distribution = extractQuestionTypeDistribution(question);
        
        if (questionType === 'hot') {
            return `
Question: ${question}

Source index (cite as [1], [2], etc.):
${citationIndex || "(no textbook excerpts)"}

Textbook excerpts:
${excerptBlock || "(none)"}

Task: Generate EXACTLY ${requestedCount} HOT (Higher Order Thinking) questions from the textbook content above.

HOT questions should:
- Require critical thinking and analysis
- Ask students to evaluate, create, or synthesize information
- Go beyond simple recall of facts
- Apply concepts to new situations

Format each question as:
### Question X
[Thought-provoking question that requires analysis, evaluation, or creation]

Make sure questions are based on the textbook content but require deeper thinking.
`;
        }
        
        if (questionType === 'mixed') {
            return `
Question: ${question}

Source index (cite as [1], [2], etc.):
${citationIndex || "(no textbook excerpts)"}

Textbook excerpts:
${excerptBlock || "(none)"}

Task: Generate EXACTLY ${mixedRequest.longCount} long questions and ${mixedRequest.shortCount} short questions from the textbook content above.

## Long Questions (${mixedRequest.longCount} questions):
- Require detailed, multi-sentence answers
- Include HOTS, Case Study, or Competency Based types

## Short Questions (${mixedRequest.shortCount} questions):
- Require brief, focused answers (1-2 sentences)
- Include Concept Check, Application Based, or Reasoning types

Requirements:
- Each question must be based on the textbook content
- Number questions sequentially
- Include textbook citations as [1], [2] etc.

Format your response as:
### Mixed Questions from Chapter X

## Long Questions
1. [Long question text]
[Details and context if needed]

## Short Questions
1. [Short question text]
[Brief context if needed]
`;
        }
        
        let distributionInstruction = '';
        if (questionType === 'mcq') {
            distributionInstruction = `
**Question Type Distribution (${requestedCount} Questions):**
${distribution.map((type, i) => {
    const typeMap: Record<string, string> = {
        'concept': `Q${i+1}: Concept Check - Tests understanding of key concepts`,
        'application': `Q${i+1}: Application Based - Tests ability to apply concepts`,
        'competency': `Q${i+1}: Competency Based - Tests real-world application`,
        'reasoning': `Q${i+1}: Reasoning Based - Tests logical thinking`,
        'output': `Q${i+1}: Output Prediction - Tests ability to predict output`,
    };
    return typeMap[type] || `Q${i+1}: ${type}`;
}).join('\n')}
`;
        } else if (questionType === 'short') {
            distributionInstruction = `
**Question Type Distribution (${requestedCount} Questions):**
${distribution.map((type, i) => {
    const typeMap: Record<string, string> = {
        'concept': `Q${i+1}: Concept Check`,
        'application': `Q${i+1}: Application Based`,
        'competency': `Q${i+1}: Competency Based`,
        'hots': `Q${i+1}: HOTS (Higher Order Thinking)`,
        'reasoning': `Q${i+1}: Reasoning Based`,
    };
    return typeMap[type] || `Q${i+1}: ${type}`;
}).join('\n')}
`;
        } else if (questionType === 'long') {
            distributionInstruction = `
**Question Type Distribution (${requestedCount} Questions):**
${distribution.map((type, i) => {
    const typeMap: Record<string, string> = {
        'hots': `Q${i+1}: HOTS (Higher Order Thinking) - Requires analysis and evaluation`,
        'case_study': `Q${i+1}: Case Study - Real-world scenario analysis`,
        'competency': `Q${i+1}: Competency Based - Practical application`,
        'creative': `Q${i+1}: Creative Thinking - Requires innovative solutions`,
        'data_interpretation': `Q${i+1}: Data Interpretation - Analyze and interpret data`,
        'real_life': `Q${i+1}: Real-life Scenario - Apply to real-world situations`
    };
    return typeMap[type] || `Q${i+1}: ${type}`;
}).join('\n')}
`;
        }

        return `
Question: ${question}

Source index (cite as [1], [2], etc.):
${citationIndex || "(no textbook excerpts)"}

Textbook excerpts:
${excerptBlock || "(none)"}

Task: Generate EXACTLY ${requestedCount} ${questionType === 'mcq' ? 'MCQs' : questionType === 'long' ? 'long-answer questions' : 'short-answer questions'} from the textbook content above.

${distributionInstruction}

CRITICAL RULES:
1. Generate EXACTLY ${requestedCount} questions - NO MORE, NO LESS
2. Each question MUST follow its assigned type as specified above
3. Each question MUST be based directly on the textbook content
4. ${questionType === 'mcq' ? 'For MCQs: Provide 4 options (A, B, C, D) with ONE correct answer' : 'For short/long questions: Provide clear, complete questions that require understanding'}
5. Number questions from 1 to ${requestedCount}
6. Include textbook citations as [1], [2] etc.

Format your response as:
${questionType === 'mcq' ? `### MCQ Questions from Chapter X

1. [Question text]
A) [Option A]
B) [Option B]  
C) [Option C]
D) [Option D]

**Answer:** [Correct option] - [Explanation with citation]

2. [Next question with its assigned type]
...` : `### ${questionType === 'long' ? 'Long' : 'Short'} Questions from Chapter X

1. [Question text with assigned type]
[Details and context if needed]

2. [Next question with its assigned type]
...`}
`;
    }

    const citationIndex = sources
        .map((s, i) => {
            const pages = s.pages ? `, p. ${s.pages}` : "";
            return `[${i + 1}] ${s.book_title}${s.chapter ? ` — Ch. ${s.chapter}` : ""}${pages}`;
        })
        .join("\n");

    const excerptBlock = context.trim() ||
        sources
            .map((s, i) => {
                const pages = s.pages ? `, p. ${s.pages}` : "";
                return `[${i + 1}] ${s.book_title}${s.chapter ? ` — Ch. ${s.chapter}` : ""}${pages}\n${s.snippet}`;
            })
            .join("\n\n");

    return `
Question: ${question}

Source index (cite textbook as [1], [2], etc.):
${citationIndex || "(no textbook excerpts)"}

Textbook excerpts:
${excerptBlock || "(none)"}

Answer using only the textbook excerpts above. Be thorough and complete.
`;
}

function buildGenerationMessages(input: GenerateAnswerInput) {
    return [
        { role: "system", content: buildSystemPrompt(input.teacherContextAnchor) },
        { role: "user", content: buildUserPrompt(input.question, input.context, input.sources) },
    ];
}

async function generateWithGroq(
    input: GenerateAnswerInput,
    model: string,
    timeoutMs: number,
    label: string
): Promise<string> {
    console.log(` [Groq ${label}] model=${model}`);
    return await withRetry(
        () => chatCompletion(
            config.groqBaseUrl,
            config.groqApiKey,
            model,
            buildGenerationMessages(input),
            timeoutMs
        ),
        3,
        `Groq ${label}`
    );
}

async function generateWithGroqSimple(input: GenerateAnswerInput): Promise<string> {
    console.log(` [Groq Simple] model=${config.groqSimpleModel}`);
    return generateWithGroq(input, config.groqSimpleModel, config.groqSimpleTimeoutMs, 'Simple');
}

async function generateWithGroqComplex(input: GenerateAnswerInput): Promise<string> {
    console.log(` [Groq Complex] model=${config.groqComplexModel}`);
    return generateWithGroq(input, config.groqComplexModel, config.groqComplexTimeoutMs, 'Complex');
}

async function generateWithOllama(input: GenerateAnswerInput): Promise<string> {
    console.log(` [Ollama] model=${config.ollamaQwenModel}`);
    return await chatCompletion(
        config.ollamaBaseUrl,
        config.ollamaApiKey,
        config.ollamaQwenModel,
        buildGenerationMessages(input),
        config.ollamaTimeoutMs
    );
}

export async function generateAnswer(
    input: GenerateAnswerInput
): Promise<GenerateAnswerResult | null> {
    console.log(` [generateAnswer] model=${input.model} sources=${input.sources.length}`);
    
    if (input.sources.length === 0 && !input.webContext?.trim()) {
        console.log(" [generateAnswer] No sources");
        return null;
    }

    if (isGroqConfigured()) {
        const modelsToTry: Array<{ fn: (i: GenerateAnswerInput) => Promise<string>; display: string; model: RoutedModel }> = [
            { fn: generateWithGroqComplex, display: 'Complex', model: 'groq_complex' },
            { fn: generateWithGroqSimple, display: 'Simple', model: 'groq_simple' },
        ];

        for (const { fn, display, model } of modelsToTry) {
            try {
                console.log(` [generateAnswer] Trying Groq ${display}...`);
                const answer = await fn(input);
                if (answer && answer.length > 50) {
                    console.log(` [generateAnswer] Groq ${display} succeeded`);
                    return { answer, model_used: model, llm_provider: 'groq' };
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                // withRetry already exhausted retries for rate limits — just log and try next model
                console.warn(` [generateAnswer] Groq ${display} exhausted: ${msg.substring(0, 100)}`);
            }
        }
    }

    try {
        const ollama = await getOllamaStatus();
        if (ollama.running && ollama.modelReady) {
            console.log(` [generateAnswer] Trying Ollama fallback...`);
            try {
                const answer = await generateWithOllama(input);
                if (answer && !answer.includes('Error') && answer.length > 30) {
                    console.log(` [generateAnswer] Ollama succeeded`);
                    return { answer, model_used: "qwen", llm_provider: "ollama" };
                }
            } catch (ollamaErr: unknown) {
                const errorMsg = ollamaErr instanceof Error ? ollamaErr.message : String(ollamaErr);
                console.warn(` [generateAnswer] Ollama error:`, errorMsg);
            }
        } else {
            console.log(` [generateAnswer] Ollama not ready`);
        }
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn(` [generateAnswer] Ollama failed:`, errorMessage);
    }

    console.log(` [generateAnswer] All LLMs failed — falling back to Synthesizer`);
    const { buildFormattedFallbackAnswer } = await import("./answerFormatter.js");
    
    let enhancedContext = input.context;
    if (enhancedContext.length < 100 && input.sources.length > 0) {
        enhancedContext = input.sources
            .map(s => s.snippet)
            .join("\n\n");
        console.log(` [generateAnswer] Enhanced context from ${input.sources.length} sources`);
    }
    
    const answer = buildFormattedFallbackAnswer({
        question: input.question,
        context: enhancedContext,
        sources: input.sources,
        summary: "",
    });
    
    return { answer, model_used: "synthesizer", llm_provider: "none" };
}

export function modelDisplayName(model: RoutedModel | string): string {
    switch (model) {
        case "groq_simple": return "Groq Simple (Llama 3.1 8B)";
        case "groq_complex": return "Groq Complex (Llama 3.1 70B)";
        case "phi": return "Phi-4-mini";
        case "qwen35": return "Qwen3.5-9B";
        case "qwen": return "Qwen3-4B";
        case "deepseek": return "DeepSeek";
        case "synthesizer": return "Synthesizer (Fallback)";
        default: return String(model);
    }
}

export function normalizeBillingModel(model: string): "phi" | "qwen35" | "qwen" | "deepseek" | "groq" {
    if (model === "phi" || model === "qwen35" || model === "qwen" || model === "deepseek" || model === "groq") {
        return model;
    }
    return isGroqConfigured() ? "groq" : "phi";
}