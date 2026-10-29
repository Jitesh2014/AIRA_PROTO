import { config } from "../config.js";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function isWebSearchConfigured(): boolean {
  return config.webSearchEnabled && Boolean(config.tavilyApiKey);
}

export function buildChapterScopedQuery(input: {
  question: string;
  chapter: string;
  chapterLabel?: string;
}): string {
  const label = input.chapterLabel ? `"${input.chapterLabel}"` : "";
  return [
    "Grade 6 Computer Science",
    `Chapter ${input.chapter}`,
    label,
    input.question,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function formatWebContext(results: WebSearchResult[]): string {
  if (results.length === 0) return "";

  return results
    .map(
      (r, i) =>
        `[Web ${i + 1} — ${r.title}]\n${r.snippet}${r.url ? `\nURL: ${r.url}` : ""}`
    )
    .join("\n\n");
}

export async function searchWebForChapter(input: {
  question: string;
  chapter: string;
  chapterLabel?: string;
  maxResults?: number;
}): Promise<WebSearchResult[]> {
  if (!isWebSearchConfigured()) return [];

  const query = buildChapterScopedQuery(input);

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.tavilyApiKey,
        query,
        search_depth: "basic",
        max_results: input.maxResults ?? 3,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(config.webSearchTimeoutMs),
    });

    if (!response.ok) {
      console.warn("Web search failed:", await response.text());
      return [];
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    return (data.results ?? [])
      .map((r) => ({
        title: r.title?.trim() || "Web result",
        url: r.url?.trim() || "",
        snippet: (r.content ?? "").trim().slice(0, 600),
      }))
      .filter((r) => r.snippet.length > 0);
  } catch (err) {
    console.warn("Web search error:", err);
    return [];
  }
}
