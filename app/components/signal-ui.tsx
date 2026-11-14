"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { NormalizedEvent } from "@/lib/intel/types";

interface PollResult { events: NormalizedEvent[]; error: string | null; nextPollAt: string | null }

export function SignalPoller() {
  const seen = useRef(new Set<string>());
  const [toast, setToast] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/signals/poll", { cache: "no-store" });
        const body = await response.json() as PollResult;
        if (!active) return;
        if (!response.ok || body.error) setPollError(body.error ?? "Signal cache is unavailable.");
        else setPollError(null);
        const fresh = (body.events ?? []).find((event) => event.isNew && event.eventId && !seen.current.has(event.eventId));
        for (const event of body.events ?? []) if (event.eventId) seen.current.add(event.eventId);
        if (fresh) {
          const match = fresh.matchedBy === "keyword" ? " Matched by keyword; lower confidence." : "";
          setToast(`New signal: ${fresh.title ?? "Untitled signal"}.${match}`);
          window.setTimeout(() => setToast(null), 7000);
        }
      } catch {
        if (active) setPollError("Could not read the signal poll cache.");
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return <>
    {pollError ? <div role="status" className="fixed bottom-4 left-4 z-40 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">Signal feed: {pollError}</div> : null}
    {toast ? <div role="status" className="fixed bottom-4 right-4 z-40 max-w-sm rounded-xl border border-teal-200 bg-slate-950 px-4 py-3 text-sm text-white shadow-xl"><div className="flex items-start justify-between gap-3"><p>{toast}</p><Link href="/evidence" className="shrink-0 font-medium text-teal-200 underline">View</Link></div></div> : null}
  </>;
}

export function SignalTimeline({ events, SourceChip }: {
  events: NormalizedEvent[];
  SourceChip: ComponentType<{ id: string | null | undefined; label?: string }>;
}) {
  const [rows, setRows] = useState(events);
  const [error, setError] = useState<string | null>(null);
  async function acknowledge(eventId: string) {
    setError(null);
    try {
      const response = await fetch("/api/signals/ack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId }) });
      if (!response.ok) throw new Error("Signal could not be acknowledged.");
      setRows((current) => current.map((event) => event.eventId === eventId ? { ...event, isNew: false, acknowledgedAt: new Date().toISOString() } : event));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Signal could not be acknowledged."); }
  }

  if (!rows.length) return <p className="text-sm text-slate-500">No live events are stored yet. The dashboard reads the server-side signal cache.</p>;
  return <div className="space-y-3">{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}{rows.map((event, index) => <article key={event.eventId ?? event.sourceId ?? index} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2">{event.isNew ? <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">NEW</span> : null}<span className={`rounded-full px-2.5 py-1 text-xs font-medium ${event.matchedBy === "keyword" ? "bg-violet-100 text-violet-800" : event.matchedBy === "field" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{event.matchedBy === "keyword" ? "Matched by keyword · lower confidence" : event.matchedBy === "field" ? "Matched by event fields" : "Account match unknown"}</span><span className="text-xs text-slate-500">{event.date ?? "Date not established"}</span></div>{event.isNew && event.eventId ? <button type="button" onClick={() => void acknowledge(event.eventId!)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Acknowledge</button> : null}</div><h3 className="mt-2 font-medium">{event.title ?? "Signal title not established"}</h3><p className="mt-1 text-xs text-slate-500">{event.accountId ? `Account ${event.accountId}` : "Account not matched"}{event.dealId ? ` · Deal ${event.dealId}` : ""}{event.firstSeenAt ? ` · First seen ${event.firstSeenAt}` : ""}</p><div className="mt-3 flex flex-wrap gap-1"><SourceChip id={event.sourceId} /></div><details className="mt-3"><summary className="cursor-pointer text-xs text-slate-500">Raw signal</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(event.raw ?? event.fields, null, 2)}</pre></details></article>)}</div>;
}
