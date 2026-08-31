import { NextRequest, NextResponse } from "next/server";
import { redis, TERMUX_DEVICE_TTL_S } from "@/lib/redis";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(_req: NextRequest) {
  try {
    const devices: any[] = [];
    let cursor = "0";

    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 100 });
      cursor = next;

      if (keys.length > 0) {
        const values = await redis.mget(...keys);
        for (let i = 0; i < keys.length; i++) {
          if (values[i]) {
            try {
              const device = JSON.parse(values[i]!);
              const elapsed = (Date.now() - device.lastSeen) / 1000;
              device.status = elapsed < TERMUX_DEVICE_TTL_S ? "online" : "offline";
              devices.push(device);
            } catch {}
          }
        }
      }
    } while (cursor !== "0");

    devices.sort((a, b) => b.lastSeen - a.lastSeen);

    return NextResponse.json({ ok: true, devices });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, devices: [] }, { status: 500 });
  }
}
