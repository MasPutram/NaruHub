import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const category = url.searchParams.get("category");
  const search = url.searchParams.get("search");
  const sort = url.searchParams.get("sort") || "newest";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 50);
  const offset = (page - 1) * limit;

  const sb = getSupabaseAdmin();
  let query = sb
    .from("products")
    .select("id, name, description, category, game, price, images, status, stock_count, sold_count, created_at", { count: "exact" })
    .eq("status", "published");

  if (category) query = query.eq("category", category);
  if (search) query = query.ilike("name", `%${search}%`);

  if (sort === "price_asc") query = query.order("price", { ascending: true });
  else if (sort === "price_desc") query = query.order("price", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: "Gagal memuat produk" }, { status: 500 });
  }

  return NextResponse.json({
    products: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}
