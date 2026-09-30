import { NextRequest, NextResponse } from "next/server";
import { resetDeviceSession } from "@/lib/reset-session";

// Operator-triggered "reset device" from the device dashboard. Same logic as
// the agent-fired reset-session but authenticated by the session cookie the
// middleware already checked (this path is NOT under any public exempt list),
// so no access-key required.
export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = (body.deviceId || "").toString();
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }
    const result = await resetDeviceSession(deviceId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
