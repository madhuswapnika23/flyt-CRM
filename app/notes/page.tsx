import { readNormalizedData } from "@/lib/intel/data";
import { NotesClient } from "@/app/components/notes-client";
import { PageTitle } from "@/app/components/dashboard-ui";
import { safeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  try {
    const data = await readNormalizedData();
    return <><PageTitle eyebrow="Customer communication" title="Notes" description="Compose a local draft and send it only after reviewing the confirmation dialog." /><NotesClient accounts={data.accounts.map((account) => ({ id: account.sourceId, name: account.name }))} /></>;
  } catch (error) {
    return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">Notes unavailable: {safeErrorMessage(error, "Stored account data could not be read.")}</div>;
  }
}
