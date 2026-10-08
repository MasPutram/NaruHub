import { NextRequest, NextResponse } from "next/server";
import { redis, scanPattern } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface CookieEntry {
  pkg: string;
  username: string;
  cookie: string;
}

const COOKIES_BASE = "termux:cookies";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { deviceId, cookies } = body as {
      deviceId: string;
      cookies: CookieEntry[];
    };
    if (!deviceId || !cookies) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }

    const cookiesKey = scanPattern(tenant, COOKIES_BASE);
    const existing = await redis.get<Record<string, CookieEntry & { deviceId: string; updatedAt: number }>>(cookiesKey);
    const store: Record<string, CookieEntry & { deviceId: string; updatedAt: number }> =
      (existing && typeof existing === "object") ? existing : {};

    const now = Date.now();
    for (const c of cookies) {
      if (!c.cookie) continue;
      store[c.pkg] = {
        pkg: c.pkg,
        username: c.username || "",
        cookie: c.cookie,
        deviceId,
        updatedAt: now,
      };
    }

    await redis.set(cookiesKey, JSON.stringify(store));

    return NextResponse.json({ ok: true, stored: cookies.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
