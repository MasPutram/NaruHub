import { NextRequest, NextResponse } from "next/server";
import { redis, presenceKey, PRESENCE_TTL_S, PRESENCE_FRESH_S } from "@/lib/redis";

// Global duplicate-clone coordinator. The in-game script calls this after each
// join: it (1) freshens this clone's presence with its current server + arrival
// time, then (2) checks -- across ALL devices -- whether another of the
// operator's clones is in the same Roblox server. If so, exactly ONE clone
// stays (the one that arrived first) and the rest are told to LEAVE the game
// (Kick to Roblox home), so two clones never both act and thrash.
//
// Historical name: this endpoint used to tell losers to server-hop. That was
// dropped because repeated hops burn Arkose trust score and escalate captcha.
// Now the response says `action: "leave"` and the script Kicks the clone to
// home; the operator can decide whether to relaunch. `hop: true` is kept as a
// backward-compatible alias -- older cached scripts read that field and Kick
// (they no longer try to hop servers themselves).
//
// Device cooldown (40s): at most one clone per device is told to leave at a
// time, so a burst of duplicates doesn't clear an entire device at once.
//
// Public path (under /api/termux), gated by the shared access key the script
// carries. POST { deviceId, account, jobId, placeId } -> { ok, action, hop, count }.
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
    if (!jobId) return NextResponse.json({ ok: true, hop: false, action: "stay" });

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

    if (byAccount.size <= 1) return NextResponse.json({ ok: true, hop: false, action: "stay", count: byAccount.size });

    // Stayer = earliest arrival; deterministic tiebreak by account name so
    // exactly one stays and everyone else leaves (no double-leave even under
    // simultaneous asks).
    const list = Array.from(byAccount.entries()).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const shouldLeave = account !== list[0][0];

    if (shouldLeave) {
      // Device leave cooldown: if another clone on this device was just told
      // to leave, hold off so leaves are serialized (one at a time per device,
      // ~40s apart). Key name stays `hop-cooldown` for backward compat with
      // any deployed instance still reading it -- semantics are now "leave".
      const cooldownKey = `hop-cooldown:${deviceId}`;
      const cooldownActive = await redis.get(cooldownKey);
      if (cooldownActive) {
        return NextResponse.json({ ok: true, hop: false, action: "stay", count: byAccount.size, queued: true });
      }
      await redis.set(cooldownKey, "1", { ex: 40 });
    }

    return NextResponse.json({
      ok: true,
      hop: shouldLeave, // backward compat: old scripts read this
      action: shouldLeave ? "leave" : "stay",
      count: byAccount.size,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, hop: false }, { status: 500 });
  }
}
