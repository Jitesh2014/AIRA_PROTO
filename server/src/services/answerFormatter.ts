function removeAllLabels(answer: string): string {
    if (!answer) return answer;
    
    // Remove ALL type labels from the answer - keep only question numbers
    const patterns = [
        // Remove labels from question numbering like "1. Concept Check -"
        /^\d+\.\s*(?:Concept Check|Application Based|Competency Based|Reasoning Based|HOTS|Output Prediction|Case Study|Creative Thinking|Data Interpretation|Real-life Scenario)\s*[–-]?\s*/gmi,
        
        // Remove "Q1: Concept Check" style
        /Q\d+\s*[:：]\s*(?:Concept Check|Application Based|Competency Based|Reasoning Based|HOTS|Output Prediction)\s*[–-]?\s*/gmi,
        
        // Remove standalone labels
        /-\s*(?:Concept Check|Application Based|Competency Based|Reasoning Based|HOTS|Output Prediction)\s*[–-]?\s*/gmi,
        /\*\*(?:Concept Check|Application Based|Competency Based|Reasoning Based|HOTS|Output Prediction)\*\*\s*[–-]?\s*/gmi,
        
        // Remove labels in parentheses
        /\(Concept Check\)/gmi,
        /\(Application Based\)/gmi,
        /\(Competency Based\)/gmi,
        /\(Reasoning Based\)/gmi,
        /\(HOTS\)/gmi,
        /\(Output Prediction\)/gmi,
        /\(Case Study\)/gmi,
        /\(Creative Thinking\)/gmi,
        /\(Data Interpretation\)/gmi,
        /\(Real-life Scenario\)/gmi,
        
        // Remove **Question Type:** labels
        /\*\*Question Type:\*\*\s*[^\n]+\n/gmi,
        
        // Remove "Concept Check –" style
        /Concept Check\s*[–-]\s*/gmi,
        /Application Based\s*[–-]\s*/gmi,
        /Competency Based\s*[–-]\s*/gmi,
        /Reasoning Based\s*[–-]\s*/gmi,
        /Higher Order Thinking\s*[–-]\s*/gmi,
    ];
    
    for (const pattern of patterns) {
        answer = answer.replace(pattern, '');
    }
    
    // Clean up extra spaces and dashes
    answer = answer.replace(/^\s*[-–]\s*/gm, '');
    answer = answer.replace(/\n{3,}/g, '\n\n');
    answer = answer.replace(/^\s+/, '');
    
    return answer;
}

// ============================================
// CLEAN DISPLAY TEXT
// ============================================

