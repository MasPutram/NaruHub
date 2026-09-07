import { NextRequest, NextResponse } from "next/server";

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

echo '=== NARUHUB agent starting (auto-restart on exit) ==='
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
