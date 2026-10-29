import { createHash } from "node:crypto";

import { getRedis } from "../db/redis.js";

export interface CachedAnswer {
  answer: string;
  sources: Array<{
    book_title: string;
    chapter: string;
    pages: string;
    snippet: string;
  }>;
  model_used: string;
  content_version: string;
  created_at: string;
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/[?!.]+$/, "")
    .replace(/\s+/g, " ");
}

function buildCacheKey(
  schoolId: string,
  query: string,
  contentVersion: string,
  filters: Record<string, string | undefined>
): string {
  const filterKey = JSON.stringify({
    subject: filters.subject ?? "",
    class: filters.class ?? "",
    book_id: filters.bookId ?? "",
    chapter: filters.chapter ?? "",
    mode: filters.mode ?? "",
    theme: filters.theme ?? "",
  });
  const raw = `${schoolId}:${normalizeQuery(query)}:${contentVersion}:${filterKey}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  return `aira:${schoolId}:cache:${hash}`;
}

/*export async function getCachedAnswer(
  schoolId: string,
  query: string,
  contentVersion: string,
  filters: Record<string, string | undefined> = {}
): Promise<CachedAnswer | null> {
  const redis = getRedis();
  if (!redis) return null;

  const key = buildCacheKey(schoolId, query, contentVersion, filters);
  const raw = await redis.get(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedAnswer;
  } catch {
    return null;
  }
}*/


export async function getCachedAnswer(key: string): Promise<string | null> {
  console.log(" Cache disabled for debugging");
  return null;
}

export async function setCachedAnswer(
  schoolId: string,
  query: string,
  contentVersion: string,
  filters: Record<string, string | undefined>,
  value: CachedAnswer,
  ttlSeconds = 60 * 60 * 72
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const key = buildCacheKey(schoolId, query, contentVersion, filters);
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}

/**
 * Clear specific keys by prefix from Redis cache.
 */
export async function clearCacheByPrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    let cursor = "0";
    do {
      const reply = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = reply[0];
      const keys = reply[1];
      if (keys.length > 0) {
        // ioredis / standard redis delete
        await redis.del(...keys);
      }
    } while (cursor !== "0");
    console.log(` [Cache] Cleared keys matching prefix: ${prefix}*`);
  } catch (err) {
    console.error(` [Cache] Error clearing keys for prefix ${prefix}:`, err);
  }
}

/**
 * Clear all cached answers for a specific school.
 */
export async function clearSchoolCache(schoolId: string): Promise<void> {
  const prefix = `aira:${schoolId}:cache:`;
  await clearCacheByPrefix(prefix);
}
