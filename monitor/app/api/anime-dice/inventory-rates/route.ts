import { NextRequest, NextResponse } from "next/server";
import { redis, adInventoryRatesKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const raw = await redis.get<string>(adInventoryRatesKey(tenant || undefined));
    const rates = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return NextResponse.json({ ok: true, rates });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const body = await req.json();
    const rates = body.rates || {};
    await redis.set(adInventoryRatesKey(tenant || undefined), JSON.stringify(rates));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
