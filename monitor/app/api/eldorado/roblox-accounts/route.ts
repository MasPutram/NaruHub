import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);
    const res = await eldoradoFetch("/api/v1/item-management/me/roblox-accounts");
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
