import { NextRequest, NextResponse } from "next/server";
import { redis, scanPattern, stripTenantPrefix } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { tenant } = getTenantFromRequest(req);
  const t = tenant || undefined;

  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result: any = await redis.scan(cursor, { match: scanPattern(t, "sold:*"), count: 200 });
      cursor = String(result[0]);
      const batch: string[] = result[1] || [];
      keys.push(...batch);
    } while (cursor !== "0");

    if (keys.length === 0) {
      return NextResponse.json({ accounts: [] });
    }

    const values: any[] = await redis.mget(...keys);
    const rows = keys.map((key, i) => {
      const raw = values[i];
      if (!raw) return null;
      const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
      const name = stripTenantPrefix(key, t).replace(/^sold:/, "");
      return {
        ...acc,
        sourceAccount: name,
        online: false,
        forSale: false,
        sold: true,
      };
    }).filter(Boolean);

    rows.sort((a: any, b: any) => (b.soldAt || 0) - (a.soldAt || 0));

    return NextResponse.json({ accounts: rows });
  } catch (e: any) {
    return NextResponse.json({ accounts: [], error: e.message }, { status: 500 });
  }
}
