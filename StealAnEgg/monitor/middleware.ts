import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/monitor",
  "/api/check-access",
  "/api/termux",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function verifyTokenEdge(token: string, secret: string): Promise<boolean> {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;

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

  if (sig !== expected) return false;

  try {
    const payload = JSON.parse(atob(b64.replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp > Date.now();
  } catch {
    return false;
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

  if (!secret || !token || !(await verifyTokenEdge(token, secret))) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
