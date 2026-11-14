import { readNormalizedData } from "@/lib/intel/data";
import { safeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  let data;
  let error: string | null = null;
  try { data = await readNormalizedData(); }
  catch (cause) { error = safeErrorMessage(cause, "Stored data could not be read."); }

  const records = data ? {
    accounts: data.accounts,
    people: data.accounts.flatMap((account) => account.people),
    facts: data.accounts.flatMap((account) => account.facts),
    deals: data.accounts.flatMap((account) => account.deals),
    offers: data.accounts.flatMap((account) => account.offers),
    files: data.accounts.flatMap((account) => account.files),
    deadlines: data.accounts.flatMap((account) => account.deadlines),
    paperworkCalls: data.accounts.flatMap((account) => account.paperwork.calls),
    paperworkEmails: data.accounts.flatMap((account) => account.paperwork.emails),
    paperworkContracts: data.accounts.flatMap((account) => account.paperwork.contracts),
    paperworkTickets: data.accounts.flatMap((account) => account.paperwork.tickets),
    paperworkFlights: data.accounts.flatMap((account) => account.paperwork.flights),
    paperworkDevices: data.accounts.flatMap((account) => account.paperwork.devices),
    paperworkInvoices: data.accounts.flatMap((account) => account.paperwork.invoices),
    paperworkUsage: data.accounts.flatMap((account) => account.paperwork.usage),
    events: data.events,
  } : null;

  return (
    <main className="mx-auto max-w-5xl p-8 font-sans">
      <h1 className="text-2xl font-bold">Stored data inspector</h1>
      {error ? <p role="alert" className="mt-4 text-red-700">Data unavailable: {error}</p> : null}
      {records ? <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr><th className="border p-2">Type</th><th className="border p-2">Count</th><th className="border p-2">Sample record</th></tr></thead>
          <tbody>{Object.entries(records).map(([type, values]) => <tr key={type}>
            <td className="border p-2">{type}</td>
            <td className="border p-2">{values.length}</td>
            <td className="max-w-xl border p-2"><pre className="whitespace-pre-wrap">{values.length ? JSON.stringify(values[0], null, 2) : "No stored records"}</pre></td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </main>
  );
}
