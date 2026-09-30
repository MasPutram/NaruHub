import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, termuxDeviceMetaKey, TERMUX_DEVICE_TTL_S } from "@/lib/redis";

// Admin-only (protected by middleware session auth -- outside /api/termux/).
// Sets a custom display name for a device, shown instead of its raw hostname.
export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId, name } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }
    if (typeof name !== "string" || name.length > 60) {
      return NextResponse.json({ ok: false, error: "name required, max 60 chars" }, { status: 400 });
    }

    const existing = await redis.get<string>(termuxDeviceKey(deviceId));
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Device tidak ditemukan" }, { status: 404 });
    }
    const device = typeof existing === "string" ? JSON.parse(existing) : existing;
    device.customName = name.trim();

    await redis.set(termuxDeviceKey(deviceId), JSON.stringify(device), { ex: TERMUX_DEVICE_TTL_S });

    const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId));
    const meta = metaRaw ? (typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw) : {};
    meta.customName = name.trim();
    if (!meta.registeredAt) meta.registeredAt = device.registeredAt || Date.now();
    await redis.set(termuxDeviceMetaKey(deviceId), JSON.stringify(meta));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
