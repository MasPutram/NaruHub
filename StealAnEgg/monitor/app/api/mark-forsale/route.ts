import { NextRequest, NextResponse } from "next/server";
import { redis, forSaleKey, accountKey, detailKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { account, forSale } = await req.json();
    if (!account) {
      return NextResponse.json({ ok: false, error: "Missing account" }, { status: 400 });
    }
    const fsKey = forSaleKey(account);
    if (forSale) {
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
      await redis.set(fsKey, JSON.stringify({
        ...acc,
        sourceAccount: account,
        markedAt: Date.now(),
        ...(detail ? { detail } : {}),
      }));
      // Drop the active monitoring record so a Siap-Jual account disappears
      // from the dashboard immediately, instead of lingering ~2 min as
      // "offline" until its TTL expires (and reappearing if the forSale flag
      // is later cleared). The catalog copy above -- which embeds `detail` --
      // preserves everything the catalog/poster needs. Once the account is
      // logged out (the Siap Jual force-stop), nothing recreates these keys.
      await redis.del(accountKey(account));
      await redis.del(detailKey(account));
    } else {
      await redis.del(fsKey);
    }
    return NextResponse.json({ ok: true, account, forSale: !!forSale });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
