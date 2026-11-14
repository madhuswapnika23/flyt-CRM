import { NextResponse } from "next/server";
import { getLastCallAt } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const lastCallAt = await getLastCallAt();
    return NextResponse.json({ ok: true, hasToken: Boolean(process.env.AQ_TOKEN), lastCallAt });
  } catch {
    return NextResponse.json({ ok: false, hasToken: Boolean(process.env.AQ_TOKEN), lastCallAt: null }, { status: 500 });
  }
}
