import { NextRequest, NextResponse } from "next/server";
import { redis, adCatalogKey, AD_CATALOG_TTL_S, scanPattern, stripTenantPrefix } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

// Written by AnimeDiceSell.luau — an enriched inventory snapshot (units
// with colors/shirtId/pantsId/meshTextures, backpack with icons, stats)
// that the catalog / marketplace UI reads. Distinct from the monitor
// endpoint (which stores a shorter-lived "is this account online" snapshot).
export async function POST(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await req.json();
    const name = data.sourceAccount;
    if (!name || typeof name !== "string") {
      return NextResponse.json({ ok: false, error: "Missing sourceAccount" }, { status: 400 });
    }

    const now = Date.now() / 1000;
    let firstSeen = now;
    const existing = await redis.get<string>(adCatalogKey(name, tenant));
    if (existing) {
      try {
        const prev = typeof existing === "string" ? JSON.parse(existing) : existing;
        if (prev.firstSeen) firstSeen = prev.firstSeen;
      } catch {}
    }

    const snapshot = {
      game: data.game || "AnimeDice",
      sourceAccount: name,
      money: data.money ?? null,
      rolls: data.rolls ?? null,
      rebirth: data.rebirth ?? null,
      dice: data.dice ?? null,
      vip: data.vip ?? false,
      unitsCount: data.unitsCount ?? 0,
      units: Array.isArray(data.units) ? data.units : [],
      backpack: Array.isArray(data.backpack) ? data.backpack : [],
      firstSeen,
      lastSeen: now,
      deviceId: req.headers.get("x-device-id") || "unknown",
    };

    await redis.set(adCatalogKey(name, tenant), JSON.stringify(snapshot), { ex: AD_CATALOG_TTL_S });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// GET ?account=Name -> single snapshot; no query -> list all account names.
export async function GET(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }
  try {
    const account = req.nextUrl.searchParams.get("account");
    if (account) {
      const raw = await redis.get<string>(adCatalogKey(account, tenant));
      if (!raw) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      const snap = typeof raw === "string" ? JSON.parse(raw) : raw;
      return NextResponse.json({ ok: true, snapshot: snap });
    }

    const keys: string[] = [];
    let cursor = "0";
    do {
      const res = await redis.scan(cursor, { match: scanPattern(tenant, "ad:catalog:*"), count: 200 });
      cursor = String(res[0]);
      keys.push(...(res[1] || []));
    } while (cursor !== "0");

    if (keys.length === 0) return NextResponse.json({ ok: true, snapshots: [] });

    const values = await redis.mget(...keys);
    const snapshots = values
      .map((raw) => {
        if (!raw) return null;
        try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
      })
      .filter(Boolean);

    return NextResponse.json({ ok: true, snapshots });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// DELETE ?account=Name wipes a single account snapshot. No query wipes
// every ad:catalog:* key — fresh slate (next Luau push repopulates).
export async function DELETE(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }
  try {
    const account = req.nextUrl.searchParams.get("account");
    if (account) {
      await redis.del(adCatalogKey(account, tenant));
      return NextResponse.json({ ok: true, deleted: account });
    }

    const keys: string[] = [];
    let cursor = "0";
    do {
      const res = await redis.scan(cursor, { match: scanPattern(tenant, "ad:catalog:*"), count: 200 });
      cursor = String(res[0]);
      keys.push(...(res[1] || []));
    } while (cursor !== "0");

    for (const k of keys) await redis.del(k);
    return NextResponse.json({ ok: true, deleted: keys.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
