import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxCommandQueueKey,
  termuxCommandLogKey,
  TERMUX_COMMAND_QUEUE_TTL_S,
  TERMUX_COMMAND_QUEUE_MAX,
  TERMUX_COMMAND_LOG_TTL_S,
  TERMUX_COMMAND_LOG_MAX,
} from "@/lib/redis";

// Find the live device that hosts a Roblox package logged in as `username`
// and queue a launch command for that specific package -- used by the
// "Siap Jual" flow so the operator can immediately log the account out.
export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username: string = (body.username || body.account || "").toString().trim();
    if (!username) {
      return NextResponse.json({ ok: false, error: "username required" }, { status: 400 });
    }

    // Scan live device keys only (skip meta keys).
    let cursor = "0";
    const deviceKeys: string[] = [];
    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 100 });
      cursor = next;
      for (const k of keys) if (!k.startsWith("termux:device:meta:")) deviceKeys.push(k);
    } while (cursor !== "0");

    if (deviceKeys.length === 0) {
      return NextResponse.json({ ok: false, error: "Tidak ada device online" }, { status: 404 });
    }

    const values = await redis.mget(...deviceKeys);
    const wantLower = username.toLowerCase();
    let matchDevice: any = null;
    let matchPkg: string | null = null;

    for (const raw of values) {
      if (!raw) continue;
      let device: any;
      try { device = JSON.parse(raw); } catch { continue; }
      const packages = Array.isArray(device.packages) ? device.packages : [];
      for (const p of packages) {
        if (!p || typeof p !== "object") continue;
        const uname = (p.username || "").toString().trim().toLowerCase();
        if (uname && uname === wantLower) {
          matchDevice = device;
          matchPkg = p.pkg;
          break;
        }
      }
      if (matchDevice) break;
    }

    if (!matchDevice || !matchPkg) {
      return NextResponse.json(
        { ok: false, error: `Package untuk akun '${username}' tidak ditemukan di device online mana pun` },
        { status: 404 }
      );
    }

    const command = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "launch",
      package: matchPkg,
      bounds: "",
      resize: false,
      launchDelay: 10,
      createdAt: Date.now(),
    };
    await redis.queuePush(termuxCommandQueueKey(matchDevice.deviceId), JSON.stringify(command), {
      ttl: TERMUX_COMMAND_QUEUE_TTL_S,
      maxLen: TERMUX_COMMAND_QUEUE_MAX,
    });

    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      action: "launch (siap-jual)",
      packages: [matchPkg],
      username,
    };
    await redis.queuePush(termuxCommandLogKey(matchDevice.deviceId), JSON.stringify(logEntry), {
      ttl: TERMUX_COMMAND_LOG_TTL_S,
      maxLen: TERMUX_COMMAND_LOG_MAX,
    });

    return NextResponse.json({
      ok: true,
      deviceId: matchDevice.deviceId,
      hostname: matchDevice.hostname,
      package: matchPkg,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
