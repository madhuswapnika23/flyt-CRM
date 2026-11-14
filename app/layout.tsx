import type { ReactNode } from "react";
import "@/app/globals.css";
import { DashboardShell } from "@/app/components/dashboard-ui";
import { readNormalizedData } from "@/lib/intel/data";
import { safeErrorMessage } from "@/lib/security";

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  let lastUpdated: string | null = null;
  let dataError: string | null = null;
  try { lastUpdated = (await readNormalizedData()).lastUpdated; }
  catch (error) { dataError = safeErrorMessage(error, "No stored data is available."); }
  return (
    <html lang="en">
      <body className="antialiased"><DashboardShell lastUpdated={lastUpdated} dataError={dataError}>{children}</DashboardShell></body>
    </html>
  );
}
