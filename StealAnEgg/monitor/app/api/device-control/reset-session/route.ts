import { NextRequest, NextResponse } from "next/server";
import { resetDeviceSession } from "@/lib/reset-session";

// Called by the agent once per process start (a device/agent restart) to wipe
// this device's stale session state so everything re-arms cleanly: the rejoin
// state machine (attempt counts / gave-up flags), presence (clones re-report
// within ~20s), the launch-time anchors, and the pending command queue.
// Agent-authed via access key (this path is exempted from the session
// middleware).
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
    const result = await resetDeviceSession(deviceId, Array.isArray(body.packages) ? body.packages : []);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
