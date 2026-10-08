import { NextRequest, NextResponse } from "next/server";
import { redis, termuxAgentConfigKey } from "@/lib/redis";
import { getTenantFromRequest } from "@/lib/auth";
import {
  AgentConfig,
  AGENT_CONFIG_DEFAULTS,
} from "@/app/api/termux/agent/route";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const raw = await redis.get<string>(termuxAgentConfigKey(tenant || undefined));
    const saved: Partial<AgentConfig> = raw
      ? typeof raw === "string" ? JSON.parse(raw) : raw
      : {};
    const cfg: AgentConfig = { ...AGENT_CONFIG_DEFAULTS, ...saved };
    return NextResponse.json({ ok: true, config: cfg, defaults: AGENT_CONFIG_DEFAULTS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenant } = getTenantFromRequest(req);
    const body = await req.json();
    const cfg: Partial<AgentConfig> = {};
    for (const key of Object.keys(AGENT_CONFIG_DEFAULTS) as (keyof AgentConfig)[]) {
      if (key in body && typeof body[key] === "number" && body[key] > 0) {
        cfg[key] = body[key];
      }
    }
    await redis.set(termuxAgentConfigKey(tenant || undefined), JSON.stringify(cfg));
    const merged: AgentConfig = { ...AGENT_CONFIG_DEFAULTS, ...cfg };
    return NextResponse.json({ ok: true, config: merged });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
