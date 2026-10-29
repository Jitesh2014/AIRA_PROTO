/**
 * Normalize LLM / textbook text into clean, readable markdown.
 */

const SOURCE_HEADER =
  /^\[Source\s+\d+\s*[—–-]\s*.+?score:\s*[\d.]+\]\s*$/gim;

function fixOcr(text: string): string {
  return text
    .replace(/øoat/gi, "float")
    .replace(/Ÿ/g, "'")
    .replace(/fullled/gi, "fulfilled")
    .replace(/\uFFFD/g, "")
    .replace(/A,\s*owchart/gi, "flowchart")
    .replace(/\?owchart/gi, "flowchart");
}

function collapsePipeNoise(line: string): string {
  let s = line.trim();
  if (!s.includes("|")) return s;

  if ((s.match(/\|/g) || []).length >= 3) {
    s = s
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && c !== "0")
      .join(" ");
  }

  return s.replace(/\s+/g, " ").trim();
}

function formatMcqOptions(text: string): string {
  const optMatch = text.match(/((?:\([a-d]\)\s*[^()]+?){2,})/i);
  if (!optMatch) return text;

  const before = text.slice(0, optMatch.index).trim();
  const options = [
    ...optMatch[1].matchAll(/\(([a-d])\)\s*([^()]+?)(?=\s*\([a-d]\)|$)/gi),
  ];

  if (options.length < 2) return text;

  const opts = options
    .map((m) => `- **(${m[1]})** ${m[2].trim()}`)
    .join("\n");

  return `${before}\n\n${opts}`;
}

function formatCodeLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (codeBuf.length) {
      out.push("```python", ...codeBuf, "```");
      codeBuf = [];
    }
  };

  const codeLike =
    /^(print\s*\(|>>>|input\s*\(|\w+\s*=\s*.+|if\s+.+\s*:|for\s+.+\s*:|def\s+\w+)/i;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushCode();
      out.push("");
      continue;
    }
    if (codeLike.test(line) && line.length < 120) {
      codeBuf.push(line);
    } else {
      flushCode();
      out.push(line);
    }
  }
  flushCode();
  return out.join("\n");
}

function formatSections(text: string): string {
  return text
    .replace(/^A\.\s*MULTIPLE\s+CHOICE\s+QUESTIONS?/gim, "## A. Multiple Choice Questions")
    .replace(/^B\.\s*FILL\s+IN\s+THE\s+BLANKS?/gim, "## B. Fill in the Blanks")
    .replace(/^WORKSHEET$/gim, "### Worksheet")
    .replace(/^PROJECT\s*:\s*(.+)$/gim, "### Project: $1");
}

function formatNumberedQuestions(text: string): string {
  return text.replace(/^(\d+)\.\s+(.+)$/gm, (_, num, body) => {
    return `**${num}.** ${formatMcqOptions(body.trim())}`;
  });
}

function stripBoilerplate(text: string): string {
  return text
    .replace(SOURCE_HEADER, "")
    .replace(/^\d+\s*©\s*.+$/gim, "")
    .replace(/^-+$/gm, "")
    .replace(/\[PAGE\s+\d+\]/gi, "")
    .replace(/\*Routed to .+\*/g, "")
    .replace(/Start Ollama locally.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizePipeTables(text: string): string {
  let out = text;

  out = out.replace(/\[TABLE START\]\s*/gi, "\n\n");
  out = out.replace(/\s*\[TABLE END\]/gi, "\n\n");
  out = out.replace(/\[CODE\]\s*/gi, "\n```\n");
  out = out.replace(/\s*\[\/CODE\]/gi, "\n```\n");

  out = out.replace(
    /([^\n])\n(\|[^\n]+\|)\n(\|[-:\s|]+\|)/g,
    "$1\n\n$2\n$3"
  );

  return out;
}

function formatSourceBlocks(text: string): string {
  const chunks = text.split(/(?=\[Source\s+\d+)/i).filter(Boolean);
  if (chunks.length <= 1) return text;

  return chunks
    .map((chunk) => {
      const header = chunk.match(
        /^\[Source\s+(\d+)\s*[—–-]\s*([^,]+),\s*Ch\.\s*([^\]—–-]+)/i
      );
      let body = chunk;
      if (header) {
        const [, num, title, chapter] = header;
        body = chunk.replace(/^\[Source\s+\d+[^\]]*\]\s*/i, "");
        return `### Source ${num} — ${title.trim()}, Ch. ${chapter.trim()}\n\n${body.trim()}`;
      }
      return chunk.trim();
    })
    .join("\n\n---\n\n");
}

/** Main formatter used by ChatMarkdown. */
export function formatChatMarkdown(text: string): string {
  let out = text.replace(/\r\n/g, "\n");

  out = fixOcr(out);
  out = normalizePipeTables(out);
  out = stripBoilerplate(out);

  const lines = out.split("\n").map(collapsePipeNoise);
  out = lines.join("\n");

  out = formatSourceBlocks(out);
  out = formatSections(out);
  out = formatCodeLines(out);
  out = formatNumberedQuestions(out);

  // Promote markdown headings that LLM may have missed
  out = out.replace(
    /^\*\*Excerpts from your materials:\*\*/gim,
    "## From your textbook"
  );
  out = out.replace(/^\*\*Sources:\*\*/gim, "## Sources");
  out = out.replace(/^\*\*Summary[^*]*:\*\*/gim, "## Summary");

  return out.trim();
}
