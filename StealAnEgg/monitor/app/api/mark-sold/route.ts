import { NextRequest, NextResponse } from "next/server";
import { redis, forSaleKey, soldKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account, price } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ ok: false, error: "Harga tidak valid" }, { status: 400 });
    }

    const fsKey = forSaleKey(account);
    const raw = await redis.get<string>(fsKey);
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Akun tidak ditemukan di katalog." },
        { status: 404 }
      );
    }

    const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
    const sKey = soldKey(account);
    await redis.set(sKey, JSON.stringify({
      ...acc,
      sourceAccount: account,
      soldAt: Date.now(),
      soldPrice: Number(price),
    }));
    await redis.del(fsKey);

    return NextResponse.json({ ok: true, account, price: Number(price) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
