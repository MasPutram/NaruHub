import { NextRequest, NextResponse } from "next/server";
import { redis, soldKey, forSaleKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }

    const sKey = soldKey(account);
    const raw = await redis.get<string>(sKey);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Akun tidak ditemukan di daftar terjual." }, { status: 404 });
    }

    const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
    delete acc.soldAt;
    delete acc.soldPrice;
    delete acc.snapshotDetail;

    const fsKey = forSaleKey(account);
    await redis.set(fsKey, JSON.stringify(acc));
    await redis.del(sKey);

    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
