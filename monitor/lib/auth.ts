import crypto from "crypto";

const COOKIE_NAME = "naruhub_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET env not set");
  return s;
}

// ── Multi-key tenant helpers ───────────────────────────────────────────
// ACCESS_KEYS env: comma-separated list of valid keys.
// Falls back to legacy ACCESS_KEY (single key) for backward compat.

export function getValidKeys(): string[] {
  const multi = process.env.ACCESS_KEYS;
  if (multi) return multi.split(",").map((k) => k.trim()).filter(Boolean);
  const single = process.env.ACCESS_KEY;
  if (single) return [single.trim()];
  return [];
}

export function isValidKey(key: string): boolean {
  return getValidKeys().includes(key);
}

// The first key in the list is the "owner" key — it uses no Redis prefix
// so all existing data stays accessible without migration.
export function getDefaultKey(): string | undefined {
  return getValidKeys()[0];
}

// Derive a short tenant id from a key. The first/default key returns
// undefined (no prefix) to preserve existing non-prefixed Redis data.
// Additional keys get a hash-based prefix for isolation.
export function tenantFromKey(key: string): string | undefined {
  const def = getDefaultKey();
  if (def && key === def) return undefined;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

// ── Session token (HMAC-signed JWT-like) ───────────────────────────────
// Payload now carries `t` (tenant hash) instead of `u` (username).

export function createToken(tenant: string | undefined): string {
  const payload = JSON.stringify({ t: tenant || "", exp: Date.now() + MAX_AGE * 1000 });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

// Server-side token verification + tenant extraction.
// Returns { valid: true, tenant } or { valid: false }.
// tenant is undefined for the default/owner key (no Redis prefix).
export function verifyToken(token: string): { valid: boolean; tenant?: string } {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return { valid: false };
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  if (sig !== expected) return { valid: false };
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (payload.exp <= Date.now()) return { valid: false };
    return { valid: true, tenant: payload.t || undefined };
  } catch {
    return { valid: false };
  }
}

export function sessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── Tenant extraction from request ─────────────────────────────────────
// Import NextRequest at the type level only (Edge compat: crypto import
// above is Node-only, but these helpers work in both runtimes).

// Returns { tenant, authed }. tenant is undefined for the default/owner key
// (no Redis prefix — existing data stays accessible). tenant is a hash string
// for additional keys. authed is true when the caller is authenticated.
export function getTenantFromRequest(req: { headers: { get(name: string): string | null }; cookies?: { get(name: string): { value: string } | undefined } }): { tenant: string | undefined; authed: boolean; error?: string } {
  // Path 1: X-Access-Key header (agent/script calls)
  const headerKey = req.headers.get("x-access-key");
  if (headerKey) {
    if (!isValidKey(headerKey)) return { tenant: undefined, authed: false, error: "Unauthorized" };
    return { tenant: tenantFromKey(headerKey), authed: true };
  }
  // Path 2: x-tenant header injected by middleware (value "__default__" = owner key)
  const t = req.headers.get("x-tenant");
  if (t) return { tenant: t === "__default__" ? undefined : t, authed: true };
  // Path 3: fallback — decode cookie directly
  const token = req.cookies?.get("naruhub_session")?.value;
  if (token) {
    const result = verifyToken(token);
    if (result.valid) return { tenant: result.tenant, authed: true };
  }
  return { tenant: undefined, authed: false, error: "Not authenticated" };
}
