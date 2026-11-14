import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runInitialSync } from "@/lib/sync";
import { McpRateLimitError } from "@/lib/mcp";
import { safeErrorMessage } from "@/lib/security";

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
    if (error instanceof McpRateLimitError) {
      const retryAfter = Math.max(1, Math.ceil((error.lastCallAt + 61_000 - Date.now()) / 1_000));
      return NextResponse.json({ ok: false, retryAfter, error: "MCP rate limit reached; retry after the indicated delay." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }
    const message = safeErrorMessage(error, "Initial sync failed.");
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
