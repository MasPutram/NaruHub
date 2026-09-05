import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDevicePolicyKey } from "@/lib/redis";

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
  updatedAt: number;
}

const DEFAULT_POLICY: DevicePolicy = {
  autoRejoinEnabled: false,
  rejoinDelay: 10,
  retryLimit: 0,
  autoRejoinPackages: [],
  launchDelay: 10,
  packageTargets: {},
  updatedAt: 0,
};

function normalize(raw: any): DevicePolicy {
  const p = (raw && typeof raw === "object") ? raw : {};
  const rawTargets = (p.packageTargets && typeof p.packageTargets === "object") ? p.packageTargets : {};
  const packageTargets: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawTargets)) {
    if (typeof v === "string" && v.trim().length > 0) packageTargets[k] = String(v).trim();
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
    return NextResponse.json({ ok: true, policy });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, policy: DEFAULT_POLICY }, { status: 500 });
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
