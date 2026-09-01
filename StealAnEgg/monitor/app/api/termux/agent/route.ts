import { NextRequest, NextResponse } from "next/server";

const LUA_AGENT = `
local VERSION = "2.0"

-- ─── Config ───
local CONFIG_DIR = os.getenv("HOME") .. "/.cache/log"
local CONFIG_FILE = CONFIG_DIR .. "/naruhub_config.json"
local LOG_FILE = CONFIG_DIR .. "/naruhub_agent.log"
local BASE_URL = "https://naruhub.my.id"
local LICENSE_KEY = "$$LICENSE$$"
local RAM_TRIM_PCT = 85
local HEARTBEAT_INTERVAL = 120
local POLL_INTERVAL = 5

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
  local h = io.popen(cmd .. " 2>/dev/null", "r")
  if not h then return "" end
  local out = h:read("*a") or ""
  h:close()
  return out:gsub("%s+$", "")
end

local function shellcode(cmd)
  local ok = os.execute(cmd .. " >/dev/null 2>&1")
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
      -- detect array: has numeric keys
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
    -- empty table = empty array if we got here via collect_packages returning {}
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
  -- Use a simple approach: leverage Lua pattern matching for basic JSON
  -- For our needs (server responses), this is sufficient
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

-- ─── HTTP via curl ───
local function http_post(url, body, headers)
  local hdr = ""
  if headers then
    for k, v in pairs(headers) do
      hdr = hdr .. " -H " .. string.format("%q", k .. ": " .. v)
    end
  end
  local tmp = CONFIG_DIR .. "/.http_resp"
  local cmd = string.format(
    'curl -s -o %s -w "%%{http_code}" -X POST %q %s -d %q 2>/dev/null',
    tmp, url, hdr, body
  )
  local code = shell(cmd)
  local resp_body = fread(tmp) or ""
  return tonumber(code) or 0, resp_body
end

local function http_get(url, headers)
  local hdr = ""
  if headers then
    for k, v in pairs(headers) do
      hdr = hdr .. " -H " .. string.format("%q", k .. ": " .. v)
    end
  end
  local cmd = string.format('curl -s %q %s 2>/dev/null', url, hdr)
  return shell(cmd)
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
      local label = pkg
      local username = ""
      local prefs = shell(string.format('su -c "cat /data/data/%s/shared_prefs/prefs.xml"', pkg))
      if prefs ~= "" then
        username = prefs:match('<string name="username">([^<]*)</string>') or ""
      end
      pkgs[#pkgs+1] = { pkg = pkg, label = label, username = username }
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
  -- Fallback: wm size + rotation
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

-- ─── Stats collection ───
local function collect_stats()
  local stats = {}
  -- Battery
  local batt_pct = fread("/sys/class/power_supply/battery/capacity")
  local batt_status = fread("/sys/class/power_supply/battery/status")
  stats.battery = {
    percent = batt_pct and tonumber(batt_pct:match("%d+")) or nil,
    charging = batt_status and batt_status:match("Charging") ~= nil or false,
  }
  -- RAM
  local meminfo = fread("/proc/meminfo") or ""
  local mem_total = tonumber(meminfo:match("MemTotal:%s*(%d+)")) or 0
  local mem_avail = tonumber(meminfo:match("MemAvailable:%s*(%d+)")) or 0
  stats.ram = {
    totalMB = math.floor(mem_total / 1024),
    usedMB = math.floor((mem_total - mem_avail) / 1024),
  }
  -- Load
  local loadavg = fread("/proc/loadavg") or "0 0 0"
  local l1, l5, l15 = loadavg:match("([%d%.]+)%s+([%d%.]+)%s+([%d%.]+)")
  stats.load = {
    ["1m"] = tonumber(l1) or 0,
    ["5m"] = tonumber(l5) or 0,
    ["15m"] = tonumber(l15) or 0,
  }
  -- Storage
  local dfline = shell("df -k $HOME | tail -1")
  local df_total, df_free = 0, 0
  if dfline ~= "" then
    local parts = {}
    for p in dfline:gmatch("%S+") do parts[#parts+1] = p end
    df_total = tonumber(parts[2]) or 0
    df_free = tonumber(parts[4]) or 0
  end
  stats.storage = {
    totalMB = math.floor(df_total / 1024),
    freeMB = math.floor(df_free / 1024),
  }
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
  log(C.yellow .. "[" .. ts() .. "] RAM " .. pct .. "% >= " .. RAM_TRIM_PCT .. "% -- auto trim (clearing cache)" .. C.reset)
  for _, p in ipairs(pkgs) do
    shellcode(string.format('su -c "rm -rf /data/data/%s/cache/*"', p.pkg))
  end
  log(C.green .. "[" .. ts() .. "] auto trim done" .. C.reset)
end

-- ─── Resize via shared_prefs ───
local function set_window_bounds(pkg, left, top, right, bottom)
  local prefFile = string.format("/data/data/%s/shared_prefs/%s_preferences.xml", pkg, pkg)
  local exists = shellcode(string.format('su -c "test -f %s"', prefFile))
  if not exists then
    log(C.yellow .. "[" .. ts() .. "] prefs not found for " .. pkg .. C.reset)
    return false
  end
  for _, prefix in ipairs({"launch", "current", "original"}) do
    for _, side in ipairs({"left", "top", "right", "bottom"}) do
      local val = ({left=left, top=top, right=right, bottom=bottom})[side]
      local sed = string.format(
        [[su -c "sed -i 's/app_cloner_%s_window_%s\" value=\"[0-9]*/app_cloner_%s_window_%s\" value=\"%d/' %s"]],
        prefix, side, prefix, side, val, prefFile
      )
      shellcode(sed)
    end
  end
  log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " set bounds " .. left .. "," .. top .. "," .. right .. "," .. bottom .. " for " .. C.cyan .. pkg .. C.reset)
  return true
end

-- ─── Launch app ───
local function launch_app(pkg, bounds, resize, delay)
  -- Kill existing
  shellcode(string.format('su -c "am force-stop %s"', pkg))
  local pid = shell(string.format('su -c "pidof %s"', pkg))
  if pid ~= "" then shellcode(string.format('su -c "kill -9 %s"', pid)) end
  sleep(1)

  -- Set bounds if resize requested
  if resize and bounds and bounds ~= "" then
    local left, top, right, bottom = bounds:match("(%d+),(%d+),(%d+),(%d+)")
    if left then
      set_window_bounds(pkg, tonumber(left), tonumber(top), tonumber(right), tonumber(bottom))
    end
  end

  -- Launch
  log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " launching " .. C.cyan .. pkg .. C.reset)
  shellcode(string.format('su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p %s"', pkg))
  log(C.green .. "[" .. ts() .. "] launched " .. pkg .. C.reset)

  -- Wait for app to be ready
  local waited = 0
  local maxwait = 60
  while waited < maxwait do
    local stack = shell('su -c "am stack list"')
    if stack:find(pkg .. "/", 1, true) then
      log(C.green .. "[" .. ts() .. "] " .. pkg .. " is ready (waited " .. waited .. "s)" .. C.reset)
      break
    end
    sleep(2)
    waited = waited + 2
  end
  if waited >= maxwait then
    log(C.yellow .. "[" .. ts() .. "] timeout waiting for " .. pkg .. C.reset)
  end

  -- Extra delay
  delay = tonumber(delay) or 5
  if delay > 0 then
    log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " extra delay " .. delay .. "s...")
    sleep(delay)
  end
end

-- ─── Main ───
os.execute("mkdir -p " .. CONFIG_DIR)

-- Reset log file
fwrite(LOG_FILE, "")

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
    baseUrl = BASE_URL,
    accessKey = LICENSE_KEY,
    registeredAt = os.time(),
  }))
  IS_NEW = true
else
  IS_NEW = false
end

local ANDROID_VER = get_prop("ro.build.version.release")
local DEVICE_MODEL = get_prop("ro.product.model")

-- Banner
os.execute("clear")
log(C.cyan .. C.bold .. "+-----------------------------+" .. C.reset)
log(C.cyan .. C.bold .. "|        N A R U H U B         |" .. C.reset)
log(C.cyan .. C.dim  .. "   Monitoring Agent - v" .. VERSION .. "     " .. C.reset)
log(C.cyan .. C.bold .. "+-----------------------------+" .. C.reset)
log("")
log(C.dim .. "License" .. C.reset .. "  -> " .. C.yellow .. LICENSE_KEY:sub(1, 6) .. "..." .. LICENSE_KEY:sub(-4) .. C.reset)
log(C.dim .. "Device" .. C.reset .. "   -> " .. C.cyan .. DEVICE_ID:sub(1, 8) .. "..." .. DEVICE_ID:sub(-6) .. C.reset)
log(C.dim .. "Model" .. C.reset .. "    -> " .. DEVICE_MODEL)
log(C.dim .. "Android" .. C.reset .. "  -> " .. ANDROID_VER)
log("")

-- Register if new
if IS_NEW then
  log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " registering device...")
  local body = json.encode({
    deviceId = DEVICE_ID,
    hostname = HOSTNAME,
    platform = PLATFORM,
  })
  local code = http_post(
    BASE_URL .. "/api/termux/register",
    body,
    { ["Content-Type"] = "application/json", ["X-Access-Key"] = LICENSE_KEY }
  )
  if code == 200 then
    log(C.green .. "[" .. ts() .. "] registered" .. C.reset)
  else
    log(C.red .. "[" .. ts() .. "] registration failed (HTTP " .. code .. ")" .. C.reset)
  end
else
  log(C.dim .. "[" .. ts() .. "] existing device, skip register" .. C.reset)
end

-- ─── Main loop (single-threaded, alternating heartbeat + poll) ───
local last_heartbeat = 0

log(C.green .. "[" .. ts() .. "] online - streaming" .. C.reset)
log(C.dim .. "Press Ctrl+C to stop." .. C.reset)

while true do
  local now = os.time()

  -- Heartbeat
  if now - last_heartbeat >= HEARTBEAT_INTERVAL then
    local pkgs = collect_packages()
    maybe_trim_ram(pkgs)
    local screen = collect_screen()
    local stats = collect_stats()
    local body = json.encode({
      deviceId = DEVICE_ID,
      packages = pkgs,
      screen = screen,
      stats = stats,
    })
    local code = http_post(
      BASE_URL .. "/api/termux/heartbeat",
      body,
      { ["Content-Type"] = "application/json", ["X-Access-Key"] = LICENSE_KEY }
    )
    if code ~= 200 then
      log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " " .. C.red .. "heartbeat failed (HTTP " .. code .. ")" .. C.reset)
    end
    last_heartbeat = now
  end

  -- Poll commands
  local resp = http_get(
    BASE_URL .. "/api/termux/commands?deviceId=" .. DEVICE_ID,
    { ["X-Access-Key"] = LICENSE_KEY }
  )
  local data = json.decode(resp)
  if data and data.commands then
    for _, cmd in ipairs(data.commands) do
      if cmd.type == "launch" then
        launch_app(cmd.package, cmd.bounds, cmd.resize, cmd.launchDelay)
      end
    end
  end

  sleep(POLL_INTERVAL)
end
`;

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const accessKey = req.nextUrl.searchParams.get("key");
  if (!accessKey) {
    return new NextResponse("-- Error: access key required\nos.exit(1)\n", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const script = LUA_AGENT.replace(/\$\$LICENSE\$\$/g, accessKey);

  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
