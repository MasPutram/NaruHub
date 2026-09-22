import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { AgentConfig, AGENT_CONFIG_DEFAULTS } from "@/app/api/termux/agent/route";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await redis.get<string>("termux:agent-config");
  const saved: Partial<AgentConfig> = raw
    ? typeof raw === "string" ? JSON.parse(raw) : raw
    : {};
  const cfg: AgentConfig = { ...AGENT_CONFIG_DEFAULTS, ...saved };
  return NextResponse.json(cfg);
}
