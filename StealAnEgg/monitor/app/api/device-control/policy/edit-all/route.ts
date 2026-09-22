import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDevicePolicyKey, termuxDeviceKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { psLink, cols, rows, rejoinDelay, launchDelay } = body as {
      psLink?: string;
      cols?: number;
      rows?: number;
      rejoinDelay?: number;
      launchDelay?: number;
    };

    const deviceKeys: string[] = [];
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, { match: "termux:device:*", count: 100 });
      cursor = next;
      deviceKeys.push(...found);
    } while (cursor !== "0");

    let updated = 0;
    const gap = 16;
    const topPad = 50;

    for (const devKey of deviceKeys) {
      const deviceRaw = await redis.get<string>(devKey);
      if (!deviceRaw) continue;
      const device = typeof deviceRaw === "string" ? JSON.parse(deviceRaw) : deviceRaw;
      if (device.status !== "online") continue;

      const deviceId = devKey.replace("termux:device:", "");
      const policyRaw = await redis.get<string>(termuxDevicePolicyKey(deviceId));
      const existing = policyRaw ? (typeof policyRaw === "string" ? JSON.parse(policyRaw) : policyRaw) : {};

      let packages: string[] = (device.packages || []).map((p: any) =>
        typeof p === "string" ? p : p.pkg
      );
      let screen = device.screen || { width: 1080, height: 1920 };

      const merged: any = { ...existing, updatedAt: Date.now() };

      if (typeof rejoinDelay === "number") merged.rejoinDelay = Math.max(1, Math.min(600, rejoinDelay));
      if (typeof launchDelay === "number") merged.launchDelay = Math.max(0, Math.min(300, launchDelay));

      if (typeof psLink === "string") {
        const targets: Record<string, string> = {};
        const trimmed = psLink.trim();
        if (trimmed) {
          for (const pkg of packages) targets[pkg] = trimmed;
        }
        merged.packageTargets = targets;
      }

      if (cols && rows && cols > 0 && rows > 0 && packages.length > 0) {
        const sw = screen.width;
        const sh = screen.height;
        const cellW = Math.floor((sw - gap * (cols + 1)) / cols);
        const cellH = Math.floor((sh - topPad - gap * rows) / rows);
        const bounds: Record<string, string> = {};
        for (let i = 0; i < packages.length; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          if (row >= rows) break;
          const left = gap + col * (cellW + gap);
          const top = topPad + row * (cellH + gap);
          bounds[packages[i]] = `${left},${top},${left + cellW},${top + cellH}`;
        }
        merged.packageBounds = bounds;
      }

      await redis.set(termuxDevicePolicyKey(deviceId), JSON.stringify(merged));
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: deviceKeys.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
