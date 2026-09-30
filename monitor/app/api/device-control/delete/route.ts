import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxDeviceKey,
  termuxDeviceMetaKey,
  termuxCommandQueueKey,
  termuxCommandLogKey,
} from "@/lib/redis";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    await redis.del(termuxDeviceKey(deviceId));
    await redis.del(termuxDeviceMetaKey(deviceId));
    await redis.del(termuxCommandQueueKey(deviceId));
    await redis.del(termuxCommandLogKey(deviceId));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
