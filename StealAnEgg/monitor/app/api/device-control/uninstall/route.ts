import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxCommandQueueKey,
  TERMUX_COMMAND_QUEUE_TTL_S,
  TERMUX_COMMAND_QUEUE_MAX,
} from "@/lib/redis";

// Queue an uninstall command per package. Agent runs `pm uninstall <pkg>`
// via su. Accepts both a single packageName and a packageNames[] array so
// the UI can batch-uninstall selected clones in one call.

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = String(body.deviceId || "");
    if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });

    const packageNames: string[] = Array.isArray(body.packageNames)
      ? body.packageNames.filter((x: any) => typeof x === "string" && x.trim())
      : body.packageName
        ? [String(body.packageName)]
        : [];
    if (packageNames.length === 0) {
      return NextResponse.json({ ok: false, error: "packageNames required" }, { status: 400 });
    }

    // Guard against typos or exploit attempts -- only allow real Android
    // package names (letters/digits/dots, must contain at least one dot).
    const bad = packageNames.filter((p) => !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(p));
    if (bad.length > 0) {
      return NextResponse.json({ ok: false, error: `invalid package name(s): ${bad.join(", ")}` }, { status: 400 });
    }

    const queueKey = termuxCommandQueueKey(deviceId);
    const commands: any[] = [];
    for (const pkg of packageNames) {
      const command = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "uninstall",
        package: pkg,
        createdAt: Date.now(),
      };
      commands.push(command);
      await redis.queuePush(queueKey, JSON.stringify(command), {
        ttl: TERMUX_COMMAND_QUEUE_TTL_S,
        maxLen: TERMUX_COMMAND_QUEUE_MAX,
      });
    }

    return NextResponse.json({ ok: true, count: commands.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
