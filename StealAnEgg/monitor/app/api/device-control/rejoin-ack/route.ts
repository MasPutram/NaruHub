import { NextRequest, NextResponse } from "next/server";
import { redis, rejoinStateKey, REJOIN_STATE_TTL_S } from "@/lib/redis";

// The agent calls this right after it actually executes a rejoin action, so
// the brain measures the "waited long enough to escalate" window from the real
// execution time (not from when the server decided). Without it the server
// would fall back to timing from when it issued the action -- still correct,
// just less precise -- so this endpoint is a best-effort refinement.
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
    const pkg = (body.pkg || body.package || "").toString();
    if (!deviceId || !pkg) {
      return NextResponse.json({ ok: false, error: "deviceId and pkg required" }, { status: 400 });
    }
    const key = rejoinStateKey(deviceId, pkg);
    const raw = await redis.get<string>(key);
    if (raw) {
      const st = typeof raw === "string" ? JSON.parse(raw) : raw;
      st.lastAckAt = Date.now();
      await redis.set(key, JSON.stringify(st), { ex: REJOIN_STATE_TTL_S });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
