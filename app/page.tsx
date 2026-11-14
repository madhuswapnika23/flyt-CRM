import Link from "next/link";
import { buildAccountIntel } from "@/lib/intel";
import { readNormalizedData } from "@/lib/intel/data";
import { PageTitle, Panel, SourceChip, StatusBadge } from "@/app/components/dashboard-ui";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  let data;
  let error: string | null = null;
  try { data = await readNormalizedData(); }
  catch (cause) { error = cause instanceof Error ? cause.message : "Stored account data could not be read."; }
  if (!data) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">Dashboard unavailable: {error ?? "No stored data."}</div>;

  const accounts = data.accounts.map((account) => ({ account, intel: buildAccountIntel(data, account.sourceId)! }));
  const actions = accounts.flatMap(({ intel }) => intel.firstThree).sort((a, b) => b.score - a.score || a.account.localeCompare(b.account) || (a.relatedDeal ?? "").localeCompare(b.relatedDeal ?? "")).slice(0, 3);
  const risks = accounts.flatMap(({ intel }) => intel.risks).filter((risk) => risk.severity === "high" || risk.severity === "medium").slice(0, 5);

  return <>
    <PageTitle eyebrow="Portfolio" title="Executive overview" description="A source-linked view of customer value, deadlines, risks, and the next actions supported by stored records." />
    <div className="grid gap-4 sm:grid-cols-2">
      {accounts.map(({ account, intel }) => <article key={account.sourceId} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-500">Account {account.sourceId}</p><Link href={`/accounts/${encodeURIComponent(account.sourceId)}`} className="mt-1 block text-lg font-semibold hover:text-teal-700">{account.name}</Link></div><Link href={`/accounts/${encodeURIComponent(account.sourceId)}`} className="text-sm text-teal-700">Open account →</Link></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-800">Verified pipeline</p><p className="mt-1 text-xl font-semibold text-emerald-950">{intel.bookValue.verifiedPipeline.deals.length ? intel.bookValue.verifiedPipeline.value : "None verified"}</p><p className="text-[11px] text-emerald-800">Only verified file or record backing</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-900">Unverified pipeline</p><p className="mt-1 text-xl font-semibold text-amber-950">{intel.bookValue.totalUnverified ?? "Not established"}</p><p className="text-[11px] text-amber-900">Claim/told values kept separate</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{intel.bookValue.unverified.map((deal) => <span key={deal.dealId ?? deal.title} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-xs"><span>{deal.title}: {deal.displayValue}</span><SourceChip id={deal.amountEvidenceIds[0] ?? deal.dealId} /></span>)}</div>
      </article>)}
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Panel title="Upcoming renewals and deadlines">
        <div className="space-y-4">{accounts.flatMap(({ account }) => account.deals.filter((deal) => /renew/i.test(deal.title) || deal.deadline).map((deal) => ({ account, deal }))).map(({ account, deal }) => <div key={`${account.sourceId}-${deal.sourceId}`} className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center"><div><Link href={`/accounts/${account.sourceId}`} className="font-medium hover:text-teal-700">{deal.title}</Link><p className="text-xs text-slate-500">{account.name} · {deal.deadline?.date ?? "Date not established"}</p></div><SourceChip id={deal.sourceId} /></div>)}{accounts.every(({ account }) => account.deals.every((deal) => !/renew/i.test(deal.title) && !deal.deadline)) ? <p className="text-sm text-slate-500">No renewal or deadline records found.</p> : null}</div>
      </Panel>
      <Panel title="Top risks">
        <div className="space-y-3">{risks.map((risk, index) => <div key={`${risk.account}-${risk.rules[0]?.name}-${index}`} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0"><div><p className="text-sm font-medium">{risk.trigger}</p><p className="mt-1 text-xs text-slate-500">Account {risk.account} · rule {risk.rules[0]?.name}</p><div className="mt-2 flex flex-wrap gap-1">{risk.evidenceIds.map((id) => <SourceChip key={id} id={id} />)}</div></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${risk.severity === "high" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>{risk.severity}</span></div>)}{!risks.length ? <p className="text-sm text-slate-500">No risk records found.</p> : null}</div>
      </Panel>
    </div>
    <Panel title="Top three actions overall" className="mt-6">
      <div className="grid gap-3 md:grid-cols-3">{actions.map((action) => <article key={`${action.account}-${action.relatedDeal}`} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><StatusBadge status="assumption" /><span className="text-xs text-slate-500">Account {action.account}</span></div><h3 className="mt-3 text-sm font-semibold">{action.description}</h3><p className="mt-2 text-xs text-slate-500">{action.deadline.label} · Owner: {action.owner}</p><div className="mt-3 flex flex-wrap gap-1">{action.evidenceIds.map((id) => <SourceChip key={id} id={id} />)}</div></article>)}{!actions.length ? <p className="text-sm text-slate-500">No actions can be derived from stored deals.</p> : null}</div>
    </Panel>
  </>;
}
