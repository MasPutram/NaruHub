import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, accountKey } from "@/lib/redis";

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
    // restart, not from hours ago. Session = now - firstSeen, so we stamp
    // firstSeen = now on each of this device's accounts. Presence (jobId) is
    // already wiped by the prefix delete above, so clones re-report fresh.
    let sessionsReset = 0;
    try {
      const devRaw = await redis.get<string>(termuxDeviceKey(deviceId));
      if (devRaw) {
        const device = typeof devRaw === "string" ? JSON.parse(devRaw) : devRaw;
        const packages: any[] = Array.isArray(device.packages) ? device.packages : [];
        const now = Date.now() / 1000;
        for (const p of packages) {
          const account = p && typeof p === "object" ? p.username : null;
          if (!account) continue;
          const accRaw = await redis.get<string>(accountKey(account));
          if (!accRaw) continue;
          try {
            const acc = typeof accRaw === "string" ? JSON.parse(accRaw) : accRaw;
            acc.firstSeen = now;
            await redis.set(accountKey(account), JSON.stringify(acc));
            sessionsReset++;
          } catch {}
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, deleted, sessionsReset });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
