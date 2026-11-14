import { NextResponse } from "next/server";
import { buildAccountIntel } from "@/lib/intel";
import { readNormalizedData } from "@/lib/intel/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ account: string }> }): Promise<NextResponse> {
  try {
    const { account } = await context.params;
    const data = await readNormalizedData();
    const intel = buildAccountIntel(data, account);
    if (!intel) return NextResponse.json({ error: `Account ${account} was not found in stored data.` }, { status: 404 });
    return NextResponse.json(intel);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not build account intelligence.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
