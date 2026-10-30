import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createToken, sessionCookieHeader } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { email, wa_number, password } = await req.json();

  if (!email || !wa_number || !password) {
    return NextResponse.json({ error: "Semua field wajib diisi" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 });
  }

  const waClean = wa_number.replace(/\D/g, "");
  if (waClean.length < 10) {
    return NextResponse.json({ error: "Nomor WhatsApp tidak valid" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  const { data: existing } = await sb
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const { data: user, error } = await sb
    .from("users")
    .insert({
      email: email.toLowerCase().trim(),
      wa_number: waClean,
      password_hash: passwordHash,
      role: "user",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Gagal mendaftar" }, { status: 500 });
  }

  const token = createToken(undefined, "user", user.id);
  const res = NextResponse.json({ ok: true, role: "user" });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
