import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

import { config } from "../config.js";
import { getRedis, isRedisAvailable } from "../db/redis.js";

async function dirSizeBytes(dirPath: string): Promise<number> {
  let total = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await dirSizeBytes(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
  } catch {
    return 0;
  }

  return total;
}

export async function getServerStorageBytes(): Promise<number> {
  return dirSizeBytes(config.uploadDir);
}

export async function getDatabaseStorageBytes(): Promise<number> {
  try {
    const db = mongoose.connection.db;
    if (!db) return 0;
    const stats = await db.stats();
    return stats.dataSize ?? 0;
  } catch {
    return 0;
  }
}

export async function getCacheStorage(): Promise<{
  bytes: number;
  keys: number;
  available: boolean;
}> {
  if (!isRedisAvailable()) {
    return { bytes: 0, keys: 0, available: false };
  }

  const redis = getRedis();
  if (!redis) {
    return { bytes: 0, keys: 0, available: false };
  }

  try {
    const info = await redis.info("memory");
    const usedMatch = info.match(/used_memory:(\d+)/);
    const bytes = usedMatch ? Number(usedMatch[1]) : 0;

    let keys = 0;
    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(
        cursor,
        "MATCH",
        "aira:*:cache:*",
        "COUNT",
        200
      );
      cursor = next;
      keys += batch.length;
    } while (cursor !== "0");

    return { bytes, keys, available: true };
  } catch {
    return { bytes: 0, keys: 0, available: false };
  }
}
