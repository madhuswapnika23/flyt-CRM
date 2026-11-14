import { createHash } from "node:crypto";
import { get, list, set } from "@/lib/store";
import type { NormalizedAccount } from "@/lib/intel/types";

export interface StoredSignalEvent {
  eventId: string;
  sourceId: string;
  title: string;
  date: string | null;
  raw: Record<string, unknown>;
  accountId: string | null;
  dealId: string | null;
  matchedBy: "field" | "keyword" | "unmatched";
  confidence: "high" | "low" | "unknown";
  firstSeenAt: string;
  isNew: boolean;
  acknowledgedAt: string | null;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const normalizedKey = (key: string): string => key.toLowerCase().replace(/[^a-z]/g, "");

function unwrap(value: unknown): unknown {
  if (!record(value)) return value;
  const raw = "raw" in value ? value.raw : value;
  if (!record(raw)) return raw;
  const result = record(raw.result) ? raw.result : null;
  const content = result && Array.isArray(result.content) ? result.content : [];
  const text = record(content[0]) ? content[0].text : undefined;
  if (typeof text !== "string") return raw;
  try { return JSON.parse(text) as unknown; } catch { return raw; }
}

function looksLikeEvent(value: unknown): value is Record<string, unknown> {
  return record(value) && Object.keys(value).some((key) => ["id", "signalid", "eventid", "date", "eventdate", "occurredat", "title", "eventtitle", "text", "message", "summary", "description", "body"].includes(normalizedKey(key)));
}

export function extractSignalRecords(payload: unknown): Array<Record<string, unknown>> {
  const root = unwrap(payload);
  const found: Array<Record<string, unknown>> = [];
  const seen = new Set<Record<string, unknown>>();
  if (looksLikeEvent(root) && record(root) && ("signal_id" in root || "event_id" in root || ("id" in root && Object.keys(root).some((key) => /title|text|message|summary/i.test(key))))) {
    return [root];
  }
  const visit = (value: unknown, parentKey = ""): void => {
    if (Array.isArray(value)) {
      const eventArray = value.length > 0 && value.every(looksLikeEvent) && (/(signal|event|item|result|data)/i.test(parentKey) || value.some((item) => record(item) && ("signal_id" in item || "title" in item || "text" in item)));
      if (eventArray) {
        for (const item of value) if (record(item) && !seen.has(item)) { seen.add(item); found.push(item); }
      } else {
        for (const item of value) visit(item, parentKey);
      }
      return;
    }
    if (!record(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (/(signal|event)/i.test(key) && looksLikeEvent(child) && record(child)) {
        if (!seen.has(child)) { seen.add(child); found.push(child); }
      } else visit(child, key);
    }
  };
  if (Array.isArray(root)) visit(root, "signals");
  else visit(root);
  return found;
}

function firstText(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) if (typeof source[key] === "string" && source[key].trim()) return (source[key] as string).trim();
  return null;
}

function eventDate(source: Record<string, unknown>): string | null {
  const text = firstText(source, ["date", "event_date", "eventDate", "created_at", "timestamp", "occurred_at", "deadline", "due_date", "starts_at"]);
  if (text) return text;
  const numeric = [source.date, source.timestamp, source.created_at].find((value) => typeof value === "number");
  if (typeof numeric === "number" && Number.isFinite(numeric)) return new Date(numeric).toISOString();
  const context = [source.title, source.text, source.message, source.summary, source.description].filter((value): value is string => typeof value === "string").join(" ");
  const match = context.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:,?\s+(\d{4}))?\b/i)
    ?? context.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
  if (!match) return null;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(match[1])) return `${match[2]} ${match[1]}${match[3] ? ` ${match[3]}` : ""}`;
  return `${match[1]} ${match[2]}${match[3] ? ` ${match[3]}` : ""}`;
}

function eventIdentifier(source: Record<string, unknown>): string | null {
  for (const key of ["signal_id", "signalId", "id", "event_id", "eventId"]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function fieldHint(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (record(value)) {
      for (const nestedKey of ["id", "account_id", "name", "title"]) {
        const nested = value[nestedKey];
        if (typeof nested === "string" && nested.trim()) return nested.trim();
      }
    }
  }
  return null;
}

function accountFromField(hint: string | null, accounts: NormalizedAccount[]): NormalizedAccount | null {
  if (!hint) return null;
  const lower = hint.toLowerCase();
  return accounts.find((account) => account.sourceId.toLowerCase() === lower || account.name.toLowerCase() === lower) ?? null;
}

function keywords(text: string): string[] {
  const stop = new Set(["the", "and", "for", "with", "from", "into", "this", "that", "will", "have", "has", "are", "was", "were", "not", "but", "over", "under", "about", "account", "customer", "deal", "event"]);
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].filter((word) => !stop.has(word));
}

