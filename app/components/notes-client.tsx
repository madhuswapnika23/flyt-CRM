"use client";

import { useEffect, useState, type FormEvent } from "react";
import { StatusBadge } from "@/app/components/dashboard-ui";

interface NoteItem { id: string; account: string; kind: string | null; title: string | null; text: string; createdAt: string; sentAt?: string; status: "draft" | "sent" }
interface NotesState { allowedKinds: string[]; observedKinds: string[]; drafts: NoteItem[]; sent: NoteItem[]; schemaAvailable: boolean; notesListAvailable: boolean }

export function NotesClient({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const [state, setState] = useState<NotesState | null>(null);
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [kind, setKind] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/notes", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load notes.");
      setState(body as NotesState);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load notes."); }
  }
  useEffect(() => { void refresh(); }, []);

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", account, kind: kind || null, title: title || null, text }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Draft could not be saved.");
      setText(""); setTitle(""); setMessage("Draft saved locally. It has not been sent."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Draft could not be saved."); }
    finally { setBusy(false); }
  }

  async function sendDraft(note: NoteItem) {
    const kindLabel = note.kind ?? "kind not established";
    const titleLabel = note.title ? `\nTitle: ${note.title}` : "";
    const confirmed = window.confirm(`Send this note to FlytBase?\n\nAccount: ${note.account}\nKind: ${kindLabel}${titleLabel}\n\n${note.text}\n\nThis writes the note externally.`);
    if (!confirmed) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "send", confirmed: true, draftId: note.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Note could not be sent.");
      setMessage("Note sent and recorded locally."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Note could not be sent."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6">
    {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Create a draft</h2><p className="mt-1 text-sm text-slate-500">Drafts stay local. Sending requires the separate confirmation button below.</p>
      {state && (!state.schemaAvailable || !state.allowedKinds.length) ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Allowed kinds are not established from stored get_data_format data. You can save a draft, but it cannot be sent until sync stores the schema.</p> : null}
      <form onSubmit={createDraft} className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs font-medium text-slate-700">Account<select required value={account} onChange={(event) => setAccount(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{accounts.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.name}</option>)}</select></label><label className="text-xs font-medium text-slate-700">Kind<select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Not established</option>{state?.allowedKinds.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="text-xs font-medium text-slate-700 md:col-span-2">Title (optional)<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-slate-700 md:col-span-2">Text<textarea required value={text} onChange={(event) => setText(event.target.value)} rows={5} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><div className="md:col-span-2"><button disabled={busy || !account || !text.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">Save draft</button></div></form>
      {state?.observedKinds.length ? <p className="mt-3 text-xs text-slate-500">Kinds observed in stored list_notes: {state.observedKinds.join(", ")}. Only schema-listed kinds are enabled for sending.</p> : null}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Draft notes</h2></div><div className="space-y-3 p-5">{state?.drafts.map((note) => <article key={note.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><StatusBadge status="assumption" /><span className="text-xs text-slate-500">Account {note.account} · {note.kind ?? "Kind not established"}</span></div><h3 className="mt-2 font-medium">{note.title ?? "Untitled draft"}</h3></div><button type="button" disabled={busy || !note.kind || !state.allowedKinds.includes(note.kind)} onClick={() => void sendDraft(note)} className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-40">Send to FlytBase</button></div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{note.text}</p><p className="mt-2 text-[11px] text-slate-400">Draft id: {note.id} · created {note.createdAt}</p></article>)}{!state?.drafts.length ? <p className="text-sm text-slate-500">No drafts saved.</p> : null}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Sent notes</h2></div><div className="space-y-3 p-5">{state?.sent.map((note) => <article key={note.id} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-2"><StatusBadge status="verified" /><span className="text-xs text-slate-500">Account {note.account} · {note.kind ?? "Kind not established"} · sent {note.sentAt}</span></div><h3 className="mt-2 font-medium">{note.title ?? "Untitled note"}</h3><p className="mt-2 whitespace-pre-wrap text-sm">{note.text}</p></article>)}{!state?.sent.length ? <p className="text-sm text-slate-500">No sent notes recorded.</p> : null}</div></section>
  </div>;
}
