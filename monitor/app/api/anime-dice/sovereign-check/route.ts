import { NextRequest, NextResponse } from "next/server";
import { redis, scanPattern, stripTenantPrefix } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TARGET_QUIRK = "Sovereign";

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
      return NextResponse.json({ ok: true, accounts: [], total: 0 });
    }

    const values = await redis.mget(...keys);
    const accounts: { account: string; units: { name: string; count: number }[]; total: number }[] = [];
    let grandTotal = 0;

    for (let i = 0; i < keys.length; i++) {
      const raw = values[i];
      if (!raw) continue;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      const account = stripTenantPrefix(keys[i], tenant).replace(/^ad:detail:/, "");

      const allUnits: any[] = Array.isArray(data.allUnits) ? data.allUnits : [];
      const unitCounts: Record<string, number> = {};

      for (const u of allUnits) {
        if (u.quirk === TARGET_QUIRK) {
          unitCounts[u.name] = (unitCounts[u.name] || 0) + 1;
        }
      }

      const total = Object.values(unitCounts).reduce((s, n) => s + n, 0);
      if (total > 0) {
        grandTotal += total;
        accounts.push({
          account,
          units: Object.entries(unitCounts).map(([name, count]) => ({ name, count })),
          total,
        });
      }
    }

    accounts.sort((a, b) => b.total - a.total);

    return NextResponse.json({ ok: true, accounts, total: grandTotal });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, accounts: [], total: 0 }, { status: 500 });
  }
}
