import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const accessKey = process.env.ACCESS_KEY || "";
  if (!accessKey) {
    return NextResponse.json({ ok: false, command: "" });
  }
  const key = encodeURIComponent(accessKey);
  const command = `pkg update -y && pkg upgrade -y && pkg install lua54 curl websocat -y && mkdir -p ~/.cache/log && echo '{"license_key":"${accessKey}"}' > ~/.cache/log/naruhub_config.json && curl -s "https://naruhub.my.id/api/termux/agent?key=${key}" | lua5.4`;
  return NextResponse.json({ ok: true, command });
}
