import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxCommandQueueKey,
  TERMUX_COMMAND_QUEUE_TTL_S,
  TERMUX_COMMAND_QUEUE_MAX,
  autoexecDeployedKey,
} from "@/lib/redis";

// Just place a .lua file into the executor autoexec directories on the
// target device, or remove one. No library, no history -- the operator
// composes each script inline in the UI and hits Deploy.
//
// POST   /api/device-control/autoexec  { deviceId, filename, content }
// DELETE /api/device-control/autoexec?deviceId=X&filename=Y

export const dynamic = "force-dynamic";

function sanitizeFilename(name: string): string {
  const trimmed = String(name || "").trim();
  // Strip path separators + control chars so the agent can never be
  // tricked into writing outside the autoexec dirs.
  return trimmed.replace(/[\\/\x00-\x1f]+/g, "");
}

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deviceId = String(body.deviceId || "");
    const filename = sanitizeFilename(body.filename);
    const content = String(body.content || "");

    if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    if (!filename) return NextResponse.json({ ok: false, error: "filename required" }, { status: 400 });
    if (!filename.toLowerCase().endsWith(".lua")) {
      return NextResponse.json({ ok: false, error: "filename must end with .lua" }, { status: 400 });
    }
    if (content.length > 200_000) {
      return NextResponse.json({ ok: false, error: "script too large (max 200KB)" }, { status: 400 });
    }

    const command = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "autoexec_write",
      filename,
      content,
      createdAt: Date.now(),
    };
    await redis.queuePush(termuxCommandQueueKey(deviceId), JSON.stringify(command), {
      ttl: TERMUX_COMMAND_QUEUE_TTL_S,
      maxLen: TERMUX_COMMAND_QUEUE_MAX,
    });
    // Track deployment so the UI can show "deployed to this device" without
    // asking the agent to scan. Uses the filename (not the library slug) so
    // ad-hoc deploys without a library entry are trackable too.
    await redis.sadd(autoexecDeployedKey(deviceId), filename);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    const filename = sanitizeFilename(req.nextUrl.searchParams.get("filename") || "");
    if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    if (!filename) return NextResponse.json({ ok: false, error: "filename required" }, { status: 400 });

    const command = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: "autoexec_remove",
      filename,
      createdAt: Date.now(),
    };
    await redis.queuePush(termuxCommandQueueKey(deviceId), JSON.stringify(command), {
      ttl: TERMUX_COMMAND_QUEUE_TTL_S,
      maxLen: TERMUX_COMMAND_QUEUE_MAX,
    });
    await redis.srem(autoexecDeployedKey(deviceId), filename);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

// List which filenames are deployed to this device (from our own tracking).
export async function GET(req: NextRequest) {
  try {
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    const files = await redis.smembers(autoexecDeployedKey(deviceId));
    return NextResponse.json({ ok: true, files });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, files: [] }, { status: 500 });
  }
}
