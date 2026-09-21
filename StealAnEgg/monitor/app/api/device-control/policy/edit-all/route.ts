import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDevicePolicyKey, termuxDeviceKey } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { psLink, cols, rows } = body as {
      psLink?: string;
      cols?: number;
      rows?: number;
    };

    const policyKeys: string[] = [];
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, { match: "termux:policy:*", count: 100 });
      cursor = next;
      policyKeys.push(...found);
    } while (cursor !== "0");

    let updated = 0;
    const gap = 16;
    const topPad = 50;

    for (const key of policyKeys) {
      const raw = await redis.get<string>(key);
      if (!raw) continue;
      const existing = typeof raw === "string" ? JSON.parse(raw) : raw;

      const deviceId = key.replace("termux:policy:", "");
      const deviceRaw = await redis.get<string>(termuxDeviceKey(deviceId));
      let packages: string[] = [];
      let screen = { width: 1080, height: 1920 };
      if (deviceRaw) {
        const device = typeof deviceRaw === "string" ? JSON.parse(deviceRaw) : deviceRaw;
        packages = (device.packages || []).map((p: any) =>
          typeof p === "string" ? p : p.pkg
        );
        if (device.screen) screen = device.screen;
      }

      const merged: any = { ...existing, updatedAt: Date.now() };

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

      await redis.set(key, JSON.stringify(merged));
      updated++;
    }

    return NextResponse.json({ ok: true, updated, total: policyKeys.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
