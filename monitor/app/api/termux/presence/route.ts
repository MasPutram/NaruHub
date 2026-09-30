import { NextRequest, NextResponse } from "next/server";
import { redis, presenceKey, PRESENCE_TTL_S } from "@/lib/redis";

// Presence webhook for the in-game heartbeat script (heartbeatnaru.lua). Each
// clone reports which Roblox server (jobId) it's currently in, so a launch or
// hop can avoid stacking our own accounts onto one server. Public path (under
// /api/termux, bypassed by the session middleware); gated by the shared access
// key the agent-deployed script carries. Deliberately SEPARATE from
// /api/monitor so a lightweight presence ping never clobbers the rich account
// stats that the main reporter writes.
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
    // deviceId scopes presence so same-named accounts on different cloud phones
    // don't overwrite each other. Falls back to the X-Device-Id header.
    const deviceId = (data.deviceId || req.headers.get("x-device-id") || "").toString().trim();
    if (!account) {
      return NextResponse.json({ ok: false, error: "account required" }, { status: 400 });
    }
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }
    const jobId = (data.jobId || "").toString();
    const placeId = data.placeId != null ? String(data.placeId) : "";

    // Track when the clone entered THIS server (arrival time) so the hop
    // coordinator can pick "earliest stays". Reset only when jobId changes.
    const key = presenceKey(deviceId, account);
    const nowTs = Date.now();
    let jobIdSince = nowTs;
    try {
      const prevRaw = await redis.get<string>(key);
      if (prevRaw) {
        const prev = typeof prevRaw === "string" ? JSON.parse(prevRaw) : prevRaw;
        if (prev.jobId === jobId && prev.jobIdSince) jobIdSince = Number(prev.jobIdSince) || nowTs;
      }
    } catch {}

    await redis.set(
      key,
      JSON.stringify({ account, deviceId, jobId, placeId, ts: nowTs, jobIdSince }),
      { ex: PRESENCE_TTL_S }
    );

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
