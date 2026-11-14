import { NextResponse } from "next/server";
import { getEvidenceRecord } from "@/lib/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const evidence = await getEvidenceRecord(id);
    if (!evidence) return NextResponse.json({ error: `Source record ${id} is not in the stored data.` }, { status: 404 });
    return NextResponse.json(evidence);
  } catch {
    return NextResponse.json({ error: "Stored evidence could not be read." }, { status: 500 });
  }
}
