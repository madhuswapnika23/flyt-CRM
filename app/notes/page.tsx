import { readNormalizedData } from "@/lib/intel/data";
import { NotesClient } from "@/app/components/notes-client";
import { PageTitle } from "@/app/components/dashboard-ui";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  try {
    const data = await readNormalizedData();
    return <><PageTitle eyebrow="Customer communication" title="Notes" description="Compose a local draft and send it only after reviewing the confirmation dialog." /><NotesClient accounts={data.accounts.map((account) => ({ id: account.sourceId, name: account.name }))} /></>;
  } catch (error) {
    return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">Notes unavailable: {error instanceof Error ? error.message : "Stored account data could not be read."}</div>;
  }
}
