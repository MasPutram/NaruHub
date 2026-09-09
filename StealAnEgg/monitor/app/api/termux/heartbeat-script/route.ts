import { NextRequest, NextResponse } from "next/server";

// Serves heartbeatnaru.lua with the caller's access key baked in. The agent
// fetches this on startup and writes it into every executor autoexec dir, so
// each clone reports its Roblox server (JobId) presence. Keep this in sync
// with StealAnEgg/heartbeatnaru.lua (this string is the deployed source).
const HEARTBEAT_SCRIPT = `-- heartbeatnaru.lua (auto-deployed by NaruHub agent)
local BASE_URL = "https://naruhub.my.id"
local ACCESS_KEY = "$$LICENSE$$"
local INTERVAL = 20

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")

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
				jobId = jobId,
				placeId = placeId,
			})
		end
		task.wait(INTERVAL)
	end
end)
`;

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return NextResponse.json(null, { status: 204 });
}

export async function GET(req: NextRequest) {
  const accessKey = req.nextUrl.searchParams.get("key");
  if (!accessKey) {
    return new NextResponse("-- Error: access key required\n", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const script = HEARTBEAT_SCRIPT.replace(/\$\$LICENSE\$\$/g, accessKey);
  return new NextResponse(script, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
