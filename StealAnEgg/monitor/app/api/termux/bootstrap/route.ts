import { NextRequest, NextResponse } from "next/server";

const BOOTSTRAP_SCRIPT = `#!/data/data/com.termux/files/usr/bin/bash
set -e

CONFIG_DIR="$HOME/.cache/log"
CONFIG_FILE="$CONFIG_DIR/naruhub_config.json"
BASE_URL="https://naruhub.my.id"

mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  DEVICE_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N | sha256sum | head -c 32)
  HOSTNAME=$(hostname 2>/dev/null || echo "termux-\${DEVICE_ID:0:8}")
  PLATFORM=$(uname -m 2>/dev/null || echo "unknown")

  cat > "$CONFIG_FILE" << EOFCFG
{
  "deviceId": "$DEVICE_ID",
  "hostname": "$HOSTNAME",
  "platform": "$PLATFORM",
  "baseUrl": "$BASE_URL",
  "accessKey": "$ACCESS_KEY",
  "registeredAt": $(date +%s)
}
EOFCFG

  echo "[NaruHub] Device ID: $DEVICE_ID"
  echo "[NaruHub] Registering device..."

  curl -s -X POST "$BASE_URL/api/termux/register" \\
    -H "Content-Type: application/json" \\
    -H "X-Access-Key: $ACCESS_KEY" \\
    -d "{\\"deviceId\\":\\"$DEVICE_ID\\",\\"hostname\\":\\"$HOSTNAME\\",\\"platform\\":\\"$PLATFORM\\"}" || true

  echo "[NaruHub] Device registered."
else
  DEVICE_ID=$(grep -o '"deviceId":"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
  echo "[NaruHub] Existing device: $DEVICE_ID"
fi

heartbeat() {
  while true; do
    curl -s -X POST "$BASE_URL/api/termux/heartbeat" \\
      -H "Content-Type: application/json" \\
      -H "X-Access-Key: $ACCESS_KEY" \\
      -d "{\\"deviceId\\":\\"$DEVICE_ID\\"}" > /dev/null 2>&1
    sleep 120
  done
}

heartbeat &
HEARTBEAT_PID=$!

echo "[NaruHub] Heartbeat started (PID: $HEARTBEAT_PID)"
echo "[NaruHub] Ready. Device $DEVICE_ID is online."
echo "[NaruHub] Press Ctrl+C to stop."

trap "kill $HEARTBEAT_PID 2>/dev/null; echo '[NaruHub] Stopped.'; exit 0" INT TERM

wait
`;

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const accessKey = req.nextUrl.searchParams.get("key");
  if (!accessKey) {
    return new NextResponse("# Error: access key required\nexit 1\n", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const script = BOOTSTRAP_SCRIPT.replace(/\$ACCESS_KEY/g, accessKey);

  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
