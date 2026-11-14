import { readFile } from "node:fs/promises";
import path from "node:path";
import { get } from "@/lib/store";
import { normalizeAccountExport } from "@/lib/normalize";
import type { NormalizedData } from "@/lib/intel/types";
import { getStoredSignalEvents } from "@/lib/signals";

function unwrapExport(stored: unknown): unknown {
  if (typeof stored !== "object" || stored === null) return stored;
  const record = stored as Record<string, unknown>;
  const raw = "raw" in record ? record.raw : stored;
  if (typeof raw !== "object" || raw === null) return raw;
  const result = (raw as Record<string, unknown>).result;
  if (typeof result !== "object" || result === null) return raw;
  const content = (result as Record<string, unknown>).content;
  if (!Array.isArray(content) || typeof content[0]?.text !== "string") return raw;
  return JSON.parse(content[0].text);
}

async function readStoredOrFile(key: string, filename: string): Promise<unknown | null> {
  const stored = await get<unknown>(key);
  if (stored !== null) return stored;
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "raw", filename), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readNormalizedData(): Promise<NormalizedData> {
  let stored = await get<unknown>("accounts");
  if (stored === null) {
    const rawFile = path.join(process.cwd(), "data", "raw", "get_my_accounts.json");
    try {
      stored = JSON.parse(await readFile(rawFile, "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("No stored account response. Run the probe or sync first.");
      throw error;
    }
  }
  const exported = unwrapExport(stored);
  const schema = await readStoredOrFile("raw/schema", "get_data_format.json");
  const exportRecord = typeof exported === "object" && exported !== null ? exported as { accounts?: unknown } : {};
  const accountIds = Array.isArray(exportRecord.accounts)
    ? exportRecord.accounts.flatMap((account) => typeof account === "object" && account !== null && typeof (account as { id?: unknown }).id === "string" ? [(account as { id: string }).id] : [])
    : [];
  const paperworkByAccount: Record<string, unknown> = {};
  for (const accountId of accountIds) {
    paperworkByAccount[accountId] = await get<unknown>(`paperwork:${accountId}`);
  }
  const signals = await get<unknown>("signals:initial");
  const signalPollCache = await get<unknown>("signals/poll-cache");
  const normalized = normalizeAccountExport(exported, {
    schema: schema === null ? null : unwrapExport(schema),
    paperworkByAccount,
    signals,
  });
  const timestamps: string[] = [];
  for (const source of [stored, schema, ...Object.values(paperworkByAccount), signals, signalPollCache]) {
    if (typeof source === "object" && source !== null && typeof (source as { fetchedAt?: unknown }).fetchedAt === "string") {
      timestamps.push((source as { fetchedAt: string }).fetchedAt);
    }
  }
  const exportedAt = typeof exported === "object" && exported !== null && typeof (exported as { exported_at?: unknown }).exported_at === "string"
    ? (exported as { exported_at: string }).exported_at
    : null;
  if (exportedAt) timestamps.push(exportedAt);
  const parsedTimes = timestamps.map((value) => ({ value, time: Date.parse(value) })).filter((item) => !Number.isNaN(item.time));
  normalized.lastUpdated = parsedTimes.length ? parsedTimes.sort((a, b) => b.time - a.time)[0].value : null;
  const eventHistory = await getStoredSignalEvents();
  if (eventHistory.length) {
    normalized.events = eventHistory.map((event) => ({
      sourceId: event.sourceId,
      fields: event.raw,
      eventId: event.eventId,
      title: event.title,
      date: event.date,
      accountId: event.accountId,
      dealId: event.dealId,
      matchedBy: event.matchedBy,
      confidence: event.confidence,
      firstSeenAt: event.firstSeenAt,
      isNew: event.isNew,
      acknowledgedAt: event.acknowledgedAt,
      raw: event.raw,
    }));
    for (const account of normalized.accounts) account.events = normalized.events.filter((event) => event.accountId === account.sourceId);
  }
  return normalized;
}
