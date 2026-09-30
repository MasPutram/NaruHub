import { NextRequest, NextResponse } from "next/server";
import { redis, AD_INVENTORY_RATES_KEY } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const raw = await redis.get<string>(AD_INVENTORY_RATES_KEY);
    const rates = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return NextResponse.json({ ok: true, rates });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rates = body.rates || {};
    await redis.set(AD_INVENTORY_RATES_KEY, JSON.stringify(rates));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
