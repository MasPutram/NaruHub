import { NextRequest, NextResponse } from "next/server";
import { redis, adDetailKey, adForSaleKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account") || "";
  if (!account) {
    return NextResponse.json({ ok: false, error: "Missing account param" }, { status: 400 });
  }

  try {
    let raw = await redis.get<string>(adDetailKey(account));
    let data: any = null;

    if (raw) {
      data = typeof raw === "string" ? JSON.parse(raw) : raw;
    } else {
      const fsRaw = await redis.get<string>(adForSaleKey(account));
      if (fsRaw) {
        const fs = typeof fsRaw === "string" ? JSON.parse(fsRaw) : fsRaw;
        data = fs.detail || null;
      }
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, error: "Belum ada data lengkap buat akun ini." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      sourceAccount: account,
      ownedDice: data.ownedDice || [],
      upgrades: data.upgrades || {},
      gamepasses: data.gamepasses || {},
      topUnits: data.topUnits || [],
      unitsCount: data.unitsCount ?? 0,
      unitTypesCount: data.unitTypesCount ?? 0,
      discoveredCount: data.discoveredCount ?? 0,
      slotsCount: data.slotsCount ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
