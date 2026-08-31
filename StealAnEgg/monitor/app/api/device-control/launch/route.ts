import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxDeviceKey,
  termuxCommandQueueKey,
  TERMUX_COMMAND_QUEUE_TTL_S,
  TERMUX_COMMAND_QUEUE_MAX,
} from "@/lib/redis";

// Admin-only (protected by middleware session auth -- this path is NOT under
// /api/termux/ so it does not get the public device access-key bypass).
// Queues a "launch this Roblox clone in a specific screen cell" command that
// the Termux agent will pick up on its next command-poll tick.
export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deviceId, packageName, cols, rows, index } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }
    if (!packageName || typeof packageName !== "string") {
      return NextResponse.json({ ok: false, error: "packageName required" }, { status: 400 });
    }
    const c = Math.max(1, Number(cols) || 1);
    const r = Math.max(1, Number(rows) || 1);
    const i = Math.max(0, Number(index) || 0);

    const deviceRaw = await redis.get<string>(termuxDeviceKey(deviceId));
    if (!deviceRaw) {
      return NextResponse.json({ ok: false, error: "Device tidak ditemukan / offline" }, { status: 404 });
    }
    const device = typeof deviceRaw === "string" ? JSON.parse(deviceRaw) : deviceRaw;
    const screen = device.screen;
    if (!screen || !screen.width || !screen.height) {
      return NextResponse.json(
        { ok: false, error: "Device belum lapor ukuran layar (screen). Coba lagi setelah heartbeat berikutnya." },
        { status: 400 }
      );
    }

    const cellW = Math.floor(screen.width / c);
    const cellH = Math.floor(screen.height / r);
    const col = i % c;
    const row = Math.floor(i / c);
    const left = col * cellW;
    const top = row * cellH;
    const right = col === c - 1 ? screen.width : left + cellW;
    const bottom = row === r - 1 ? screen.height : top + cellH;

    const command = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "launch",
      package: packageName,
      bounds: `${left},${top},${right},${bottom}`,
      createdAt: Date.now(),
    };

    await redis.queuePush(termuxCommandQueueKey(deviceId), JSON.stringify(command), {
      ttl: TERMUX_COMMAND_QUEUE_TTL_S,
      maxLen: TERMUX_COMMAND_QUEUE_MAX,
    });

    return NextResponse.json({ ok: true, command });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
