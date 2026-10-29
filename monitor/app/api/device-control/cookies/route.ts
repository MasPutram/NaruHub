import { NextRequest, NextResponse } from "next/server";
import { redis, termuxCookiesKey, termuxDeviceKey, termuxDeviceMetaKey } from "@/lib/redis";
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

    for (const k of Object.keys(store)) {
      if (store[k].deviceId === deviceId) delete store[k];
    }

    const now = Date.now();
    for (const c of cookies) {
      if (!c.cookie) continue;
      const key = `${deviceId}:${c.pkg}`;
      store[key] = {
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
    const entries = Object.values(store) as Array<CookieEntry & { deviceId: string; updatedAt: number }>;

    const deviceIds = Array.from(new Set(entries.map((e: any) => e.deviceId).filter(Boolean)));
    const devices: Record<string, string> = {};
    await Promise.all(deviceIds.map(async (id) => {
      let name = "";
      const dRaw = await redis.get<string>(termuxDeviceKey(id, t));
      if (dRaw) {
        const d = typeof dRaw === "string" ? JSON.parse(dRaw) : dRaw;
        name = d.customName || d.hostname || "";
      }
      if (!name) {
        const metaRaw = await redis.get<string>(termuxDeviceMetaKey(id, t));
        if (metaRaw) {
          const m = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;
          name = m.customName || m.hostname || "";
        }
      }
      devices[id] = name || id.substring(0, 8);
    }));

    return NextResponse.json({ ok: true, cookies: entries, devices });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
