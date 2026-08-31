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

export const TERMUX_DEVICE_TTL_S = 300;

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
