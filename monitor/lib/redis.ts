import IORedis from "ioredis";

const client = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

export const ONLINE_TIMEOUT_S = 45;
export const ACCOUNT_TTL_S = 120;

// Tenant prefix helper — all per-tenant Redis keys go through this.
function tp(tenant: string | undefined, base: string): string {
  return tenant ? `t:${tenant}:${base}` : base;
}

// Build a SCAN match pattern scoped to a tenant.
// e.g. scanPattern("abc123", "account:*") => "t:abc123:account:*"
export function scanPattern(tenant: string | undefined, pattern: string): string {
  return tenant ? `t:${tenant}:${pattern}` : pattern;
}

// Strip tenant prefix from a key to get the base key.
export function stripTenantPrefix(key: string, tenant: string | undefined): string {
  if (!tenant) return key;
  const prefix = `t:${tenant}:`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

export function accountKey(name: string, tenant?: string) {
  return tp(tenant, `account:${name}`);
}

export function detailKey(name: string, tenant?: string) {
  return tp(tenant, `detail:${name}`);
}

export function forSaleKey(name: string, tenant?: string) {
  return tp(tenant, `forsale:${name}`);
}

export function forSaleKickKey(name: string, tenant?: string) {
  return tp(tenant, `forsalekick:${name}`);
}
export const FORSALE_KICK_TTL_S = 300; // 5 minutes

export function soldKey(name: string, tenant?: string) {
  return tp(tenant, `sold:${name}`);
}

export function moderatedKey(name: string, tenant?: string) {
  return tp(tenant, `moderated:${name}`);
}

export function resolvedModeratedKey(name: string, tenant?: string) {
  return tp(tenant, `modresolved:${name}`);
}

export function termuxDeviceKey(deviceId: string, tenant?: string) {
  return tp(tenant, `termux:device:${deviceId}`);
}

export function termuxDeviceMetaKey(deviceId: string, tenant?: string) {
  return tp(tenant, `termux:device:meta:${deviceId}`);
}

export const TERMUX_DEVICE_TTL_S = 90;

export function petIconKey(category: string) {
  return `peticon:${category}`; // shared across tenants (icon cache)
}

// Live server presence reported by the in-game heartbeat script: which Roblox
// server (jobId) each account is currently sitting in, and when it last
// checked in. Keyed by deviceId + account because Roblox client (account)
// names repeat across cloud phones -- account alone would collide. The brain
// reads this to tell "in a game" (fresh) from "stuck/dropped" (stale). TTL is
// long enough to still measure staleness past the give-up point.
export function presenceKey(deviceId: string, account: string, tenant?: string) {
  return tp(tenant, `presence:${deviceId}:${account}`);
}
export const PRESENCE_TTL_S = 600; // 10 min -- outlives the stuck/give-up window
export const PRESENCE_FRESH_S = 60; // seen within this = currently in-game

// Per-device reverse map of accounts detected via game heartbeat (/api/monitor).
// JSON object: { accountName: lastSeenMs, ... }. Used by /api/termux/heartbeat
// to enrich packages whose prefs.xml-based username detection failed.
export function deviceAccountsKey(deviceId: string, tenant?: string) {
  return tp(tenant, `device-accounts:${deviceId}`);
}
export const DEVICE_ACCOUNTS_TTL_S = ACCOUNT_TTL_S * 2; // 240s

// Per-package auto-rejoin state machine (server-side brain). Tracks how long a
// clone has been stuck, how many rejoin attempts have fired, which servers
// failed, and whether we've given up (sent it home).
export function rejoinStateKey(deviceId: string, pkg: string, tenant?: string) {
  return tp(tenant, `rejoinstate:${deviceId}:${pkg}`);
}
export const REJOIN_STATE_TTL_S = 60 * 60; // 1h; refreshed on every touch

// When a package was last launched (batch/manual). The brain anchors the
// "no heartbeat for 300s = stuck" grace on this so a clone that failed early
// in a long batch is judged from its OWN launch, not from when the batch
// finished (the agent can't poll the brain while it's busy launching).
export function lastLaunchKey(deviceId: string, pkg: string, tenant?: string) {
  return tp(tenant, `lastlaunch:${deviceId}:${pkg}`);
}
export const LAST_LAUNCH_TTL_S = 60 * 60; // 1h

export const PET_ICON_TTL_S = 60 * 60 * 24 * 30; // 30 days

export function accountDeviceMapKey(tenant?: string): string {
  return tp(tenant, "account-device-map");
}
export const ACCOUNT_DEVICE_MAP_KEY = "account-device-map"; // legacy compat

export function termuxCommandQueueKey(deviceId: string, tenant?: string) {
  return tp(tenant, `termux:cmdqueue:${deviceId}`);
}

export const TERMUX_COMMAND_QUEUE_TTL_S = 60 * 10; // 10 minutes -- commands go stale fast
export const TERMUX_COMMAND_QUEUE_MAX = 50; // cap so a dead/offline device can't grow this forever

// Separate from the delivery queue above: a persistent (non-consumed) log of
// admin actions per device, for the web UI's "command console" panel.
export function termuxCommandLogKey(deviceId: string, tenant?: string) {
  return tp(tenant, `termux:cmdlog:${deviceId}`);
}

export const TERMUX_COMMAND_LOG_TTL_S = 60 * 60 * 24; // 24 hours
export const TERMUX_COMMAND_LOG_MAX = 30;

// Live runtime log streamed by the agent itself (force-stop, trim, launch,
// rejoin, RAM warnings...) so the dashboard's console shows what's actually
// happening on-device -- separate from the admin-action command log above.
export function termuxAgentLogKey(deviceId: string, tenant?: string) {
  return tp(tenant, `termux:agentlog:${deviceId}`);
}
export const TERMUX_AGENT_LOG_TTL_S = 60 * 60 * 6; // 6 hours
export const TERMUX_AGENT_LOG_MAX = 300; // keep the last 300 lines per device

// Persistent execution policy per device: auto-rejoin, per-package opt-in
// list, launch delay, retry limit. Read by both the dashboard and the
// Termux agent so the agent can act on disconnected packages autonomously.
export function termuxDevicePolicyKey(deviceId: string, tenant?: string) {
  return tp(tenant, `termux:policy:${deviceId}`);
}

// Per-package temporary rejoin pause. Set (with TTL) by flows like
// "Siap Jual" where the operator needs the app to stay on Roblox's home
// screen for a moment (to log the account out) without auto-rejoin kicking
// it back into the private server. Agent checks this before firing any
// auto-rejoin launch.
export function termuxPackageRejoinPauseKey(deviceId: string, pkg: string, tenant?: string) {
  return tp(tenant, `termux:pkgpause:${deviceId}:${pkg}`);
}
export const TERMUX_REJOIN_PAUSE_DEFAULT_S = 600; // 10 minutes -- enough to log out

// Global script library, shared across all devices. Each entry keys by a
// slug derived from the filename. Persistent (no TTL).
export function termuxAgentConfigKey(tenant?: string): string {
  return tp(tenant, "termux:agent-config");
}

export function termuxCookiesKey(tenant?: string): string {
  return tp(tenant, "termux:cookies");
}

export function autoexecLibraryKey(slug: string, tenant?: string) {
  return tp(tenant, `autoexec:library:${slug}`);
}
export function autoexecLibraryIndexKey(tenant?: string): string {
  return tp(tenant, "autoexec:library:_index");
}
export const AUTOEXEC_LIBRARY_INDEX = "autoexec:library:_index"; // legacy compat

export function autoexecDeployedKey(deviceId: string, tenant?: string) {
  return tp(tenant, `autoexec:deployed:${deviceId}`);
}

// ── Anime Dice ──────────────────────────────────────────────────────────
export function adAccountKey(name: string, tenant?: string) {
  return tp(tenant, `ad:account:${name}`);
}

export function adDetailKey(name: string, tenant?: string) {
  return tp(tenant, `ad:detail:${name}`);
}

export function adForSaleKey(name: string, tenant?: string) {
  return tp(tenant, `ad:forsale:${name}`);
}

export function adForSaleKickKey(name: string, tenant?: string) {
  return tp(tenant, `ad:forsalekick:${name}`);
}

export function adInventoryRatesKey(tenant?: string): string {
  return tp(tenant, "ad:inventory:rates");
}
export const AD_INVENTORY_RATES_KEY = "ad:inventory:rates"; // legacy compat

export function adInventoryStateKey(tenant?: string): string {
  return tp(tenant, "ad:inventory:state");
}

export function adCatalogKey(name: string, tenant?: string) {
  return tp(tenant, `ad:catalog:${name}`);
}
export const AD_CATALOG_TTL_S = 60 * 60 * 24; // 24 hours

export function adEventKey(tenant?: string) {
  return tp(tenant, "ad:event:active");
}
export const AD_EVENT_TTL_S = 360; // 6 min (slightly longer than 5min event)

export function adEventHistoryKey(tenant?: string): string {
  return tp(tenant, "ad:event:history");
}
export const AD_EVENT_HISTORY_KEY = "ad:event:history"; // legacy compat
export const AD_EVENT_HISTORY_MAX = 50;


type SetOptions = { ex?: number };

function parseMaybeJson<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export const redis = {
  async get<T = string>(key: string): Promise<T | null> {
    const raw = await client.get(key);
    return parseMaybeJson<T>(raw);
  },

  async set(key: string, value: string, opts?: SetOptions): Promise<void> {
    if (opts?.ex) {
      await client.set(key, value, "EX", opts.ex);
    } else {
      await client.set(key, value);
    }
  },

  async del(key: string): Promise<void> {
    await client.del(key);
  },

  async mget(...keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const results = await client.mget(...keys);
    return results;
  },

  async scan(
    cursor: string,
    opts: { match: string; count: number }
  ): Promise<[string, string[]]> {
    const result = await client.scan(cursor, "MATCH", opts.match, "COUNT", opts.count);
    return [String(result[0]), result[1]];
  },

  // Redis set primitives -- used by the autoexec library index so we can
  // enumerate saved scripts without SCAN + a match pattern.
  async sadd(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) return;
    await client.sadd(key, ...members);
  },
  async srem(key: string, ...members: string[]): Promise<void> {
    if (members.length === 0) return;
    await client.srem(key, ...members);
  },
  async smembers(key: string): Promise<string[]> {
    return (await client.smembers(key)) || [];
  },

  // Push a command onto a device's queue (RPUSH), trim it to the last N
  // entries, and refresh its TTL so a dead device doesn't accumulate junk.
  async queuePush(key: string, value: string, opts: { ttl: number; maxLen: number }): Promise<void> {
    const pipe = client.pipeline();
    pipe.rpush(key, value);
    pipe.ltrim(key, -opts.maxLen, -1);
    pipe.expire(key, opts.ttl);
    await pipe.exec();
  },

  // Pop up to `count` commands off the front of the queue (FIFO).
  async queuePop(key: string, count: number): Promise<string[]> {
    const pipe = client.pipeline();
    pipe.lrange(key, 0, count - 1);
    pipe.ltrim(key, count, -1);
    const results = await pipe.exec();
    if (!results) return [];
    const [, rangeResult] = results[0] as [Error | null, string[]];
    return rangeResult || [];
  },

  // Read the most recent `count` entries WITHOUT consuming them -- for
  // display logs (unlike queuePop, which is for one-shot delivery queues).
  async queuePeek(key: string, count: number): Promise<string[]> {
    const results = await client.lrange(key, -count, -1);
    return results.reverse(); // newest first
  },

  pipeline() {
    const pipe = client.pipeline();
    return {
      set(key: string, value: string, opts?: SetOptions) {
        if (opts?.ex) {
          pipe.set(key, value, "EX", opts.ex);
        } else {
          pipe.set(key, value);
        }
        return this;
      },
      async exec() {
        return pipe.exec();
      },
    };
  },
};
