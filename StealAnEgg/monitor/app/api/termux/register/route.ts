import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, termuxDeviceMetaKey, TERMUX_DEVICE_TTL_S } from "@/lib/redis";

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
    const { deviceId, hostname, platform } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    const now = Date.now();
    const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId));
    const meta = metaRaw ? (typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw) : null;

    const device: Record<string, any> = {
      deviceId,
      hostname: hostname || "unknown",
      platform: platform || "unknown",
      status: "online",
      registeredAt: meta?.registeredAt || now,
      lastSeen: now,
      packages: [] as string[],
    };
    if (meta?.customName) device.customName = meta.customName;

    await redis.set(termuxDeviceKey(deviceId), JSON.stringify(device), { ex: TERMUX_DEVICE_TTL_S });

    if (!meta) {
      await redis.set(termuxDeviceMetaKey(deviceId), JSON.stringify({ registeredAt: now }));
    }

    return NextResponse.json({ ok: true, device });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
