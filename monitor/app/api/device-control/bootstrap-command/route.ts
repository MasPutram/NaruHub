import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest, getValidKeys, tenantFromKey, getDefaultKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

function keyForTenant(tenant: string | undefined): string | undefined {
  if (tenant === undefined) return getDefaultKey();
  return getValidKeys().find((k) => tenantFromKey(k) === tenant);
}

export async function GET(req: NextRequest) {
  const { tenant, authed, error } = getTenantFromRequest(req);
  if (!authed) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }

  const accessKey = req.headers.get("x-access-key") || keyForTenant(tenant) || "";
  if (!accessKey) {
    return NextResponse.json({ ok: false, command: "" });
  }
  const key = encodeURIComponent(accessKey);
  const command = [
    `pkg update -y`,
    `pkg upgrade -y`,
    `pkg install lua54 curl websocat python -y`,
    `mkdir -p ~/.cache/log`,
    `[ -f ~/.cache/log/naruhub_config.json ] || echo '{"license_key":"${accessKey}"}' > ~/.cache/log/naruhub_config.json`,
    `curl -s "https://naruhub.my.id/api/termux/install?key=${key}" | bash`,
  ].join(" && ");
  return NextResponse.json({ ok: true, command });
}
