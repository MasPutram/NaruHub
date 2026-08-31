import { NextRequest, NextResponse } from "next/server";

const BOOTSTRAP_SCRIPT = `#!/data/data/com.termux/files/usr/bin/bash
set -e

CONFIG_DIR="$HOME/.cache/log"
CONFIG_FILE="$CONFIG_DIR/naruhub_config.json"
BASE_URL="https://naruhub.my.id"
LICENSE_KEY="$ACCESS_KEY"

GREEN=$'\\033[0;32m'
CYAN=$'\\033[0;36m'
YELLOW=$'\\033[0;33m'
RED=$'\\033[0;31m'
BOLD=$'\\033[1m'
DIM=$'\\033[2m'
RESET=$'\\033[0m'

ts() { date +%H:%M:%S; }

mkdir -p "$CONFIG_DIR"

ANDROID_VER=$(getprop ro.build.version.release 2>/dev/null || true)
[ -z "$ANDROID_VER" ] && ANDROID_VER="?"
DEVICE_MODEL=$(getprop ro.product.model 2>/dev/null || true)
[ -z "$DEVICE_MODEL" ] && DEVICE_MODEL="?"

if [ ! -f "$CONFIG_FILE" ]; then
  DEVICE_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || date +%s%N | sha256sum | head -c 32)
  HOSTNAME=$(hostname 2>/dev/null || true)
  [ -z "$HOSTNAME" ] && HOSTNAME="termux-\${DEVICE_ID:0:8}"
  PLATFORM=$(uname -m 2>/dev/null || echo "unknown")

  printf '{"deviceId":"%s","hostname":"%s","platform":"%s","baseUrl":"%s","accessKey":"%s","registeredAt":%s}' \\
    "$DEVICE_ID" "$HOSTNAME" "$PLATFORM" "$BASE_URL" "$LICENSE_KEY" "$(date +%s)" > "$CONFIG_FILE"
  IS_NEW=1
else
  DEVICE_ID=$(grep -o '"deviceId":"[^"]*"' "$CONFIG_FILE" | head -1 | cut -d'"' -f4)
  HOSTNAME=$(grep -o '"hostname":"[^"]*"' "$CONFIG_FILE" | head -1 | cut -d'"' -f4)
  PLATFORM=$(grep -o '"platform":"[^"]*"' "$CONFIG_FILE" | head -1 | cut -d'"' -f4)
  IS_NEW=0
fi

clear
echo "\${CYAN}\${BOLD}+-----------------------------+\${RESET}"
echo "\${CYAN}\${BOLD}|        N A R U H U B         |\${RESET}"
echo "\${CYAN}\${DIM}   Monitoring Agent - v1.0     \${RESET}"
echo "\${CYAN}\${BOLD}+-----------------------------+\${RESET}"
echo ""
echo "\${DIM}License\${RESET}  -> \${YELLOW}\${LICENSE_KEY:0:6}...\${LICENSE_KEY: -4}\${RESET}"
echo "\${DIM}Device\${RESET}   -> \${CYAN}\${DEVICE_ID:0:8}...\${DEVICE_ID: -6}\${RESET}"
echo "\${DIM}Model\${RESET}    -> $DEVICE_MODEL"
echo "\${DIM}Android\${RESET}  -> $ANDROID_VER"
echo ""

if [ "$IS_NEW" = "1" ]; then
  echo "\${DIM}[$(ts)]\${RESET} registering device..."
  HTTP_CODE=$(curl -s -o /tmp/naruhub_reg.json -w "%{http_code}" -X POST "$BASE_URL/api/termux/register" \\
    -H "Content-Type: application/json" \\
    -H "X-Access-Key: $LICENSE_KEY" \\
    -d "{\\"deviceId\\":\\"$DEVICE_ID\\",\\"hostname\\":\\"$HOSTNAME\\",\\"platform\\":\\"$PLATFORM\\"}" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    echo "\${GREEN}[$(ts)] registered\${RESET}"
  else
    echo "\${RED}[$(ts)] registration failed (HTTP $HTTP_CODE)\${RESET}"
    cat /tmp/naruhub_reg.json 2>/dev/null
    echo ""
    echo "\${YELLOW}Cek access key kamu, lalu jalankan ulang command ini.\${RESET}"
  fi
else
  echo "\${DIM}[$(ts)] existing device, skip register\${RESET}"
fi

heartbeat() {
  while true; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/termux/heartbeat" \\
      -H "Content-Type: application/json" \\
      -H "X-Access-Key: $LICENSE_KEY" \\
      -d "{\\"deviceId\\":\\"$DEVICE_ID\\"}" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
      echo "\${DIM}[$(ts)]\${RESET} \${GREEN}heartbeat ok\${RESET}"
    else
      echo "\${DIM}[$(ts)]\${RESET} \${RED}heartbeat failed (HTTP $HTTP_CODE)\${RESET}"
    fi
    sleep 120
  done
}

heartbeat &
HEARTBEAT_PID=$!

echo "\${DIM}[$(ts)]\${RESET} heartbeat started (pid $HEARTBEAT_PID)"
echo "\${GREEN}[$(ts)] online - streaming\${RESET}"
echo "\${DIM}Press Ctrl+C to stop.\${RESET}"

trap 'kill $HEARTBEAT_PID 2>/dev/null; echo ""; echo "\${YELLOW}[$(ts)] stopped.\${RESET}"; exit 0' INT TERM

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
