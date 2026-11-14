import { readNormalizedData } from "@/lib/intel/data";
import { Muted, PageTitle, Panel, SourceChip, StatusBadge } from "@/app/components/dashboard-ui";
import { SignalTimeline } from "@/app/components/signal-ui";
import { safeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  let data;
  try { data = await readNormalizedData(); }
  catch (error) { return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">Evidence unavailable: {safeErrorMessage(error, "Stored data could not be read.")}</div>; }
  const accounts = data.accounts;
  const facts = accounts.flatMap((account) => account.facts.map((fact) => ({ ...fact, account: account.name })));
  const finances = accounts.flatMap((account) => [
    ...account.deals.filter((deal) => deal.value !== null).map((deal) => ({ id: deal.sourceId, title: deal.title, value: deal.value, status: deal.valueStatus, account: account.name, evidenceIds: deal.amountEvidenceIds })),
    ...account.offers.filter((offer) => offer.value !== null).map((offer) => ({ id: offer.sourceId, title: offer.title, value: offer.value, status: "claim", account: account.name, evidenceIds: offer.evidenceIds })),
  ]);
  const paperwork = accounts.flatMap((account) => Object.entries(account.paperwork).flatMap(([kind, records]) => records.map((record) => ({ kind, record, account: account.name }))));
  return <>
    <PageTitle eyebrow="Source library" title="Evidence" description="Statements, commercial claims, paperwork, and signal events as held in the local or Redis store. Open a source id to inspect its raw stored record." />
    <Panel title="Customer statements"><div className="space-y-3">{facts.map((fact) => <article key={`${fact.account}-${fact.sourceId ?? fact.text}`} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={fact.status} /><span className="text-xs text-slate-500">{fact.account} · {fact.saidBy ?? "Speaker not established"} · {fact.date ?? "Date not established"}</span><SourceChip id={fact.sourceId} /></div><p className="mt-2 text-sm">{fact.text}</p></article>)}{!facts.length ? <Muted>No customer statements are stored.</Muted> : null}</div></Panel>
    <Panel title="Financial evidence" className="mt-6"><div className="grid gap-3 md:grid-cols-2">{finances.map((entry, index) => <article key={`${entry.account}-${entry.id}-${index}`} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{entry.title}</p><p className="mt-1 text-xs text-slate-500">{entry.account} · currency not established</p></div><StatusBadge status={entry.status} /></div><p className="mt-3 text-xl font-semibold">{entry.value}</p><div className="mt-2 flex flex-wrap gap-1"><SourceChip id={entry.id} />{entry.evidenceIds.map((id) => <SourceChip key={id} id={id} />)}</div></article>)}{!finances.length ? <Muted>No financial amounts are stored.</Muted> : null}</div></Panel>
    <Panel title="Paperwork records" className="mt-6"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{paperwork.map(({ kind, record, account }, index) => <article key={`${account}-${kind}-${record.sourceId ?? index}`} className="rounded-xl bg-slate-50 p-3"><p className="text-xs uppercase tracking-wider text-slate-500">{kind} · {account}</p><SourceChip id={record.sourceId} /><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(record.fields, null, 2)}</pre></article>)}{!paperwork.length ? <Muted>No paperwork records are stored. Run the guarded sync to ingest paperwork.</Muted> : null}</div></Panel>
    <Panel title="File records" className="mt-6"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{accounts.flatMap((account) => account.files.map((file) => ({ ...file, account: account.name }))).map((file) => <div key={file.sourceId ?? file.path} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><div><p className="text-sm font-medium">{file.title}</p><p className="text-xs text-slate-500">{file.path}</p></div><SourceChip id={file.sourceId} /></div>)}</div></Panel>
    <Panel title="Live event history" className="mt-6"><SignalTimeline events={data.events} SourceChip={SourceChip} /></Panel>
  </>;
}
