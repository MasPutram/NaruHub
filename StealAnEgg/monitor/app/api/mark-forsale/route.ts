import { NextRequest, NextResponse } from "next/server";
import { redis, forSaleKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account, forSale } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    const key = forSaleKey(account);
    if (forSale) {
      await redis.set(key, "1");
    } else {
      await redis.del(key);
    }
    return NextResponse.json({ ok: true, account, forSale: !!forSale });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
