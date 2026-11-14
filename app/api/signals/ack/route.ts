import { NextResponse } from "next/server";
import { acknowledgeSignal } from "@/lib/signals";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as { eventId?: unknown };
    if (typeof body.eventId !== "string" || !body.eventId) return NextResponse.json({ error: "eventId is required." }, { status: 400 });
    const acknowledged = await acknowledgeSignal(body.eventId);
    return acknowledged ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Signal event not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Signal acknowledgement failed." }, { status: 500 });
  }
}
