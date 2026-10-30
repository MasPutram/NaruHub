import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",
  "/api/auth/register",
  "/api/monitor",
  "/api/anime-dice/monitor",
  "/api/anime-dice/catalog",
  "/api/check-access",
  "/api/termux",
  "/api/pet-icon",
  "/api/save-temp-image",
  "/api/store",
];

const AGENT_DEVICE_CONTROL_PATHS = [
  "/api/device-control/rejoin-plan",
  "/api/device-control/rejoin-ack",
  "/api/device-control/reset-session",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/poster") return true;
  if (AGENT_DEVICE_CONTROL_PATHS.includes(pathname)) return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

interface EdgeTokenResult {
  valid: boolean;
  tenant?: string;
  role?: string;
  userId?: string;
}

async function verifyTokenEdge(token: string, secret: string): Promise<EdgeTokenResult> {
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
    return {
      valid: true,
      tenant: payload.t || undefined,
      role: payload.r || "admin",
      userId: payload.uid,
    };
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

  // Role-based access control
  if (pathname.startsWith("/dashboard")) {
    if (result.role !== "admin") {
      const storeUrl = req.nextUrl.clone();
      storeUrl.pathname = "/store";
      return NextResponse.redirect(storeUrl);
    }
  }

  if (pathname.startsWith("/store")) {
    // Both admin and user can access store — no restriction
  }

  const response = NextResponse.next();
  response.headers.set("x-tenant", result.tenant || "__default__");
  response.headers.set("x-role", result.role || "admin");
  if (result.userId) response.headers.set("x-user-id", result.userId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
