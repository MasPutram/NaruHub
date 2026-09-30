import { NextRequest, NextResponse } from "next/server";
import { redis, moderatedKey, accountKey, detailKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    const modKey = moderatedKey(account);
    const raw = await redis.get<string>(accountKey(account));
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Akun belum ada datanya di Redis." },
        { status: 404 }
      );
    }
    const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
    const detailRaw = await redis.get<string>(detailKey(account));
    const detail = detailRaw ? (typeof detailRaw === "string" ? JSON.parse(detailRaw) : detailRaw) : null;
    await redis.set(modKey, JSON.stringify({
      ...acc,
      sourceAccount: account,
      moderatedAt: Date.now(),
      ...(detail ? { detail } : {}),
    }));
    await redis.del(accountKey(account));
    await redis.del(detailKey(account));
    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
