import { NextRequest, NextResponse } from "next/server";
import { redis, termuxCommandQueueKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

// Polled by the Termux agent every few seconds. Pops (consumes) whatever
// commands are queued for this device -- each command is only delivered once.
export async function GET(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }

  try {
    const raw = await redis.queuePop(termuxCommandQueueKey(deviceId, tenant), 10);
    const commands = raw
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, commands });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, commands: [] }, { status: 500 });
  }
}
