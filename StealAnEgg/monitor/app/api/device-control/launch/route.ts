import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  termuxDeviceKey,
  termuxDevicePolicyKey,
  termuxCommandQueueKey,
  termuxCommandLogKey,
  lastLaunchKey,
  LAST_LAUNCH_TTL_S,
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
    const launchDelay = Math.max(0, Number(body.launchDelay) || 10);
    // Per-package Roblox target: package name -> deep link. When set, the
    // agent opens that place/private server directly via VIEW intent; when
    // absent, agent falls back to a plain MAIN launch (Roblox home screen).
    const targets: Record<string, string> = (body.targets && typeof body.targets === "object") ? body.targets : {};

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

    // Read saved bounds from policy (set by Auto Grid).
    let savedBounds: Record<string, string> = {};
    if (!applyResize) {
      try {
        const policyRaw = await redis.get<string>(termuxDevicePolicyKey(deviceId));
        if (policyRaw) {
          const pol = typeof policyRaw === "string" ? JSON.parse(policyRaw) : policyRaw;
          if (pol.packageBounds && typeof pol.packageBounds === "object") savedBounds = pol.packageBounds;
        }
      } catch {}
    }

    // Spread: assign each launching clone a DIFFERENT Roblox server so they
    // don't all pile into one (they'd steal from each other -> less income).
    // Opt-in via body.spread. Best-effort: excludes servers this device's own
    // clones already sit in (presence) + assigns distinct within this batch;
    // if the server list can't be fetched or runs out, those packages keep
    // their plain place target (random server) -- never worse than before.
    const spread = body.spread === true;
    const assigned: Record<string, string> = {};
    if (spread) {
      const byPlace: Record<string, string[]> = {};
      for (const pkg of packageNames) {
        const m = (targets[pkg] || "").match(/placeId=(\d+)/);
        if (m) (byPlace[m[1]] ||= []).push(pkg);
      }
      // Occupied jobIds from this device's own presence.
      const occupiedByPlace: Record<string, Set<string>> = {};
      try {
        const presPrefix = `presence:${deviceId}:`;
        let cur = "0";
        const keys: string[] = [];
        do {
          const [next, ks] = await redis.scan(cur, { match: `${presPrefix}*`, count: 100 });
          cur = next;
          keys.push(...ks);
        } while (cur !== "0");
        if (keys.length > 0) {
          const vals = await redis.mget(...keys);
          const now = Date.now();
          for (const v of vals) {
            if (!v) continue;
            try {
              const o = JSON.parse(v as string);
              if (o.placeId && o.jobId && o.ts && now - o.ts < 600 * 1000) {
                (occupiedByPlace[o.placeId] ||= new Set()).add(o.jobId);
              }
            } catch {}
          }
        }
      } catch {}
      for (const [placeId, pkgs] of Object.entries(byPlace)) {
        const occupied = occupiedByPlace[placeId] || new Set<string>();
        let available: string[] = [];
        try {
          const url = `https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Asc&limit=100`;
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 6000);
          const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
          clearTimeout(to);
          if (res.ok) {
            const data = await res.json();
            const servers: any[] = Array.isArray(data?.data) ? data.data : [];
            available = servers
              .filter((s) => s && s.id && !occupied.has(s.id) && typeof s.playing === "number" && s.playing < (s.maxPlayers || 999))
              // Populated servers (>=5 players) first -- real victims + clones
              // spread across busy servers instead of all landing on empty ones.
              .sort((a, b) => {
                const ap = (a.playing || 0) >= 5 ? 0 : 1;
                const bp = (b.playing || 0) >= 5 ? 0 : 1;
                if (ap !== bp) return ap - bp;
                return (a.ping || 9999) - (b.ping || 9999);
              })
              .map((s) => String(s.id));
          }
        } catch {}
        for (let k = 0; k < pkgs.length && k < available.length; k++) {
          assigned[pkgs[k]] = available[k];
        }
      }
    }

    const queueKey = termuxCommandQueueKey(deviceId);
    const commands: any[] = [];
    for (let i = 0; i < packageNames.length; i++) {
      const packageName = packageNames[i];
      let bounds = "";
      let useResize = applyResize;

      if (applyResize && screen && screen.width && screen.height) {
        const gap = 16;
        const topPad = 50;
        const cellW = Math.floor((screen.width - gap * (c + 1)) / c);
        const cellH = Math.floor((screen.height - topPad - gap * r) / r);
        const col = i % c;
        const row = Math.floor(i / c);
        const left = gap + col * (cellW + gap);
        const top = topPad + row * (cellH + gap);
        const right = left + cellW;
        const bottom = top + cellH;
        bounds = `${left},${top},${right},${bottom}`;
      } else if (!applyResize && savedBounds[packageName]) {
        bounds = savedBounds[packageName];
        useResize = true;
      } else if (!applyResize && screen && screen.width && screen.height) {
        // No saved bounds for this package -> DON'T let it open fullscreen.
        // A fullscreen Roblox launch collapses the other floating clones,
        // which the operator sees as the running accounts getting force-
        // closed. Compute a grid tile from cols/rows so every launch opens
        // as a freeform window instead (HipHub keeps every clone floating,
        // which is why opening 10 there never closes the rest).
        const gap = 16;
        const topPad = 50;
        const cellW = Math.floor((screen.width - gap * (c + 1)) / c);
        const cellH = Math.floor((screen.height - topPad - gap * r) / r);
        const col = i % c;
        const row = Math.floor(i / c);
        const left = gap + col * (cellW + gap);
        const top = topPad + row * (cellH + gap);
        bounds = `${left},${top},${left + cellW},${top + cellH}`;
        useResize = true;
      }

      let target = targets[packageName] || "";
      if (assigned[packageName]) {
        const m = target.match(/placeId=(\d+)/);
        if (m) target = `roblox://placeId=${m[1]}&gameInstanceId=${assigned[packageName]}`;
      }

      const command = {
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        type: "launch",
        package: packageName,
        bounds,
        resize: useResize,
        launchDelay,
        target,
        createdAt: Date.now(),
      };
      commands.push(command);
      await redis.queuePush(queueKey, JSON.stringify(command), {
        ttl: TERMUX_COMMAND_QUEUE_TTL_S,
        maxLen: TERMUX_COMMAND_QUEUE_MAX,
      });
      // Anchor the auto-rejoin stuck grace on each clone's own launch time.
      await redis.set(lastLaunchKey(deviceId, packageName), String(Date.now()), { ex: LAST_LAUNCH_TTL_S });
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

    return NextResponse.json({ ok: true, commands, spreadCount: Object.keys(assigned).length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
