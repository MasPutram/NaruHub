import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxDeviceKey,
  termuxCommandQueueKey,
  termuxCommandLogKey,
  TERMUX_COMMAND_QUEUE_TTL_S,
  TERMUX_COMMAND_QUEUE_MAX,
  TERMUX_COMMAND_LOG_TTL_S,
  TERMUX_COMMAND_LOG_MAX,
} from "@/lib/redis";

// Admin-only (protected by middleware session auth -- this path is NOT under
// /api/termux/ so it does not get the public device access-key bypass).
// Queues "open this package" commands (one per package) that the Termux
// agent will pick up on its next command-poll tick, and records ONE
// aggregate entry in the device's command log for the web UI's "command
// console" panel.
export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept both the current batch shape and the older single-package
    // shape (packageName) for backward compatibility.
    const { deviceId, cols, rows } = body;
    const packageNames: string[] = Array.isArray(body.packageNames)
      ? body.packageNames
      : body.packageName
        ? [body.packageName]
        : [];
    // Opt-in: only set true from the Grid Layout modal's "Apply to device"
    // action. Normal "Launch selected" stays resize:false (just opens the
    // app) -- resizing is a separate, deliberate step so it can be tested
    // on one device before trusting it everywhere.
    const applyResize = body.resize === true;
    const launchDelay = Math.max(0, Number(body.launchDelay) || 5);

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }
    if (packageNames.length === 0) {
      return NextResponse.json({ ok: false, error: "packageNames required (non-empty array)" }, { status: 400 });
    }
    const c = Math.max(1, Number(cols) || 1);
    const r = Math.max(1, Number(rows) || 1);

    const deviceRaw = await redis.get<string>(termuxDeviceKey(deviceId));
    if (!deviceRaw) {
      return NextResponse.json({ ok: false, error: "Device tidak ditemukan / offline" }, { status: 404 });
    }
    const device = typeof deviceRaw === "string" ? JSON.parse(deviceRaw) : deviceRaw;
    const screen = device.screen;

    const queueKey = termuxCommandQueueKey(deviceId);
    const commands: any[] = [];
    for (let i = 0; i < packageNames.length; i++) {
      const packageName = packageNames[i];
      let bounds = "";
      if (screen && screen.width && screen.height) {
        // Uniform gap around and between cells. Formula matches the user's
        // mental model: "inti layar = screen - border, cell = inti / N".
        // Reserving (c+1) gaps horizontally means every edge + every seam
        // between cells has the SAME spacing -> layout looks consistent.
        const gap = 16;
        const topPad = 50; // status bar clearance (bigger than side gaps)
        const usableW = screen.width - gap * (c + 1);
        const usableH = screen.height - topPad - gap * r;
        const cellW = Math.floor(usableW / c);
        const cellH = Math.floor(usableH / r);
        const col = i % c;
        const row = Math.floor(i / c);
        const left = gap + col * (cellW + gap);
        const top = topPad + row * (cellH + gap);
        const right = left + cellW;
        const bottom = top + cellH;
        bounds = `${left},${top},${right},${bottom}`;
      }

      const command = {
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        type: "launch",
        package: packageName,
        bounds,
        resize: applyResize,
        launchDelay,
        createdAt: Date.now(),
      };
      commands.push(command);
      await redis.queuePush(queueKey, JSON.stringify(command), {
        ttl: TERMUX_COMMAND_QUEUE_TTL_S,
        maxLen: TERMUX_COMMAND_QUEUE_MAX,
      });
    }

    const logEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      action: applyResize ? "launch+resize" : "launch",
      packages: packageNames,
    };
    await redis.queuePush(termuxCommandLogKey(deviceId), JSON.stringify(logEntry), {
      ttl: TERMUX_COMMAND_LOG_TTL_S,
      maxLen: TERMUX_COMMAND_LOG_MAX,
    });

    return NextResponse.json({ ok: true, commands });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
