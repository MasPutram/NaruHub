import { NextRequest, NextResponse } from "next/server";
import { redis, forSaleKey, accountKey, detailKey, forSaleKickKey, FORSALE_KICK_TTL_S } from "@/lib/redis";

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
      // Arm the one-shot Kick signal for the in-game script. The heartbeat
      // will see forSale:true in the /api/monitor response and Kick the clone
      // to Roblox home so the operator can log out manually. TTL expires the
      // signal if the clone is offline; operator re-clicks Siap Jual to re-arm.
      await redis.set(forSaleKickKey(account), "1", { ex: FORSALE_KICK_TTL_S });
    } else {
      // Restore account + detail data back to dashboard keys before deleting
      // the catalog copy, so "Kembalikan" doesn't lose data.
      const catalogRaw = await redis.get<string>(fsKey);
      if (catalogRaw) {
        const catalog = typeof catalogRaw === "string" ? JSON.parse(catalogRaw) : catalogRaw;
        const { detail, markedAt, sourceAccount, ...accData } = catalog;
        const existingAcc = await redis.get<string>(accountKey(account));
        if (!existingAcc) {
          await redis.set(accountKey(account), JSON.stringify(accData));
        }
        if (detail) {
          const existingDetail = await redis.get<string>(detailKey(account));
          if (!existingDetail) {
            await redis.set(detailKey(account), JSON.stringify(detail));
          }
        }
      }
      await redis.del(fsKey);
      await redis.del(forSaleKickKey(account));
    }
    return NextResponse.json({ ok: true, account, forSale: !!forSale });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
