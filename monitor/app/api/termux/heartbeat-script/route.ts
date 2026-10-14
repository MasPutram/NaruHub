import { NextRequest, NextResponse } from "next/server";
import { isValidKey } from "@/lib/auth";

// Serves heartbeatnaru.lua with the caller's access key baked in. The agent
// fetches this on startup and writes it into every executor autoexec dir, so
// each clone reports its Roblox server (JobId) presence. Keep this in sync
// with heartbeatnaru.lua (this string is the deployed source).
const HEARTBEAT_SCRIPT = `-- heartbeatnaru.lua (auto-deployed by NaruHub agent)
local BASE_URL = "https://naruhub.my.id"
local ACCESS_KEY = "$$LICENSE$$"
local DEVICE_ID = "$$DEVICEID$$"
local INTERVAL = 20

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TeleportService = game:GetService("TeleportService")

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
`;

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const accessKey = req.nextUrl.searchParams.get("key");
  if (!accessKey || !isValidKey(accessKey)) {
    return new NextResponse("-- Error: valid access key required\n", {
      status: accessKey ? 401 : 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  const script = HEARTBEAT_SCRIPT
    .replace(/\$\$LICENSE\$\$/g, accessKey)
    .replace(/\$\$DEVICEID\$\$/g, deviceId);
  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
