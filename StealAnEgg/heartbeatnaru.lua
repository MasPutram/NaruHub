-- heartbeatnaru.lua
-- Lightweight in-game presence heartbeat, auto-deployed to every executor's
-- autoexec folder by the NaruHub agent on start. Every clone reports which
-- Roblox server (JobId) it is currently sitting in, so a launch/hop can avoid
-- stacking our own accounts onto one server. Reports ONLY presence -- it does
-- NOT touch the account stats that the main reporter (StealAnEgg) writes.
--
-- The agent serves this file with $$LICENSE$$ replaced by the device access
-- key before writing it into the autoexec dirs.

local BASE_URL = "https://naruhub.my.id"
local ACCESS_KEY = "$$LICENSE$$"
local DEVICE_ID = "$$DEVICEID$$"
local INTERVAL = 20 -- seconds between presence pings

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")

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
		end
		task.wait(INTERVAL)
	end
end)
