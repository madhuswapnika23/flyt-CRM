import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Redis } from "@upstash/redis";

const dataDirectory = path.join(process.cwd(), "data");
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
let localClaimQueue: Promise<void> = Promise.resolve();

function ensureStorageConfigured(): void {
  if (process.env.VERCEL === "1" && !redis) {
    throw new Error("Upstash Redis is required for persistent storage on Vercel.");
  }
}

export function isRedisConfigured(): boolean {
  return redis !== null;
}

function filePath(key: string): string {
  const safeKey = key.split("/").map(encodeURIComponent).join(path.sep);
  return path.join(dataDirectory, `${safeKey}.json`);
}

export async function get<T>(key: string): Promise<T | null> {
  ensureStorageConfigured();
  if (redis) return (await redis.get<T>(key)) ?? null;

  try {
    return JSON.parse(await readFile(filePath(key), "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function set<T>(key: string, value: T): Promise<void> {
  ensureStorageConfigured();
  if (redis) {
    await redis.set(key, value);
    return;
  }

  const destination = filePath(key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(value, null, 2), "utf8");
}

export async function list<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  ensureStorageConfigured();
  if (redis) {
    const keys = await redis.keys(`${prefix}*`);
    const values = await Promise.all(keys.map((key) => redis.get<T>(key)));
    return keys.flatMap((key, index) => values[index] == null ? [] : [{ key, value: values[index] as T }]);
  }

  async function walk(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(entries.map((entry) => {
        const entryPath = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(entryPath) : entry.name.endsWith(".json") ? [entryPath] : [];
      }));
      return nested.flat();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  const files = await walk(dataDirectory);
  const result: Array<{ key: string; value: T }> = [];
  for (const file of files) {
    const key = path.relative(dataDirectory, file).split(path.sep).join("/").replace(/\.json$/, "");
    if (key.startsWith(prefix)) result.push({ key, value: JSON.parse(await readFile(file, "utf8")) as T });
  }
  return result;
}

/** Atomically claims a call slot in Redis, or checks it in local development. */
export async function claimMcpCall(now: number, minimumSpacingMs: number): Promise<number | null> {
  ensureStorageConfigured();
  const key = "system/mcp-last-call-at";
  if (redis) {
    const result = await redis.eval<[string, string], number>(
      "local previous = redis.call('GET', KEYS[1]); if previous and (tonumber(ARGV[1]) - tonumber(previous)) < tonumber(ARGV[2]) then return tonumber(previous) end; redis.call('SET', KEYS[1], ARGV[1]); return 0",
      [key],
      [String(now), String(minimumSpacingMs)],
    );
    if (result !== 0) return Number(result);
    return null;
  }

  let release!: () => void;
  const previousClaim = localClaimQueue;
  localClaimQueue = new Promise<void>((resolve) => { release = resolve; });
  await previousClaim;
  try {
    const previous = await get<number>(key);
    if (previous !== null && now - previous < minimumSpacingMs) return previous;
    await set(key, now);
    return null;
  } finally {
    release();
  }
}

export async function getLastCallAt(): Promise<number | null> {
  return get<number>("system/mcp-last-call-at");
}

/** Atomically reserves a poll window so concurrent serverless requests cannot duplicate calls. */
export async function claimSignalPoll(now: number, minimumSpacingMs: number): Promise<number | null> {
  ensureStorageConfigured();
  const key = "system/signals-last-poll-at";
  if (redis) {
    const result = await redis.eval<[string, string], number>(
      "local previous = redis.call('GET', KEYS[1]); if previous and (tonumber(ARGV[1]) - tonumber(previous)) < tonumber(ARGV[2]) then return tonumber(previous) end; redis.call('SET', KEYS[1], ARGV[1]); return 0",
      [key],
      [String(now), String(minimumSpacingMs)],
    );
    return result === 0 ? null : Number(result);
  }

  let release!: () => void;
  const previousClaim = localClaimQueue;
  localClaimQueue = new Promise<void>((resolve) => { release = resolve; });
  await previousClaim;
  try {
    const previous = await get<number>(key);
    if (previous !== null && now - previous < minimumSpacingMs) return previous;
    await set(key, now);
    return null;
  } finally {
    release();
  }
}

export async function getLastSignalPollAt(): Promise<number | null> {
  return get<number>("system/signals-last-poll-at");
}
