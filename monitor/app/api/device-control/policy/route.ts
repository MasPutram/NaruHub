import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDevicePolicyKey, termuxDeviceKey, accountKey, ONLINE_TIMEOUT_S } from "@/lib/redis";

// Scan every termux:pkgpause:<deviceId>:<pkg> key that currently exists (its
// TTL hasn't expired yet) and return just the package names. Agent uses this
// to skip auto-rejoin on packages under a temporary pause (e.g. "Siap Jual"
// flow where the operator is logging an account out).
async function readPausedPackages(deviceId: string): Promise<string[]> {
  const prefix = `termux:pkgpause:${deviceId}:`;
  const paused: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
    cursor = next;
    for (const k of keys) {
      const pkg = k.slice(prefix.length);
      if (pkg) paused.push(pkg);
    }
  } while (cursor !== "0");
  return paused;
}

// Packages on this device that have a target set but whose logged-in account
// is NOT currently online (not heartbeating in-game). The agent cross-checks
// this against its own "is the package still running?" view: running + account
// offline = wedged on an error/reconnect screen (a stuck join), which the
// drop-based auto-rejoin can't see because the process is technically alive.
// Only packages with a target are considered (rejoin needs somewhere to go).
async function readOfflineTargetPackages(
  deviceId: string,
  packageTargets: Record<string, string>
): Promise<string[]> {
  const targetPkgs = Object.keys(packageTargets);
  if (targetPkgs.length === 0) return [];
  const raw = await redis.get<string>(termuxDeviceKey(deviceId));
  if (!raw) return [];
  let device: any;
  try { device = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return []; }
  const packages = Array.isArray(device.packages) ? device.packages : [];
  const withUser = packages.filter(
    (p: any) => p && typeof p === "object" && p.username && packageTargets[p.pkg]
  );
  if (withUser.length === 0) return [];
  const vals = await redis.mget(...withUser.map((p: any) => accountKey(p.username)));
  const now = Date.now() / 1000;
  const offline: string[] = [];
  for (let i = 0; i < withUser.length; i++) {
    const v = vals[i];
    let online = false;
    if (v) {
      try {
        const a = typeof v === "string" ? JSON.parse(v) : v;
        online = now - (a.lastSeen || 0) <= ONLINE_TIMEOUT_S;
      } catch {}
    }
    if (!online) offline.push(withUser[i].pkg);
  }
  return offline;
}

// Per-device execution policy read/written by the dashboard AND the Termux
// agent. The agent polls this to know which packages to auto-rejoin, how
// long to wait between reconnect attempts, and the cap on retry count.
//
// GET  /api/device-control/policy?deviceId=X  -> current policy (or defaults)
// POST /api/device-control/policy             -> upsert policy fields

export const dynamic = "force-dynamic";

interface DevicePolicy {
  autoRejoinEnabled: boolean;
  rejoinDelay: number;          // seconds between crash detection and relaunch
  retryLimit: number;           // 0 = unlimited
  autoRejoinPackages: string[]; // per-package opt-in list; empty = all packages
  launchDelay: number;          // seconds between successive launches in a batch
  // Per-package Roblox target: package -> deep link (roblox://...) or a raw
  // http(s) URL. When set, both manual launches and auto-rejoin open this
  // exact place/private server instead of Roblox's home screen.
  packageTargets: Record<string, string>;
  // Per-package saved window bounds from Auto Grid: package -> "left,top,right,bottom"
  packageBounds: Record<string, string>;
  updatedAt: number;
}

const DEFAULT_POLICY: DevicePolicy = {
  autoRejoinEnabled: false,
  rejoinDelay: 10,
  retryLimit: 0,
  autoRejoinPackages: [],
  launchDelay: 10,
  packageTargets: {},
  packageBounds: {},
  updatedAt: 0,
};

function normalize(raw: any): DevicePolicy {
  const p = (raw && typeof raw === "object") ? raw : {};
  const rawTargets = (p.packageTargets && typeof p.packageTargets === "object") ? p.packageTargets : {};
  const packageTargets: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawTargets)) {
    if (typeof v === "string" && v.trim().length > 0) packageTargets[k] = String(v).trim();
  }
  const rawBounds = (p.packageBounds && typeof p.packageBounds === "object") ? p.packageBounds : {};
  const packageBounds: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawBounds)) {
    if (typeof v === "string" && /^\d+,\d+,\d+,\d+$/.test(v.trim())) packageBounds[k] = v.trim();
  }
  return {
    autoRejoinEnabled: !!p.autoRejoinEnabled,
    rejoinDelay: Math.max(1, Math.min(600, Number(p.rejoinDelay) || DEFAULT_POLICY.rejoinDelay)),
    retryLimit: Math.max(0, Math.min(100, Number(p.retryLimit) || 0)),
    autoRejoinPackages: Array.isArray(p.autoRejoinPackages)
      ? p.autoRejoinPackages.filter((x: any) => typeof x === "string")
      : [],
    launchDelay: Math.max(0, Math.min(300, Number(p.launchDelay) || DEFAULT_POLICY.launchDelay)),
    packageTargets,
    packageBounds,
    updatedAt: Number(p.updatedAt) || 0,
  };
}

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  // Public read (also read by the agent). Access key check only when the
  // request carries one -- keeps the endpoint usable from both admin UI
  // and license-keyed agent.
  const accessKey = process.env.ACCESS_KEY;
  const headerKey = req.headers.get("x-access-key");
  if (accessKey && headerKey && headerKey !== accessKey) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }

  try {
    const raw = await redis.get<string>(termuxDevicePolicyKey(deviceId));
    const parsed = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
    const policy = normalize(parsed);
    const pausedPackages = await readPausedPackages(deviceId);
    const offlinePackages = await readOfflineTargetPackages(deviceId, policy.packageTargets);
    return NextResponse.json({ ok: true, policy, pausedPackages, offlinePackages });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, policy: DEFAULT_POLICY, pausedPackages: [], offlinePackages: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId } = body;
    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    // Merge with existing policy so partial updates don't wipe untouched fields.
    const existingRaw = await redis.get<string>(termuxDevicePolicyKey(deviceId));
    const existing = existingRaw
      ? (typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw)
      : {};
    const merged = normalize({ ...existing, ...body, updatedAt: Date.now() });

    await redis.set(termuxDevicePolicyKey(deviceId), JSON.stringify(merged));
    return NextResponse.json({ ok: true, policy: merged });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
