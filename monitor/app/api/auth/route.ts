import { NextRequest, NextResponse } from "next/server";
import { isValidKey, tenantFromKey, createToken, sessionCookieHeader, verifyPassword } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Admin login via access key
  if (body.key) {
    const { key } = body;
    if (typeof key !== "string") {
      return NextResponse.json({ error: "Key diperlukan" }, { status: 400 });
    }
    if (!isValidKey(key)) {
      return NextResponse.json({ error: "Access key tidak valid" }, { status: 401 });
    }
    const tenant = tenantFromKey(key);
    const token = createToken(tenant, "admin");
    const res = NextResponse.json({ ok: true, role: "admin" });
    res.headers.set("Set-Cookie", sessionCookieHeader(token));
    return res;
  }

  // User login via email + password
  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email dan password diperlukan" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  const { data: user, error } = await sb
    .from("users")
    .select("id, email, password_hash, role")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  }

  const token = createToken(undefined, user.role || "user", user.id);
  const res = NextResponse.json({ ok: true, role: user.role || "user" });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