function cleanDisplayText(text: string): string {
    if (!text) return "";
    
    let cleaned = text;
    
    const removePatterns = [
        /©\s*SuperTeacher\s*Edureforms\s*Pvt\.\s*Ltd\.?/gi,
        /SuperTeacher\s*Edureforms\s*Pvt\.\s*Ltd\.?/gi,
        /Edureforms/gi,
        /Recall\s+Recall/gi,
        /for More\.{2,}/gi,
        /For More\.{2,}/gi,
        /ScanScan/gi,
        /scan\s*scan/gi,
        /\[PAGE\s+\d+\]/gi,
        /Page\s+\d+/gi,
        /\[CHAPTER_START\].*?\[CHAPTER_END\]/gi,
        /\[TABLE START\].*?\[TABLE END\]/gi,
        /\[FORMULA\].*?\[\/FORMULA\]/gi,
        /\[CODE\].*?\[\/CODE\]/gi,
        /END OF CHAPTER.*$/gm,
        /CHAPTER\s*\d+\s*:\s*.*$/gm,
        /LEARNING OBJECTIVES.*$/gm,
        /Source:.*$/gm,
        /Total Pages:.*$/gm,
        /Tables Found:.*$/gm,
        /Formulas Found:.*$/gm,
        /Code Blocks Found:.*$/gm,
        /Title:.*$/gm,
    ];
    
    for (const pattern of removePatterns) {
        cleaned = cleaned.replace(pattern, '');
    }
    
    cleaned = cleaned.replace(/\b\d+\s*\/\s*\d+\s*\*\s*\d+\b/g, '');
    cleaned = cleaned.replace(/\b\d+\s*\+\s*\d+\s*\*\s*\d+\b/g, '');
    cleaned = cleaned.replace(/\b\d+\s*[\/\+\*\-]\s*\d+\s*[\/\+\*\-]\s*\d+\b/g, '');
    cleaned = cleaned.replace(/\b\d+\s*[\/\+\*\-]\s*\d+\b/g, '');
    cleaned = cleaned.replace(/^\s*\d+\s*\/\s*\d+\s*/, '');
    
    cleaned = cleaned.replace(/ﬁ/g, 'fi');
    cleaned = cleaned.replace(/ﬂ/g, 'fl');
    cleaned = cleaned.replace(/’/g, "'");
    cleaned = cleaned.replace(/“/g, '"');
    cleaned = cleaned.replace(/”/g, '"');
    cleaned = cleaned.replace(/ø/g, 'o');
    cleaned = cleaned.replace(/Ÿ/g, "'");
    cleaned = cleaned.replace(/Å/g, '');
    cleaned = cleaned.replace(/Ã/g, '');
    cleaned = cleaned.replace(/¸/g, '');
    cleaned = cleaned.replace(/î¢e/g, 'The');
    cleaned = cleaned.replace(/e/g, 'The');
    cleaned = cleaned.replace(/oowchart/gi, 'flowchart');
    cleaned = cleaned.replace(/A,owchart/gi, 'flowchart');
    
    cleaned = cleaned.replace(/[@#\$%\^&\*\(\)\{\}\[\]|\\;:'",<>\/?]/g, '');
    cleaned = cleaned.replace(/[•●○◆◇■□▶▸]/g, '');
    cleaned = cleaned.replace(/_{5,}/g, '');
    cleaned = cleaned.replace(/_{3,4}/g, ' ');
    cleaned = cleaned.replace(/_{2,}/g, ' ');
    
    const garbagePhrases = [
        'Space is a special character',
        'player@health',
        '@ is a specia',
        'playerhealth is a specia',
        'specia',
        '_____',
        '__ __',
    ];
    
    for (const phrase of garbagePhrases) {
        cleaned = cleaned.replace(new RegExp(phrase, 'gi'), '');
    }
    
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\n\s*\n+/g, '\n\n');
    
    return cleaned.trim();
}

// ============================================
// EXTRACT DEFINITION
// ============================================

function extractDefinition(text: string): string | null {
    const cleaned = cleanDisplayText(text);
    
    const patterns = [
        /A\s+(\w+)\s+is\s+([^.!?]+[.!?])/i,
        /(\w+)\s+is\s+a\s+([^.!?]+[.!?])/i,
        /(\w+)\s+are\s+([^.!?]+[.!?])/i,
        /called\s+(\w+)[,.\s]+([^.!?]+[.!?])/i,
        /defined\s+as\s+([^.!?]+[.!?])/i,
        /Variable\s+is\s+([^.!?]+[.!?])/i,
        /variables\s+are\s+([^.!?]+[.!?])/i,
        /is\s+a\s+memory\s+box\s+([^.!?]+[.!?])/i,
    ];
    
    for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
            let result = match[0].trim();
            result = result.charAt(0).toUpperCase() + result.slice(1);
            result = result.replace(/\b\d+\s*[\/\+\*\-]\s*\d+\b/g, '');
            result = result.replace(/specia/gi, '');
            return result;
        }
    }
    return null;
}

// ============================================
// EXTRACT EXAMPLES
// ============================================

function extractExamples(text: string): string[] {
    const cleaned = cleanDisplayText(text);
    const examples: string[] = [];
    
    const patterns = [
        /for example[,:]\s*([^.!?]+[.!?])/gi,
        /e\.g\.,?\s*([^.!?]+[.!?])/gi,
        /such as\s+([^.!?]+[.!?])/gi,
        /like\s+([^.!?]+[.!?])/gi,
        /example\s*:\s*([^.!?]+[.!?])/gi,
    ];
    
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(cleaned)) !== null) {
            const example = (match[2] || match[1]).trim();
            if (example.length > 15 && 
                example.length < 200 &&
                !example.includes('___') &&
                !example.includes('_ _') &&
                /[a-zA-Z]/.test(example) &&
                !example.includes('specia') &&
                !example.includes('player@')) {
                examples.push(example);
            }
        }
    }
    
    const varPattern = /(\w+)\s*=\s*[^,;.!?\s]+/g;
    let varMatch;
    while ((varMatch = varPattern.exec(cleaned)) !== null) {
        const example = varMatch[0].trim();
        if (example.length > 3 && example.length < 50) {
            examples.push(example);
        }
    }
    
    return examples;
}

// ============================================
// EXTRACT KEY POINTS
// ============================================

function extractKeyPoints(text: string): string[] {
    const cleaned = cleanDisplayText(text);
    const points: string[] = [];
    
    const bulletMatches = cleaned.match(/[•●○◆◇■□▶▸]\s*([^.!?]+[.!?])/g);
    if (bulletMatches) {
        for (const match of bulletMatches) {
            const point = match.replace(/[•●○◆◇■□▶▸]\s*/, '').trim();
            if (point.length > 10 && point.length < 200) {
                points.push(point);
            }
        }
    }
    
    const numberedMatches = cleaned.match(/\d+\.\s*([^.!?]+[.!?])/g);
    if (numberedMatches) {
        for (const match of numberedMatches) {
            const point = match.replace(/\d+\.\s*/, '').trim();
            if (point.length > 10 && point.length < 200) {
                points.push(point);
            }
        }
    }
    
    return points;
}

// ============================================
// SYNTHESIZE ANSWER
// ============================================

