import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, termuxDeviceMetaKey, accountKey } from "@/lib/redis";

// Called by the agent once per process start (a device/agent restart) to wipe
// this device's stale session state so everything re-arms cleanly: the rejoin
// state machine (attempt counts / gave-up flags), presence (clones re-report
// within ~20s), and the launch-time anchors. Agent-authed via access key
// (this path is exempted from the session middleware).
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
    const body = await req.json();
    const deviceId = (body.deviceId || "").toString();
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }
    const prefixes = [
      `rejoinstate:${deviceId}:`,
      `presence:${deviceId}:`,
      `lastlaunch:${deviceId}:`,
    ];
    let deleted = 0;
    for (const prefix of prefixes) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 200 });
        cursor = next;
        for (const k of keys) {
          await redis.del(k);
          deleted++;
        }
      } while (cursor !== "0");
    }

    // Reset the per-clone SESSION timer (uptime column) so it counts from this
    // restart, not from hours ago. Source the account list from THREE places
    // and take the union -- because the live device key (termux:device:<id>) has
    // a 90s TTL and is USUALLY EXPIRED at agent-restart time (the whole reason
    // the operator is restarting). The persistent meta key + an optional
    // packages payload from the agent fill that gap so we always find accounts
    // to reset instead of silently no-op'ing.
    const usernames = new Set<string>();
    // 1. Live device key (may be gone if agent has been offline).
    try {
      const devRaw = await redis.get<string>(termuxDeviceKey(deviceId));
      if (devRaw) {
        const device = typeof devRaw === "string" ? JSON.parse(devRaw) : devRaw;
        for (const p of Array.isArray(device.packages) ? device.packages : []) {
          if (p && typeof p === "object" && p.username) usernames.add(p.username);
        }
      }
    } catch {}
    // 2. Persistent meta snapshot -- survives the 90s TTL.
    try {
      const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId));
      if (metaRaw) {
        const meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;
        for (const p of Array.isArray(meta.packages) ? meta.packages : []) {
          if (p && typeof p === "object" && p.username) usernames.add(p.username);
        }
      }
    } catch {}
    // 3. Explicit list from the agent (fresh from its own collect_packages()).
    for (const p of Array.isArray(body.packages) ? body.packages : []) {
      if (typeof p === "string") { usernames.add(p); continue; }
      if (p && typeof p === "object" && p.username) usernames.add(p.username);
    }

    let sessionsReset = 0;
    const now = Date.now() / 1000;
    for (const account of Array.from(usernames)) {
      try {
        const accRaw = await redis.get<string>(accountKey(account));
        if (!accRaw) continue;
        const acc = typeof accRaw === "string" ? JSON.parse(accRaw) : accRaw;
        acc.firstSeen = now;
        acc.lastSeen = now;
        await redis.set(accountKey(account), JSON.stringify(acc));
        sessionsReset++;
      } catch {}
    }

    return NextResponse.json({ ok: true, deleted, sessionsReset, accountsConsidered: usernames.size });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
