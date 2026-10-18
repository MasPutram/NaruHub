import { NextRequest, NextResponse } from "next/server";
import { redis, scanPattern, stripTenantPrefix } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

const HAUNTED_GEARS = [
  "Pumpkin Head",
  "Candy Bucket",
  "Ghost Wisps",
  "Mummy Wraps",
  "Vampire Cape",
];

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);

    const keys: string[] = [];
    let cursor = "0";
    do {
      const result: any = await redis.scan(cursor, { match: scanPattern(tenant, "ad:detail:*"), count: 200 });
      cursor = String(result[0]);
      keys.push(...(result[1] || []));
    } while (cursor !== "0");

    if (keys.length === 0) {
      return NextResponse.json({ ok: true, found: [], missing: HAUNTED_GEARS });
    }

    const values = await redis.mget(...keys);
    const found: { gear: string; account: string }[] = [];
    const foundSet = new Set<string>();

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const bp: any[] = Array.isArray(data.backpack) ? data.backpack : [];
      const account = stripTenantPrefix(keys[i], tenant).replace(/^ad:detail:/, "");
      for (const item of bp) {
        if (HAUNTED_GEARS.includes(item.name) && !foundSet.has(item.name)) {
          found.push({ gear: item.name, account });
          foundSet.add(item.name);
        }
      }
    }

    const missing = HAUNTED_GEARS.filter((g) => !foundSet.has(g));

    return NextResponse.json({ ok: true, found, missing });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, found: [], missing: HAUNTED_GEARS }, { status: 500 });
  }
}
