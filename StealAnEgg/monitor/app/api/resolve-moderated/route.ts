import { NextRequest, NextResponse } from "next/server";
import { redis, moderatedKey, resolvedModeratedKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }

    const modKey = moderatedKey(account);
    const raw = await redis.get<string>(modKey);
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "Akun tidak ditemukan di daftar moderated." },
        { status: 404 }
      );
    }

    const acc = typeof raw === "string" ? JSON.parse(raw) : raw;

    const resKey = resolvedModeratedKey(account);
    await redis.set(resKey, JSON.stringify({
      ...acc,
      sourceAccount: account,
      resolvedAt: Date.now(),
    }));
    await redis.del(modKey);

    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
