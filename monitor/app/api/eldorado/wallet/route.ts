import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);

    const balanceRes = await eldoradoFetch("/api/userpayment/me");

    let balance: number | null = null;
    if (balanceRes.ok) {
      const d = await balanceRes.json();
      balance = d.userPaymentPrivateDTO?.balanceInUSD?.amount ?? null;
    }

    return NextResponse.json({ balance });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