export function synthesizeAnswer(question: string, sources: Array<{ book_title: string; chapter: string; snippet?: string; pages?: string }>): string {
    console.log(`[synthesizeAnswer] Called with ${sources?.length || 0} sources`);
    
    if (!sources || sources.length === 0) {
        return `I couldn't find specific information about "${question}" in your textbook.`;
    }

    let combinedContent = '';
    const seen = new Set();
    
    for (const source of sources) {
        let snippet = source.snippet || '';
        if (!snippet || snippet.length < 10) continue;
        
        snippet = cleanDisplayText(snippet);
        if (!snippet || snippet.length < 10) continue;
        
        const sentences = snippet.match(/[^.!?]*[.!?]/g) || [];
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed.length > 15 && 
                /[a-zA-Z]/.test(trimmed) && 
                !trimmed.includes('___') &&
                !trimmed.includes('_ _') &&
                !seen.has(trimmed)) {
                seen.add(trimmed);
                combinedContent += trimmed + ' ';
            }
        }
    }

    const sentences = combinedContent.match(/[^.!?]*[.!?]/g) || [];
    const cleanSentences = sentences.filter(s => s.trim().length > 15);
    
    let definition = '';
    if (cleanSentences.length > 0) {
        definition = cleanSentences[0].trim();
        definition = definition.charAt(0).toUpperCase() + definition.slice(1);
    }

    let additionalInfo = '';
    if (cleanSentences.length > 1) {
        const extra = cleanSentences.slice(1, 4).join(' ');
        additionalInfo = extra.trim();
        additionalInfo = additionalInfo.charAt(0).toUpperCase() + additionalInfo.slice(1);
    }

    const examples: string[] = [];
    for (const source of sources) {
        const snippet = source.snippet || '';
        const exs = extractExamples(snippet);
        examples.push(...exs);
    }
    const uniqueExamples = [...new Set(examples)].slice(0, 2);

    const keyPoints: string[] = [];
    for (const source of sources) {
        const snippet = source.snippet || '';
        const points = extractKeyPoints(snippet);
        keyPoints.push(...points);
    }
    const uniqueKeyPoints = [...new Set(keyPoints)].slice(0, 3);

    const cleanQuestion = question.replace(/[?!.]+$/, "").trim();
    const formattedTitle = cleanQuestion.charAt(0).toUpperCase() + cleanQuestion.slice(1);
    let answer = ` **${formattedTitle}**\n\n`;

    if (definition) {
        answer += `${definition}\n\n`;
    }

    if (additionalInfo) {
        answer += `${additionalInfo}\n\n`;
    }

    if (uniqueExamples.length > 0) {
        answer += `**Examples:**\n`;
        uniqueExamples.forEach((ex, i) => {
            let cleanEx = ex.charAt(0).toUpperCase() + ex.slice(1);
            if (!cleanEx.endsWith('.') && !cleanEx.endsWith('!') && !cleanEx.endsWith('?')) {
                cleanEx += '.';
            }
            answer += `${i + 1}. ${cleanEx}\n`;
        });
        answer += `\n`;
    }

    if (uniqueKeyPoints.length > 0) {
        answer += `**Key Points:**\n`;
        uniqueKeyPoints.forEach((point) => {
            let cleanPoint = point.charAt(0).toUpperCase() + point.slice(1);
            if (!cleanPoint.endsWith('.') && !cleanPoint.endsWith('!') && !cleanPoint.endsWith('?')) {
                cleanPoint += '.';
            }
            answer += `• ${cleanPoint}\n`;
        });
        answer += `\n`;
    }

    if (sources.length > 0) {
        answer += ` **Sources:**\n`;
        const uniqueSources = new Map();
        sources.forEach((source) => {
            const key = `${source.book_title}:${source.chapter}`;
            if (!uniqueSources.has(key)) {
                uniqueSources.set(key, source);
            }
        });
        
        let idx = 1;
        for (const [_, source] of uniqueSources) {
            const title = source.book_title || 'Textbook';
            const chapter = source.chapter || 'Unknown';
            answer += `[${idx}] ${title} — Ch. ${chapter}\n`;
            idx++;
        }
    }

    // Apply label removal before returning
    return removeAllLabels(answer);
}

// ============================================
// BUILD FORMATTED FALLBACK ANSWER
// ============================================

export function buildFormattedFallbackAnswer(input: {
    question: string;
    context: string;
    sources: Array<{ book_title: string; chapter: string; snippet?: string; pages?: string }>;
    summary?: string;
}): string {
    console.log(`[buildFormattedFallbackAnswer] Called with ${input.sources?.length || 0} sources`);
    console.log(`[buildFormattedFallbackAnswer] Context length: ${input.context?.length || 0}`);
    
    const context = input.context || '';
    if (context && context.length > 200 && 
        !context.includes('AIRA (RAG service offline)') &&
        !context.includes('I couldn\'t find')) {
        console.log(`[buildFormattedFallbackAnswer] Using LLM-generated context (${context.length} chars)`);
        return removeAllLabels(context);
    }
    
    console.log(`[buildFormattedFallbackAnswer] Using synthesizer fallback`);
    return synthesizeAnswer(input.question, input.sources);
}