import { NextRequest, NextResponse } from "next/server";

const LUA_AGENT = `
local VERSION = "3.0"

-- ─── Config ───
local CONFIG_DIR = os.getenv("HOME") .. "/.cache/log"
local CONFIG_FILE = CONFIG_DIR .. "/naruhub_config.json"
local LOG_FILE = CONFIG_DIR .. "/naruhub_agent.log"
local WS_URL = "wss://ws.naruhub.my.id"
local LICENSE_KEY = "$$LICENSE$$"
local RAM_TRIM_PCT = 90
local HEARTBEAT_INTERVAL = 120
local RECONNECT_DELAY = 5

-- Paths set after CONFIG_DIR
local WS_INBOX = nil
local WS_OUTBOX = nil

-- ─── Colors ───
local C = {
  green  = "\\27[0;32m",
  cyan   = "\\27[0;36m",
  yellow = "\\27[0;33m",
  red    = "\\27[0;31m",
  bold   = "\\27[1m",
  dim    = "\\27[2m",
  reset  = "\\27[0m",
}

-- ─── Fix PATH when running via curl pipe ───
local PREFIX = os.getenv("PREFIX") or "/data/data/com.termux/files/usr"
local HOME = os.getenv("HOME") or "/data/data/com.termux/files/home"
os.execute(string.format('export PATH="%s/bin:%s/bin/applets:$PATH"', PREFIX, PREFIX))
-- For io.popen/os.execute subshells, inject PATH via env
local ENV_PREFIX = string.format('PATH="%s/bin:%s/bin/applets:/usr/bin:/bin" ', PREFIX, PREFIX)

-- ─── Helpers ───
local function ts()
  return os.date("%H:%M:%S")
end

local function log(msg)
  io.write(msg .. "\\n")
  io.flush()
  local f = io.open(LOG_FILE, "a")
  if f then
    local clean = msg:gsub("\\27%[[%d;]*m", "")
    f:write(os.date("%Y-%m-%d %H:%M:%S") .. " " .. clean .. "\\n")
    f:close()
  end
end

local function shell(cmd)
  local h = io.popen(ENV_PREFIX .. cmd .. " 2>/dev/null", "r")
  if not h then return "" end
  local out = h:read("*a") or ""
  h:close()
  return out:gsub("%s+$", "")
end

local function shellcode(cmd)
  local ok = os.execute(ENV_PREFIX .. cmd .. " >/dev/null 2>&1")
  if type(ok) == "number" then return ok == 0 end
  return ok == true
end

local function sleep(n)
  if n > 0 then os.execute("sleep " .. n) end
end

local function fread(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a")
  f:close()
  return s
end

local function fwrite(path, content)
  local f = io.open(path, "w")
  if not f then return false end
  f:write(content)
  f:close()
  return true
end

-- ─── Minimal JSON ───
local json = {}

function json.encode(val)
  local t = type(val)
  if t == "nil" then return "null" end
  if t == "boolean" then return val and "true" or "false" end
  if t == "number" then return tostring(val) end
  if t == "string" then
    return '"' .. val:gsub('\\\\', '\\\\\\\\'):gsub('"', '\\\\"'):gsub('\\n', '\\\\n'):gsub('\\r', '\\\\r'):gsub('\\t', '\\\\t') .. '"'
  end
  if t == "table" then
    if #val > 0 or next(val) == nil and val[1] ~= nil then
      local isArr = true
      local maxn = 0
      for k in pairs(val) do
        if type(k) ~= "number" then isArr = false; break end
        if k > maxn then maxn = k end
      end
      if isArr and maxn == #val then
        local parts = {}
        for i = 1, #val do parts[i] = json.encode(val[i]) end
        return "[" .. table.concat(parts, ",") .. "]"
      end
    end
    if next(val) == nil then return "[]" end
    local parts = {}
    for k, v in pairs(val) do
      parts[#parts+1] = json.encode(tostring(k)) .. ":" .. json.encode(v)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

function json.decode(str)
  if not str or str == "" then return nil end
  local pos = 1
  local function skip_ws()
    pos = str:find("[^ \\t\\n\\r]", pos) or pos
  end
  local function parse_string()
    if str:sub(pos, pos) ~= '"' then return nil end
    pos = pos + 1
    local s = {}
    while pos <= #str do
      local ch = str:sub(pos, pos)
      if ch == '"' then pos = pos + 1; return table.concat(s) end
      if ch == '\\\\' then
        pos = pos + 1
        ch = str:sub(pos, pos)
        if ch == 'n' then s[#s+1] = '\\n'
        elseif ch == 't' then s[#s+1] = '\\t'
        elseif ch == 'r' then s[#s+1] = '\\r'
        else s[#s+1] = ch end
      else
        s[#s+1] = ch
      end
      pos = pos + 1
    end
    return table.concat(s)
  end
  local parse_value
  local function parse_array()
    if str:sub(pos, pos) ~= '[' then return nil end
    pos = pos + 1
    local arr = {}
    skip_ws()
    if str:sub(pos, pos) == ']' then pos = pos + 1; return arr end
    while true do
      skip_ws()
      arr[#arr+1] = parse_value()
      skip_ws()
      if str:sub(pos, pos) == ',' then pos = pos + 1
      elseif str:sub(pos, pos) == ']' then pos = pos + 1; return arr
      else return arr end
    end
  end
  local function parse_object()
    if str:sub(pos, pos) ~= '{' then return nil end
    pos = pos + 1
    local obj = {}
    skip_ws()
    if str:sub(pos, pos) == '}' then pos = pos + 1; return obj end
    while true do
      skip_ws()
      local key = parse_string()
      skip_ws()
      if str:sub(pos, pos) == ':' then pos = pos + 1 end
      skip_ws()
      obj[key] = parse_value()
      skip_ws()
      if str:sub(pos, pos) == ',' then pos = pos + 1
      elseif str:sub(pos, pos) == '}' then pos = pos + 1; return obj
      else return obj end
    end
  end
  function parse_value()
    skip_ws()
    local ch = str:sub(pos, pos)
    if ch == '"' then return parse_string()
    elseif ch == '{' then return parse_object()
    elseif ch == '[' then return parse_array()
    elseif ch == 't' then pos = pos + 4; return true
    elseif ch == 'f' then pos = pos + 5; return false
    elseif ch == 'n' then pos = pos + 4; return nil
    else
      local num = str:match("^%-?%d+%.?%d*[eE]?[+-]?%d*", pos)
      if num then pos = pos + #num; return tonumber(num) end
      return nil
    end
  end
  return parse_value()
end

-- ─── Device info ───
local function get_device_id()
  local raw = fread("/proc/sys/kernel/random/uuid")
  if raw and #raw > 0 then return raw:gsub("%s+", "") end
  return tostring(os.time()) .. tostring(math.random(100000, 999999))
end

local function get_prop(key)
  local v = shell("getprop " .. key)
  return v ~= "" and v or "?"
end

-- ─── Package collection ───
local function collect_packages()
  local raw = shell('su -c "pm list packages -f" | grep -i roblox')
  if raw == "" then return {} end
  local pkgs = {}
  for line in raw:gmatch("[^\\n]+") do
    local pkg = line:match("=([%w%.]+)$")
    if pkg then
      local username = ""
      local prefs = shell(string.format('su -c "cat /data/data/%s/shared_prefs/prefs.xml"', pkg))
      if prefs ~= "" then
        username = prefs:match('<string name="username">([^<]*)</string>') or ""
      end
      pkgs[#pkgs+1] = { pkg = pkg, label = pkg, username = username }
    end
  end
  return pkgs
end

-- ─── Screen detection ───
local function collect_screen()
  local cur = shell('su -c "dumpsys window displays" | grep -m1 -oE "cur=[0-9]+x[0-9]+"')
  if cur == "" then
    cur = shell('su -c "dumpsys window" | grep -m1 -oE "cur=[0-9]+x[0-9]+"')
  end
  if cur ~= "" then
    local w, h = cur:match("cur=(%d+)x(%d+)")
    if w and h then return { width = tonumber(w), height = tonumber(h) } end
  end
  local raw = shell('su -c "wm size"')
  local w, h = raw:match("(%d+)x(%d+)")
  if w and h then
    w, h = tonumber(w), tonumber(h)
    local rot = shell('su -c "dumpsys input" | grep -m1 SurfaceOrientation | grep -oE "[0-9]+"')
    if rot == "1" or rot == "3" then w, h = h, w end
    return { width = w, height = h }
  end
  return nil
end

-- ─── Stats ───
local function collect_stats()
  local stats = {}
  local batt_pct = fread("/sys/class/power_supply/battery/capacity")
  local batt_status = fread("/sys/class/power_supply/battery/status")
  stats.battery = {
    percent = batt_pct and tonumber(batt_pct:match("%d+")) or nil,
    charging = batt_status and batt_status:match("Charging") ~= nil or false,
  }
  local meminfo = fread("/proc/meminfo") or ""
  local mem_total = tonumber(meminfo:match("MemTotal:%s*(%d+)")) or 0
  local mem_avail = tonumber(meminfo:match("MemAvailable:%s*(%d+)")) or 0
  stats.ram = { totalMB = math.floor(mem_total / 1024), usedMB = math.floor((mem_total - mem_avail) / 1024) }
  local loadavg = fread("/proc/loadavg") or "0 0 0"
  local l1, l5, l15 = loadavg:match("([%d%.]+)%s+([%d%.]+)%s+([%d%.]+)")
  stats.load = { ["1m"] = tonumber(l1) or 0, ["5m"] = tonumber(l5) or 0, ["15m"] = tonumber(l15) or 0 }
  local dfline = shell("df -k $HOME | tail -1")
  local df_total, df_free = 0, 0
  if dfline ~= "" then
    local parts = {}
    for p in dfline:gmatch("%S+") do parts[#parts+1] = p end
    df_total = tonumber(parts[2]) or 0
    df_free = tonumber(parts[4]) or 0
  end
  stats.storage = { totalMB = math.floor(df_total / 1024), freeMB = math.floor(df_free / 1024) }
  return stats
end

-- ─── Auto RAM trim ───
local function maybe_trim_ram(pkgs)
  local meminfo = fread("/proc/meminfo") or ""
  local total = tonumber(meminfo:match("MemTotal:%s*(%d+)")) or 0
  local avail = tonumber(meminfo:match("MemAvailable:%s*(%d+)")) or 0
  if total == 0 then return end
  local pct = math.floor((total - avail) * 100 / total)
  if pct < RAM_TRIM_PCT then return end
  log(C.yellow .. "[" .. ts() .. "] RAM " .. pct .. "% >= " .. RAM_TRIM_PCT .. "% -- auto trim" .. C.reset)
  for _, p in ipairs(pkgs) do
    local pid = shell(string.format('su -c "pgrep -f %s"', p.pkg))
    if pid ~= "" then
      for line in pid:gmatch("[^\\n]+") do
        shellcode(string.format('su -c "am send-trim-memory %s RUNNING_CRITICAL"', line))
      end
    end
  end
  log(C.green .. "[" .. ts() .. "] trim done" .. C.reset)
end

-- ─── Resize via shared_prefs ───
local function set_window_bounds(pkg, left, top, right, bottom)
  local prefFile = string.format("/data/data/%s/shared_prefs/%s_preferences.xml", pkg, pkg)
  local exists = shellcode(string.format('su -c "test -f %s"', prefFile))
  if not exists then
    log(C.yellow .. "[" .. ts() .. "] prefs not found: " .. pkg .. C.reset)
    return false
  end
  for _, prefix in ipairs({"launch", "current", "original"}) do
    for _, side in ipairs({"left", "top", "right", "bottom"}) do
      local val = ({left=left, top=top, right=right, bottom=bottom})[side]
      local sed = string.format(
        [[su -c "sed -i 's/app_cloner_%s_window_%s\\" value=\\"[0-9]*/app_cloner_%s_window_%s\\" value=\\"%d/' %s"]],
        prefix, side, prefix, side, val, prefFile
      )
      shellcode(sed)
    end
  end
  log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " bounds " .. left .. "," .. top .. "," .. right .. "," .. bottom .. " -> " .. C.cyan .. pkg .. C.reset)
  return true
end

-- ─── Launch app ───
local function kill_pkg(pkg)
  shellcode(string.format('su -c "am force-stop %s"', pkg))
  local pids = shell(string.format('su -c "pgrep -f \\\\"%s\\\\""', pkg))
  if pids ~= "" then
    for line in pids:gmatch("[^\\n]+") do
      shellcode(string.format('su -c "kill -9 %s"', line))
    end
  end
end

local function launch_app(pkg, bounds, resize, delay)
  kill_pkg(pkg)
  sleep(1)

  if resize and bounds and bounds ~= "" then
    local left, top, right, bottom = bounds:match("(%d+),(%d+),(%d+),(%d+)")
    if left then
      set_window_bounds(pkg, tonumber(left), tonumber(top), tonumber(right), tonumber(bottom))
    end
  end

  log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " launching " .. C.cyan .. pkg .. C.reset)
  shellcode(string.format('su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p %s"', pkg))

  local waited = 0
  while waited < 60 do
    local stack = shell('su -c "am stack list"')
    if stack:find(pkg .. "/", 1, true) then
      log(C.green .. "[" .. ts() .. "] " .. pkg .. " ready (" .. waited .. "s)" .. C.reset)
      break
    end
    sleep(2)
    waited = waited + 2
  end
  if waited >= 60 then
    log(C.yellow .. "[" .. ts() .. "] timeout: " .. pkg .. C.reset)
  end

  delay = tonumber(delay) or 5
  if delay > 0 then sleep(delay) end
end

-- ─── WebSocket (bidirectional via websocat + named pipe) ───
local function stop_ws()
  shellcode("pkill -f 'websocat.*ws.naruhub'")
  sleep(1)
end

local function start_ws(device_id)
  WS_INBOX = CONFIG_DIR .. "/.ws_inbox"
  WS_OUTBOX = CONFIG_DIR .. "/.ws_outbox"

  fwrite(WS_INBOX, "")
  os.remove(WS_OUTBOX)
  shellcode("mkfifo " .. WS_OUTBOX .. " 2>/dev/null")

  -- websocat reads from FIFO (outbox), writes to inbox file
  -- tail -f keeps the FIFO open so websocat doesn't exit
  local cmd = string.format(
    "tail -f %s | websocat -n %q >> %s 2>/dev/null &",
    WS_OUTBOX, WS_URL, WS_INBOX
  )
  os.execute(cmd)
  sleep(2)

  -- Check if websocat started
  local alive = shell("pgrep -f 'websocat.*ws.naruhub'")
  if alive == "" then return false end
  return true
end

local function ws_send(msg_table)
  if not WS_OUTBOX then return false end
  local data = json.encode(msg_table)
  -- Append to the FIFO via shell (non-blocking write)
  local cmd = string.format("echo %q >> %s", data, WS_OUTBOX)
  return shellcode(cmd)
end

local function ws_recv()
  if not WS_INBOX then return {} end
  local content = fread(WS_INBOX)
  if not content or content == "" then return {} end
  fwrite(WS_INBOX, "")
  local messages = {}
  for line in content:gmatch("[^\\n]+") do
    if line ~= "" then
      local msg = json.decode(line)
      if msg then messages[#messages+1] = msg end
    end
  end
  return messages
end

local function ws_alive()
  return shell("pgrep -f 'websocat.*ws.naruhub'") ~= ""
end

-- ─── Main ───
os.execute("mkdir -p " .. CONFIG_DIR)
fwrite(LOG_FILE, "")

if shell("websocat --version") == "" then
  log(C.red .. "websocat not found. Run: pkg install websocat" .. C.reset)
  os.exit(1)
end

local DEVICE_ID, HOSTNAME, PLATFORM, IS_NEW

local config_raw = fread(CONFIG_FILE)
if config_raw then
  local cfg = json.decode(config_raw)
  if cfg then
    DEVICE_ID = cfg.deviceId
    HOSTNAME = cfg.hostname
    PLATFORM = cfg.platform
  end
end

if not DEVICE_ID then
  DEVICE_ID = get_device_id()
  HOSTNAME = shell("hostname")
  if HOSTNAME == "" then HOSTNAME = "termux-" .. DEVICE_ID:sub(1, 8) end
  PLATFORM = shell("uname -m")
  if PLATFORM == "" then PLATFORM = "unknown" end
  fwrite(CONFIG_FILE, json.encode({
    deviceId = DEVICE_ID,
    hostname = HOSTNAME,
    platform = PLATFORM,
    wsUrl = WS_URL,
    accessKey = LICENSE_KEY,
    registeredAt = os.time(),
  }))
  IS_NEW = true
else
  IS_NEW = false
end

local ANDROID_VER = get_prop("ro.build.version.release")
local DEVICE_MODEL = get_prop("ro.product.model")

os.execute("clear")
log(C.cyan .. C.bold .. "+------------------------------+" .. C.reset)
log(C.cyan .. C.bold .. "|         N A R U H U B         |" .. C.reset)
log(C.cyan .. C.dim  .. "   Monitoring Agent v" .. VERSION .. " (WS)   " .. C.reset)
log(C.cyan .. C.bold .. "+------------------------------+" .. C.reset)
log("")
log(C.dim .. "License" .. C.reset .. "  -> " .. C.yellow .. LICENSE_KEY:sub(1,6) .. "..." .. LICENSE_KEY:sub(-4) .. C.reset)
log(C.dim .. "Device" .. C.reset .. "   -> " .. C.cyan .. DEVICE_ID:sub(1,8) .. "..." .. DEVICE_ID:sub(-6) .. C.reset)
log(C.dim .. "Model" .. C.reset .. "    -> " .. DEVICE_MODEL)
log(C.dim .. "Android" .. C.reset .. "  -> " .. ANDROID_VER)
log(C.dim .. "Server" .. C.reset .. "   -> " .. C.cyan .. WS_URL .. C.reset)
log("")

-- ─── Connection loop (auto-reconnect) ───
while true do
  stop_ws()
  log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " connecting to " .. WS_URL .. "...")

  local ok = start_ws(DEVICE_ID)
  if not ok then
    log(C.red .. "[" .. ts() .. "] connect failed, retry in " .. RECONNECT_DELAY .. "s" .. C.reset)
    sleep(RECONNECT_DELAY)
    goto continue
  end

  log(C.green .. "[" .. ts() .. "] WS connected" .. C.reset)

  -- Auth
  ws_send({
    type = "auth",
    role = "device",
    deviceId = DEVICE_ID,
    accessKey = LICENSE_KEY,
  })

  -- Register if new
  if IS_NEW then
    ws_send({
      type = "register",
      deviceId = DEVICE_ID,
      hostname = HOSTNAME,
      platform = PLATFORM,
    })
    IS_NEW = false
  end

  log(C.green .. "[" .. ts() .. "] online - streaming" .. C.reset)
  log(C.dim .. "Press Ctrl+C to stop." .. C.reset)

  local last_heartbeat = 0

  while true do
    local now = os.time()

    -- Heartbeat via WS
    if now - last_heartbeat >= HEARTBEAT_INTERVAL then
      local pkgs = collect_packages()
      maybe_trim_ram(pkgs)
      local screen = collect_screen()
      local stats = collect_stats()
      local sent = ws_send({
        type = "heartbeat",
        deviceId = DEVICE_ID,
        hostname = HOSTNAME,
        packages = pkgs,
        screen = screen,
        stats = stats,
      })
      if sent then
        last_heartbeat = now
      else
        log(C.red .. "[" .. ts() .. "] heartbeat send failed" .. C.reset)
      end
    end

    -- Read incoming WS messages
    local messages = ws_recv()
    for _, msg in ipairs(messages) do
      if msg.type == "auth" then
        if msg.ok then
          log(C.green .. "[" .. ts() .. "] authenticated" .. C.reset)
        else
          log(C.red .. "[" .. ts() .. "] auth failed: " .. (msg.error or "?") .. C.reset)
        end
      elseif msg.type == "register" then
        if msg.ok then
          log(C.green .. "[" .. ts() .. "] registered" .. C.reset)
        end
      elseif msg.type == "heartbeat" then
        if msg.ok then
          log(C.dim .. "[" .. ts() .. "] heartbeat ok" .. C.reset)
        end
      elseif msg.type == "command" then
        if msg.commands then
          for _, cmd in ipairs(msg.commands) do
            if cmd.type == "launch" then
              log(C.cyan .. "[" .. ts() .. "] >> launch " .. cmd.package .. C.reset)
              launch_app(cmd.package, cmd.bounds, cmd.resize, cmd.launchDelay)
            end
          end
        end
      end
    end

    -- Check websocat alive
    if not ws_alive() then
      log(C.red .. "[" .. ts() .. "] WS disconnected" .. C.reset)
      break
    end

    sleep(1)
  end

  log(C.yellow .. "[" .. ts() .. "] reconnecting in " .. RECONNECT_DELAY .. "s..." .. C.reset)
  sleep(RECONNECT_DELAY)

  ::continue::
end
`;

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const accessKey = req.nextUrl.searchParams.get("key");
  if (!accessKey) {
    return new NextResponse("-- Error: access key required\\nos.exit(1)\\n", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const script = LUA_AGENT.replace(/\\$\\$LICENSE\\$\\$/g, accessKey);

  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
