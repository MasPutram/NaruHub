import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);

    const [pendingRes, balanceRes] = await Promise.all([
      eldoradoFetch("/api/orders/me/pendingOrdersSum"),
      eldoradoFetch("/api/v1/userpayment/me/balance"),
    ]);

    let pending: number | null = null;
    if (pendingRes.ok) {
      const d = await pendingRes.json();
      pending = d.amount ?? null;
    }

    let balance: number | null = null;
    if (balanceRes.ok) {
      const d = await balanceRes.json();
      balance = d.amount ?? d.balance ?? null;
    }

    return NextResponse.json({ pending, balance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
