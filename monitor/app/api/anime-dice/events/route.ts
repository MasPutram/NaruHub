import { NextRequest, NextResponse } from "next/server";
import { redis, adEventKey, adEventKeyPattern, adEventHistoryKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// All currently-active server events (per-jobId) + last N history entries.
// Returns:
//   events: Event[]          — every active server event (may be multiple)
//   event : Event | null     — legacy single-event field (= freshest of events[]
//                              or last-writer-wins) for older clients
//   history: Event[]
export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);

    // Scan every per-jobId active-event key
    const pattern = adEventKeyPattern(tenant || undefined);
    const keys: string[] = [];
    let cursor = "0";
    try {
      do {
        const res = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = String(res[0]);
        keys.push(...(res[1] || []));
      } while (cursor !== "0");
    } catch {}

    const [perJobVals, legacyRaw, hist] = await Promise.all([
      keys.length > 0 ? redis.mget(...keys) : Promise.resolve([] as (string | null)[]),
      redis.get<string>(adEventKey(tenant || undefined)),
      (redis as any).queuePeek(adEventHistoryKey(tenant || undefined), 20).catch(() => []),
    ]);

    const now = Math.floor(Date.now() / 1000);
    const applyRemaining = (ev: any): any | null => {
      if (!ev) return null;
      if (ev.startedAt && ev.duration) {
        const elapsed = Math.max(0, now - ev.startedAt);
        ev.remaining = Math.max(0, ev.duration - elapsed);
        if (ev.remaining <= 0) return null;
      }
      return ev;
    };

    const events: any[] = [];
    const seenJobs = new Set<string>();
    for (const v of perJobVals as (string | null)[]) {
      if (!v) continue;
      try {
        const parsed = typeof v === "string" ? JSON.parse(v) : v;
        const ev = applyRemaining(parsed);
        if (ev && ev.jobId && !seenJobs.has(ev.jobId)) {
          seenJobs.add(ev.jobId);
          events.push(ev);
        }
      } catch {}
    }

    // Legacy fallback: include the singleton key event if its jobId wasn't
    // already covered by the per-job scan (older writes before the per-job
    // key existed).
    if (legacyRaw) {
      try {
        const parsed = typeof legacyRaw === "string" ? JSON.parse(legacyRaw) : legacyRaw;
        const ev = applyRemaining(parsed);
        if (ev && (!ev.jobId || !seenJobs.has(ev.jobId))) events.push(ev);
      } catch {}
    }

    // Sort: freshest reportedAt first (so UI shows the newest-reported event
    // as the "primary" in single-event contexts).
    events.sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0));
    const event = events[0] || null;

    const parsedHistory = (Array.isArray(hist) ? hist : [])
      .map((s: string) => {
        try { return JSON.parse(s); } catch { return null; }
      })
      .filter(Boolean);

    // Dedup history by (jobId, event name, startedAt rounded to minute).
    const seenHist = new Set<string>();
    const history = parsedHistory.filter((ev: any) => {
      const key = `${ev.jobId || "?"}|${ev.name}|${Math.floor((ev.startedAt || 0) / 60)}`;
      if (seenHist.has(key)) return false;
      seenHist.add(key);
      return true;
    });

    return NextResponse.json({ ok: true, events, event, history });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
