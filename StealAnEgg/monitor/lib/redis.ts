import IORedis from "ioredis";

const client = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

export const ONLINE_TIMEOUT_S = 45;
export const ACCOUNT_TTL_S = 120;

export function accountKey(name: string) {
  return `account:${name}`;
}

export function detailKey(name: string) {
  return `detail:${name}`;
}

export function forSaleKey(name: string) {
  return `forsale:${name}`;
}

export function termuxDeviceKey(deviceId: string) {
  return `termux:device:${deviceId}`;
}

export function termuxDeviceMetaKey(deviceId: string) {
  return `termux:device:meta:${deviceId}`;
}

export const TERMUX_DEVICE_TTL_S = 300;

export function petIconKey(category: string) {
  return `peticon:${category}`;
}

export const PET_ICON_TTL_S = 60 * 60 * 24 * 30; // 30 days

export function termuxCommandQueueKey(deviceId: string) {
  return `termux:cmdqueue:${deviceId}`;
}

export const TERMUX_COMMAND_QUEUE_TTL_S = 60 * 10; // 10 minutes -- commands go stale fast
export const TERMUX_COMMAND_QUEUE_MAX = 50; // cap so a dead/offline device can't grow this forever

// Separate from the delivery queue above: a persistent (non-consumed) log of
// admin actions per device, for the web UI's "command console" panel.
export function termuxCommandLogKey(deviceId: string) {
  return `termux:cmdlog:${deviceId}`;
}

export const TERMUX_COMMAND_LOG_TTL_S = 60 * 60 * 24; // 24 hours
export const TERMUX_COMMAND_LOG_MAX = 30;

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
