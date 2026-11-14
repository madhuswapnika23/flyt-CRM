import type { Deal, EvidenceFact, EvidenceStatus, NormalizedAccount, NormalizedData, NormalizedEvent, NormalizedRecord, Person } from "@/lib/intel/types";

type UnknownRecord = Record<string, unknown>;

export interface NormalizeOptions {
  asOf?: string;
  schema?: unknown | null;
  paperworkByAccount?: Record<string, unknown>;
  signals?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sourceStatus(value: unknown): EvidenceStatus {
  return value === "verified" || value === "told" || value === "claim" ? value : "unknown";
}

function unwrapStoredResponse(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const raw = "raw" in value ? value.raw : value;
  if (!isRecord(raw)) return raw;
  const result = isRecord(raw.result) ? raw.result : null;
  const content = result && Array.isArray(result.content) ? result.content : [];
  const text = isRecord(content[0]) ? content[0].text : undefined;
  if (typeof text !== "string") return raw;
  try { return JSON.parse(text) as unknown; } catch { return raw; }
}

function normalizeRecords(value: unknown, keys: string[]): NormalizedRecord[] {
  const wanted = new Set(keys);
  const records: NormalizedRecord[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { for (const child of item) visit(child); return; }
    if (!isRecord(item)) return;
    for (const [key, child] of Object.entries(item)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
      if ([...wanted].some((name) => normalizedKey.includes(name)) && Array.isArray(child)) {
        for (const record of child) {
          if (!isRecord(record)) continue;
          const sourceId = typeof record.id === "string" ? record.id : typeof record.source_id === "string" ? record.source_id : null;
          records.push({ sourceId, fields: record });
        }
      } else if (typeof child === "object" && child !== null) {
        visit(child);
      }
    }
  };
  visit(unwrapStoredResponse(value));
  const seen = new Set<string>();
  return records.filter((record) => {
    if (record.sourceId === null) return true;
    const key = `${record.sourceId}:${JSON.stringify(record.fields)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Adapts the observed account-quest-v2-export/1 payload without inferring missing data. */
export function normalizeAccountExport(payload: unknown, options: NormalizeOptions = {}): NormalizedData {
  if (!isRecord(payload) || payload.format !== "account-quest-v2-export/1") {
    throw new Error("Unsupported or missing account export format.");
  }

  const fileIndex = list(payload.files);
  const rawAccounts = list(payload.accounts);
  if (rawAccounts.some((source) => typeof source.id !== "string")) {
    throw new Error("Account export contains an account without a source id.");
  }
  const accounts = rawAccounts.map((source): NormalizedAccount => {
    const accountId = source.id as string;
    const people: Person[] = list(source.stakeholders).map((person) => ({
      sourceId: typeof person.id === "string" ? person.id : null,
      name: string(person.name, "Unknown person"),
      role: string(person.role, "Not established"),
      relationship: string(person.relationship) || undefined,
      available: typeof person.available === "boolean" ? person.available : undefined,
    }));
    const facts: EvidenceFact[] = list(source.facts).map((fact) => ({
      sourceId: typeof fact.id === "string" ? fact.id : null,
      text: string(fact.text, "Not established"),
      status: sourceStatus(fact.status),
      saidBy: string(fact.said_by) || undefined,
      date: null,
    }));
    const deals: Deal[] = list(source.opportunities).map((opportunity) => {
      const sourceId = typeof opportunity.id === "string" ? opportunity.id : null;
      const rawDeadline = isRecord(opportunity.deadline) ? opportunity.deadline : null;
      const blocker = isRecord(opportunity.blocker) ? opportunity.blocker : null;
      return {
        sourceId,
        title: string(opportunity.title, "Not established"),
        stage: string(opportunity.stage) || null,
        value: typeof opportunity.worth_up_to === "number" ? opportunity.worth_up_to : null,
        // The export labels the amount but provides no file/record backing it.
        valueStatus: typeof opportunity.worth_up_to === "number" ? "claim" : "unknown",
        amountEvidenceIds: typeof opportunity.worth_up_to === "number" && sourceId ? [sourceId] : [],
        amountEvidence: typeof opportunity.worth_up_to === "number"
          ? sourceId ? [{ sourceId, kind: "claim", status: "claim" }] : []
          : [],
        evidenceIds: Array.isArray(opportunity.evidence) ? opportunity.evidence.filter((id): id is string => typeof id === "string") : sourceId ? [sourceId] : [],
        blocker: blocker ? string(blocker.text) || null : null,
        deadline: rawDeadline ? {
          text: string(rawDeadline.text, "Not established"),
          date: null,
          passed: typeof rawDeadline.passed === "boolean" ? rawDeadline.passed : undefined,
          soon: typeof rawDeadline.soon === "boolean" ? rawDeadline.soon : undefined,
        } : null,
      };
    });
    const offers = list(source.offers).map((offer) => ({
      sourceId: typeof offer.id === "string" ? offer.id : null,
      title: string(offer.title, "Not established"),
      value: typeof offer.value === "number" ? offer.value : null,
      status: string(offer.status, "unknown"),
      evidenceIds: typeof offer.id === "string" ? [offer.id] : [],
    }));
    const files = fileIndex.filter((file) => file.account === accountId).map((file) => ({
      sourceId: typeof file.id === "string" ? file.id : null,
      title: string(file.title, "Not established"),
      path: string(file.path, "Not established"),
    }));
    const deadlines = list(source.deadlines).map((deadline) => ({
      sourceId: typeof deadline.id === "string" ? deadline.id : null,
      text: string(deadline.text, "Not established"),
      date: typeof deadline.date === "string" ? deadline.date : null,
      status: typeof deadline.id === "string" ? "told" as const : "unknown" as const,
    }));
    const paperworkRaw = options.paperworkByAccount?.[accountId];
    const paperwork: NormalizedAccount["paperwork"] = {
      calls: normalizeRecords(paperworkRaw, ["calls", "call"]),
      emails: normalizeRecords(paperworkRaw, ["emails", "email"]),
      contracts: normalizeRecords(paperworkRaw, ["contracts", "contract"]),
      tickets: normalizeRecords(paperworkRaw, ["tickets", "ticket"]),
      flights: normalizeRecords(paperworkRaw, ["flights", "flight", "flightlogs"]),
      devices: normalizeRecords(paperworkRaw, ["devices", "device"]),
      invoices: normalizeRecords(paperworkRaw, ["invoices", "invoice"]),
      usage: normalizeRecords(paperworkRaw, ["usage", "usagerecords", "usagerecord"]),
    };
    const events: NormalizedEvent[] = normalizeRecords(options.signals, ["events", "signals", "signal"]).map((event) => ({
      ...event,
      eventId: event.sourceId ?? undefined,
      title: typeof event.fields.title === "string" ? event.fields.title : typeof event.fields.text === "string" ? event.fields.text : undefined,
      date: typeof event.fields.date === "string" ? event.fields.date : null,
      accountId: typeof event.fields.account_id === "string" ? event.fields.account_id : typeof event.fields.account === "string" ? event.fields.account : null,
      raw: event.fields,
      isNew: false,
    }))
      .filter((event) => event.fields.account === accountId || event.fields.account_id === accountId);

    return {
      sourceId: accountId,
      name: string(source.name, "Unknown account"),
      people,
      facts,
      deals,
      offers,
      files,
      deadlines,
      paperwork,
      events,
      recordTypesPresent: [
        "stakeholders", "facts", "opportunities", "offers", ...(deadlines.length ? ["deadlines"] : []), "files",
        ...Object.entries(paperwork).filter(([, records]) => records.length > 0).map(([type]) => type),
      ],
    };
  });

  const exportDate = typeof payload.exported_at === "string" ? payload.exported_at.slice(0, 10) : undefined;
  return {
    accounts,
    events: normalizeRecords(options.signals, ["events", "signals", "signal"]).map((event) => ({ ...event, eventId: event.sourceId ?? undefined, raw: event.fields, isNew: false })),
    asOf: options.asOf ?? exportDate,
    schema: options.schema ?? null,
    schemaAvailable: options.schema !== undefined && options.schema !== null,
    lastUpdated: null,
  };
}
