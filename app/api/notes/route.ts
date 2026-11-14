import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readNormalizedData } from "@/lib/intel/data";
import { callTool } from "@/lib/mcp";
import { extractAllowedNoteKinds, extractObservedNoteKinds, type NoteDraft } from "@/lib/notes";
import { get, list, set } from "@/lib/store";
import { safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function noteOptions() {
  const schema = await get<unknown>("raw/schema");
  const notes = await get<unknown>("raw/notes");
  return {
    allowedKinds: schema === null ? [] : extractAllowedNoteKinds(schema),
    observedKinds: notes === null ? [] : extractObservedNoteKinds(notes),
    schemaAvailable: schema !== null,
    notesListAvailable: notes !== null,
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    const [options, drafts, sent] = await Promise.all([
      noteOptions(),
      list<NoteDraft>("notes/drafts/"),
      list<NoteDraft>("notes/sent/"),
    ]);
    return NextResponse.json({ ...options, drafts: drafts.map((item) => item.value), sent: sent.map((item) => item.value) });
  } catch {
    return NextResponse.json({ error: "Stored note settings could not be read." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "send") {
      if (body.confirmed !== true || typeof body.draftId !== "string") return NextResponse.json({ error: "Explicit confirmation and a saved draft are required to send." }, { status: 400 });
      const draft = await get<NoteDraft>(`notes/drafts/${body.draftId}`);
      if (!draft || draft.status !== "draft") return NextResponse.json({ error: "Draft note was not found or was already sent." }, { status: 404 });
      const options = await noteOptions();
      if (!options.schemaAvailable || !options.allowedKinds.length) return NextResponse.json({ error: "Allowed note kinds are not established from the stored get_data_format response. Run sync before sending." }, { status: 409 });
      if (!draft.kind || !options.allowedKinds.includes(draft.kind)) return NextResponse.json({ error: "This draft kind is not listed as allowed by the stored schema." }, { status: 400 });

      const args: Record<string, unknown> = { account: draft.account, kind: draft.kind };
      if (draft.title) args.title = draft.title;
      args.text = draft.text;
      const response = await callTool("write_note", args);
      const sentAt = new Date().toISOString();
      const sent: NoteDraft = { ...draft, status: "sent", sentAt };
      await set(`notes/sent/${draft.id}`, { ...sent, rawResponse: response.raw });
      await set(`notes/drafts/${draft.id}`, sent);
      return NextResponse.json({ ok: true, note: sent });
    }

    if (body.action !== "draft") return NextResponse.json({ error: "Action must be draft or send." }, { status: 400 });
    if (typeof body.account !== "string" || typeof body.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "Account and note text are required." }, { status: 400 });
    const data = await readNormalizedData();
    if (!data.accounts.some((account) => account.sourceId === body.account)) return NextResponse.json({ error: "Account is not present in stored data." }, { status: 400 });
    if (body.kind !== undefined && body.kind !== null && typeof body.kind !== "string") return NextResponse.json({ error: "Kind must be text." }, { status: 400 });
    if (body.title !== undefined && body.title !== null && typeof body.title !== "string") return NextResponse.json({ error: "Title must be text." }, { status: 400 });
    const options = await noteOptions();
    const kind = typeof body.kind === "string" && body.kind ? body.kind : null;
    if (kind && options.allowedKinds.length && !options.allowedKinds.includes(kind)) return NextResponse.json({ error: "Kind is not listed as allowed by the stored schema." }, { status: 400 });
    const id = randomUUID();
    const draft: NoteDraft = {
      id,
      account: body.account,
      kind,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null,
      text: body.text.trim(),
      createdAt: new Date().toISOString(),
      status: "draft",
    };
    await set(`notes/drafts/${id}`, draft);
    return NextResponse.json({ ok: true, draft }, { status: 201 });
  } catch (error) {
    const message = safeErrorMessage(error, "Could not save the draft note.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
