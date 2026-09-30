import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxAgentLogKey,
  termuxDeviceKey,
} from "@/lib/redis";

// Access-key-gated log tail for diagnostics. Same data as the dashboard's
// /api/device-control/agent-logs endpoint, but this one lives under
// /api/termux/ so the session-auth middleware skips it -- an operator (or
// tooling) can curl it with the shared ACCESS_KEY to tail a device's log
// without a browser session.
//
// GET /api/termux/tail-logs?deviceId=X&limit=200
// GET /api/termux/tail-logs?limit=100        -> tails every online device
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accessKey = process.env.ACCESS_KEY;
  const headerKey = req.headers.get("x-access-key") || req.nextUrl.searchParams.get("key");
  if (accessKey && headerKey !== accessKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const requestedDevice = req.nextUrl.searchParams.get("deviceId");
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 200));
  const sinceMs = Number(req.nextUrl.searchParams.get("since")) || 0;

  try {
    let deviceIds: string[] = [];
    if (requestedDevice) {
      deviceIds = [requestedDevice];
    } else {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 200 });
        cursor = next;
        for (const k of keys) {
          if (k.startsWith("termux:device:meta:")) continue;
          deviceIds.push(k.replace(/^termux:device:/, ""));
        }
      } while (cursor !== "0");
    }

    const devKeys = deviceIds.map((id) => termuxDeviceKey(id));
    const devVals = devKeys.length > 0 ? await redis.mget(...devKeys) : [];
    const deviceInfo: Record<string, { name: string; status: string }> = {};
    for (let i = 0; i < deviceIds.length; i++) {
      const raw = devVals[i];
      if (!raw) continue;
      try {
        const d = typeof raw === "string" ? JSON.parse(raw) : raw;
        deviceInfo[deviceIds[i]] = {
          name: d.customName || d.hostname || deviceIds[i].slice(0, 8),
          status: d.status || "unknown",
        };
      } catch {}
    }

    const devices = await Promise.all(
      deviceIds.map(async (id) => {
        const raw = await redis.queuePeek(termuxAgentLogKey(id), limit);
        const entries = raw
          .map((r) => {
            try {
              const o = JSON.parse(r);
              return { ts: Number(o.ts) || 0, line: String(o.line || "") };
            } catch {
              return null;
            }
          })
          .filter((x): x is { ts: number; line: string } => x !== null)
          .filter((x) => x.ts >= sinceMs);
        return {
          deviceId: id,
          name: deviceInfo[id]?.name || id.slice(0, 8),
          status: deviceInfo[id]?.status || "unknown",
          entries,
        };
      })
    );

    // Sort by most-recent-first based on the newest line each device has, so a
    // fleet-wide tail surfaces the noisy devices first.
    devices.sort((a, b) => {
      const latestA = a.entries.length > 0 ? a.entries[0].ts : 0;
      const latestB = b.entries.length > 0 ? b.entries[0].ts : 0;
      return latestB - latestA;
    });

    return NextResponse.json({ ok: true, devices, serverNow: Date.now() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
