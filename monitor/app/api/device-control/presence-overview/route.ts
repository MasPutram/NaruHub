import { NextRequest, NextResponse } from "next/server";
import { redis, PRESENCE_FRESH_S, deviceAccountsKey, DEVICE_ACCOUNTS_TTL_S } from "@/lib/redis";

// Global fleet overview: every clone's current Roblox server (jobId) across ALL
// devices, so the operator can see the spread at a glance and spot any two
// clones sitting in the same server. Admin-only (session-protected).
//
// A clone is resolved to its device by ACCOUNT NAME (which agent device lists
// that username), NOT by the deviceId in the presence record -- the in-game
// script reports a different deviceId than the agent, so keying on it would
// show raw hex groups. Account names are globally unique, so this is stable.
// Derive a friendly device name from the account username pattern.
// BlekokGong{N} → SAE{groupStart} where groupStart = floor((N-1)/10)*10+1
// e.g. BlekokGong161-170 → SAE161, BlekokGong21-30 → SAE21
function deriveDeviceName(account: string): string | null {
  const m = account.match(/^BlekokGong(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (isNaN(n) || n <= 0) return null;
  const groupStart = Math.floor((n - 1) / 10) * 10 + 1;
  return `SAE${groupStart}`;
}

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    // account -> { name, deviceId } from the live device records' package lists.
    const devKeys: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:*", count: 200 });
      cursor = next;
      for (const k of keys) if (!k.startsWith("termux:device:meta:")) devKeys.push(k);
    } while (cursor !== "0");
    const accountToDev: Record<string, { name: string; deviceId: string }> = {};
    if (devKeys.length > 0) {
      const devVals = await redis.mget(...devKeys);
      for (let i = 0; i < devKeys.length; i++) {
        const id = devKeys[i].replace(/^termux:device:/, "");
        const v = devVals[i];
        if (!v) continue;
        try {
          const d = typeof v === "string" ? JSON.parse(v) : v;
          const name = d.customName || d.hostname || id.slice(0, 8);
          const packages: any[] = Array.isArray(d.packages) ? d.packages : [];
          for (const p of packages) {
            const u = p && typeof p === "object" ? p.username : null;
            if (u) accountToDev[u] = { name, deviceId: id };
          }
        } catch {}
      }
    }

    // Collect presence, dedupe by account (in-game script + agent can write two
    // keys for one clone), keeping the freshest.
    const presKeys: string[] = [];
    cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "presence:*", count: 300 });
      cursor = next;
      presKeys.push(...keys);
    } while (cursor !== "0");
    const presVals = presKeys.length > 0 ? await redis.mget(...presKeys) : [];
    const byAccount = new Map<string, any>();
    for (const v of presVals) {
      if (!v) continue;
      try {
        const o = typeof v === "string" ? JSON.parse(v) : v;
        if (!o.account) continue;
        const prev = byAccount.get(o.account);
        if (!prev || (o.ts || 0) > (prev.ts || 0)) byAccount.set(o.account, o);
      } catch {}
    }

    // Build device-id → name lookup from device + meta records for fallback
    // when an account's presence has a deviceId but the agent didn't list
    // the account in its packages (no agent, or prefs.xml detection failed).
    const deviceIdToName: Record<string, string> = {};
    for (const [account, dev] of Object.entries(accountToDev)) {
      deviceIdToName[dev.deviceId] = dev.name;
    }
    // Also check device meta keys (persist even after device goes offline)
    const metaKeys: string[] = [];
    cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "termux:device:meta:*", count: 200 });
      cursor = next;
      metaKeys.push(...keys);
    } while (cursor !== "0");
    if (metaKeys.length > 0) {
      const metaVals = await redis.mget(...metaKeys);
      for (let i = 0; i < metaKeys.length; i++) {
        const id = metaKeys[i].replace(/^termux:device:meta:/, "");
        if (deviceIdToName[id]) continue;
        const v = metaVals[i];
        if (!v) continue;
        try {
          const m = typeof v === "string" ? JSON.parse(v) : v;
          deviceIdToName[id] = m.customName || m.hostname || id.slice(0, 8);
        } catch {}
      }
    }

    // Enrich accountToDev from game heartbeat mappings (device-accounts:*)
    // so accounts detected via /api/monitor show up even without agent.
    const daKeys: string[] = [];
    cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: "device-accounts:*", count: 200 });
      cursor = next;
      daKeys.push(...keys);
    } while (cursor !== "0");
    if (daKeys.length > 0) {
      const daVals = await redis.mget(...daKeys);
      const cutoff = Date.now() - DEVICE_ACCOUNTS_TTL_S * 1000;
      for (let i = 0; i < daKeys.length; i++) {
        const devId = daKeys[i].replace(/^device-accounts:/, "");
        const v = daVals[i];
        if (!v) continue;
        try {
          const map: Record<string, number> = typeof v === "string" ? JSON.parse(v) : v;
          for (const [acct, ts] of Object.entries(map)) {
            if (ts < cutoff) continue;
            if (!accountToDev[acct]) {
              accountToDev[acct] = {
                name: deviceIdToName[devId] || deriveDeviceName(acct) || devId.slice(0, 8),
                deviceId: devId,
              };
            }
          }
        } catch {}
      }
    }

    const now = Date.now();
    const rows = Array.from(byAccount.values())
      .map((o: any) => {
        // Resolve device: agent package list → game heartbeat mapping → presence record's own deviceId
        let dev = accountToDev[o.account];
        if (!dev && o.deviceId) {
          dev = {
            name: deviceIdToName[o.deviceId] || deriveDeviceName(o.account) || o.deviceId.slice(0, 8),
            deviceId: o.deviceId,
          };
        }
        if (!dev) return null;
        const inGame = o.ts && now - o.ts < PRESENCE_FRESH_S * 1000;
        return {
          account: o.account as string,
          deviceId: dev.deviceId,
          deviceName: dev.name,
          jobId: (o.jobId || "") as string,
          placeId: (o.placeId || "") as string,
          lastSeen: (o.ts || 0) as number,
          inGame: !!inGame,
        };
      })
      .filter(Boolean) as { account: string; deviceId: string; deviceName: string; jobId: string; placeId: string; lastSeen: number; inGame: boolean }[];

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
