import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxAgentLogKey,
  TERMUX_AGENT_LOG_TTL_S,
  TERMUX_AGENT_LOG_MAX,
} from "@/lib/redis";

// Webhook the Termux agent POSTs its runtime log lines to. Public path (it
// lives under /api/termux/, which the middleware bypasses for session auth);
// gated instead by the shared access key the agent already sends. Each line
// is stored as one queue entry so the dashboard console can render them
// newest-last, and the list is capped + TTL'd so a chatty device can't grow
// it forever.
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
    const deviceId: string = (body.deviceId || "").toString();
    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    const lines: string[] = Array.isArray(body.lines)
      ? body.lines.filter((l: any) => typeof l === "string" && l.length > 0).slice(0, 100)
      : [];
    if (lines.length === 0) {
      return NextResponse.json({ ok: true, stored: 0 });
    }

    const key = termuxAgentLogKey(deviceId);
    for (const line of lines) {
      // Hard cap each line so a runaway log can't blow up a single entry.
      const entry = JSON.stringify({ ts: Date.now(), line: line.slice(0, 500) });
      await redis.queuePush(key, entry, {
        ttl: TERMUX_AGENT_LOG_TTL_S,
        maxLen: TERMUX_AGENT_LOG_MAX,
      });
    }

    return NextResponse.json({ ok: true, stored: lines.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
