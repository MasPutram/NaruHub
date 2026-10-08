import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, termuxDeviceMetaKey, TERMUX_DEVICE_TTL_S } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { deviceId, hostname, platform } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    const now = Date.now();
    const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId, tenant));
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

    await redis.set(termuxDeviceKey(deviceId, tenant), JSON.stringify(device), { ex: TERMUX_DEVICE_TTL_S });

    // Persist a snapshot so an offline device still shows its last-known
    // hostname/platform (and any prior stats) on the dashboard.
    const snapshot: Record<string, any> = {
      ...(meta || {}),
      hostname: device.hostname,
      platform: device.platform,
      registeredAt: device.registeredAt,
      lastSeen: device.lastSeen,
    };
    if (device.customName) snapshot.customName = device.customName;
    await redis.set(termuxDeviceMetaKey(deviceId, tenant), JSON.stringify(snapshot));

    return NextResponse.json({ ok: true, device });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
