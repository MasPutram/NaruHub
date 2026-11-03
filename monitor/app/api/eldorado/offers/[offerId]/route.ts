import { NextRequest, NextResponse } from "next/server";
import { eldoradoFetch } from "@/lib/eldorado";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    getTenantFromRequest(req);
    const { offerId } = await params;
    const body = await req.json();
    const { action } = body;

    let res: Response;

    if (action === "pause") {
      res = await eldoradoFetch(`/api/v1/item-management/me/offers/${offerId}/pause`, { method: "POST" });
    } else if (action === "resume") {
      res = await eldoradoFetch(`/api/v1/item-management/me/offers/${offerId}/resume`, { method: "POST" });
    } else if (action === "price") {
      res = await eldoradoFetch(`/api/v1/item-management/me/offers/${offerId}/price`, {
        method: "PUT",
        body: JSON.stringify({ amount: body.amount, currency: body.currency || "USD" }),
      });
    } else if (action === "quantity") {
      res = await eldoradoFetch(`/api/v1/item-management/me/offers/${offerId}/quantity`, {
        method: "PUT",
        body: JSON.stringify(body.quantity),
      });
    } else if (action === "details") {
      const { action: _, ...detailsPayload } = body;
      res = await eldoradoFetch(`/api/v1/item-management/me/offers/item/${offerId}/details`, {
        method: "PUT",
        body: JSON.stringify(detailsPayload),
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return NextResponse.json({ ok: res.ok, data }, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ offerId: string }> }) {
  try {
    getTenantFromRequest(req);
    const { offerId } = await params;

    const res = await eldoradoFetch(`/api/v1/item-management/me/offers/${offerId}`, {
      method: "DELETE",
    });

    return NextResponse.json({ ok: res.ok }, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
