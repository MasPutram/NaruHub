import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/api/monitor",
  "/api/check-access",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function verifyTokenEdge(token: string, secret: string): boolean {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Static assets and Next.js internals
  if (pathname.startsWith("/_next/") || pathname.startsWith("/icons/") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("naruhub_session")?.value;
  const secret = process.env.AUTH_SECRET;

  if (!secret || !token || !verifyTokenEdge(token, secret)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
