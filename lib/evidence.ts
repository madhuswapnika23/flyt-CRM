import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { get } from "@/lib/store";
import type { StoredSignalEvent } from "@/lib/signals";

type RecordValue = Record<string, unknown>;

async function storedAccounts(): Promise<unknown> {
  const stored = await get<unknown>("accounts");
  if (stored !== null) return stored;
  return JSON.parse(await readFile(path.join(process.cwd(), "data", "raw", "get_my_accounts.json"), "utf8")) as unknown;
}

function unwrap(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const raw = "raw" in value ? (value as RecordValue).raw : value;
  if (typeof raw !== "object" || raw === null) return raw;
  const result = (raw as RecordValue).result;
  if (typeof result !== "object" || result === null) return raw;
  const content = (result as RecordValue).content;
  if (!Array.isArray(content) || typeof content[0]?.text !== "string") return raw;
  try { return JSON.parse(content[0].text as string) as unknown; } catch { return raw; }
}

function findRecord(root: unknown, sourceId: string): RecordValue | null {
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findRecord(item, sourceId);
      if (found) return found;
    }
    return null;
  }
  if (typeof root !== "object" || root === null) return null;
  const record = root as RecordValue;
  if (record.id === sourceId || record.source_id === sourceId) return record;
  for (const value of Object.values(record)) {
    const found = findRecord(value, sourceId);
    if (found) return found;
  }
  return null;
}

function dateFrom(record: RecordValue): string | null {
  for (const key of ["date", "created_at", "updated_at", "timestamp", "exported_at", "learned_at_minute"]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") return key === "learned_at_minute" ? `Minute ${value}` : String(value);
  }
  return null;
}

export async function getEvidenceRecord(sourceId: string): Promise<{
  sourceId: string;
  account: string | null;
  factStatus: "verified" | "told" | "claim" | "unknown";
  date: string | null;
  rawText: string;
} | null> {
  const signalKey = `signals/events/${createHash("sha256").update(sourceId).digest("hex")}`;
  const signal = await get<StoredSignalEvent>(signalKey);
  if (signal) {
    return {
      sourceId,
      account: signal.accountId,
      factStatus: "unknown",
      date: signal.date,
      rawText: JSON.stringify(signal.raw, null, 2),
    };
  }
  const accountsRaw = await storedAccounts();
  const accounts = unwrap(accountsRaw);
  const sources: unknown[] = [accounts];
  const root = typeof accounts === "object" && accounts !== null ? accounts as RecordValue : {};
  const accountRows = Array.isArray(root.accounts) ? root.accounts : [];
  for (const entry of accountRows) {
    if (typeof entry !== "object" || entry === null || typeof (entry as RecordValue).id !== "string") continue;
    const accountId = (entry as RecordValue).id as string;
    const paperwork = await get<unknown>(`paperwork:${accountId}`);
    if (paperwork) sources.push(unwrap(paperwork));
  }
  const signals = await get<unknown>("signals:initial");
  if (signals) sources.push(unwrap(signals));

  for (const source of sources) {
    const record = findRecord(source, sourceId);
    if (!record) continue;
    const accountValue = record.account ?? record.account_id;
    const rawStatus = record.status;
    const hasCommercialValue = typeof record.worth_up_to === "number" || typeof record.value === "number";
    const factStatus = rawStatus === "verified" || rawStatus === "told" || rawStatus === "claim"
      ? rawStatus
      : hasCommercialValue ? "claim" : "unknown";
    return {
      sourceId,
      account: typeof accountValue === "string" ? accountValue : null,
      factStatus,
      date: dateFrom(record),
      rawText: JSON.stringify(record, null, 2),
    };
  }
  return null;
}
