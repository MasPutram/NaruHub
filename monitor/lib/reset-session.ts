import { redis, termuxDeviceKey, termuxDeviceMetaKey, termuxCommandQueueKey, termuxAgentLogKey, accountKey, scanPattern } from "@/lib/redis";

export interface ResetResult {
  deleted: number;
  commandsDropped: number;
  sessionsReset: number;
  accountsConsidered: number;
}

export async function resetDeviceSession(
  deviceId: string,
  extraPackages: Array<string | { username?: string }> = [],
  tenant?: string
): Promise<ResetResult> {
  const basePrefixes = [
    `rejoinstate:${deviceId}:`,
    `presence:${deviceId}:`,
    `lastlaunch:${deviceId}:`,
  ];
  let deleted = 0;
  for (const base of basePrefixes) {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: scanPattern(tenant, `${base}*`), count: 200 });
      cursor = next;
      for (const k of keys) {
        await redis.del(k);
        deleted++;
      }
    } while (cursor !== "0");
  }

  let commandsDropped = 0;
  try {
    const qKey = termuxCommandQueueKey(deviceId, tenant);
    const peek = await redis.queuePeek(qKey, 100);
    commandsDropped = peek.length;
    await redis.del(qKey);
  } catch {}

  try {
    await redis.del(termuxAgentLogKey(deviceId, tenant));
  } catch {}

  const usernames = new Set<string>();
  try {
    const devRaw = await redis.get<string>(termuxDeviceKey(deviceId, tenant));
    if (devRaw) {
      const device = typeof devRaw === "string" ? JSON.parse(devRaw) : devRaw;
      for (const p of Array.isArray(device.packages) ? device.packages : []) {
        if (p && typeof p === "object" && p.username) usernames.add(p.username);
      }
    }
  } catch {}
  try {
    const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId, tenant));
    if (metaRaw) {
      const meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;
      for (const p of Array.isArray(meta.packages) ? meta.packages : []) {
        if (p && typeof p === "object" && p.username) usernames.add(p.username);
      }
    }
  } catch {}
  for (const p of extraPackages) {
    if (typeof p === "string") { usernames.add(p); continue; }
    if (p && typeof p === "object" && p.username) usernames.add(p.username);
  }

  let sessionsReset = 0;
  const now = Date.now() / 1000;
  for (const account of Array.from(usernames)) {
    try {
      const accRaw = await redis.get<string>(accountKey(account, tenant));
      if (!accRaw) continue;
      const acc = typeof accRaw === "string" ? JSON.parse(accRaw) : accRaw;
      acc.firstSeen = now;
      acc.lastSeen = now;
      await redis.set(accountKey(account, tenant), JSON.stringify(acc));
      sessionsReset++;
    } catch {}
  }

  return { deleted, commandsDropped, sessionsReset, accountsConsidered: usernames.size };
}
