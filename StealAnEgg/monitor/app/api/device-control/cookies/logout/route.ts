import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const COOKIES_KEY = "termux:cookies";

async function getCsrf(cookie: string): Promise<string> {
  // Use a safe endpoint to get CSRF without side effects (v2/logout would actually log out)
  const res = await fetch("https://auth.roblox.com/v1/logoutfromallsessionsandreauthenticate", {
    method: "POST",
    headers: {
      "Cookie": `.ROBLOSECURITY=${cookie}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  return res.headers.get("x-csrf-token") || "";
}

async function tryLogoutAll(cookie: string, csrf: string): Promise<{ status: number; body: string; endpoint: string }> {
  const endpoints = [
    "https://auth.roblox.com/v1/logoutfromallsessionsandreauthenticate",
    "https://auth.roblox.com/v1/sessions/logout-from-all-sessions-and-reauthenticate",
    "https://auth.roblox.com/v2/logoutfromallsessionsandreauthenticate",
  ];

  for (const url of endpoints) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Cookie": `.ROBLOSECURITY=${cookie}`,
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrf,
      },
      body: "{}",
    });
    const body = await res.text();
    if (res.status === 200) {
      return { status: 200, body, endpoint: url };
    }
    if (res.status !== 404 && res.status !== 405) {
      return { status: res.status, body, endpoint: url };
    }
  }

  // Fallback: logout current session only
  const res = await fetch("https://auth.roblox.com/v2/logout", {
    method: "POST",
    headers: {
      "Cookie": `.ROBLOSECURITY=${cookie}`,
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
    },
  });
  const body = await res.text();
  return { status: res.status, body, endpoint: "v2/logout (fallback)" };
}

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
    const csrf = await getCsrf(cookie);

    if (!csrf) {
      return NextResponse.json({ ok: false, error: "failed to get CSRF token" });
    }

    const result = await tryLogoutAll(cookie, csrf);

    // After logout-all succeeds, also kill the session used for this request
    // (logout-all keeps the requesting session alive)
    if (result.status === 200 && !result.endpoint.includes("v2/logout")) {
      await fetch("https://auth.roblox.com/v2/logout", {
        method: "POST",
        headers: {
          "Cookie": `.ROBLOSECURITY=${cookie}`,
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": csrf,
        },
      });
    }

    if (result.status === 200) {
      store[pkg] = { ...entry, loggedOut: true, loggedOutAt: Date.now() };
      await redis.set(COOKIES_KEY, JSON.stringify(store));
    }

    return NextResponse.json({
      ok: result.status === 200,
      httpStatus: result.status,
      endpoint: result.endpoint,
      body: result.body,
      pkg,
      username: entry.username,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
