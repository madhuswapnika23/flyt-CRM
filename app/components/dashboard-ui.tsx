"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { SignalPoller } from "@/app/components/signal-ui";

interface EvidenceRecord {
  sourceId: string;
  account: string | null;
  factStatus: "verified" | "told" | "claim" | "unknown";
  date: string | null;
  rawText: string;
}

interface EvidenceContextValue {
  openEvidence: (id: string) => void;
}

const EvidenceContext = createContext<EvidenceContextValue>({ openEvidence: () => undefined });

export function DashboardShell({ children, lastUpdated, dataError }: { children: ReactNode; lastUpdated: string | null; dataError?: string | null }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [record, setRecord] = useState<EvidenceRecord | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function openEvidence(id: string) {
    setSelectedId(id);
    setRecord(null);
    setDrawerError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/evidence/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Evidence record was not found.");
      setRecord(body as EvidenceRecord);
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : "Evidence record was not found.");
    } finally {
      setLoading(false);
    }
  }

  return <EvidenceContext.Provider value={{ openEvidence }}>
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm text-white">F</span>
            <span>FlytBase <span className="font-normal text-slate-500">Customer Success</span></span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Main navigation">
            {[["Overview", "/"], ["Accounts", "/accounts/A"], ["Actions", "/actions"], ["Evidence", "/evidence"], ["Notes", "/notes"], ["Inspector", "/debug"]].map(([label, href]) =>
              <Link key={href} href={href} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950">{label}</Link>)}
          </nav>
        </div>
      </header>
      {dataError ? <div role="alert" className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"><div className="mx-auto max-w-7xl"><strong>Stored data unavailable.</strong> {dataError}</div></div> : null}
      <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-xs text-slate-500 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:justify-between"><span>FlytBase Questathon CRM · Evidence-linked account intelligence</span><span>Data last synced: {lastUpdated ? new Date(lastUpdated).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "Not established"}</span></div>
      </footer>
      <SignalPoller />
      {selectedId ? <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
        <aside className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" aria-label="Source evidence drawer" role="dialog" aria-modal="true">
          <div className="flex items-start justify-between border-b border-slate-200 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Source record</p><h2 className="mt-1 break-all font-mono text-lg font-semibold">{selectedId}</h2></div><button type="button" onClick={() => setSelectedId(null)} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100" aria-label="Close evidence drawer">Close</button></div>
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? <p className="text-sm text-slate-500">Loading stored evidence…</p> : null}
            {drawerError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{drawerError}</p> : null}
            {record ? <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={record.factStatus} />{record.account ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Account {record.account}</span> : null}<span className="text-xs text-slate-500">{record.date ?? "Date not established"}</span></div><div><h3 className="mb-2 text-sm font-semibold">Raw stored record</h3><pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{record.rawText}</pre></div></div> : null}
          </div>
        </aside>
      </div> : null}
    </div>
  </EvidenceContext.Provider>;
}

export function SourceChip({ id, label }: { id: string | null | undefined; label?: string }) {
  const { openEvidence } = useContext(EvidenceContext);
  if (!id) return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Source id not established</span>;
  return <button type="button" onClick={() => openEvidence(id)} className="inline-flex max-w-full items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600 hover:border-slate-400 hover:bg-slate-50" title={`Open source ${id}`}>{label ?? id}</button>;
}

const badgeClasses: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  told: "bg-sky-100 text-sky-800 ring-sky-200",
  claim: "bg-amber-100 text-amber-900 ring-amber-200",
  assumption: "bg-violet-100 text-violet-800 ring-violet-200",
  unknown: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${badgeClasses[normalized] ?? badgeClasses.unknown}`}>{status}</span>;
}

export function PageTitle({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{eyebrow ?? "Customer success"}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>{description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}</div>;
}

export function Panel({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}><div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div><div className="p-5">{children}</div></section>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}
