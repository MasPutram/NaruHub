import { NextResponse } from "next/server";
import { redis, adEventKey, AD_EVENT_HISTORY_KEY } from "@/lib/redis";

export const dynamic = "force-dynamic";

// Current server event (nil if nothing active) + last ~N history entries.
export async function GET() {
  try {
    const [raw, hist] = await Promise.all([
      redis.get<string>(adEventKey()),
      (redis as any).queuePeek(AD_EVENT_HISTORY_KEY, 20).catch(() => []),
    ]);

    let event: any = null;
    if (raw) {
      try {
        event = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {}
      // Recompute remaining server-side so the UI doesn't have to trust the
      // reporter's stale value when it polls again.
      if (event && event.startedAt && event.duration) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = Math.max(0, now - (event.reportedAt || now));
        event.remaining = Math.max(0, (event.remaining || 0) - elapsed);
        if (event.remaining <= 0) event = null;
      }
    }

    const history = (Array.isArray(hist) ? hist : [])
      .map((s: string) => {
        try { return JSON.parse(s); } catch { return null; }
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, event, history });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
