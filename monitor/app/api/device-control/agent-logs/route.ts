import { NextRequest, NextResponse } from "next/server";
import { redis, termuxAgentLogKey } from "@/lib/redis";

// Read the agent's streamed runtime log for one device, for the dashboard
// console. Admin-only (this path is under /api/device-control/, protected by
// the middleware session auth -- no public access-key bypass).
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }
  const limit = Math.min(300, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 200));
  try {
    const raw = await redis.queuePeek(termuxAgentLogKey(deviceId), limit);
    const entries = raw
      .map((r) => {
        try {
          const o = JSON.parse(r);
          return { ts: Number(o.ts) || 0, line: String(o.line || "") };
        } catch {
          return null;
        }
      })
      .filter((x): x is { ts: number; line: string } => x !== null);
    return NextResponse.json({ ok: true, entries });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
