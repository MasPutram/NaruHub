import crypto from "crypto";

const COOKIE_NAME = "naruhub_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET env not set");
  return s;
}

// ── Multi-key tenant helpers ───────────────────────────────────────────

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

export function getDefaultKey(): string | undefined {
  return getValidKeys()[0];
}

export function tenantFromKey(key: string): string | undefined {
  const def = getDefaultKey();
  if (def && key === def) return undefined;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

// ── Password hashing (scrypt, Node built-in) ──────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(plain, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) return resolve(false);
    crypto.scrypt(plain, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(crypto.timingSafeEqual(Buffer.from(key, "hex"), derived));
    });
  });
}

// ── Session token (HMAC-signed) ───────────────────────────────────────
// Payload: t=tenant, r=role (admin/user), uid=user UUID, exp=expiry

export type TokenRole = "admin" | "user";

export function createToken(tenant: string | undefined, role: TokenRole = "admin", userId?: string): string {
  const payload: Record<string, unknown> = { t: tenant || "", r: role, exp: Date.now() + MAX_AGE * 1000 };
  if (userId) payload.uid = userId;
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

export interface TokenResult {
  valid: boolean;
  tenant?: string;
  role?: TokenRole;
  userId?: string;
}

export function verifyToken(token: string): TokenResult {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return { valid: false };
  const expected = crypto.createHmac("sha256", getSecret()).update(b64).digest("base64url");
  if (sig !== expected) return { valid: false };
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString());
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

export function sessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export function clearCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── Tenant extraction from request ────────────────────────────────────

export interface RequestAuth {
  tenant: string | undefined;
  authed: boolean;
  role?: TokenRole;
  userId?: string;
  error?: string;
}

export function getTenantFromRequest(req: { headers: { get(name: string): string | null }; cookies?: { get(name: string): { value: string } | undefined } }): RequestAuth {
  const headerKey = req.headers.get("x-access-key");
  if (headerKey) {
    if (!isValidKey(headerKey)) return { tenant: undefined, authed: false, error: "Unauthorized" };
    return { tenant: tenantFromKey(headerKey), authed: true, role: "admin" };
  }
  const t = req.headers.get("x-tenant");
  const r = (req.headers.get("x-role") || "admin") as TokenRole;
  const uid = req.headers.get("x-user-id") || undefined;
  if (t) return { tenant: t === "__default__" ? undefined : t, authed: true, role: r, userId: uid };
  const token = req.cookies?.get("naruhub_session")?.value;
  if (token) {
    const result = verifyToken(token);
    if (result.valid) return { tenant: result.tenant, authed: true, role: result.role, userId: result.userId };
  }
  return { tenant: undefined, authed: false, error: "Not authenticated" };
}
