import { NextRequest, NextResponse } from "next/server";
import { redis, adInventoryStateKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface InventoryState {
  unitData: Record<string, { price: number; sold: boolean }>;
  bpSold: Record<string, number>;
  sewa: Record<string, { pricePerHour: number; deposit: number }>;
}

const DEFAULT_STATE: InventoryState = { unitData: {}, bpSold: {}, sewa: {} };

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const raw = await redis.get<string>(adInventoryStateKey(tenant || undefined));
    const state: InventoryState = raw
      ? { ...DEFAULT_STATE, ...(typeof raw === "string" ? JSON.parse(raw) : raw) }
      : DEFAULT_STATE;
    return NextResponse.json({ ok: true, state });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const stateKey = adInventoryStateKey(tenant || undefined);
    const body = await req.json();

    const raw = await redis.get<string>(stateKey);
    const current: InventoryState = raw
      ? { ...DEFAULT_STATE, ...(typeof raw === "string" ? JSON.parse(raw) : raw) }
      : DEFAULT_STATE;

    if (body.unitData !== undefined) current.unitData = body.unitData;
    if (body.bpSold !== undefined) current.bpSold = body.bpSold;
    if (body.sewa !== undefined) current.sewa = body.sewa;

    if (body.setUnit) {
      const { key, price, sold } = body.setUnit;
      current.unitData[key] = { price: price ?? current.unitData[key]?.price ?? 0, sold: sold ?? current.unitData[key]?.sold ?? false };
    }

    if (body.setBpSold) {
      const { item, qty } = body.setBpSold;
      current.bpSold[item] = qty;
    }

    await redis.set(stateKey, JSON.stringify(current));
    return NextResponse.json({ ok: true, state: current });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// Wipe all per-unit/per-item tracking (prices, sold toggles, sewa, bp sold).
// Rates (ad:inventory:rates) and the catalog snapshots are NOT touched.
export async function DELETE(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    await redis.set(adInventoryStateKey(tenant || undefined), JSON.stringify(DEFAULT_STATE));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
