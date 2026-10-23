import { NextRequest, NextResponse } from "next/server";
import { redis, moderatedKey, accountKey, detailKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { tenant } = getTenantFromRequest(req);
  const t = tenant || undefined;

  try {
    const { account, snapshot } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    const modKey = moderatedKey(account, t);

    let accData: Record<string, unknown>;
    if (snapshot && typeof snapshot === "object") {
      accData = { ...snapshot };
    } else {
      const raw = await redis.get<string>(accountKey(account, t));
      if (!raw) {
        return NextResponse.json(
          { ok: false, error: "Akun belum ada datanya di Redis." },
          { status: 404 }
        );
      }
      const acc = typeof raw === "string" ? JSON.parse(raw) : raw;
      const detailRaw = await redis.get<string>(detailKey(account, t));
      const detail = detailRaw ? (typeof detailRaw === "string" ? JSON.parse(detailRaw) : detailRaw) : null;
      accData = { ...acc, ...(detail ? { detail } : {}) };
    }

    await redis.set(modKey, JSON.stringify({
      ...accData,
      sourceAccount: account,
      moderatedAt: Date.now(),
    }));
    await redis.del(accountKey(account, t));
    await redis.del(detailKey(account, t));
    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
