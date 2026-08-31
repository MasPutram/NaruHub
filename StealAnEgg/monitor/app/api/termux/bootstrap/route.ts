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

command -v jq >/dev/null 2>&1 || pkg install -y jq >/dev/null 2>&1 || true

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

# Best-effort: enable freeform multi-window support so remote "launch" commands
# can position a Roblox clone into a specific screen cell. Requires root and
# varies by OEM/Android version -- silently no-ops if unsupported.
su -c "settings put global enable_freeform_support 1" >/dev/null 2>&1 || true
su -c "settings put global force_resizable_activities 1" >/dev/null 2>&1 || true

# Lists installed Roblox clone packages (rooted device -- app-cloner-style
# multi-account setups). Emits a JSON array [{"pkg":...,"label":...}] via
# jq, or "[]" if jq / root / no matching packages.
collect_packages() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "[]"
    return
  fi
  local result pkgs
  result="[]"
  pkgs=$(su -c "pm list packages -f" 2>/dev/null | grep -i roblox | sed -n 's/^package:.*=\\(.*\\)$/\\1/p')
  if [ -n "$pkgs" ]; then
    while IFS= read -r pkg; do
      [ -z "$pkg" ] && continue
      local apkpath label
      apkpath=$(su -c "pm path $pkg" 2>/dev/null | sed -n 's/^package://p' | head -1)
      label="$pkg"
      if command -v aapt >/dev/null 2>&1 && [ -n "$apkpath" ]; then
        local al
        al=$(su -c "aapt dump badging '$apkpath'" 2>/dev/null | grep -m1 "application-label:" | sed -n "s/^application-label:'\\\\(.*\\\\)'\\$/\\\\1/p")
        [ -n "$al" ] && label="$al"
      fi
      result=$(echo "$result" | jq --arg pkg "$pkg" --arg label "$label" '. + [{"pkg":$pkg,"label":$label}]')
    done <<< "$pkgs"
  fi
  echo "$result"
}

# Reports the device's active screen resolution (needed server-side to turn
# a "2x5 grid, slot 3" request into pixel bounds for am task resize).
collect_screen() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "null"
    return
  fi
  local raw w h
  raw=$(su -c "wm size" 2>/dev/null)
  w=$(echo "$raw" | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f1)
  h=$(echo "$raw" | grep -oE '[0-9]+x[0-9]+' | tail -1 | cut -dx -f2)
  if [ -n "$w" ] && [ -n "$h" ]; then
    jq -n --argjson w "$w" --argjson h "$h" '{"width":$w,"height":$h}'
  else
    echo "null"
  fi
}

# Local device health -- battery/RAM/storage/CPU load. Reads standard
# world-readable Linux/Android sources (/proc, sysfs, df) so it works
# without root even though the rest of this agent needs root for the
# package-launch feature. All KB->MB division is done in bash (native
# integer math) to keep the jq filter itself free of arithmetic.
collect_stats() {
  if ! command -v jq >/dev/null 2>&1; then
    echo "null"
    return
  fi
  local batt_pct batt_status charging
  batt_pct=$(cat /sys/class/power_supply/battery/capacity 2>/dev/null || true)
  batt_status=$(cat /sys/class/power_supply/battery/status 2>/dev/null || true)
  charging="false"
  [ "$batt_status" = "Charging" ] && charging="true"

  local mem_total_kb mem_avail_kb mem_used_kb mem_total_mb mem_used_mb
  mem_total_kb=$(grep -m1 '^MemTotal:' /proc/meminfo 2>/dev/null | grep -oE '[0-9]+')
  mem_avail_kb=$(grep -m1 '^MemAvailable:' /proc/meminfo 2>/dev/null | grep -oE '[0-9]+')
  [ -z "$mem_total_kb" ] && mem_total_kb=0
  [ -z "$mem_avail_kb" ] && mem_avail_kb=0
  mem_used_kb=$((mem_total_kb - mem_avail_kb))
  mem_total_mb=$((mem_total_kb / 1024))
  mem_used_mb=$((mem_used_kb / 1024))

  local load1 load5 load15
  read -r load1 load5 load15 _ < /proc/loadavg 2>/dev/null
  load1=\${load1:-0}
  load5=\${load5:-0}
  load15=\${load15:-0}

  local disk_total_kb disk_free_kb disk_total_mb disk_free_mb dfline
  disk_total_kb=0
  disk_free_kb=0
  dfline=$(df -k "$HOME" 2>/dev/null | tail -1)
  if [ -n "$dfline" ]; then
    disk_total_kb=$(echo "$dfline" | awk '{print $2}')
    disk_free_kb=$(echo "$dfline" | awk '{print $4}')
  fi
  [ -z "$disk_total_kb" ] && disk_total_kb=0
  [ -z "$disk_free_kb" ] && disk_free_kb=0
  disk_total_mb=$((disk_total_kb / 1024))
  disk_free_mb=$((disk_free_kb / 1024))

  if [ -n "$batt_pct" ]; then
    jq -n --argjson battPct "$batt_pct" --argjson charging "$charging" \\
      --argjson memTotalMB "$mem_total_mb" --argjson memUsedMB "$mem_used_mb" \\
      --arg load1 "$load1" --arg load5 "$load5" --arg load15 "$load15" \\
      --argjson diskTotalMB "$disk_total_mb" --argjson diskFreeMB "$disk_free_mb" \\
      '{battery:{percent:$battPct,charging:$charging},ram:{totalMB:$memTotalMB,usedMB:$memUsedMB},storage:{totalMB:$diskTotalMB,freeMB:$diskFreeMB},load:{"1m":($load1|tonumber),"5m":($load5|tonumber),"15m":($load15|tonumber)}}'
  else
    jq -n --argjson charging "$charging" \\
      --argjson memTotalMB "$mem_total_mb" --argjson memUsedMB "$mem_used_mb" \\
      --arg load1 "$load1" --arg load5 "$load5" --arg load15 "$load15" \\
      --argjson diskTotalMB "$disk_total_mb" --argjson diskFreeMB "$disk_free_mb" \\
      '{battery:{percent:null,charging:$charging},ram:{totalMB:$memTotalMB,usedMB:$memUsedMB},storage:{totalMB:$diskTotalMB,freeMB:$diskFreeMB},load:{"1m":($load1|tonumber),"5m":($load5|tonumber),"15m":($load15|tonumber)}}'
  fi
}

