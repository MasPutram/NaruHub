import { NextRequest, NextResponse } from "next/server";
import { redis, termuxCommandLogKey } from "@/lib/redis";

// Admin-only (protected by middleware session auth). Returns recent admin
// actions for a device -- the web UI's "command console" panel. Read-only,
// does not consume the log (unlike the device-facing command queue).
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId required", entries: [] }, { status: 400 });
  }

  try {
    const raw = await redis.queuePeek(termuxCommandLogKey(deviceId), 30);
    const entries = raw
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, entries });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, entries: [] }, { status: 500 });
  }
}
