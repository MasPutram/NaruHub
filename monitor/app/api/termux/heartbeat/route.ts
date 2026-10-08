import { NextRequest, NextResponse } from "next/server";
import { redis, termuxDeviceKey, termuxDeviceMetaKey, TERMUX_DEVICE_TTL_S, deviceAccountsKey, DEVICE_ACCOUNTS_TTL_S, accountDeviceMapKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { deviceId, packages, running, stats, screen, androidVersion, model, sdkInt } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
    }

    const existing = await redis.get<string>(termuxDeviceKey(deviceId, tenant));
    let device: Record<string, any>;

    if (existing) {
      device = typeof existing === "string" ? JSON.parse(existing) : existing;
      device.lastSeen = Date.now();
      device.status = "online";
      if (packages) device.packages = Array.isArray(packages) ? packages : [];
      if (Array.isArray(running)) device.running = running;
      if (stats) device.stats = stats;
      if (screen && screen.width && screen.height) device.screen = screen;
      if (androidVersion) device.androidVersion = androidVersion;
      if (model) device.model = model;
      if (sdkInt) device.sdkInt = sdkInt;
    } else {
      const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId, tenant));
      const meta = metaRaw ? (typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw) : null;
      device = {
        deviceId,
        hostname: "unknown",
        platform: "unknown",
        status: "online",
        registeredAt: meta?.registeredAt || Date.now(),
        lastSeen: Date.now(),
        packages: Array.isArray(packages) ? packages : [],
        running: Array.isArray(running) ? running : [],
        stats: stats || {},
        screen: screen && screen.width && screen.height ? screen : undefined,
        androidVersion: androidVersion || undefined,
        model: model || undefined,
        sdkInt: sdkInt || undefined,
      };
      if (meta?.customName) device.customName = meta.customName;
    }

    // Enrich packages with empty usernames from game heartbeat data.
    if (Array.isArray(device.packages) && device.packages.length > 0) {
      try {
        const mapRaw = await redis.get<string>(deviceAccountsKey(deviceId, tenant));
        if (mapRaw) {
          const accountMap: Record<string, number> = typeof mapRaw === "string" ? JSON.parse(mapRaw) : mapRaw;
          const now = Date.now();
          const cutoff = now - DEVICE_ACCOUNTS_TTL_S * 1000;
          const activeAccounts = Object.entries(accountMap)
            .filter(([, ts]) => ts > cutoff)
            .map(([name]) => name);

          if (activeAccounts.length > 0) {
            const assigned = new Set(
              device.packages
                .map((p: any) => (typeof p === "string" ? "" : p.username || ""))
                .filter(Boolean)
            );
            const unassigned = activeAccounts.filter((a) => !assigned.has(a));
            const emptyPkgs = device.packages.filter(
              (p: any) => typeof p !== "string" && !p.username
            );

            if (emptyPkgs.length === 1 && unassigned.length === 1) {
              emptyPkgs[0].username = unassigned[0];
            }

            device.heartbeatAccounts = activeAccounts;
          }
        }
      } catch {}
    }

    await redis.set(termuxDeviceKey(deviceId, tenant), JSON.stringify(device), { ex: TERMUX_DEVICE_TTL_S });

    const metaRawExisting = await redis.get<string>(termuxDeviceMetaKey(deviceId, tenant));
    const metaExisting = metaRawExisting
      ? (typeof metaRawExisting === "string" ? JSON.parse(metaRawExisting) : metaRawExisting)
      : {};
    const snapshot: Record<string, any> = {
      ...metaExisting,
      hostname: device.hostname,
      platform: device.platform,
      registeredAt: device.registeredAt || metaExisting.registeredAt || Date.now(),
      lastSeen: device.lastSeen,
      packages: device.packages,
      stats: device.stats,
      screen: device.screen,
      androidVersion: device.androidVersion,
      model: device.model,
      sdkInt: device.sdkInt,
    };
    if (device.customName) snapshot.customName = device.customName;
    await redis.set(termuxDeviceMetaKey(deviceId, tenant), JSON.stringify(snapshot));

    const hostname = device.customName || device.hostname;
    if (hostname && hostname !== "unknown" && Array.isArray(device.packages)) {
      try {
        const mapRaw = await redis.get<string>(accountDeviceMapKey(tenant));
        const map: Record<string, string> = mapRaw
          ? (typeof mapRaw === "string" ? JSON.parse(mapRaw) : mapRaw)
          : {};
        let changed = false;
        for (const pkg of device.packages) {
          const username = typeof pkg === "string" ? "" : (pkg.username || "");
          if (username && map[username] !== hostname) {
            map[username] = hostname;
            changed = true;
          }
        }
        if (changed) await redis.set(accountDeviceMapKey(tenant), JSON.stringify(map));
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
