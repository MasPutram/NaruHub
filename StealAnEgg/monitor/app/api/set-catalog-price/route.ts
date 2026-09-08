import { NextRequest, NextResponse } from "next/server";
import { redis, forSaleKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account, price } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    const numPrice = Number(price);
    if (price == null || isNaN(numPrice) || numPrice < 0) {
      return NextResponse.json({ ok: false, error: "Harga tidak valid" }, { status: 400 });
    }

    const fsKey = forSaleKey(account);
    const raw = await redis.get<string>(fsKey);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Akun tidak ditemukan di katalog." }, { status: 404 });
    }

    const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
    acc.catalogPrice = numPrice;
    await redis.set(fsKey, JSON.stringify(acc));

    return NextResponse.json({ ok: true, account, price: numPrice });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
