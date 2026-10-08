import { NextRequest, NextResponse } from "next/server";
import { redis, termuxCookiesKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface CookieEntry {
  pkg: string;
  username: string;
  cookie: string;
}

export async function POST(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const t = tenant || undefined;
    const body = await req.json();
    const { deviceId, cookies } = body as {
      deviceId: string;
      cookies: CookieEntry[];
    };
    if (!deviceId || !cookies) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }

    const existing = await redis.get<Record<string, CookieEntry & { deviceId: string; updatedAt: number }>>(termuxCookiesKey(t));
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

    await redis.set(termuxCookiesKey(t), JSON.stringify(store));

    return NextResponse.json({ ok: true, stored: cookies.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const t = tenant || undefined;
    const raw = await redis.get<string>(termuxCookiesKey(t));
    const store = raw
      ? typeof raw === "string" ? JSON.parse(raw) : raw
      : {};
    const entries = Object.values(store);
    return NextResponse.json({ ok: true, cookies: entries });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
