import { NextResponse } from "next/server";
import { getLastCallAt, isRedisConfigured } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const lastCallAt = await getLastCallAt();
    return NextResponse.json({ ok: process.env.VERCEL !== "1" || isRedisConfigured(), hasToken: Boolean(process.env.AQ_TOKEN), redisConfigured: isRedisConfigured(), lastCallAt }, { status: process.env.VERCEL === "1" && !isRedisConfigured() ? 503 : 200 });
  } catch {
    return NextResponse.json({ ok: false, hasToken: Boolean(process.env.AQ_TOKEN), redisConfigured: isRedisConfigured(), lastCallAt: null }, { status: 503 });
  }
}
