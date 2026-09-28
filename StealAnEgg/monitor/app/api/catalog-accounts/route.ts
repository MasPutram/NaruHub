import { NextResponse } from "next/server";
import { redis, ACCOUNT_DEVICE_MAP_KEY } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result: any = await redis.scan(cursor, { match: "forsale:*", count: 200 });
      cursor = String(result[0]);
      const batch: string[] = result[1] || [];
      keys.push(...batch);
    } while (cursor !== "0");

    const deviceMapRaw = await redis.get<string>(ACCOUNT_DEVICE_MAP_KEY);
    const deviceMap: Record<string, string> = deviceMapRaw
      ? typeof deviceMapRaw === "string" ? JSON.parse(deviceMapRaw) : deviceMapRaw
      : {};

    if (keys.length === 0) {
      return NextResponse.json({ accounts: [], deviceMap });
    }

    const values: any[] = await redis.mget(...keys);
    const rows = keys.map((key, i) => {
      const raw = values[i];
      if (!raw) return null;
      const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
      const name = key.replace(/^forsale:/, "");
      return {
        ...acc,
        sourceAccount: name,
        online: false,
        forSale: true,
      };
    }).filter(Boolean);

    return NextResponse.json({ accounts: rows, deviceMap });
  } catch (e: any) {
    return NextResponse.json({ accounts: [], deviceMap: {}, error: e.message }, { status: 500 });
  }
}
