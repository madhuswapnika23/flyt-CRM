import type { StoredRawNote } from "@/lib/notes-types";

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain => typeof value === "object" && value !== null && !Array.isArray(value);

export function unwrapNotePayload(stored: unknown): unknown {
  if (!isPlain(stored)) return stored;
  const raw = "raw" in stored ? stored.raw : stored;
  if (!isPlain(raw) || !isPlain(raw.result) || !Array.isArray(raw.result.content)) return raw;
  const text = isPlain(raw.result.content[0]) ? raw.result.content[0].text : null;
  if (typeof text !== "string") return raw;
  try { return JSON.parse(text) as unknown; } catch { return raw; }
}

export function extractAllowedNoteKinds(schema: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      if (/(?:kind.*\.enum|allowed.?kinds?)$/i.test(path) && value.every((item) => typeof item === "string")) for (const item of value) found.add(item);
      for (const child of value) visit(child, path);
      return;
    }
    if (!isPlain(value)) return;
    for (const [key, child] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      if (/kind/i.test(key) && isPlain(child) && Array.isArray(child.enum) && child.enum.every((item) => typeof item === "string")) {
        for (const item of child.enum) found.add(item as string);
      }
      if (/^allowed.?kinds?$/i.test(key) && Array.isArray(child) && child.every((item) => typeof item === "string")) {
        for (const item of child) found.add(item as string);
      }
      visit(child, nextPath);
    }
  };
  visit(unwrapNotePayload(schema), "");
  return [...found].sort();
}

export function extractObservedNoteKinds(notes: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const child of value) visit(child); return; }
    if (!isPlain(value)) return;
    if (typeof value.kind === "string") found.add(value.kind);
    for (const child of Object.values(value)) visit(child);
  };
  visit(unwrapNotePayload(notes));
  return [...found].sort();
}

export interface NoteDraft extends StoredRawNote {
  id: string;
  status: "draft" | "sent";
  createdAt: string;
  sentAt?: string;
}
