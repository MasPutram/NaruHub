import { NextRequest, NextResponse } from "next/server";
import { redis, adDetailKey, adForSaleKey, adCatalogKey } from "@/lib/redis";

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

    // Overlay enriched catalog data (written by AnimeDiceSell.luau). Catalog
    // carries colors/shirtId/pantsId/meshTextures for units and image for
    // backpack items — fields the monitor detail doesn't have. If detail is
    // missing entirely, catalog alone is enough to render the Inventory page.
    let catalogUnits: any[] = [];
    let catalogBackpack: any[] = [];
    try {
      const catRaw = await redis.get<string>(adCatalogKey(account));
      if (catRaw) {
        const cat = typeof catRaw === "string" ? JSON.parse(catRaw) : catRaw;
        catalogUnits = Array.isArray(cat.units) ? cat.units : [];
        catalogBackpack = Array.isArray(cat.backpack) ? cat.backpack : [];
      }
    } catch {}

    if (!data && catalogUnits.length === 0 && catalogBackpack.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Belum ada data lengkap buat akun ini." },
        { status: 404 }
      );
    }

    // Merge catalog fields into monitor units by unit id (or by name+attrs
    // signature when id not present). Catalog wins for enrichment fields.
    const unitSig = (u: any): string => {
      if (u.id) return "id:" + u.id;
      const attrs = u.attributes || {};
      return [
        u.name || "",
        u.variant || "",
        u.rarity || "",
        u.mutation || attrs.mutation || "",
        u.trait || attrs.trait || "",
        u.grade || attrs.grade || "",
        u.level ?? attrs.level ?? "",
      ].join("|");
    };
    const catByKey = new Map<string, any>();
    for (const cu of catalogUnits) catByKey.set(unitSig(cu), cu);

    const monitorUnits: any[] = Array.isArray(data?.allUnits) ? data.allUnits : [];
    const mergedUnits = monitorUnits.map((mu) => {
      const cu = catByKey.get(unitSig(mu));
      if (!cu) return mu;
      return {
        ...mu,
        colors: cu.colors ?? mu.colors ?? null,
        modelName: cu.modelName ?? mu.modelName ?? null,
        shirtId: cu.shirtId ?? mu.shirtId ?? null,
        pantsId: cu.pantsId ?? mu.pantsId ?? null,
        meshTextures: cu.meshTextures ?? mu.meshTextures ?? null,
        speed: cu.speed ?? mu.speed ?? null,
        image: cu.image ?? mu.image ?? null,
      };
    });
    // Fall back to catalog units entirely when monitor detail is empty.
    const finalUnits = mergedUnits.length > 0 ? mergedUnits : catalogUnits;

    // Same merge for backpack: catalog carries `image`, monitor may have slot/tier.
    const monitorBp: any[] = Array.isArray(data?.backpack) ? data.backpack : [];
    const catBpByName = new Map<string, any>();
    for (const cb of catalogBackpack) catBpByName.set(String(cb.name || "").toLowerCase(), cb);
    const mergedBp = monitorBp.map((mb) => {
      const cb = catBpByName.get(String(mb.name || "").toLowerCase());
      if (!cb) return mb;
      return { ...mb, image: cb.image ?? mb.image ?? null };
    });
    const finalBp = mergedBp.length > 0 ? mergedBp : catalogBackpack;

    return NextResponse.json({
      ok: true,
      sourceAccount: account,
      ownedDice: data?.ownedDice || [],
      upgrades: data?.upgrades || {},
      gamepasses: data?.gamepasses || {},
      topUnits: data?.topUnits || [],
      allUnits: finalUnits,
      backpack: finalBp,
      slots: data?.slots || [],
      towerSquad: data?.towerSquad || { squad: [], equipped: null },
      upgradesList: data?.upgradesList || [],
      unitsCount: data?.unitsCount ?? finalUnits.length,
      unitTypesCount: data?.unitTypesCount ?? finalUnits.length,
      discoveredCount: data?.discoveredCount ?? 0,
      slotsCount: data?.slotsCount ?? 0,
      totalItemCount: data?.totalItemCount ?? finalBp.reduce((s: number, b: any) => s + (b.amount || 0), 0),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
