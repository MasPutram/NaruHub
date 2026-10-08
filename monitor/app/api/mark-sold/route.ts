import { NextRequest, NextResponse } from "next/server";
import { redis, forSaleKey, soldKey, detailKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { tenant } = getTenantFromRequest(req);
  const t = tenant || undefined;

  try {
    const { account, price } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ ok: false, error: "Harga tidak valid" }, { status: 400 });
    }

    const fsKey = forSaleKey(account, t);
    const raw = await redis.get<string>(fsKey);
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Akun tidak ditemukan di katalog." },
        { status: 404 }
      );
    }

    const acc = typeof raw === "string" ? JSON.parse(raw) : raw;

    const detRaw = await redis.get<string>(detailKey(account, t));
    const detail = detRaw ? (typeof detRaw === "string" ? JSON.parse(detRaw) : detRaw) : null;

    const sKey = soldKey(account, t);
    await redis.set(sKey, JSON.stringify({
      ...acc,
      sourceAccount: account,
      soldAt: Date.now(),
      soldPrice: Number(price),
      ...(detail ? { snapshotDetail: detail } : {}),
    }));
    await redis.del(fsKey);

    return NextResponse.json({ ok: true, account, price: Number(price) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
