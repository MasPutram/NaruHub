import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

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
    return NextResponse.json({ ok: true, deleted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
