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
// Device hop cooldown (40s): at most one clone per device hops at a time.
// When a clone is told to hop, a cooldown key is written for that deviceId.
// Any other clone on the same device that needs to hop will get hop:false until
// the cooldown expires, then poll again (15s interval) and hop in turn.
// This serializes hops per device: A hops, B waits ~15-40s, C waits ~30-55s.
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
    // deviceId is only used for the presence key; the clone IDENTITY is the
    // account name (globally unique: BlekokGong<n>). Optional so the in-game
    // script can call this without knowing the agent's hardware id.
    const deviceId = (data.deviceId || req.headers.get("x-device-id") || account).toString().trim();
    const jobId = (data.jobId || "").toString();
    const placeId = data.placeId != null ? String(data.placeId) : "";
    if (!account) {
      return NextResponse.json({ ok: false, error: "account required" }, { status: 400 });
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

    // Dedupe by account (a clone can briefly have two presence keys if the
    // in-game script and the agent report different deviceIds) -- keep the
    // earliest arrival per account.
    const byAccount = new Map<string, number>();
    for (const v of vals) {
      if (!v) continue;
      try {
        const o = typeof v === "string" ? JSON.parse(v) : v;
        if (o.account && o.jobId === jobId && o.ts && now - o.ts < PRESENCE_FRESH_S * 1000) {
          const since = Number(o.jobIdSince) || Number(o.ts) || now;
          const prev = byAccount.get(o.account);
          if (prev === undefined || since < prev) byAccount.set(o.account, since);
        }
      } catch {}
    }

    if (byAccount.size <= 1) return NextResponse.json({ ok: true, hop: false, count: byAccount.size });

    // Stayer = earliest arrival; deterministic tiebreak by account name so
    // exactly one stays and everyone else hops (no double-hop even under
    // simultaneous asks).
    const list = Array.from(byAccount.entries()).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const shouldHop = account !== list[0][0];

    if (shouldHop) {
      // Device hop cooldown: if another clone on this device hopped recently,
      // hold off so hops are serialized (one at a time per device, ~40s apart).
      const cooldownKey = `hop-cooldown:${deviceId}`;
      const cooldownActive = await redis.get(cooldownKey);
      if (cooldownActive) {
        return NextResponse.json({ ok: true, hop: false, count: byAccount.size, queued: true });
      }
      await redis.set(cooldownKey, "1", { ex: 40 });
    }

    return NextResponse.json({ ok: true, hop: shouldHop, count: byAccount.size });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, hop: false }, { status: 500 });
  }
}
