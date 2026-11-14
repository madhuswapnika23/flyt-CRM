export type EvidenceStatus = "verified" | "told" | "claim" | "assumption" | "unknown";

export interface EvidenceFact {
  sourceId: string | null;
  text: string;
  status: EvidenceStatus;
  saidBy?: string;
  date?: string | null;
}

export interface Person {
  sourceId: string | null;
  name: string;
  role: string;
  relationship?: string;
  available?: boolean;
}

export interface NormalizedRecord {
  sourceId: string | null;
  fields: Record<string, unknown>;
}

export interface NormalizedEvent extends NormalizedRecord {
  eventId?: string;
  title?: string;
  date?: string | null;
  accountId?: string | null;
  dealId?: string | null;
  matchedBy?: "field" | "keyword" | "unmatched";
  confidence?: "high" | "low" | "unknown";
  firstSeenAt?: string | null;
  isNew?: boolean;
  acknowledgedAt?: string | null;
  raw?: Record<string, unknown>;
}

export interface NormalizedDeadline {
  sourceId: string | null;
  text: string;
  date: string | null;
  status: EvidenceStatus;
}

export interface Deal {
  sourceId: string | null;
  title: string;
  stage: string | null;
  value: number | null;
  valueStatus: EvidenceStatus;
  amountEvidenceIds: string[];
  amountEvidence: Array<{
    sourceId: string;
    kind: "file" | "record" | "stakeholder" | "claim";
    status: EvidenceStatus;
  }>;
  evidenceIds: string[];
  blocker?: string | null;
  deadline?: { text: string; date?: string | null; passed?: boolean; soon?: boolean } | null;
}

export interface NormalizedAccount {
  sourceId: string;
  name: string;
  people: Person[];
  facts: EvidenceFact[];
  deals: Deal[];
  offers: Array<{ sourceId: string | null; title: string; value: number | null; status: string; evidenceIds: string[] }>;
  files: Array<{ sourceId: string | null; title: string; path: string }>;
  deadlines: NormalizedDeadline[];
  paperwork: {
    calls: NormalizedRecord[];
    emails: NormalizedRecord[];
    contracts: NormalizedRecord[];
    tickets: NormalizedRecord[];
    flights: NormalizedRecord[];
    devices: NormalizedRecord[];
    invoices: NormalizedRecord[];
    usage: NormalizedRecord[];
  };
  events: NormalizedEvent[];
  recordTypesPresent: string[];
}

export interface NormalizedData {
  accounts: NormalizedAccount[];
  events: NormalizedEvent[];
  asOf?: string;
  schema: unknown | null;
  schemaAvailable: boolean;
  lastUpdated: string | null;
}

export interface RuleExplanation {
  name: string;
  explanation: string;
}

export interface IntelItem {
  rules: RuleExplanation[];
  evidenceIds: string[];
}
