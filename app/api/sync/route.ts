import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runInitialSync } from "@/lib/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const expected = process.env.SYNC_SECRET;
  const supplied = request.headers.get("x-sync-secret");
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runInitialSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Initial sync failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
