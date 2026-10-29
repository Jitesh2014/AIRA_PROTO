// server/src/services/questionParser.ts

export interface ParsedQuestionRequest {
    types: {
        mcq?: number;
        short?: number;
        veryShort?: number;
        long?: number;
        hot?: number;
    };
    chapters: number[];
    chapterRange?: { start: number; end: number };
    totalQuestions: number;
}

export function parseQuestionRequest(query: string): ParsedQuestionRequest | null {
    const lower = query.toLowerCase();
    
    // ============================================
    // 1. EXTRACT CHAPTERS
    // ============================================
    let chapters: number[] = [];
    let chapterRange: { start: number; end: number } | undefined;

    // 1. Chapter range: "chapters 3 to 6", "chapters 3-6", "chapters 3 through 6"
    const rangeMatch = lower.match(/chapters?\s+(\d+)\s*(?:to|through|–|-)\s*(\d+)/i);
    if (rangeMatch) {
        const start = parseInt(rangeMatch[1]);
        const end = parseInt(rangeMatch[2]);
        chapterRange = { start, end };
        for (let i = start; i <= end; i++) {
            chapters.push(i);
        }
    }

    // 2. Specific chapters list: "chapters 3, 4 and 5" or "chapters 3 and 4" or "chapters 3,4,5"
    if (chapters.length === 0) {
        // Grab everything after "chapters" up to end or a keyword boundary
        const specificMatch = lower.match(/chapters?\s+([\d,\s]+(?:and\s+\d+)?)/i);
        if (specificMatch) {
            // Replace "and" with comma so we can split uniformly
            const normalized = specificMatch[1].replace(/\band\b/gi, ',');
            const numbers = normalized
                .split(/[,\s]+/)
                .map(Number)
                .filter(n => !isNaN(n) && n >= 1 && n <= 20);
            chapters = [...new Set(numbers)]; // dedupe
        }
    }

    // 3. Single chapter: "chapter 3" or "ch 3" or "ch.3"
    if (chapters.length === 0) {
        const singleMatch = lower.match(/(?:chapter|ch\.?)\s*(\d+)/i);
        if (singleMatch) {
            chapters = [parseInt(singleMatch[1])];
        }
    }
    
    // ============================================
    // 2. EXTRACT QUESTION COUNTS
    // ============================================
    const types: ParsedQuestionRequest['types'] = {};
    let totalQuestions = 0;

    // IMPORTANT: veryShort MUST come before short in the list.
    // "/(\d+)\s*short\s*questions?/" also matches "5 very short questions"
    // because "short questions" appears as a substring.
    const typePatterns = [
        { key: 'veryShort', patterns: [
            /(\d+)\s*very\s+short\s*(?:answer\s*)?questions?/i,
            /(\d+)\s*vsa/i,
            /(\d+)\s*very\s+short/i,    // without "questions" suffix
        ]},
        { key: 'mcq', patterns: [
            /(\d+)\s*mcqs?/i,
            /(\d+)\s*multiple\s+choice\s*(?:questions?)?/i,
        ]},
        { key: 'long', patterns: [
            /(\d+)\s*long\s*(?:answer\s*)?questions?/i,
            /(\d+)\s*essay\s*questions?/i,
            /(\d+)\s*long/i,            // without "questions" suffix
        ]},
        { key: 'short', patterns: [
            /(\d+)\s*short\s*(?:answer\s*)?questions?/i,
            /(\d+)\s*short/i,           // without "questions" suffix
        ]},
        { key: 'hot', patterns: [
            /(\d+)\s*hot\s*(?:questions?)?/i,
            /(\d+)\s*key\s*questions?/i,
            /(\d+)\s*hots/i,
        ]},
    ];

    for (const type of typePatterns) {
        for (const pattern of type.patterns) {
            const match = lower.match(pattern);
            if (match) {
                const count = parseInt(match[1]);
                // Only set if not already set (first-match wins per type)
                if (!(type.key in types)) {
                    types[type.key as keyof ParsedQuestionRequest['types']] = count;
                    totalQuestions += count;
                }
                break;
            }
        }
    }
    
    // If no specific counts, try to detect implied counts
    if (totalQuestions === 0) {
        if (/mcq|multiple\s+choice/i.test(lower)) {
            types.mcq = 5;
            totalQuestions += 5;
        }
        if (/long\s+questions?/i.test(lower)) {
            types.long = 3;
            totalQuestions += 3;
        }
        if (/short\s+questions?/i.test(lower)) {
            types.short = 5;
            totalQuestions += 5;
        }
        if (/very\s+short/i.test(lower)) {
            types.veryShort = 5;
            totalQuestions += 5;
        }
        if (/hot\s+questions?/i.test(lower)) {
            types.hot = 5;
            totalQuestions += 5;
        }
    }
    
    // If no chapters found, return null
    if (chapters.length === 0) {
        return null;
    }
    
    // If no question types found, default to long questions
    if (totalQuestions === 0) {
        types.long = 3;
        totalQuestions = 3;
    }
    
    return {
        types,
        chapters,
        chapterRange,
        totalQuestions
    };
}

export function formatQuestionRequest(parsed: ParsedQuestionRequest): string {
    const parts: string[] = [];
    
    const typeLabels: Record<string, string> = {
        mcq: 'MCQs',
        short: 'short questions',
        veryShort: 'very short questions',
        long: 'long questions',
        hot: 'hot questions'
    };
    
    for (const [key, count] of Object.entries(parsed.types)) {
        if (count && count > 0) {
            const label = typeLabels[key] || key;
            parts.push(`${count} ${label}`);
        }
    }
    
    const chapterText = parsed.chapters.length === 1 
        ? `Chapter ${parsed.chapters[0]}`
        : `Chapters ${parsed.chapters.join(', ')}`;
    
    return `Generate ${parts.join(', ')} from ${chapterText}`;
}