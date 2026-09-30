import { redis, termuxDeviceKey, termuxDeviceMetaKey, termuxCommandQueueKey, termuxAgentLogKey, accountKey } from "@/lib/redis";

// Shared helper used by both /api/device-control/reset-session (agent-authed,
// public path) and /api/device-control/force-reset (dashboard-authed, session
// path). Wipes stale device state so the next agent tick / next Launch Selected
// / next auto-rejoin runs against a clean slate:
//   - rejoinstate:<device>:*   -- clears attempt counters + gave-up flags
//   - presence:<device>:*      -- clones will re-report jobId within ~20s
//   - lastlaunch:<device>:*    -- rejoin grace re-anchors on next launch
//   - termux:cmdqueue:<device> -- drops pending launches carrying stale jobIds
//   - account:<name>.firstSeen -- resets the SESSION uptime column to zero
export interface ResetResult {
  deleted: number;
  commandsDropped: number;
  sessionsReset: number;
  accountsConsidered: number;
}

export async function resetDeviceSession(
  deviceId: string,
  extraPackages: Array<string | { username?: string }> = []
): Promise<ResetResult> {
  const prefixes = [
    `rejoinstate:${deviceId}:`,
    `presence:${deviceId}:`,
    `lastlaunch:${deviceId}:`,
  ];
  let deleted = 0;
  for (const prefix of prefixes) {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 200 });
      cursor = next;
      for (const k of keys) {
        await redis.del(k);
        deleted++;
      }
    } while (cursor !== "0");
  }

  let commandsDropped = 0;
  try {
    const qKey = termuxCommandQueueKey(deviceId);
    const peek = await redis.queuePeek(qKey, 100);
    commandsDropped = peek.length;
    await redis.del(qKey);
  } catch {}

  try {
    await redis.del(termuxAgentLogKey(deviceId));
  } catch {}

  const usernames = new Set<string>();
  try {
    const devRaw = await redis.get<string>(termuxDeviceKey(deviceId));
    if (devRaw) {
      const device = typeof devRaw === "string" ? JSON.parse(devRaw) : devRaw;
      for (const p of Array.isArray(device.packages) ? device.packages : []) {
        if (p && typeof p === "object" && p.username) usernames.add(p.username);
      }
    }
  } catch {}
  try {
    const metaRaw = await redis.get<string>(termuxDeviceMetaKey(deviceId));
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
      const accRaw = await redis.get<string>(accountKey(account));
      if (!accRaw) continue;
      const acc = typeof accRaw === "string" ? JSON.parse(accRaw) : accRaw;
      acc.firstSeen = now;
      acc.lastSeen = now;
      await redis.set(accountKey(account), JSON.stringify(acc));
      sessionsReset++;
    } catch {}
  }

  return { deleted, commandsDropped, sessionsReset, accountsConsidered: usernames.size };
}
