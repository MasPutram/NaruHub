import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

const BASE = "https://www.eldorado.gg";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") || "1";
    const size = searchParams.get("size") || "24";
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "";

    const qs = new URLSearchParams({
      gameId: "476",
      category: "CustomItem",
      pageIndex: page,
      pageSize: size,
      includeDeliveryMedians: "true",
    });

    if (search) qs.set("searchQuery", search);
    if (sort === "price_asc") { qs.set("offerSortingCriterion", "Price"); qs.set("isAscending", "true"); }
    if (sort === "price_desc") { qs.set("offerSortingCriterion", "Price"); qs.set("isAscending", "false"); }

    const res = await fetch(`${BASE}/api/v1/item-management/offers?${qs}`);

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
