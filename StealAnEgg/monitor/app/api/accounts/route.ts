import { NextResponse } from "next/server";
import { redis, ONLINE_TIMEOUT_S } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await redis.scan(cursor, { match: "account:*", count: 200 });
      cursor = String(result[0]);
      const batch: string[] = result[1] || [];
      keys.push(...batch);
    } while (cursor !== "0");

    if (keys.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = await redis.mget(...keys);
    const now = Date.now() / 1000;
    const rows = keys.map((key, i) => {
      const raw = values[i];
      if (!raw) return null;
      const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
      const name = key.replace(/^account:/, "");
      return {
        ...acc,
        sourceAccount: name,
        online: (now - (acc.lastSeen || 0)) <= ONLINE_TIMEOUT_S,
      };
    }).filter(Boolean);

    return NextResponse.json({ accounts: rows });
  } catch (e: any) {
    return NextResponse.json({ accounts: [], error: e.message }, { status: 500 });
  }
}
