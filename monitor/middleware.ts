import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/monitor",
  "/api/anime-dice/monitor",
  "/api/anime-dice/catalog",
  "/api/check-access",
  "/api/termux",
  "/api/pet-icon",
  "/api/save-temp-image",
];

// Agent-facing device-control endpoints: the Termux agent calls these with its
// access key (X-Access-Key), NOT a session cookie, so they must bypass the
// session-auth redirect below. Each verifies the access key itself. Everything
// else under /api/device-control/ stays session-protected (dashboard only).
const AGENT_DEVICE_CONTROL_PATHS = [
  "/api/device-control/rejoin-plan",
  "/api/device-control/rejoin-ack",
  "/api/device-control/reset-session",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/poster") return true;
  if (AGENT_DEVICE_CONTROL_PATHS.includes(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function verifyTokenEdge(token: string, secret: string): Promise<{ valid: boolean; tenant?: string }> {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return { valid: false };

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(b64));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const expected = btoa(binary)
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  if (sig !== expected) return { valid: false };

  try {
    const payload = JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp <= Date.now()) return { valid: false };
    return { valid: true, tenant: payload.t || null };
  } catch {
    return { valid: false };
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (pathname.startsWith("/_next/") || pathname.startsWith("/icons/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("naruhub_session")?.value;
  const secret = process.env.AUTH_SECRET;

  if (!secret || !token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  const result = await verifyTokenEdge(token, secret);
  if (!result.valid) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Inject tenant id as request header so API routes can read it without
  // re-parsing the cookie. "__default__" = owner/first key (no Redis prefix).
  const response = NextResponse.next();
  response.headers.set("x-tenant", result.tenant || "__default__");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
