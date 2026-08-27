import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const ONLINE_TIMEOUT_S = 45;
export const ACCOUNT_TTL_S = 120;

export function accountKey(name: string) {
  return `account:${name}`;
}

export function detailKey(name: string) {
  return `detail:${name}`;
}
