import { NextRequest, NextResponse } from "next/server";
import { redis, scanPattern } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const t = tenant || undefined;

    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, { match: scanPattern(t, "termux:policy:*"), count: 100 });
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0");

    let updated = 0;
    for (const key of keys) {
      const raw = await redis.get<string>(key);
      if (!raw) continue;
      const existing = typeof raw === "string" ? JSON.parse(raw) : raw;
      const merged = {
        ...existing,
        autoRejoinEnabled: false,
        packageTargets: {},
        updatedAt: Date.now(),
      };
      await redis.set(key, JSON.stringify(merged));
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: keys.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
