import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = getTenantFromRequest(req);
  if (!auth.authed || !auth.userId) {
    return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
  }

  const { product_id, notes } = await req.json();
  if (!product_id) {
    return NextResponse.json({ error: "product_id diperlukan" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: product } = await sb
    .from("products")
    .select("id, status, name, price")
    .eq("id", product_id)
    .single();

  if (!product || product.status !== "published") {
    return NextResponse.json({ error: "Produk tidak tersedia" }, { status: 404 });
  }

  const { data: order, error } = await sb
    .from("orders")
    .insert({
      user_id: auth.userId,
      product_id,
      status: "pending",
      notes: notes || null,
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Gagal membuat order" }, { status: 500 });
  }

  const waNumber = process.env.ADMIN_WA_NUMBER || "6285172332233";
  const waText = `Halo kak, saya mau order:\n\nProduk: ${product.name}\nHarga: Rp ${product.price.toLocaleString("id-ID")}\nOrder ID: ${order.id}\n\nMohon konfirmasinya ya!`;
  const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}`;

  return NextResponse.json({
    ok: true,
    order,
    wa_link: waLink,
  });
}

export async function GET(req: NextRequest) {
  const auth = getTenantFromRequest(req);
  if (!auth.authed || !auth.userId) {
    return NextResponse.json({ error: "Login diperlukan" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("orders")
    .select("id, status, notes, created_at, products(id, name, price, images)")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Gagal memuat orders" }, { status: 500 });
  }

  return NextResponse.json({ orders: data || [] });
}
