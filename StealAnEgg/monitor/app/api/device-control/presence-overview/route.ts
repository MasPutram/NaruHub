import { NextRequest, NextResponse } from "next/server";
import { redis, PRESENCE_FRESH_S } from "@/lib/redis";

// Global fleet overview: every clone's current Roblox server (jobId) across ALL
// devices, so the operator can see the spread at a glance and spot any two
// clones sitting in the same server. Admin-only (session-protected).
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    // Collect all presence entries (presence:<deviceId>:<account>).
    const presKeys: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "presence:*", count: 300 });
      cursor = next;
      presKeys.push(...keys);
    } while (cursor !== "0");

    // Device id -> friendly name (from the live device records).
    const devKeys: string[] = [];
    cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 200 });
      cursor = next;
      for (const k of keys) if (!k.startsWith("termux:device:meta:")) devKeys.push(k);
    } while (cursor !== "0");
    const nameById: Record<string, string> = {};
    if (devKeys.length > 0) {
      const devVals = await redis.mget(...devKeys);
      for (let i = 0; i < devKeys.length; i++) {
        const id = devKeys[i].replace(/^termux:device:/, "");
        const v = devVals[i];
        if (!v) continue;
        try {
          const d = typeof v === "string" ? JSON.parse(v) : v;
          nameById[id] = d.customName || d.hostname || id.slice(0, 8);
        } catch {}
      }
    }

    const now = Date.now();
    const presVals = presKeys.length > 0 ? await redis.mget(...presKeys) : [];
    const rows: {
      account: string;
      deviceId: string;
      deviceName: string;
      jobId: string;
      placeId: string;
      lastSeen: number;
      inGame: boolean;
    }[] = [];
    for (const v of presVals) {
      if (!v) continue;
      try {
        const o = typeof v === "string" ? JSON.parse(v) : v;
        const inGame = o.ts && now - o.ts < PRESENCE_FRESH_S * 1000;
        rows.push({
          account: o.account || "",
          deviceId: o.deviceId || "",
          deviceName: nameById[o.deviceId] || (o.deviceId || "").slice(0, 8),
          jobId: o.jobId || "",
          placeId: o.placeId || "",
          lastSeen: o.ts || 0,
          inGame: !!inGame,
        });
      } catch {}
    }

    // Flag collisions: a jobId held by 2+ in-game clones.
    const countByJob: Record<string, number> = {};
    for (const r of rows) if (r.inGame && r.jobId) countByJob[r.jobId] = (countByJob[r.jobId] || 0) + 1;
    const withCollision = rows.map((r) => ({ ...r, collision: !!(r.inGame && r.jobId && countByJob[r.jobId] > 1) }));

    withCollision.sort((a, b) => a.account.localeCompare(b.account, undefined, { numeric: true }));
    const collisionServers = Object.values(countByJob).filter((c) => c > 1).length;

    return NextResponse.json({
      ok: true,
      rows: withCollision,
      total: rows.length,
      inGame: rows.filter((r) => r.inGame).length,
      collisionServers,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, rows: [] }, { status: 500 });
  }
}
