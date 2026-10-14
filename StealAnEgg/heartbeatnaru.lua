-- heartbeatnaru.lua
-- Lightweight in-game presence heartbeat, auto-deployed to every executor's
-- autoexec folder by the NaruHub agent on start. Every clone reports which
-- Roblox server (JobId) it is currently sitting in, so a launch/hop can avoid
-- stacking our own accounts onto one server. Reports ONLY presence -- it does
-- NOT touch the account stats that the main reporter (StealAnEgg) writes.
--
-- Also polls for teleport commands: when the server sets a teleport target
-- (via should-hop or rejoin-plan), the script executes TeleportToPlaceInstance
-- to move the clone to a different server without killing the app.
--
-- The agent serves this file with $$LICENSE$$ replaced by the device access
-- key before writing it into the autoexec dirs.

local BASE_URL = "https://naruhub.my.id"
local ACCESS_KEY = "$$LICENSE$$"
local DEVICE_ID = "$$DEVICEID$$"
local INTERVAL = 20

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TeleportService = game:GetService("TeleportService")

-- Executors expose their HTTP call under different globals -- try them all.
local httpreq = (syn and syn.request) or (http and http.request) or http_request or request
if not httpreq then return end

local function post(path, tbl)
	local okEnc, body = pcall(function() return HttpService:JSONEncode(tbl) end)
	if not okEnc then return end
	pcall(function()
		httpreq({
			Url = BASE_URL .. path,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["X-Access-Key"] = ACCESS_KEY,
			},
			Body = body,
		})
	end)
end

local function get(path)
	local ok, res = pcall(function()
		return httpreq({
			Url = BASE_URL .. path,
			Method = "GET",
			Headers = { ["X-Access-Key"] = ACCESS_KEY },
		})
	end)
	if ok and res and res.Body then
		local okDec, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
		if okDec then return data end
	end
	return nil
end

task.spawn(function()
	local lp = Players.LocalPlayer
	while not lp do
		task.wait(1)
		lp = Players.LocalPlayer
	end
	while true do
		local name = lp.Name
		local jobId = game.JobId
		local placeId = game.PlaceId
		if name and jobId and jobId ~= "" then
			post("/api/termux/presence", {
				account = name,
				deviceId = DEVICE_ID,
				jobId = jobId,
				placeId = placeId,
			})
			local cmd = get("/api/termux/teleport-command?account=" .. name .. "&deviceId=" .. DEVICE_ID)
			if cmd and cmd.teleport then
				local tp = cmd.teleport
				if tp.placeId and tp.jobId and tp.jobId ~= jobId then
					pcall(function()
						TeleportService:TeleportToPlaceInstance(tonumber(tp.placeId), tp.jobId, lp)
					end)
				end
			end
		end
		task.wait(INTERVAL + math.random(-5, 5))
	end
end)
