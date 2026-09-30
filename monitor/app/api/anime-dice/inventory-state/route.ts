import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const STATE_KEY = "ad:inventory:state";

interface InventoryState {
  unitData: Record<string, { price: number; sold: boolean }>;
  bpSold: Record<string, number>;
}

const DEFAULT_STATE: InventoryState = { unitData: {}, bpSold: {} };

export async function GET() {
  try {
    const raw = await redis.get<string>(STATE_KEY);
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
    const body = await req.json();

    const raw = await redis.get<string>(STATE_KEY);
    const current: InventoryState = raw
      ? { ...DEFAULT_STATE, ...(typeof raw === "string" ? JSON.parse(raw) : raw) }
      : DEFAULT_STATE;

    if (body.unitData !== undefined) current.unitData = body.unitData;
    if (body.bpSold !== undefined) current.bpSold = body.bpSold;

    if (body.setUnit) {
      const { key, price, sold } = body.setUnit;
      current.unitData[key] = { price: price ?? current.unitData[key]?.price ?? 0, sold: sold ?? current.unitData[key]?.sold ?? false };
    }

    if (body.setBpSold) {
      const { item, qty } = body.setBpSold;
      current.bpSold[item] = qty;
    }

    await redis.set(STATE_KEY, JSON.stringify(current));
    return NextResponse.json({ ok: true, state: current });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
