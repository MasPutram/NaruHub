import { NextRequest, NextResponse } from "next/server";
import { redis, ONLINE_TIMEOUT_S, adForSaleKey, accountDeviceMapKey, scanPattern, stripTenantPrefix } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);

    const keys: string[] = [];
    let cursor = "0";
    do {
      const result: any = await redis.scan(cursor, { match: scanPattern(tenant, "ad:account:*"), count: 200 });
      cursor = String(result[0]);
      const batch: string[] = result[1] || [];
      keys.push(...batch);
    } while (cursor !== "0");

    if (keys.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    const values: any[] = await redis.mget(...keys);
    const now = Date.now() / 1000;
    const accountNames = keys.map((k) => stripTenantPrefix(k, tenant).replace(/^ad:account:/, ""));
    const fsKeys = accountNames.map((n) => adForSaleKey(n, tenant || undefined));
    const fsValues: (string | null)[] = fsKeys.length > 0 ? await redis.mget(...fsKeys) : [];

    const rows = keys.map((key, i) => {
      const raw = values[i];
      if (!raw) return null;
      const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
      return {
        ...acc,
        sourceAccount: accountNames[i],
        online: (now - (acc.lastSeen || 0)) <= ONLINE_TIMEOUT_S,
        forSale: !!fsValues[i],
      };
    }).filter(Boolean);

    let deviceMap: Record<string, string> = {};
    try {
      const mapRaw = await redis.get<string>(accountDeviceMapKey(tenant || undefined));
      if (mapRaw) deviceMap = typeof mapRaw === "string" ? JSON.parse(mapRaw) : mapRaw;
    } catch {}

    return NextResponse.json({ accounts: rows, deviceMap });
  } catch (e: any) {
    return NextResponse.json({ accounts: [], error: e.message }, { status: 500 });
  }
}
