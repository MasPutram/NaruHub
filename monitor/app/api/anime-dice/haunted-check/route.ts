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

const RARE_UNITS = [
  "Vampire Gujo",
  "Witch Namee",
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
      return NextResponse.json({ ok: true, found: [], missing: HAUNTED_GEARS, units: [] });
    }

    const values = await redis.mget(...keys);
    const found: { gear: string; account: string }[] = [];
    const foundSet = new Set<string>();
    const units: { unit: string; account: string; count: number }[] = [];

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const account = stripTenantPrefix(keys[i], tenant).replace(/^ad:detail:/, "");

      const bp: any[] = Array.isArray(data.backpack) ? data.backpack : [];
      for (const item of bp) {
        if (HAUNTED_GEARS.includes(item.name) && !foundSet.has(item.name)) {
          found.push({ gear: item.name, account });
          foundSet.add(item.name);
        }
      }

      const allUnits: any[] = Array.isArray(data.allUnits) ? data.allUnits : [];
      for (const u of allUnits) {
        if (RARE_UNITS.includes(u.name)) {
          const existing = units.find((x) => x.unit === u.name && x.account === account);
          if (existing) {
            existing.count++;
          } else {
            units.push({ unit: u.name, account, count: 1 });
          }
        }
      }
    }

    const missing = HAUNTED_GEARS.filter((g) => !foundSet.has(g));

    return NextResponse.json({ ok: true, found, missing, units });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, found: [], missing: HAUNTED_GEARS, units: [] }, { status: 500 });
  }
}
