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
      // Recompute remaining from startedAt (fixed) instead of remaining
      // (which the client re-reports with its own clock drift). A new
      // heartbeat from a different account used to make the countdown jump
      // forward or backward depending on which client reported last.
      if (event && event.startedAt && event.duration) {
        const now = Math.floor(Date.now() / 1000);
        const elapsed = Math.max(0, now - event.startedAt);
        event.remaining = Math.max(0, event.duration - elapsed);
        if (event.remaining <= 0) event = null;
      }
    }

    const parsedHistory = (Array.isArray(hist) ? hist : [])
      .map((s: string) => {
        try { return JSON.parse(s); } catch { return null; }
      })
      .filter(Boolean);

    // Dedup by (jobId, event name, startedAt rounded to minute). Multiple
    // accounts in the same server all report the same event — collapse
    // those into a single history row and keep the earliest/first report.
    const seen = new Set<string>();
    const history = parsedHistory.filter((ev: any) => {
      const key = `${ev.jobId || "?"}|${ev.name}|${Math.floor((ev.startedAt || 0) / 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ ok: true, event, history });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
