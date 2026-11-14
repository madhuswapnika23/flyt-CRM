import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";
import { readNormalizedData } from "@/lib/intel/data";
import { claimSignalPoll, get, getLastSignalPollAt, set } from "@/lib/store";
import { getStoredSignalEvents, ingestSignalPayload } from "@/lib/signals";
import { safeErrorMessage } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 120_000;
interface PollCache { fetchedAt: string | null; error: string | null }

async function response(cached: boolean, nextPollAt: number | null, error: string | null = null): Promise<NextResponse> {
  const events = await getStoredSignalEvents();
  return NextResponse.json({ ok: !error, cached, events, nextPollAt: nextPollAt === null ? null : new Date(nextPollAt).toISOString(), error });
}

export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    const lastPollAt = await getLastSignalPollAt();
    const cache = await get<PollCache>("signals/poll-cache");
    const nextAt = lastPollAt === null ? null : lastPollAt + POLL_INTERVAL_MS;
    if (lastPollAt !== null && now < nextAt!) return response(true, nextAt, cache?.error ?? null);

    const deniedAt = await claimSignalPoll(now, POLL_INTERVAL_MS);
    if (deniedAt !== null) return response(true, deniedAt + POLL_INTERVAL_MS, cache?.error ?? null);

    try {
      const data = await readNormalizedData();
      const result = await callTool("get_signals", {});
      const ingested = await ingestSignalPayload(result.result, data.accounts);
      await set<PollCache>("signals/poll-cache", { fetchedAt: new Date().toISOString(), error: null });
      return NextResponse.json({ ok: true, cached: false, events: ingested.events, added: ingested.added, nextPollAt: new Date(now + POLL_INTERVAL_MS).toISOString(), error: null });
    } catch (error) {
      const message = safeErrorMessage(error, "Signal polling failed.");
      await set<PollCache>("signals/poll-cache", { fetchedAt: cache?.fetchedAt ?? null, error: message });
      return response(true, now + POLL_INTERVAL_MS, message);
    }
  } catch (error) {
    const message = safeErrorMessage(error, "Signal cache is unavailable.");
    return NextResponse.json({ ok: false, cached: true, events: [], nextPollAt: null, error: message }, { status: 503 });
  }
}
