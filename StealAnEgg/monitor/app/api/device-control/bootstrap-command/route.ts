import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const accessKey = process.env.ACCESS_KEY || "";
  if (!accessKey) {
    return NextResponse.json({ ok: false, command: "" });
  }
  const key = encodeURIComponent(accessKey);
  // Force a stable, well-synced Termux mirror (Grimler) before update so we
  // don't fail on random 404s from out-of-date community mirrors like
  // termux.3san.dev. --fix-missing keeps a temporary hiccup from breaking
  // the whole bootstrap.
  const command = `echo 'deb https://grimler.se/termux/termux-main stable main' > $PREFIX/etc/apt/sources.list && pkg update --fix-missing -y && pkg upgrade --fix-missing -y && pkg install lua54 curl websocat -y && mkdir -p ~/.cache/log && [ -f ~/.cache/log/naruhub_config.json ] || echo '{"license_key":"${accessKey}"}' > ~/.cache/log/naruhub_config.json && curl -s "https://naruhub.my.id/api/termux/agent?key=${key}" | lua5.4`;
  return NextResponse.json({ ok: true, command });
}
