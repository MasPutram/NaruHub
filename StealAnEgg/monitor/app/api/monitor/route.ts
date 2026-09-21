import { NextRequest, NextResponse } from "next/server";
import { redis, accountKey, detailKey, forSaleKey, soldKey, ACCOUNT_TTL_S, petIconKey, PET_ICON_TTL_S, forSaleKickKey, deviceAccountsKey, DEVICE_ACCOUNTS_TTL_S } from "@/lib/redis";

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

    // Suppress ingestion for accounts that have already been moved out of
    // active monitoring (Siap Jual -> catalog, or already sold). Between the
    // moment the operator clicks Siap Jual and the moment the agent actually
    // force-stops the Roblox app on-device, the executor keeps posting
    // heartbeats -- and those were recreating the account record so it kept
    // reappearing in the dashboard as "offline". A short-circuit here makes
    // "Siap Jual" a sticky state: nothing an executor sends can bring the
    // account back onto the main dashboard.
    const [fsExists, soldExists, kickExists] = await Promise.all([
      redis.get<string>(forSaleKey(name)),
      redis.get<string>(soldKey(name)),
      redis.get<string>(forSaleKickKey(name)),
    ]);
    // One-shot Kick signal: armed by /api/mark-forsale, consumed on the first
    // heartbeat that sees it so the script LocalPlayer:Kick("Siap Jual")s exactly
    // once. If the operator manually launches the account again later, no key
    // to trigger another Kick (unless Siap Jual is re-clicked).
    const shouldKick = !!kickExists;
    if (shouldKick) {
      await redis.del(forSaleKickKey(name));
    }
    if (fsExists || soldExists) {
      return NextResponse.json({
        ok: true,
        suppressed: fsExists ? "forsale" : "sold",
        ...(shouldKick ? { forSale: true } : {}),
      });
    }

    const now = Date.now() / 1000;

    let firstSeen = now;
    const existing = await redis.get<string>(accountKey(name));
    if (existing) {
      try {
        const prev = typeof existing === "string" ? JSON.parse(existing) : existing;
        if (prev.firstSeen) firstSeen = prev.firstSeen;
      } catch {}
    }

    const equippedIncome = Array.isArray(data.fullData?.activePets)
      ? data.fullData.activePets.reduce((s: number, p: any) => s + (p.rate || 0), 0)
      : null;

    const summary = {
      money: data.money ?? null,
      speed: data.speed ?? null,
      income: data.income ?? null,
      incomeAktif: equippedIncome ?? data.incomeAktif ?? null,
      incomeEggBackpack: data.incomeEggBackpack ?? null,
      incomeEggSedangTumbuh: data.incomeEggSedangTumbuh ?? null,
      highValuePetTotal: data.highValuePetTotal ?? null,
      kandangLevel: data.kandangLevel ?? null,
      treadmillLevel: data.treadmillLevel ?? null,
      petsCount: data.petsCount ?? 0,
      stolenCount: data.stolenCount ?? 0,
      // Limited-time event item. Lua sends `bossToken` as a count; the field
      // is whitelisted here (this endpoint only persists listed fields), so
      // it survives into the account record the dashboard reads.
      bossToken: data.bossToken ?? null,
      // Consumable mutation token count -- shown on the dashboard in place of
      // boss token. Lua sends `mutationToken`.
      mutationToken: data.mutationToken ?? null,
      scrambleToken: data.scrambleToken ?? null,
      trail: data.trail ?? null,
      growingEggCount: data.fullData?.growingEggs?.length ?? 0,
      backpackEggCount: data.fullData?.backpackEggs?.length ?? 0,
      topPets: data.topPets || [],
      firstSeen,
      lastSeen: now,
      deviceId: req.headers.get("x-device-id") || "unknown",
    };

    const pipeline = redis.pipeline();
    pipeline.set(accountKey(name), JSON.stringify(summary));

    if (data.fullData) {
      pipeline.set(detailKey(name), JSON.stringify(data.fullData));
    }

    const allPets = [
      ...(data.topPets || []),
      ...(data.fullData?.activePets || []),
      ...(data.fullData?.allPets || []),
      ...(data.fullData?.growingEggs || []),
      ...(data.fullData?.backpackEggs || []),
    ];
    for (const p of allPets) {
      if (p.category && p.textureId) {
        const match = String(p.textureId).match(/(\d+)/);
        if (match) {
          pipeline.set(petIconKey(p.category), match[1], { ex: PET_ICON_TTL_S });
        }
      }
    }

    await pipeline.exec();

    // Update per-device account mapping so the agent heartbeat handler can
    // enrich packages whose prefs.xml detection failed.
    const hbDeviceId = req.headers.get("x-device-id") || "unknown";
    if (hbDeviceId !== "unknown" && name !== "?") {
      try {
        const mapKey = deviceAccountsKey(hbDeviceId);
        const existingMap = await redis.get<string>(mapKey);
        const map: Record<string, number> = existingMap
          ? (typeof existingMap === "string" ? JSON.parse(existingMap) : existingMap)
          : {};
        map[name] = Date.now();
        // Prune entries older than TTL
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
