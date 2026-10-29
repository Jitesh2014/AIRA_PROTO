import { Redis, type RedisOptions } from "ioredis";

import { config } from "../config.js";

let client: Redis | null = null;
let available = false;

function isTlsUrl(url: string): boolean {
  return url.startsWith("rediss://");
}

function buildRedisOptions(overrides: Partial<RedisOptions> = {}): RedisOptions {
  const tls = isTlsUrl(config.redisUrl);
  return {
    // BullMQ requires null; also fine for cache reads/writes
    maxRetriesPerRequest: null,
    connectTimeout: 10_000,
    commandTimeout: 15_000,
    lazyConnect: true,
    enableReadyCheck: true,
    retryStrategy: (times) => (times > 12 ? null : Math.min(times * 300, 3000)),
    ...(tls ? { tls: { rejectUnauthorized: true } } : {}),
    ...overrides,
  };
}

export async function connectRedis(): Promise<void> {
  const url = config.redisUrl.trim();
  if (!url) {
    console.warn(
      "REDIS_URL not set — caching and indexing queue disabled. " +
        "Add your Redis Cloud URL to server/.env and rag-service/.env."
    );
    return;
  }

  const probe = new Redis(url, {
    ...buildRedisOptions(),
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });

  probe.on("error", () => {
    // suppress errors during probe
  });

  try {
    await probe.connect();
    await probe.ping();
    probe.disconnect();

    client = new Redis(url, buildRedisOptions());
    client.on("error", (err) => {
      console.error("Redis error:", err.message);
    });
    await client.connect();

    available = true;
    const host = isTlsUrl(url) ? "Redis Cloud (TLS)" : url;
    console.log(`Redis connected — ${host}`);
  } catch (err) {
    probe.disconnect();
    client = null;
    available = false;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `Redis unavailable — caching and job queue disabled (${message}). ` +
        "Check REDIS_URL in server/.env (Redis Cloud public endpoint, rediss://...)."
    );
  }
}

export function getRedis(): Redis | null {
  return available ? client : null;
}

export function isRedisAvailable(): boolean {
  return available;
}

export async function pingRedis(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}

export function getRedisConnectionConfig(): { url: string } & RedisOptions {
  return { url: config.redisUrl, ...buildRedisOptions() };
}
