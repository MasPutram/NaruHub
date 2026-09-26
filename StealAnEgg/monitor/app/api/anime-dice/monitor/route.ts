import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  adAccountKey,
  adDetailKey,
  adForSaleKey,
  adForSaleKickKey,
  ACCOUNT_TTL_S,
  FORSALE_KICK_TTL_S,
  deviceAccountsKey,
  DEVICE_ACCOUNTS_TTL_S,
} from "@/lib/redis";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const accessKey = process.env.ACCESS_KEY;
  const headerKey = req.headers.get("x-access-key");
  if (accessKey && headerKey !== accessKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    const name = data.sourceAccount || "?";

    const [fsExists, kickExists] = await Promise.all([
      redis.get<string>(adForSaleKey(name)),
      redis.get<string>(adForSaleKickKey(name)),
    ]);
    const shouldKick = !!kickExists;
    if (shouldKick) {
      await redis.del(adForSaleKickKey(name));
    }
    if (fsExists) {
      return NextResponse.json({
        ok: true,
        suppressed: "forsale",
        ...(shouldKick ? { forSale: true } : {}),
      });
    }

    const now = Date.now() / 1000;

    let firstSeen = now;
    const existing = await redis.get<string>(adAccountKey(name));
    if (existing) {
      try {
        const prev = typeof existing === "string" ? JSON.parse(existing) : existing;
        if (prev.firstSeen) firstSeen = prev.firstSeen;
      } catch {}
    }

    const summary = {
      money: data.money ?? null,
      rolls: data.rolls ?? null,
      rebirth: data.rebirth ?? null,
      dice: data.dice ?? null,
      autoRoll: data.autoRoll ?? null,
      autoSell: data.autoSell ?? null,
      vip: data.vip ?? false,
      unitsCount: data.unitsCount ?? 0,
      unitTypesCount: data.unitTypesCount ?? 0,
      discoveredCount: data.discoveredCount ?? 0,
      slotsCount: data.slotsCount ?? 0,
      ownedDiceCount: data.ownedDiceCount ?? 0,
      gamepasses: data.gamepasses ?? {},
      topUnits: data.topUnits || [],
      firstSeen,
      lastSeen: now,
      deviceId: req.headers.get("x-device-id") || "unknown",
    };

    const detail = {
      ownedDice: data.ownedDice || [],
      upgrades: data.upgrades || {},
      gamepasses: data.gamepasses ?? {},
      topUnits: data.topUnits || [],
      allUnits: data.allUnits || [],
      backpack: data.backpack || [],
      slots: data.slots || [],
      towerSquad: data.towerSquad || { squad: [], equipped: null },
      upgradesList: data.upgradesList || [],
      unitsCount: data.unitsCount ?? 0,
      unitTypesCount: data.unitTypesCount ?? 0,
      discoveredCount: data.discoveredCount ?? 0,
      slotsCount: data.slotsCount ?? 0,
      totalItemCount: data.totalItemCount ?? 0,
    };

    const pipeline = redis.pipeline();
    pipeline.set(adAccountKey(name), JSON.stringify(summary), { ex: ACCOUNT_TTL_S });
    pipeline.set(adDetailKey(name), JSON.stringify(detail), { ex: ACCOUNT_TTL_S });
    await pipeline.exec();

    const hbDeviceId = req.headers.get("x-device-id") || "unknown";
    if (hbDeviceId !== "unknown" && name !== "?") {
      try {
        const mapKey = deviceAccountsKey(hbDeviceId);
        const existingMap = await redis.get<string>(mapKey);
        const map: Record<string, number> = existingMap
          ? (typeof existingMap === "string" ? JSON.parse(existingMap) : existingMap)
          : {};
        map[name] = Date.now();
        const cutoff = Date.now() - DEVICE_ACCOUNTS_TTL_S * 1000;
        for (const k of Object.keys(map)) {
          if (map[k] < cutoff) delete map[k];
        }
        await redis.set(mapKey, JSON.stringify(map), { ex: DEVICE_ACCOUNTS_TTL_S });
      } catch {}
    }

    return NextResponse.json({ ok: true, ...(shouldKick ? { forSale: true } : {}) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
