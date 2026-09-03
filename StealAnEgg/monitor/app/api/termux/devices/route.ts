import { NextRequest, NextResponse } from "next/server";
import { redis, TERMUX_DEVICE_TTL_S } from "@/lib/redis";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(_req: NextRequest) {
  try {
    const liveByKey: Record<string, any> = {};
    const metaByKey: Record<string, any> = {};

    // Scan LIVE device keys (short TTL) -- exclude meta keys.
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 100 });
      cursor = next;
      const liveKeys = keys.filter((k) => !k.startsWith("termux:device:meta:"));
      if (liveKeys.length > 0) {
        const values = await redis.mget(...liveKeys);
        for (let i = 0; i < liveKeys.length; i++) {
          const v = values[i];
          if (!v) continue;
          try {
            const device = JSON.parse(v);
            if (device?.deviceId) liveByKey[device.deviceId] = device;
          } catch {}
        }
      }
    } while (cursor !== "0");

    // Scan META keys (persistent, holds last snapshot for offline history).
    cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:meta:*", count: 100 });
      cursor = next;
      if (keys.length > 0) {
        const values = await redis.mget(...keys);
        for (let i = 0; i < keys.length; i++) {
          const v = values[i];
          if (!v) continue;
          try {
            const meta = JSON.parse(v);
            const id = keys[i].replace("termux:device:meta:", "");
            if (id) metaByKey[id] = meta;
          } catch {}
        }
      }
    } while (cursor !== "0");

    const devices: any[] = [];
    const now = Date.now();

    // Live devices first -- compute status from lastSeen.
    for (const device of Object.values(liveByKey)) {
      const elapsed = (now - (device.lastSeen || 0)) / 1000;
      device.status = elapsed < TERMUX_DEVICE_TTL_S ? "online" : "offline";
      devices.push(device);
    }

    // Meta-only devices (offline history) -- reconstruct as offline entries.
    for (const [id, meta] of Object.entries(metaByKey)) {
      if (liveByKey[id]) continue; // already have a live entry
      if (!meta?.hostname && !meta?.customName) continue; // stale meta without any data
      devices.push({
        deviceId: id,
        hostname: meta.hostname || "unknown",
        platform: meta.platform || "unknown",
        status: "offline",
        registeredAt: meta.registeredAt || 0,
        lastSeen: meta.lastSeen || 0,
        packages: meta.packages || [],
        screen: meta.screen,
        stats: meta.stats,
        customName: meta.customName,
      });
    }

    devices.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    return NextResponse.json({ ok: true, devices });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, devices: [] }, { status: 500 });
  }
}
