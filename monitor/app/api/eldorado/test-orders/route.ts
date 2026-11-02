import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    getTenantFromRequest(req);

    const endpoints = [
      "/api/v1/order-management/me/orders/sold/search?pageIndex=1&pageSize=5",
      "/api/v1/order-management/me/orders/search?pageIndex=1&pageSize=5",
      "/api/v1/orders/me/sold?pageIndex=1&pageSize=5",
      "/api/v1/order-management/sold/search?pageIndex=1&pageSize=5",
      "/api/v2/order-management/me/orders/sold/search?pageIndex=1&pageSize=5",
      "/api/v1/seller/orders/sold?pageIndex=1&pageSize=5",
      "/api/v1/item-management/me/orders/sold/search?pageIndex=1&pageSize=5",
      "/api/v1/item-management/me/orders/search?pageIndex=1&pageSize=5",
    ];

    const results = [];
    for (const ep of endpoints) {
      try {
        const res = await eldoradoFetch(ep);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = text.substring(0, 200); }
        results.push({ endpoint: ep, status: res.status, data: typeof data === 'object' ? Object.keys(data).join(',') : data });
      } catch (e: any) {
        results.push({ endpoint: ep, status: 'error', data: e.message });
      }
    }

    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
