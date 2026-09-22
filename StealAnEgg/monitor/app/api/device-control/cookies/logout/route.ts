import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const COOKIES_KEY = "termux:cookies";

export async function POST(req: NextRequest) {
  try {
    const { pkg } = (await req.json()) as { pkg: string };
    if (!pkg) {
      return NextResponse.json({ ok: false, error: "missing pkg" }, { status: 400 });
    }

    const raw = await redis.get<string>(COOKIES_KEY);
    const store: Record<string, any> = raw
      ? typeof raw === "string" ? JSON.parse(raw) : raw
      : {};

    const entry = store[pkg];
    if (!entry?.cookie) {
      return NextResponse.json({ ok: false, error: "cookie not found for " + pkg }, { status: 404 });
    }

    const cookie = entry.cookie;

    // Step 1: Get CSRF token
    const csrfRes = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Type": "application/json",
      },
    });
    const csrfToken = csrfRes.headers.get("x-csrf-token") || "";

    if (!csrfToken) {
      return NextResponse.json({ ok: false, error: "failed to get CSRF token", status: csrfRes.status });
    }

    // Step 2: Logout current session (v2/logout)
    const logoutRes = await fetch("https://auth.roblox.com/v2/logout", {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrfToken,
      },
    });

    const logoutStatus = logoutRes.status;
    let logoutBody = "";
    try { logoutBody = await logoutRes.text(); } catch {}

    if (logoutStatus === 200) {
      // Mark cookie as logged out
      store[pkg] = { ...entry, loggedOut: true, loggedOutAt: Date.now() };
      await redis.set(COOKIES_KEY, JSON.stringify(store));
    }

    return NextResponse.json({
      ok: logoutStatus === 200,
      httpStatus: logoutStatus,
      body: logoutBody,
      pkg,
      username: entry.username,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
