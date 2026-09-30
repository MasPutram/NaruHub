import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxDeviceKey,
  presenceKey,
  rejoinStateKey,
  PRESENCE_FRESH_S,
} from "@/lib/redis";

// Dashboard-facing status for the presence / auto-rejoin panel: for each
// package on the device, its current Roblox server (jobId), last heartbeat,
// whether it's in-game, and the rejoin state machine's view. Admin-only
// (under /api/device-control, session-protected).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }
  try {
    const devRaw = await redis.get<string>(termuxDeviceKey(deviceId));
    if (!devRaw) return NextResponse.json({ ok: true, rows: [] });
    const device = typeof devRaw === "string" ? JSON.parse(devRaw) : devRaw;
    const packages: any[] = Array.isArray(device.packages) ? device.packages : [];
    const withUser = packages.filter((p) => p && typeof p === "object" && p.pkg && p.username);
    if (withUser.length === 0) return NextResponse.json({ ok: true, rows: [] });

    const presVals = await redis.mget(...withUser.map((p) => presenceKey(deviceId, p.username)));
    const stVals = await redis.mget(...withUser.map((p) => rejoinStateKey(deviceId, p.pkg)));
    const now = Date.now();

    const rows = withUser.map((p, i) => {
      const pres = presVals[i] ? (() => { try { return JSON.parse(presVals[i] as string); } catch { return null; } })() : null;
      const st = stVals[i] ? (() => { try { return JSON.parse(stVals[i] as string); } catch { return null; } })() : null;
      const lastSeen = pres?.ts || 0;
      return {
        pkg: p.pkg,
        account: p.username,
        jobId: pres?.jobId || "",
        placeId: pres?.placeId || "",
        lastSeen,
        inGame: !!(lastSeen && now - lastSeen < PRESENCE_FRESH_S * 1000),
        rejoin: st
          ? { attempts: st.attempts || 0, gaveUp: !!st.gaveUp, staleSince: st.staleSince || 0 }
          : null,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, rows: [] }, { status: 500 });
  }
}
