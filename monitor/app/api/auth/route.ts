import { NextRequest, NextResponse } from "next/server";
import { isValidKey, tenantFromKey, createToken, sessionCookieHeader } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { key } = await req.json();

  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "Key diperlukan" }, { status: 400 });
  }

  if (!isValidKey(key)) {
    return NextResponse.json({ error: "Access key tidak valid" }, { status: 401 });
  }

  const tenant = tenantFromKey(key);
  const token = createToken(tenant);
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookieHeader(token));
  return res;
}
