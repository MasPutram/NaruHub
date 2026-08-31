import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, TERMUX_DEVICE_TTL_S } from "@/lib/redis";

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
    const { deviceId, packages, stats } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    const existing = await redis.get<string>(termuxDeviceKey(deviceId));
    let device: Record<string, any>;

    if (existing) {
      device = typeof existing === "string" ? JSON.parse(existing) : existing;
      device.lastSeen = Date.now();
      device.status = "online";
      if (packages) device.packages = packages;
      if (stats) device.stats = stats;
    } else {
      device = {
        deviceId,
        hostname: "unknown",
        platform: "unknown",
        status: "online",
        registeredAt: Date.now(),
        lastSeen: Date.now(),
        packages: packages || [],
        stats: stats || {},
      };
    }

    await redis.set(termuxDeviceKey(deviceId), JSON.stringify(device), { ex: TERMUX_DEVICE_TTL_S });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
