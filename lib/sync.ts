import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { callTool, McpRateLimitError, type McpResponse } from "@/lib/mcp";
import { get, set } from "@/lib/store";
import { readNormalizedData } from "@/lib/intel/data";
import { ingestSignalPayload } from "@/lib/signals";

interface StoredRaw {
  fetchedAt: string;
  raw: unknown;
}

async function readExisting(key: string): Promise<StoredRaw | null> {
  const stored = await get<StoredRaw>(key);
  if (stored) return stored;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  const localFiles: Record<string, string> = {
    accounts: "get_my_accounts.json",
    "raw/accounts": "get_my_accounts.json",
    "raw/schema": "get_data_format.json",
    "paperwork:A": "paperwork_A.json",
    "paperwork:B": "paperwork_B.json",
    "signals:initial": "signals_initial.json",
  };
  const filename = localFiles[key];
  if (!filename) return null;
  try {
    const file = path.join(process.cwd(), "data", "raw", filename);
    const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
    const savedAt = await stat(file);
    return { fetchedAt: savedAt.mtime.toISOString(), raw };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function callAfterGate(name: string, args: Record<string, unknown>): Promise<McpResponse> {
  try {
    return await callTool(name, args);
  } catch (error) {
    if (!(error instanceof McpRateLimitError)) throw error;
    const waitMs = Math.max(0, error.lastCallAt + 61_000 - Date.now() + 100);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return callTool(name, args);
  }
}

async function fetchIfMissing(key: string, toolName: string, args: Record<string, unknown> = {}): Promise<StoredRaw> {
  const existing = await readExisting(key);
  if (existing) return existing;
  const response = await callAfterGate(toolName, args);
  const stored = { fetchedAt: new Date().toISOString(), raw: response.raw };
  await set(key, stored);
  return stored;
}

function parseToolText(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const result = (raw as { result?: { content?: Array<{ text?: string }> } }).result;
  const text = result?.content?.find((item) => typeof item.text === "string")?.text;
  if (!text) throw new Error("Stored MCP response has no text content.");
  try { return JSON.parse(text) as unknown; } catch { throw new Error("Stored MCP text content is not valid JSON."); }
}

function extractAccounts(value: unknown): Array<{ id: string }> {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { accounts?: unknown }).accounts)) {
    throw new Error("get_my_accounts did not return an accounts array; no account paperwork was requested.");
  }
  const accounts = (value as { accounts: unknown[] }).accounts.flatMap((item) => {
    if (typeof item !== "object" || item === null || typeof (item as { id?: unknown }).id !== "string") return [];
    return [{ id: (item as { id: string }).id }];
  });
  if (accounts.length < 2) throw new Error("Two account identifiers were not present; no guessed identifiers were used.");
  return accounts;
}

function findSignalCursor(value: unknown): { lastSeenSignalId: string | null; cursor: string | null } {
  const candidates: Array<Record<string, unknown>> = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (typeof item !== "object" || item === null) return;
    const record = item as Record<string, unknown>;
    candidates.push(record);
    for (const child of Object.values(record)) if (typeof child === "object" && child !== null) visit(child);
  };
  visit(value);
  const signal = [...candidates].reverse().find((item) => typeof item.id === "string" || typeof item.signal_id === "string");
  const cursorItem = [...candidates].reverse().find((item) => typeof item.cursor === "string");
  return {
    lastSeenSignalId: typeof signal?.signal_id === "string" ? signal.signal_id : typeof signal?.id === "string" ? signal.id : null,
    cursor: typeof cursorItem?.cursor === "string" ? cursorItem.cursor : null,
  };
}

export async function runInitialSync(): Promise<{ completed: string[]; skipped: string[]; signalCursor: { lastSeenSignalId: string | null; cursor: string | null } }> {
  const completed: string[] = [];
  const skipped: string[] = [];
  const fetch = async (key: string, tool: string, args: Record<string, unknown> = {}) => {
    const hadValue = await readExisting(key);
    if (hadValue) {
      await set(key, hadValue);
      skipped.push(key);
      return hadValue;
    }
    const stored = await fetchIfMissing(key, tool, args);
    completed.push(key);
    return stored;
  };

  const accountsResponse = await fetch("accounts", "get_my_accounts");
  const accounts = extractAccounts(parseToolText(accountsResponse.raw));
  const [accountA, accountB] = accounts;
  await fetch("raw/schema", "get_data_format");
  await fetch("raw/notes", "list_notes");
  await fetch(`paperwork:${accountA.id}`, "get_all_paperwork", { account: accountA.id });
  await fetch(`paperwork:${accountB.id}`, "get_all_paperwork", { account: accountB.id });
  const signals = await fetch("signals:initial", "get_signals");
  const signalCursor = findSignalCursor(parseToolText(signals.raw));
  await set("signals:last-seen", { ...signalCursor, fetchedAt: signals.fetchedAt });
  const normalized = await readNormalizedData();
  await ingestSignalPayload(parseToolText(signals.raw), normalized.accounts);
  return { completed, skipped, signalCursor };
}
