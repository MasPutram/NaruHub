import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const size = searchParams.get("size") || "50";
    const cursor = searchParams.get("cursor") || "9999-99-99 99:99:99.999999999999999-9999-9999-9999-999999999999";
    const direction = searchParams.get("direction") || "Next";
    const filter = searchParams.get("filter") || "DisplaySellingOrders";

    const qs = new URLSearchParams({
      cursorValue: cursor,
      pageSize: size,
      pageDirection: direction,
      isAscendingDateOrder: "false",
      ignorePendingReviewOrders: "true",
      displayFilter: filter,
    });
    const orderState = searchParams.get("orderState");
    if (orderState) qs.set("orderState", orderState);

    const res = await eldoradoFetch(`/api/v1/orders/me/seller/orders?${qs}`);

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
