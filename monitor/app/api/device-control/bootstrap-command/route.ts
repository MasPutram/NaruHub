import { NextRequest, NextResponse } from "next/server";
import { getTenantFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { tenant, error } = getTenantFromRequest(req);
  if (!tenant) {
    return NextResponse.json({ ok: false, error: error || "Unauthorized" }, { status: 401 });
  }

  // The bootstrap command embeds the caller's raw access key so the device
  // can authenticate future API calls. Pull it from the header that
  // getTenantFromRequest already validated.
  const accessKey = req.headers.get("x-access-key") || "";
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
