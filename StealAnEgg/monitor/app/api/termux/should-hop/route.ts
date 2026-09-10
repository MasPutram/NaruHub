import { NextRequest, NextResponse } from "next/server";
import { redis, presenceKey, PRESENCE_TTL_S, PRESENCE_FRESH_S } from "@/lib/redis";

// Global hop coordinator. The in-game script calls this after each join/hop:
// it (1) freshens this clone's presence with its current server + arrival time,
// then (2) checks -- across ALL devices -- whether another of the operator's
// clones is in the same Roblox server. If so, exactly ONE clone stays (the one
// that arrived first) and the rest are told to hop, so two clones never both
// hop and thrash. All presence is the operator's own clones (same BlekokGong
// prefix), so "2+ on this jobId" == a collision.
//
// Public path (under /api/termux), gated by the shared access key the script
// carries. POST { deviceId, account, jobId, placeId } -> { ok, hop, count }.
export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const accessKey = process.env.ACCESS_KEY;
  const headerKey = req.headers.get("x-access-key");
  if (accessKey && headerKey !== accessKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await req.json();
    const account = (data.account || data.sourceAccount || "").toString().trim();
    const deviceId = (data.deviceId || req.headers.get("x-device-id") || "").toString().trim();
    const jobId = (data.jobId || "").toString();
    const placeId = data.placeId != null ? String(data.placeId) : "";
    if (!account || !deviceId) {
      return NextResponse.json({ ok: false, error: "account and deviceId required" }, { status: 400 });
    }
    // Not in a server yet -> nothing to coordinate.
    if (!jobId) return NextResponse.json({ ok: true, hop: false });

    const now = Date.now();

    // (1) Freshen this clone's presence. Reset jobIdSince only when the server
    // actually changed, so "arrival time" reflects when it entered THIS server.
    const key = presenceKey(deviceId, account);
    let jobIdSince = now;
    try {
      const prevRaw = await redis.get<string>(key);
      if (prevRaw) {
        const prev = typeof prevRaw === "string" ? JSON.parse(prevRaw) : prevRaw;
        if (prev.jobId === jobId && prev.jobIdSince) jobIdSince = Number(prev.jobIdSince) || now;
      }
    } catch {}
    await redis.set(
      key,
      JSON.stringify({ account, deviceId, jobId, placeId, ts: now, jobIdSince }),
      { ex: PRESENCE_TTL_S }
    );

    // (2) Who else (globally) is fresh on this same jobId?
    const presKeys: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "presence:*", count: 300 });
      cursor = next;
      presKeys.push(...keys);
    } while (cursor !== "0");
    const vals = presKeys.length > 0 ? await redis.mget(...presKeys) : [];

    const onServer: { id: string; since: number }[] = [];
    for (const v of vals) {
      if (!v) continue;
      try {
        const o = typeof v === "string" ? JSON.parse(v) : v;
        if (o.jobId === jobId && o.ts && now - o.ts < PRESENCE_FRESH_S * 1000) {
          onServer.push({
            id: `${o.deviceId}:${o.account}`,
            since: Number(o.jobIdSince) || Number(o.ts) || now,
          });
        }
      } catch {}
    }

    if (onServer.length <= 1) return NextResponse.json({ ok: true, hop: false, count: onServer.length });

    // Stayer = earliest arrival; deterministic tiebreak by id so exactly one
    // stays and everyone else hops (no double-hop even under simultaneous asks).
    onServer.sort((a, b) => a.since - b.since || a.id.localeCompare(b.id));
    const me = `${deviceId}:${account}`;
    return NextResponse.json({ ok: true, hop: me !== onServer[0].id, count: onServer.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, hop: false }, { status: 500 });
  }
}
