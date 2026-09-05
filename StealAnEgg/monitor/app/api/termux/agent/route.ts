import { NextRequest, NextResponse } from "next/server";

const LUA_AGENT = `
local VERSION = "3.0"

-- ─── Config ───
local CONFIG_DIR = os.getenv("HOME") .. "/.cache/log"
local CONFIG_FILE = CONFIG_DIR .. "/naruhub_config.json"
local LOG_FILE = CONFIG_DIR .. "/naruhub_agent.log"
local BASE_URL = "https://naruhub.my.id"
local WS_URL = "wss://ws.naruhub.my.id"
local LICENSE_KEY = "$$LICENSE$$"
local RAM_TRIM_PCT = 92
local RAM_TRIM_COOLDOWN = 90  -- seconds between trim cycles
local LAST_TRIM_TS = 0
local HEARTBEAT_INTERVAL = 30
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
local ENV_PREFIX = string.format('PATH="%s/bin:%s/bin/applets:/system/bin:/system/xbin:/usr/bin:/bin" ', PREFIX, PREFIX)

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
    if next(val) == nil then return "{}" end
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
  -- Stable hardware fingerprint so the same physical device always gets the
  -- same id, even if the config file is wiped or across App Cloner clones.
  local parts = {}
  local function add(v)
    if v and v ~= "" and v ~= "unknown" and v ~= "null" then
      parts[#parts+1] = v
    end
  end

  -- getprop keys (try several serial variants -- restricted on Android 10+)
  add(shell("getprop ro.serialno"))
  add(shell("getprop ro.boot.serialno"))
  add(shell("getprop ro.build.serial"))
  add(shell("getprop ro.product.model"))
  add(shell("getprop ro.product.manufacturer"))
  add(shell("getprop ro.product.device"))
  add(shell("getprop ro.product.board"))
  add(shell("getprop ro.hardware"))
  add(shell("getprop ro.build.fingerprint"))

  -- android_id (via su if plain settings fails)
  local aid = shell("settings get secure android_id")
  if aid == "" or aid == "null" then aid = shell('su -c "settings get secure android_id"') end
  add(aid)

  -- MAC address (needs su on Android 10+)
  local mac = fread("/sys/class/net/wlan0/address")
  if not mac or mac == "" then mac = shell('su -c "cat /sys/class/net/wlan0/address"') end
  if mac then add(mac:gsub("%s+", "")) end

  -- Kernel version + bootloader (stable per device firmware)
  add(shell("getprop ro.bootloader"))

  if #parts >= 2 then
    local fp = table.concat(parts, "|")
    local hash = shell(string.format("printf %%s %q | sha256sum | cut -c1-32", fp))
    if hash ~= "" then return hash end
  end

  -- Last-resort fallback: random uuid (not stable across resets)
  local raw = fread("/proc/sys/kernel/random/uuid")
  if raw and #raw > 0 then return raw:gsub("%s+", "") end
  return tostring(os.time()) .. tostring(math.random(100000, 999999))
end

local function get_prop(key)
  local v = shell("getprop " .. key)
  return v ~= "" and v or "?"
end

-- ─── Forward-declare state (must be before functions that reference them) ───
local DEVICE_ID, HOSTNAME, PLATFORM, IS_NEW

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
-- Staged trimming: warns background apps early (MODERATE), and only escalates
-- to CRITICAL for apps that are NOT the current foreground. Never trims the
-- foreground process -- CRITICAL on the active app causes ANR/GC storms that
-- can cascade into an LMK-triggered soft reboot.
local function get_foreground_pkg()
  local raw = shell('su -c "dumpsys activity activities" | grep -m1 -oE "mResumedActivity: ActivityRecord\\\\{[^ ]+ [^ ]+ [^ /]+/"')
  if raw ~= "" then
    local pkg = raw:match("([%w%.]+)/$")
    if pkg then return pkg end
  end
  raw = shell('su -c "dumpsys window" | grep -m1 -oE "mCurrentFocus=Window\\\\{[^ ]+ [^ ]+ [^ /]+/"')
  if raw ~= "" then
    local pkg = raw:match("([%w%.]+)/$")
    if pkg then return pkg end
  end
  return nil
end

local function maybe_trim_ram(pkgs)
  local meminfo = fread("/proc/meminfo") or ""
  local total = tonumber(meminfo:match("MemTotal:%s*(%d+)")) or 0
  local avail = tonumber(meminfo:match("MemAvailable:%s*(%d+)")) or 0
  if total == 0 then return end
  local pct = math.floor((total - avail) * 100 / total)
  if pct < RAM_TRIM_PCT then return end

  local now = os.time()
  if now - LAST_TRIM_TS < RAM_TRIM_COOLDOWN then return end
  LAST_TRIM_TS = now

  local fg = get_foreground_pkg()
  -- Only ever send MODERATE. LOW/CRITICAL push borderline background clones
  -- over the edge into an LMK kill, which the user sees as a random
  -- force-close right after they open something else.
  local level = "RUNNING_MODERATE"
  log(C.yellow .. "[" .. ts() .. "] RAM " .. pct .. "% -- trim " .. level ..
      (fg and " (skip fg=" .. fg .. ")" or "") .. C.reset)

  local trimmed = 0
  for _, p in ipairs(pkgs) do
    if p.pkg ~= fg then
      local pid = shell(string.format('su -c "pgrep -x %s"', p.pkg))
      if pid ~= "" then
        for line in pid:gmatch("[^\\n]+") do
          shellcode(string.format('su -c "am send-trim-memory %s %s"', line, level))
          trimmed = trimmed + 1
          -- small stagger so all clones don't GC at the same instant
          os.execute("sleep 0.2")
        end
      end
    end
  end
  log(C.green .. "[" .. ts() .. "] trim done (" .. trimmed .. " procs)" .. C.reset)
end

-- ─── Resize via shared_prefs ───
-- Seed a minimal preferences XML with the App Cloner window keys so the
-- FIRST launch of a fresh clone already lands at our tile bounds. Without
-- this, the very first launch after install renders fullscreen (App Cloner
-- creates the file only after that first launch), which triggers force-
-- close cascades on 4GB devices because two fullscreen Roblox instances
-- overwhelm RAM.
local function seed_prefs(pkg, prefFile, left, top, right, bottom)
  local dir = string.format("/data/data/%s/shared_prefs", pkg)
  shellcode(string.format('su -c "mkdir -p %s"', dir))
  local body = string.format(
    [[<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <int name="app_cloner_launch_window_left" value="%d" />
    <int name="app_cloner_launch_window_top" value="%d" />
    <int name="app_cloner_launch_window_right" value="%d" />
    <int name="app_cloner_launch_window_bottom" value="%d" />
    <int name="app_cloner_current_window_left" value="%d" />
    <int name="app_cloner_current_window_top" value="%d" />
    <int name="app_cloner_current_window_right" value="%d" />
    <int name="app_cloner_current_window_bottom" value="%d" />
    <int name="app_cloner_original_window_left" value="%d" />
    <int name="app_cloner_original_window_top" value="%d" />
    <int name="app_cloner_original_window_right" value="%d" />
    <int name="app_cloner_original_window_bottom" value="%d" />
</map>
]],
    left, top, right, bottom,
    left, top, right, bottom,
    left, top, right, bottom
  )
  local escaped = body:gsub("'", "'\\\\''")
  local cmd = string.format("su -c 'cat > %s' <<'PREF_EOF'\\n%s\\nPREF_EOF", prefFile, escaped)
  os.execute(ENV_PREFIX .. cmd .. " >/dev/null 2>&1")
  -- Match Android's expected perms so the app can read it.
  local uid = shell(string.format('su -c "stat -c %%u /data/data/%s"', pkg))
  if uid ~= "" then
    shellcode(string.format('su -c "chown %s:%s %s"', uid, uid, prefFile))
  end
  shellcode(string.format('su -c "chmod 660 %s"', prefFile))
end

local function set_window_bounds(pkg, left, top, right, bottom)
  local prefFile = string.format("/data/data/%s/shared_prefs/%s_preferences.xml", pkg, pkg)
  local exists = shellcode(string.format('su -c "test -f %s"', prefFile))
  if not exists then
    seed_prefs(pkg, prefFile, left, top, right, bottom)
    return true
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
  return true
end

-- ─── Command dedupe ───
-- A single admin action can reach us BOTH via the HTTP command queue AND
-- via a WS push, which would run launch_app twice for the same package.
-- Track seen command ids and skip duplicates. Keep the map small by
-- expiring entries after 5 minutes.
local SEEN_COMMANDS = {}
local SEEN_TTL = 300
local function was_seen(cmd_id)
  if not cmd_id then return false end -- old commands without ids: always run
  local now = os.time()
  -- Sweep old entries every call (cheap; map stays tiny).
  for k, ts in pairs(SEEN_COMMANDS) do
    if now - ts > SEEN_TTL then SEEN_COMMANDS[k] = nil end
  end
  if SEEN_COMMANDS[cmd_id] then return true end
  SEEN_COMMANDS[cmd_id] = now
  return false
end

-- ─── Launch app ───
-- kill_pkg must ONLY kill the exact package (not sibling App Cloner clones
-- whose package names share a prefix). pgrep -f matches on the full cmdline
-- and is too broad; pgrep -x matches only exact process names, which is
-- what Android uses for app processes (proc/<pid>/cmdline).
local function kill_pkg(pkg)
  shellcode(string.format('su -c "am force-stop %s"', pkg))
  local pids = shell(string.format('su -c "pgrep -x %s"', pkg))
  if pids ~= "" then
    for line in pids:gmatch("[^\\n]+") do
      shellcode(string.format('su -c "kill -9 %s"', line))
    end
  end
end

local function launch_app(pkg, bounds, resize, delay, target)
  kill_pkg(pkg)
  sleep(1)

  if resize and bounds and bounds ~= "" then
    local left, top, right, bottom = bounds:match("(%d+),(%d+),(%d+),(%d+)")
    if left then
      set_window_bounds(pkg, tonumber(left), tonumber(top), tonumber(right), tonumber(bottom))
    end
  end

  if target and target ~= "" then
    -- Deep-link launch: opens the specific place / private server directly
    -- via VIEW intent instead of Roblox's home screen. Falls back to a
    -- plain MAIN launch if the intent errors out (unregistered scheme,
    -- broken deep-link handler, etc).
    log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " launching " .. C.cyan .. pkg .. C.reset .. C.dim .. " -> " .. target .. C.reset)
    -- Escape any double-quote in the URL for the shell arg.
    local safe = target:gsub('"', '\\\\"')
    local ok = shellcode(string.format(
      'su -c "am start -a android.intent.action.VIEW -d \\\\"%s\\\\" -p %s"',
      safe, pkg
    ))
    if not ok then
      log(C.yellow .. "[" .. ts() .. "] deep link failed, falling back to home launch" .. C.reset)
      shellcode(string.format('su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p %s"', pkg))
    end
  else
    log(C.dim .. "[" .. ts() .. "]" .. C.reset .. " launching " .. C.cyan .. pkg .. C.reset)
    shellcode(string.format('su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p %s"', pkg))
  end

  -- Wait for the app window to actually be drawn on screen, not just for
  -- the task to be registered in the activity stack. Roblox in particular
  -- shows a splash + long "Loading..." phase after the task exists; if we
  -- consider it "ready" the instant the task appears, we'll fire the next
  -- launch before this one has finished initializing.
  local waited = 0
  local task_seen = false
  while waited < 60 do
    local stack = shell('su -c "am stack list"')
    if stack:find(pkg .. "/", 1, true) then
      task_seen = true
      -- Check the app's window is actually visible AND has focus / is
      -- drawn. mCurrentFocus should point to this pkg once the first
      -- real activity window is up.
      local focus = shell('su -c "dumpsys window" | grep -E "mCurrentFocus|mFocusedApp"')
      if focus:find(pkg, 1, true) then break end
    end
    sleep(2)
    waited = waited + 2
  end
  if waited >= 60 and not task_seen then
    log(C.yellow .. "[" .. ts() .. "] timeout: " .. pkg .. C.reset)
  end

  delay = tonumber(delay) or 10
  if delay > 0 then sleep(delay) end
end

-- Rapid-fire an am start for one package WITHOUT waiting for it to finish
-- initializing. Used by the batch-launch trick below.
local function fire_start(pkg, target)
  if target and target ~= "" then
    local safe = target:gsub('"', '\\\\"')
    local ok = shellcode(string.format(
      'su -c "am start -a android.intent.action.VIEW -d \\\\"%s\\\\" -p %s"',
      safe, pkg
    ))
    if not ok then
      shellcode(string.format('su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p %s"', pkg))
    end
  else
    shellcode(string.format('su -c "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p %s"', pkg))
  end
end

-- Batch launch multiple packages using the Roblox-multi-open trick the
-- operator discovered manually: open the first clone fully, rapid-fire
-- am start on the rest so they queue behind Roblox's init lock, then
-- kill the first to release the lock -- all queued clones then proceed
-- to open at once. Falls back to plain sequential launch if only one
-- package is in the batch.
local function batch_launch(cmds)
  if #cmds == 0 then return end
  if #cmds == 1 then
    local c = cmds[1]
    launch_app(c.package, c.bounds, c.resize, c.launchDelay, c.target)
    return
  end

  local stagger = tonumber(cmds[1].launchDelay) or 10
  log(C.cyan .. "[" .. ts() .. "] batch launch (" .. #cmds .. " packages), " .. stagger .. "s stagger" .. C.reset)

  -- Step 1: fully launch the first one so its window is up. All the
  -- others fire on top of this without killing it, so at the end all N
  -- clones stay open (matches the operator's expectation: click open
  -- them one by one, don't force-close anything).
  local first = cmds[1]
  launch_app(first.package, first.bounds, first.resize, 0, first.target)

  -- Step 2: fire am start on the rest one by one, spaced by launchDelay
  -- so they open at a controlled pace. Set bounds via shared_prefs
  -- beforehand so each lands in the right tile.
  for i = 2, #cmds do
    local c = cmds[i]
    if c.resize and c.bounds and c.bounds ~= "" then
      local l, t, r, b = c.bounds:match("(%d+),(%d+),(%d+),(%d+)")
      if l then set_window_bounds(c.package, tonumber(l), tonumber(t), tonumber(r), tonumber(b)) end
    end
    fire_start(c.package, c.target)
    if stagger > 0 then sleep(stagger) end
  end
end

-- ─── HTTP helpers (writes to Redis so dashboard can read) ───
local function http_post(path, body_table)
  local body = json.encode(body_table)
  local tmpfile = CONFIG_DIR .. "/.http_body.json"
  fwrite(tmpfile, body)
  local url = BASE_URL .. path
  local cmd = string.format(
    "curl -s -w '%%{http_code}' -o /dev/null -X POST '%s' -H 'Content-Type: application/json' -H 'X-Access-Key: %s' -d @%s",
    url, LICENSE_KEY, tmpfile
  )
  local result = shell(cmd)
  return result
end

local function http_register()
  if not DEVICE_ID then
    log(C.red .. "[" .. ts() .. "] skip HTTP register: no deviceId" .. C.reset)
    return
  end
  log(C.dim .. "[" .. ts() .. "] HTTP register deviceId=" .. DEVICE_ID:sub(1,8) .. C.reset)
  local code = http_post("/api/termux/register", {
    deviceId = DEVICE_ID,
    hostname = HOSTNAME or "unknown",
    platform = PLATFORM or "unknown",
  })
  if code == "200" then
    log(C.green .. "[" .. ts() .. "] HTTP register ok" .. C.reset)
  else
    log(C.red .. "[" .. ts() .. "] HTTP register failed (" .. code .. ")" .. C.reset)
  end
end

local function http_heartbeat(pkgs, screen, stats)
  if not DEVICE_ID then return end
  local code = http_post("/api/termux/heartbeat", {
    deviceId = DEVICE_ID,
    packages = pkgs or {},
    screen = screen,
    stats = stats or {},
  })
  if code ~= "200" then
    log(C.red .. "[" .. ts() .. "] HTTP heartbeat failed (" .. code .. ")" .. C.reset)
  end
end

-- GET helper -- returns response body as string (not just status code).
-- Used for the policy poll below.
local function http_get(path)
  local url = BASE_URL .. path
  local cmd = string.format(
    "curl -s -X GET '%s' -H 'X-Access-Key: %s'",
    url, LICENSE_KEY
  )
  return shell(cmd)
end

-- ─── Auto-rejoin state + helpers ───
-- Everything auto-rejoin needs to remember lives in these tables, keyed by
-- package name. The main loop calls maybe_auto_rejoin() every tick; the
-- policy itself is polled less often (POLICY_POLL_INTERVAL) to avoid
-- hammering the server.
local POLICY_POLL_INTERVAL = 15  -- seconds
local LAST_POLICY_POLL = 0
local CACHED_POLICY = nil        -- last successful poll result (or nil)
local WAS_RUNNING = {}           -- pkg -> true if seen in am stack list last check
local PENDING_REJOIN = {}        -- pkg -> os.time() when we should relaunch
local RETRY_COUNT = {}           -- pkg -> how many rejoin attempts so far
local REJOIN_LOG_LAST = {}       -- pkg -> ts of last log line (dedup spam)

local function poll_policy_if_due()
  if not DEVICE_ID then return end
  local now = os.time()
  if now - LAST_POLICY_POLL < POLICY_POLL_INTERVAL then return end
  LAST_POLICY_POLL = now
  local body = http_get("/api/device-control/policy?deviceId=" .. DEVICE_ID)
  if body == "" then return end
  local ok, parsed = pcall(json.decode, body)
  if not ok or not parsed or not parsed.ok then return end
  CACHED_POLICY = {
    autoRejoinEnabled = parsed.policy and parsed.policy.autoRejoinEnabled or false,
    rejoinDelay = (parsed.policy and parsed.policy.rejoinDelay) or 10,
    retryLimit = (parsed.policy and parsed.policy.retryLimit) or 0,
    autoRejoinPackages = (parsed.policy and parsed.policy.autoRejoinPackages) or {},
    packageTargets = (parsed.policy and parsed.policy.packageTargets) or {},
    pausedPackages = parsed.pausedPackages or {},
  }
end

local function is_paused(pkg)
  if not CACHED_POLICY or not CACHED_POLICY.pausedPackages then return false end
  for _, p in ipairs(CACHED_POLICY.pausedPackages) do
    if p == pkg then return true end
  end
  return false
end

-- Should this package auto-rejoin? True when auto-rejoin is on globally AND
-- either the per-package list is empty (all) or the package is in the list.
local function should_rejoin(pkg)
  if not CACHED_POLICY or not CACHED_POLICY.autoRejoinEnabled then return false end
  local list = CACHED_POLICY.autoRejoinPackages
  if #list == 0 then return true end
  for _, p in ipairs(list) do
    if p == pkg then return true end
  end
  return false
end

local function rlog(pkg, msg)
  -- Dedup: don't log the same package state faster than once per 5s.
  local now = os.time()
  if REJOIN_LOG_LAST[pkg] and now - REJOIN_LOG_LAST[pkg] < 5 then return end
  REJOIN_LOG_LAST[pkg] = now
  log(msg)
end

-- Any package the agent has ever seen alive in this session -- kept even
-- when paused / crashed, so an expiring pause naturally resumes rejoin.
local TRACKED = {}
-- Rejoin sweep runs less often than the 1s main-loop tick so we don't
-- fork `am stack list` every second on a 4GB device.
local REJOIN_SWEEP_INTERVAL = 5
local LAST_REJOIN_SWEEP = 0

local function maybe_auto_rejoin()
  poll_policy_if_due()
  if not CACHED_POLICY or not CACHED_POLICY.autoRejoinEnabled then return end

  local now_top = os.time()
  if now_top - LAST_REJOIN_SWEEP < REJOIN_SWEEP_INTERVAL then return end
  LAST_REJOIN_SWEEP = now_top

  -- One stack snapshot per pass -- cheaper than pgrep per package.
  local stack = shell('su -c "am stack list"')
  local now = os.time()

  -- Parse current running set out of the stack listing.
  local seen_now = {}
  for line in stack:gmatch("[^\\n]+") do
    for pkg in line:gmatch("([%w%.]+)/[%w%.$]+") do
      seen_now[pkg] = true
    end
  end

  -- Anything currently alive joins TRACKED; a package that recovered on
  -- its own (transition NOT_SEEN -> SEEN) also resets its retry counter.
  for pkg, _ in pairs(seen_now) do
    if not WAS_RUNNING[pkg] then RETRY_COUNT[pkg] = 0 end
    WAS_RUNNING[pkg] = true
    TRACKED[pkg] = true
  end

  -- For every tracked package (even ones missing for a while), decide if
  -- we should rejoin. This is what makes pause expiration self-heal: pkg
  -- stays in TRACKED, so once is_paused() flips back to false we act on
  -- the next tick.
  for pkg, _ in pairs(TRACKED) do
    if not seen_now[pkg] and should_rejoin(pkg) and not PENDING_REJOIN[pkg] then
      if is_paused(pkg) then
        rlog(pkg, C.dim .. "[" .. ts() .. "] rejoin skipped (paused): " .. pkg .. C.reset)
      else
        local limit = CACHED_POLICY.retryLimit or 0
        local tries = RETRY_COUNT[pkg] or 0
        if limit > 0 and tries >= limit then
          rlog(pkg, C.yellow .. "[" .. ts() .. "] rejoin retry limit hit for " .. pkg .. " (" .. tries .. ")" .. C.reset)
        else
          PENDING_REJOIN[pkg] = now + (CACHED_POLICY.rejoinDelay or 10)
          rlog(pkg, C.yellow .. "[" .. ts() .. "] " .. pkg .. " dropped -- rejoin in " .. (CACHED_POLICY.rejoinDelay or 10) .. "s" .. C.reset)
        end
      end
    end
  end

  -- Drop packages we know are gone from WAS_RUNNING so the next appearance
  -- registers as a fresh recovery (resets RETRY_COUNT). TRACKED persists.
  for pkg, _ in pairs(WAS_RUNNING) do
    if not seen_now[pkg] then WAS_RUNNING[pkg] = nil end
  end

  -- Fire any pending rejoins whose delay elapsed.
  for pkg, when in pairs(PENDING_REJOIN) do
    if now >= when then
      PENDING_REJOIN[pkg] = nil
      if seen_now[pkg] then
        -- Came back on its own between schedule and now -- no-op.
      elseif is_paused(pkg) then
        rlog(pkg, C.dim .. "[" .. ts() .. "] rejoin fired but " .. pkg .. " now paused, aborting" .. C.reset)
      else
        RETRY_COUNT[pkg] = (RETRY_COUNT[pkg] or 0) + 1
        local target = CACHED_POLICY.packageTargets and CACHED_POLICY.packageTargets[pkg] or ""
        log(C.cyan .. "[" .. ts() .. "] auto-rejoin " .. pkg .. " (attempt " .. RETRY_COUNT[pkg] .. ")" .. C.reset)
        launch_app(pkg, "", false, 0, target)
      end
    end
  end
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

-- Community trick: shrink Android's logcat buffer + clear it. Heavy
-- clones (Roblox in particular) spam megabytes of logs per minute; the
-- default 256KB * 6-buffer setup + logd overhead is a real RAM/IO drain
-- and shows up as random background force-closes on 4GB devices.
-- We set the buffer to 64KB (minimum useful), clear existing logs, and
-- also stop the logd service outright when possible.
os.execute(ENV_PREFIX .. 'su -c "setprop persist.logd.size 65536" >/dev/null 2>&1')
os.execute(ENV_PREFIX .. 'su -c "setprop persist.log.tag ASSERT" >/dev/null 2>&1')
os.execute(ENV_PREFIX .. 'su -c "logcat -b all -c" >/dev/null 2>&1')
os.execute(ENV_PREFIX .. 'su -c "logcat -G 64K" >/dev/null 2>&1')
os.execute(ENV_PREFIX .. 'su -c "stop logd" >/dev/null 2>&1')

if shell("websocat --version") == "" then
  log(C.red .. "websocat not found. Run: pkg install websocat" .. C.reset)
  os.exit(1)
end

local config_raw = fread(CONFIG_FILE)
if config_raw then
  local cfg = json.decode(config_raw)
  if cfg then
    DEVICE_ID = cfg.deviceId
    HOSTNAME = cfg.hostname
    PLATFORM = cfg.platform
  end
end

-- Pick a friendly device name (what Hip shows): prefer the user custom
-- device name from Android settings, then the marketing name, then the raw
-- model. The hostname command is always "localhost" on Android so it is a
-- last resort.
local function get_device_name()
  local candidates = {
    shell('settings get global device_name'),
    shell('su -c "settings get global device_name"'),
    shell('settings get secure bluetooth_name'),
    shell('su -c "settings get secure bluetooth_name"'),
    shell("getprop ro.product.marketing_name"),
    shell("getprop ro.product.vendor.marketing_name"),
    shell("getprop ro.config.marketing_name"),
    shell("getprop ro.product.model"),
  }
  for _, c in ipairs(candidates) do
    if c and c ~= "" and c ~= "null" and c ~= "unknown" and c ~= "localhost" then
      return c
    end
  end
  return shell("hostname")
end

if not DEVICE_ID then
  DEVICE_ID = get_device_id()
  HOSTNAME = get_device_name()
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
  -- Refresh hostname if config still has the "localhost" placeholder from
  -- an older agent version, so existing installs upgrade automatically.
  if HOSTNAME == "localhost" or HOSTNAME == "" or HOSTNAME == nil then
    HOSTNAME = get_device_name()
    if HOSTNAME == "" then HOSTNAME = "termux-" .. DEVICE_ID:sub(1, 8) end
    -- Persist the updated name so we don't recompute every launch.
    local cfg_now = json.decode(config_raw) or {}
    cfg_now.hostname = HOSTNAME
    fwrite(CONFIG_FILE, json.encode(cfg_now))
  end
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
  local ok = start_ws(DEVICE_ID)
  if not ok then
    log(C.red .. "[" .. ts() .. "] connect failed, retry in " .. RECONNECT_DELAY .. "s" .. C.reset)
    sleep(RECONNECT_DELAY)
    goto continue
  end

  -- Auth
  ws_send({
    type = "auth",
    role = "device",
    deviceId = DEVICE_ID,
    accessKey = LICENSE_KEY,
  })

  -- Register ONLY on first connect of this agent session. Heartbeats keep
  -- the existing device entry alive; re-registering on every reconnect just
  -- churns the device record without adding info.
  if IS_NEW then
    ws_send({
      type = "register",
      deviceId = DEVICE_ID,
      hostname = HOSTNAME,
      platform = PLATFORM,
    })
    http_register()
    IS_NEW = false
  end

  -- First heartbeat immediately so the dashboard sees fresh data.
  do
    local pkgs = collect_packages()
    local screen = collect_screen()
    local stats = collect_stats()
    http_heartbeat(pkgs, screen, stats)
  end

  log(C.green .. "[" .. ts() .. "] online - streaming" .. C.reset)
  log(C.dim .. "Press Ctrl+C to stop." .. C.reset)

  local last_heartbeat = os.time()

  while true do
    local now = os.time()

    -- Heartbeat via WS
    if now - last_heartbeat >= HEARTBEAT_INTERVAL then
      local pkgs = collect_packages()
      -- No periodic trim -- Hip only trims per-launch. Doing it every
      -- heartbeat can nuke a clone that just went to background during a
      -- batch launch, which the user sees as a random force-close.
      local screen = collect_screen()
      local stats = collect_stats()
      ws_send({
        type = "heartbeat",
        deviceId = DEVICE_ID,
        hostname = HOSTNAME,
        packages = pkgs,
        screen = screen,
        stats = stats,
      })
      http_heartbeat(pkgs, screen, stats)
      last_heartbeat = now
    end

    -- Poll HTTP commands (dashboard queues commands via HTTP API)
    local cmd_raw = shell(string.format(
      'curl -s "%s/api/termux/commands?deviceId=%s" -H "X-Access-Key: %s"',
      BASE_URL, DEVICE_ID, LICENSE_KEY
    ))
    if cmd_raw ~= "" then
      local cmd_data = json.decode(cmd_raw)
      if cmd_data and cmd_data.commands then
        -- Collect all launch commands in this poll into one batch so we
        -- can apply the Roblox multi-open trick (open first fully -> rapid-
        -- fire the rest -> kill first to release the init lock).
        local batch = {}
        for _, cmd in ipairs(cmd_data.commands) do
          if cmd.type == "launch" and not was_seen(cmd.id) then
            batch[#batch+1] = cmd
          end
        end
        if #batch > 0 then batch_launch(batch) end
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
          local batch = {}
          for _, cmd in ipairs(msg.commands) do
            if cmd.type == "launch" and not was_seen(cmd.id) then
              batch[#batch+1] = cmd
            end
          end
          if #batch > 0 then batch_launch(batch) end
        end
      end
    end

    -- Auto-rejoin sweep: polls policy on its own throttle, detects
    -- dropped-out packages, schedules and fires relaunches. Safe to call
    -- every tick -- most calls are near-free.
    maybe_auto_rejoin()

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

export const dynamic = "force-dynamic";

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

  const script = LUA_AGENT.replace(/\$\$LICENSE\$\$/g, accessKey);

  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
