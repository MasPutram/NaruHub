import { NextRequest, NextResponse } from "next/server";

// Returns a bash installer that does the whole Termux bootstrap in one
// shot. Lets the user's bootstrap command be a single, short line:
//
//   curl -s https://naruhub.my.id/api/termux/install?key=... | bash
//
// The script below is what actually runs inside Termux. Keeping it here
// (instead of in the bootstrap-command endpoint's inline template) means
// we can iterate on the setup steps without asking the operator to copy
// a new command every time.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accessKey = req.nextUrl.searchParams.get("key") || "";
  if (!accessKey) {
    return new NextResponse("echo 'ERROR: access key required'; exit 1\n", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const key = encodeURIComponent(accessKey);

  const script = `#!/data/data/com.termux/files/usr/bin/env bash
set -e

# Force a stable, well-synced Termux mirror (Grimler) so we don't fail on
# random 404s from stale community mirrors.
echo 'deb https://grimler.se/termux/termux-main stable main' > "$PREFIX/etc/apt/sources.list"

pkg update --fix-missing -y
pkg upgrade --fix-missing -y
pkg install lua54 curl websocat -y

mkdir -p ~/.cache/log
# Only seed the config if it's not there yet -- preserves any deviceId
# the agent has already written to it.
if [ ! -f ~/.cache/log/naruhub_config.json ]; then
  echo '{"license_key":"${accessKey}"}' > ~/.cache/log/naruhub_config.json
fi

echo '=== NARUHUB agent starting (auto-restart on exit) ==='
# Auto-restart supervisor: if the Lua agent exits for any reason
# (crashed, LMK-killed, curl fail, network drop), sleep 5s and re-fetch.
while true; do
  curl -s "https://naruhub.my.id/api/termux/agent?key=${key}" | lua5.4
  echo "[agent exited, restarting in 5s...]"
  sleep 5
done
`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