function matchEvent(source: Record<string, unknown>, accounts: NormalizedAccount[]): Pick<StoredSignalEvent, "accountId" | "dealId" | "matchedBy" | "confidence"> {
  const accountHint = fieldHint(source, ["account_id", "accountId", "account", "account_name", "customer", "customer_name"]);
  let account = accountFromField(accountHint, accounts);
  let matchedBy: StoredSignalEvent["matchedBy"] = account ? "field" : "unmatched";
  let dealId: string | null = null;
  const dealHint = fieldHint(source, ["deal_id", "dealId", "opportunity_id", "opportunityId", "deal", "opportunity"]);

  if (account && dealHint) {
    const deal = account.deals.find((item) => item.sourceId === dealHint || item.title.toLowerCase() === dealHint.toLowerCase());
    if (deal) dealId = deal.sourceId;
  }

  const text = Object.values(source).filter((value) => typeof value === "string").join(" ").toLowerCase();
  if (!account) {
    const accountMatches = accounts.filter((candidate) => {
      const accountWords = keywords(candidate.name);
      const personNames = candidate.people.map((person) => person.name.toLowerCase());
      return personNames.some((name) => name.length > 3 && text.includes(name)) || accountWords.some((word) => text.includes(word));
    });
    if (accountMatches.length === 1) {
      account = accountMatches[0];
      matchedBy = "keyword";
    }
  }

  if (account && !dealId) {
    const eventWords = new Set(keywords(text));
    const ranked = account.deals.map((deal) => ({ deal, score: keywords(deal.title).filter((word) => eventWords.has(word)).length }))
      .filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
    if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score) && (ranked[0].score >= 2 || keywords(ranked[0].deal.title).some((word) => word.length >= 8 && eventWords.has(word)))) {
      dealId = ranked[0].deal.sourceId;
      matchedBy = "keyword";
    }
  }

  return { accountId: account?.sourceId ?? null, dealId, matchedBy, confidence: matchedBy === "field" ? "high" : matchedBy === "keyword" ? "low" : "unknown" };
}

function normalizeSignal(source: Record<string, unknown>, accounts: NormalizedAccount[]): StoredSignalEvent {
  const date = eventDate(source);
  const title = firstText(source, ["title", "event_title", "eventTitle", "name", "headline", "summary", "text", "message", "description", "body"]) ?? "Signal title not established";
  const accountHint = fieldHint(source, ["account_id", "accountId", "account", "account_name", "customer", "customer_name"]);
  const rawId = eventIdentifier(source);
  const eventId = rawId ?? createHash("sha256").update(`${date ?? ""}|${title}|${accountHint ?? ""}`).digest("hex");
  return {
    eventId,
    sourceId: eventId,
    title,
    date,
    raw: source,
    ...matchEvent(source, accounts),
    firstSeenAt: "",
    isNew: true,
    acknowledgedAt: null,
  };
}

export function dedupeSignalBatch(events: Array<Record<string, unknown>>, accounts: NormalizedAccount[]): StoredSignalEvent[] {
  const uniqueEvents = new Map<string, StoredSignalEvent>();
  for (const event of events) {
    const normalized = normalizeSignal(event, accounts);
    if (!uniqueEvents.has(normalized.eventId)) uniqueEvents.set(normalized.eventId, normalized);
  }
  return [...uniqueEvents.values()];
}

export async function ingestSignalPayload(payload: unknown, accounts: NormalizedAccount[], now = new Date().toISOString()): Promise<{ events: StoredSignalEvent[]; added: number }> {
  const candidates = dedupeSignalBatch(extractSignalRecords(payload), accounts);
  let added = 0;
  for (const event of candidates) {
    const key = `signals/events/${createHash("sha256").update(event.eventId).digest("hex")}`;
    const previous = await get<StoredSignalEvent>(key);
    if (previous) continue;
    const stored = { ...event, firstSeenAt: now, isNew: true };
    await set(key, stored);
    added += 1;
  }
  const all = await list<StoredSignalEvent>("signals/events/");
  return { events: all.map((entry) => entry.value).sort((a, b) => (b.date ?? b.firstSeenAt).localeCompare(a.date ?? a.firstSeenAt)), added };
}

export async function getStoredSignalEvents(): Promise<StoredSignalEvent[]> {
  const events = await list<StoredSignalEvent>("signals/events/");
  return events.map((entry) => entry.value).sort((a, b) => (b.date ?? b.firstSeenAt).localeCompare(a.date ?? a.firstSeenAt));
}

export async function acknowledgeSignal(eventId: string): Promise<boolean> {
  const key = `signals/events/${createHash("sha256").update(eventId).digest("hex")}`;
  const event = await get<StoredSignalEvent>(key);
  if (!event) return false;
  await set(key, { ...event, isNew: false, acknowledgedAt: new Date().toISOString() });
  return true;
}
