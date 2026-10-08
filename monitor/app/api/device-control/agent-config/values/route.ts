import { NextRequest, NextResponse } from "next/server";
import { redis, termuxAgentConfigKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";
import { AgentConfig, AGENT_CONFIG_DEFAULTS } from "@/app/api/termux/agent/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { tenant } = getTenantFromRequest(req);
  const raw = await redis.get<string>(termuxAgentConfigKey(tenant || undefined));
  const saved: Partial<AgentConfig> = raw
    ? typeof raw === "string" ? JSON.parse(raw) : raw
    : {};
  const cfg: AgentConfig = { ...AGENT_CONFIG_DEFAULTS, ...saved };
  return NextResponse.json(cfg);
}