heartbeat() {
  while true; do
    local pkg_json screen_json stats_json body http_code
    pkg_json=$(collect_packages)
    screen_json=$(collect_screen)
    stats_json=$(collect_stats)
    if command -v jq >/dev/null 2>&1; then
      body=$(jq -n --arg deviceId "$DEVICE_ID" --argjson packages "$pkg_json" --argjson screen "$screen_json" --argjson stats "$stats_json" \\
        '{deviceId:$deviceId, packages:$packages, screen:$screen, stats:$stats}')
    else
      body="{\\"deviceId\\":\\"$DEVICE_ID\\"}"
    fi
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/termux/heartbeat" \\
      -H "Content-Type: application/json" \\
      -H "X-Access-Key: $LICENSE_KEY" \\
      -d "$body" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
      echo "\${DIM}[$(ts)]\${RESET} \${GREEN}heartbeat ok\${RESET}"
    else
      echo "\${DIM}[$(ts)]\${RESET} \${RED}heartbeat failed (HTTP $http_code)\${RESET}"
    fi
    sleep 120
  done
}

# Polls for remote "open this package in this screen cell" commands queued
# from the website and executes them via root. Best-effort: task-id lookup
# and windowing behavior vary a lot across OEM/Android versions -- if a step
# fails it just logs and moves on instead of killing the loop.
poll_commands() {
  while true; do
    local resp
    resp=$(curl -s "$BASE_URL/api/termux/commands?deviceId=$DEVICE_ID" -H "X-Access-Key: $LICENSE_KEY" 2>/dev/null || echo '{"commands":[]}')
    if command -v jq >/dev/null 2>&1; then
      echo "$resp" | jq -c '.commands[]?' 2>/dev/null | while IFS= read -r cmd; do
        local ctype cpkg cbounds taskid
        ctype=$(echo "$cmd" | jq -r '.type')
        if [ "$ctype" = "launch" ]; then
          cpkg=$(echo "$cmd" | jq -r '.package')
          cbounds=$(echo "$cmd" | jq -r '.bounds')
          echo "\${DIM}[$(ts)]\${RESET} launching \${CYAN}$cpkg\${RESET} @ $cbounds"
          su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p $cpkg --windowingMode 5" >/dev/null 2>&1 || true
          sleep 1.5
          taskid=$(su -c "am stack list" 2>/dev/null | grep -m1 "$cpkg" | grep -oE 'taskId=[0-9]+' | head -1 | cut -d= -f2)
          if [ -z "$taskid" ]; then
            taskid=$(su -c "dumpsys activity activities" 2>/dev/null | grep -B5 "$cpkg" | grep -m1 -oE 'Task id #[0-9]+|TaskRecord\\{[a-z0-9]+ #[0-9]+' | grep -oE '#[0-9]+$' | tr -d '#')
          fi
          if [ -n "$taskid" ]; then
            su -c "am task resize $taskid $cbounds" >/dev/null 2>&1 || true
            echo "\${GREEN}[$(ts)] resized task $taskid -> $cbounds\${RESET}"
          else
            echo "\${YELLOW}[$(ts)] launched $cpkg but couldn't find task id to resize\${RESET}"
          fi
        fi
      done
    fi
    sleep 5
  done
}

heartbeat &
HEARTBEAT_PID=$!
poll_commands &
POLL_PID=$!

echo "\${DIM}[$(ts)]\${RESET} heartbeat started (pid $HEARTBEAT_PID)"
echo "\${DIM}[$(ts)]\${RESET} command listener started (pid $POLL_PID)"
echo "\${GREEN}[$(ts)] online - streaming\${RESET}"
echo "\${DIM}Press Ctrl+C to stop.\${RESET}"

trap 'kill $HEARTBEAT_PID $POLL_PID 2>/dev/null; echo ""; echo "\${YELLOW}[$(ts)] stopped.\${RESET}"; exit 0' INT TERM

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
