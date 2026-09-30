import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result: any = await redis.scan(cursor, { match: "ad:detail:*", count: 200 });
      cursor = String(result[0]);
      keys.push(...(result[1] || []));
    } while (cursor !== "0");

    if (keys.length === 0) {
      return NextResponse.json({ ok: true, details: [] });
    }

    const values = await redis.mget(...keys);
    const details = keys
      .map((key, i) => {
        const raw = values[i];
        if (!raw) return null;
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        return { account: key.replace(/^ad:detail:/, ""), data };
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, details });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, details: [] }, { status: 500 });
  }
}
