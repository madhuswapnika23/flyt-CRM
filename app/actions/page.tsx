import { buildAccountIntel } from "@/lib/intel";
import { readNormalizedData } from "@/lib/intel/data";
import { Muted, PageTitle, SourceChip, StatusBadge } from "@/app/components/dashboard-ui";

export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  let data;
  try { data = await readNormalizedData(); }
  catch (error) { return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">Actions unavailable: {error instanceof Error ? error.message : "Stored data could not be read."}</div>; }
  const rows = data.accounts.flatMap((account) => buildAccountIntel(data, account.sourceId)!.firstThree.map((action) => ({ ...action, accountName: account.name })))
    .sort((a, b) => b.score - a.score || a.account.localeCompare(b.account) || (a.relatedDeal ?? "").localeCompare(b.relatedDeal ?? ""));
  return <>
    <PageTitle eyebrow="Work queue" title="Recommended actions" description="Rule-ranked next steps with owners and dates shown as unknown or proposed when the source data does not establish them." />
    {!rows.length ? <Muted>No actions can be derived from stored deals.</Muted> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Deadline</th><th className="px-4 py-3">Account / deal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Evidence</th></tr></thead><tbody>{rows.map((action, index) => <tr key={`${action.account}-${action.relatedDeal}`} className="border-t border-slate-100 align-top"><td className="px-4 py-4 font-semibold">{index + 1}</td><td className="max-w-sm px-4 py-4"><p className="font-medium">{action.description}</p><p className="mt-1 text-xs text-slate-500">{action.reason}</p></td><td className="px-4 py-4">{action.owner}</td><td className="px-4 py-4"><p>{action.deadline.date ?? "Not established"}</p><p className="text-xs text-slate-500">{action.deadline.label}</p></td><td className="px-4 py-4"><p>{action.accountName}</p><SourceChip id={action.relatedDeal} /></td><td className="px-4 py-4"><StatusBadge status="assumption" /><p className="mt-1 text-xs text-slate-500">Proposed</p></td><td className="max-w-xs px-4 py-4"><div className="flex flex-wrap gap-1">{action.evidenceIds.map((id) => <SourceChip key={id} id={id} />)}</div></td></tr>)}</tbody></table></div></div>}
  </>;
}
