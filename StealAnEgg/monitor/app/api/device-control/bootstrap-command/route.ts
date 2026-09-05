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
  // NOTE: use `if [ ! -f ... ]; then ... fi` (not `... || echo`) so that a
  // failing pkg install upstream does NOT cause the config to be overwritten
  // -- previously `A && [ -f Y ] || echo Z > Y` would clobber the deviceId
  // whenever any earlier `&&` step failed, defeating the whole point of
  // persisting the id.
  // The final `while true` wrapper is the auto-restart supervisor: if the
  // Lua agent exits for ANY reason (crashed, ke-kill LMK karena RAM,
  // curl gagal, dll), the loop sleeps 5s and re-fetches + re-runs it.
  // Bash's while loop is a much lighter target for LMK than the Lua VM
  // itself, so it usually survives even when the agent doesn't.
  const command = `echo 'deb https://grimler.se/termux/termux-main stable main' > $PREFIX/etc/apt/sources.list && pkg update --fix-missing -y && pkg upgrade --fix-missing -y && pkg install lua54 curl websocat -y && mkdir -p ~/.cache/log && if [ ! -f ~/.cache/log/naruhub_config.json ]; then echo '{"license_key":"${accessKey}"}' > ~/.cache/log/naruhub_config.json; fi && while true; do curl -s "https://naruhub.my.id/api/termux/agent?key=${key}" | lua5.4; echo "[agent exited, restarting in 5s...]"; sleep 5; done`;
  return NextResponse.json({ ok: true, command });
}
