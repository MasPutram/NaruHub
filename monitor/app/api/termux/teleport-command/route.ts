import { NextRequest, NextResponse } from "next/server";
import { redis, teleportCommandKey, TELEPORT_COMMAND_TTL_S } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

// GET: heartbeat script polls this to check for a pending teleport command.
// Returns the command and deletes it atomically (consume-on-read).
export async function GET(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }
  const account = req.nextUrl.searchParams.get("account") || "";
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  if (!account || !deviceId) {
    return NextResponse.json({ ok: true, teleport: null });
  }
  const key = teleportCommandKey(deviceId, account, tenant);
  const raw = await redis.get<string>(key);
  if (!raw) {
    return NextResponse.json({ ok: true, teleport: null });
  }
  await redis.del(key);
  const cmd = typeof raw === "string" ? JSON.parse(raw) : raw;
  return NextResponse.json({ ok: true, teleport: cmd });
}

// POST: set a teleport command for a specific account on a device.
// Body: { deviceId, account, placeId, jobId }
export async function POST(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await req.json();
    const account = (data.account || "").toString().trim();
    const deviceId = (data.deviceId || "").toString().trim();
    const placeId = (data.placeId || "").toString().trim();
    const jobId = (data.jobId || "").toString().trim();
    if (!account || !deviceId || !placeId || !jobId) {
      return NextResponse.json({ ok: false, error: "account, deviceId, placeId, jobId required" }, { status: 400 });
    }
    const key = teleportCommandKey(deviceId, account, tenant);
    await redis.set(key, JSON.stringify({ placeId, jobId, ts: Date.now() }), { ex: TELEPORT_COMMAND_TTL_S });
    return NextResponse.json({ ok: true, account, deviceId, placeId, jobId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
