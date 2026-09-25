--!nocheck
-- NaruHub | Monitoring Anime Dice v1.0.0 (ultra-lightweight)
-- Monitoring only -- no auto-roll/sell/equip, baca data → POST ke dashboard.

------------------------------------------------------------
-- Cleanup dari run sebelumnya
------------------------------------------------------------
do
	local containers = {}
	local ok, hui = pcall(function()
		return gethui and gethui()
	end)
	if ok and hui then
		table.insert(containers, hui)
	end
	local coreGui = game:GetService("CoreGui")
	table.insert(containers, coreGui)
	local robloxGui = coreGui:FindFirstChild("RobloxGui")
	if robloxGui then
		table.insert(containers, robloxGui)
	end
	for _, container in ipairs(containers) do
		for _, child in ipairs(container:GetChildren()) do
			if child.Name == "AnimeDiceGUI" or child.Name == "AnimeDiceDropdown" or child.Name == "NaruHubAnimeDice" then
				child:Destroy()
			end
		end
	end
end

------------------------------------------------------------
-- Key Gate
------------------------------------------------------------
local SERVER_BASE_URL = "https://naruhub.my.id"
local function redactKey(value)
	value = tostring(value or "")
	if value == "" then return "" end
	if #value <= 6 then return string.rep("*", #value) end
	return value:sub(1, 3) .. "***" .. value:sub(-2)
end

local function logRequest(_tag, _url, _method, _statusCode, _responseBody, _err, _extra)
end

local DEVICE_ID = "unknown"
pcall(function()
	if gethwid then DEVICE_ID = gethwid() end
end)

local GRANTED_VIA_GLOBAL = true
local ACCESS_KEY_USED = ""

do
	local HttpService = game:GetService("HttpService")

	local function checkAccess(key)
		local body = HttpService:JSONEncode({ key = key or "" })
		local reqUrl = SERVER_BASE_URL .. "/api/check-access"
		local ok, res = pcall(function()
			return request({
				Url = reqUrl,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = body,
			})
		end)
		if not ok or not res then
			logRequest("check-access", reqUrl, "POST", nil, nil, res, "request_failed")
			return false, "Ga bisa hubungin server verifikasi -- coba lagi bentar.", true
		end
		logRequest("check-access", reqUrl, "POST", res.StatusCode, res.Body, nil, "key=" .. redactKey(key))
		if not res.Body then
			return false, "Ga bisa hubungin server verifikasi -- coba lagi bentar.", true
		end
		local decodeOk, parsed = pcall(function()
			return HttpService:JSONDecode(res.Body)
		end)
		if not decodeOk or type(parsed) ~= "table" then
			return false, "Respon server ga valid."
		end
		if parsed.ok then return true end
		return false, parsed.error or "Key salah."
	end

	local globalKey = ""
	pcall(function()
		if type(_G.NaruHub_Key) == "string" then
			globalKey = _G.NaruHub_Key
		end
	end)

	local granted, _errMsg, serverDown = checkAccess(globalKey)
	if not granted and globalKey ~= "" and serverDown then
		granted = true
	end
	GRANTED_VIA_GLOBAL = granted
	ACCESS_KEY_USED = globalKey

	if not granted then
		local container
		pcall(function() container = gethui and gethui() end)
		container = container or game:GetService("CoreGui")

		local screenGui = Instance.new("ScreenGui")
		screenGui.Name = "AnimeDiceKeyGate"
		screenGui.ResetOnSpawn = false
		screenGui.DisplayOrder = 9999
		screenGui.IgnoreGuiInset = true
		screenGui.Parent = container

		local frame = Instance.new("Frame")
		frame.Size = UDim2.new(0, 340, 0, 196)
		frame.Position = UDim2.new(0.5, -170, 0.5, -98)
		frame.BackgroundColor3 = Color3.fromRGB(20, 20, 31)
		frame.BorderSizePixel = 0
		frame.Parent = screenGui
		Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)

		local title = Instance.new("TextLabel")
		title.Text = "NaruHub -- Masukin Access Key"
		title.Font = Enum.Font.GothamBold
		title.TextSize = 16
		title.TextColor3 = Color3.fromRGB(232, 232, 240)
		title.BackgroundTransparency = 1
		title.Size = UDim2.new(1, -20, 0, 28)
		title.Position = UDim2.new(0, 10, 0, 12)
		title.TextXAlignment = Enum.TextXAlignment.Left
		title.Parent = frame

		local input = Instance.new("TextBox")
		input.PlaceholderText = "Access key..."
		input.Text = ""
		input.Font = Enum.Font.Gotham
		input.TextSize = 14
		input.TextColor3 = Color3.fromRGB(232, 232, 240)
		input.BackgroundColor3 = Color3.fromRGB(28, 28, 43)
		input.Size = UDim2.new(1, -20, 0, 36)
		input.Position = UDim2.new(0, 10, 0, 52)
		input.ClearTextOnFocus = false
		input.Parent = frame
		Instance.new("UICorner", input).CornerRadius = UDim.new(0, 8)

		local status = Instance.new("TextLabel")
		status.Text = "Device kamu belum di-whitelist. Masukin access key buat lanjut."
		status.Font = Enum.Font.Gotham
		status.TextSize = 12
		status.TextColor3 = Color3.fromRGB(139, 139, 163)
		status.TextWrapped = true
		status.BackgroundTransparency = 1
		status.Size = UDim2.new(1, -20, 0, 54)
		status.Position = UDim2.new(0, 10, 0, 96)
		status.TextXAlignment = Enum.TextXAlignment.Left
		status.TextYAlignment = Enum.TextYAlignment.Top
		status.Parent = frame

		local submit = Instance.new("TextButton")
		submit.Text = "Submit"
		submit.Font = Enum.Font.GothamBold
		submit.TextSize = 14
		submit.TextColor3 = Color3.fromRGB(26, 16, 48)
		submit.BackgroundColor3 = Color3.fromRGB(167, 139, 250)
		submit.Size = UDim2.new(1, -20, 0, 34)
		submit.Position = UDim2.new(0, 10, 0, 154)
		submit.Parent = frame
		Instance.new("UICorner", submit).CornerRadius = UDim.new(0, 8)

		local resultEvent = Instance.new("BindableEvent")
		local submitting = false

		local function trySubmit()
			if submitting then return end
			submitting = true
			status.Text = "Ngecek key..."
			status.TextColor3 = Color3.fromRGB(139, 139, 163)
			local okNow, reason = checkAccess(input.Text)
			if okNow then
				status.Text = "Key valid, lanjut..."
				status.TextColor3 = Color3.fromRGB(52, 211, 153)
				task.wait(0.3)
				resultEvent:Fire()
			else
				status.Text = tostring(reason)
				status.TextColor3 = Color3.fromRGB(248, 113, 113)
				submitting = false
			end
		end

		submit.MouseButton1Click:Connect(trySubmit)
		input.FocusLost:Connect(function(enterPressed)
			if enterPressed then trySubmit() end
		end)

		resultEvent.Event:Wait()
		screenGui:Destroy()
	end
end

if not GRANTED_VIA_GLOBAL then return end

------------------------------------------------------------
-- NaruUI (loaded from GitHub)
------------------------------------------------------------
local httpGet = game.HttpGet or HttpGet
local _naruSrc = httpGet(game, "https://raw.githubusercontent.com/MasPutram/NaruHub/main/ui-template/NaruUI.luau?v=" .. tostring(tick()))
local _naruFn, _naruErr = loadstring(_naruSrc)
if not _naruFn then
	error("NaruUI loadstring failed: " .. tostring(_naruErr))
end
local NaruUI = _naruFn()

------------------------------------------------------------
-- Game data access
------------------------------------------------------------
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local LocalPlayer = Players.LocalPlayer

local DataController = require(ReplicatedStorage.Framework.Features.Data.DataController)
local EntryRegistry = require(ReplicatedStorage.Framework.Features.Inventory.EntryRegistry)

------------------------------------------------------------
-- Rarity tier map (higher = rarer)
------------------------------------------------------------
local RARITY_TIER = {
	Common = 1,
	Uncommon = 2,
	Rare = 3,
	Epic = 4,
	Legendary = 5,
	Mythical = 6,
	Divine = 7,
	Exotic = 8,
	["Secret I"] = 9,
	Celestial = 9,
	["Secret II"] = 10,
	Heavenly = 10,
	Exclusive = 11,
}

------------------------------------------------------------
-- Data collectors
------------------------------------------------------------
local function collectAccountStats()
	local X = DataController.___X
	return {
		money = X.Money or 0,
		rolls = X.Rolls or 0,
		rebirth = X.Rebirth or 0,
		dice = X.Dice or "Normal",
		autoRoll = X.AutoRoll or false,
		autoSell = X.AutoSell or 0,
		vip = (X.OwnedGamepasses and X.OwnedGamepasses.VIP) or false,
	}
end

local function collectInventory()
	local X = DataController.___X
	local inv = X.Inventory or {}
	local allEntries = EntryRegistry:allEntries()

	local units = {}
	local totalCount = 0

	for id, entry in pairs(inv) do
		if type(entry) == "table" and entry.name then
			totalCount += (entry.amount or 1)
			local cfg = allEntries[entry.name]
			local rarity = cfg and cfg.rarity or "Unknown"
			local variant = cfg and cfg.variant or nil
			local kind = cfg and cfg.kind or "Unknown"
			local order = cfg and cfg.order or 0

			if kind == "Unit" then
				table.insert(units, {
					id = id,
					name = entry.name,
					amount = entry.amount or 1,
					rarity = rarity,
					variant = variant,
					order = order,
					tier = RARITY_TIER[rarity] or 0,
					mutation = entry.attributes and entry.attributes.mutation or nil,
					level = entry.attributes and entry.attributes.level or nil,
				})
			end
		end
	end

	table.sort(units, function(a, b)
		if a.tier ~= b.tier then return a.tier > b.tier end
		return a.order > b.order
	end)

	return units, totalCount
end

local function collectOwnedDice()
	local X = DataController.___X
	local owned = X.OwnedDice or {}
	local list = {}
	for name, val in pairs(owned) do
		if val then table.insert(list, name) end
	end
	table.sort(list)
	return list
end

local function collectUpgradesSummary()
	local X = DataController.___X
	local upgrades = X.Upgrades or {}
	local summary = {}

	for name, unlocked in pairs(upgrades) do
		if unlocked then
			local category, levelStr = name:match("^(.+)%s+([IVXLCDM]+)$")
			if category and levelStr then
				local level = #levelStr
				if levelStr == "IV" then level = 4
				elseif levelStr == "IX" then level = 9
				elseif levelStr == "XIV" then level = 14
				elseif levelStr == "XIII" then level = 13
				elseif levelStr == "XII" then level = 12
				elseif levelStr == "XI" then level = 11
				else
					level = 0
					for c in levelStr:gmatch(".") do
						if c == "I" then level += 1
						elseif c == "V" then level += 5
						elseif c == "X" then level += 10
						elseif c == "L" then level += 50
						elseif c == "C" then level += 100
						end
					end
				end
				if not summary[category] or level > summary[category] then
					summary[category] = level
				end
			end
		end
	end

	return summary
end

local function countDiscovered()
	local X = DataController.___X
	local disc = X.DiscoveredUnits or {}
	local count = 0
	for _ in pairs(disc) do count += 1 end
	return count
end

local function collectGamepasses()
	local X = DataController.___X
	local gp = X.OwnedGamepasses or {}
	local result = {}
	for name, val in pairs(gp) do
		result[name] = val
	end
	return result
end

local function countSlots()
	local X = DataController.___X
	local slots = X.Slots or {}
	local count = 0
	for _ in pairs(slots) do count += 1 end
	return count
end

------------------------------------------------------------
-- Report to monitor (dashboard)
------------------------------------------------------------
local function reportToMonitor()
	local ok, err = pcall(function()
		local stats = collectAccountStats()
		local units, totalInventory = collectInventory()
		local ownedDice = collectOwnedDice()
		local upgradesSummary = collectUpgradesSummary()
		local discoveredCount = countDiscovered()
		local gamepasses = collectGamepasses()
		local slotsCount = countSlots()

		local topUnits = {}
		for i = 1, math.min(5, #units) do
			local u = units[i]
			table.insert(topUnits, {
				name = u.name,
				rarity = u.rarity,
				variant = u.variant,
				mutation = u.mutation,
				level = u.level,
				amount = u.amount,
			})
		end

		local payload = {
			game = "AnimeDice",
			sourceAccount = LocalPlayer.Name,
			money = stats.money,
			rolls = stats.rolls,
			rebirth = stats.rebirth,
			dice = stats.dice,
			autoRoll = stats.autoRoll,
			autoSell = stats.autoSell,
			vip = stats.vip,
			unitsCount = totalInventory,
			unitTypesCount = #units,
			discoveredCount = discoveredCount,
			slotsCount = slotsCount,
			ownedDiceCount = #ownedDice,
			ownedDice = ownedDice,
			gamepasses = gamepasses,
			topUnits = topUnits,
			upgrades = upgradesSummary,
		}

		local body = HttpService:JSONEncode(payload)
		local reqUrl = SERVER_BASE_URL .. "/api/anime-dice/monitor"
		local okReq, res = pcall(function()
			return request({
				Url = reqUrl,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["X-Device-Id"] = DEVICE_ID,
					["X-Access-Key"] = ACCESS_KEY_USED,
				},
				Body = body,
			})
		end)
		if okReq and res then
			logRequest("monitor", reqUrl, "POST", res.StatusCode, res.Body, nil, "accessKey=" .. redactKey(ACCESS_KEY_USED))
			pcall(function()
				local resBody = res.Body
				if type(resBody) == "string" and resBody ~= "" then
					local okDec, data = pcall(function()
						return HttpService:JSONDecode(resBody)
					end)
					if okDec and type(data) == "table" and data.forSale == true then
						LocalPlayer:Kick("Siap Jual")
					end
				end
			end)
		else
			logRequest("monitor", reqUrl, "POST", nil, nil, res, "accessKey=" .. redactKey(ACCESS_KEY_USED))
		end
	end)
	return ok, err
end

------------------------------------------------------------
-- NaruUI Window (status only)
------------------------------------------------------------
local Fluent = NaruUI.New({
	BrandColor = Color3.fromRGB(255, 100, 100),
	ConfigPrefix = "AnimeDice",
})

local Window = Fluent:CreateWindow({
	Title = "NaruHub | AnimeDice v1.0.0",
	Badge = "MONITOR",
	TabWidth = 0,
	Size = UDim2.fromOffset(380, 300),
	AutoStartMinimized = false,
})

do
	local hui = (gethui and gethui()) or game:GetService("CoreGui")
	for _, o in ipairs(hui:GetChildren()) do
		if o.Name == "AnimeDiceMinBtn" then pcall(function() o:Destroy() end) end
	end

	task.spawn(function()
		local wiredLogo
		while Fluent.GUI and Fluent.GUI.Parent do
			local lc = hui:FindFirstChild("AnimeDiceLauncher")
			if lc then
				if not lc.Enabled then lc.Enabled = true end
				local logo = lc:FindFirstChild("Logo")
				if logo then
					if logo.Position ~= UDim2.fromOffset(4, 88) then
						logo.Position = UDim2.fromOffset(4, 88)
					end
				end
				if logo and logo ~= wiredLogo then
					wiredLogo = logo
					if getconnections then
						local ok, conns = pcall(function()
							return getconnections(logo.MouseButton1Click)
						end)
						if ok and conns then
							for _, c in ipairs(conns) do
								pcall(function()
									if c.Disable then c:Disable()
									elseif c.Disconnect then c:Disconnect() end
								end)
							end
						end
					end
					logo.MouseButton1Click:Connect(function()
						if Fluent.GUI and Fluent.GUI.Enabled then
							if Window.Minimize then Window.Minimize() end
						else
							if Window.Restore then Window.Restore() end
						end
					end)
				end
			end
			task.wait(0.3)
		end
	end)
end

do
	if Fluent.GUI then Fluent.GUI.DisplayOrder = -1000 end
	local hui = (gethui and gethui()) or game:GetService("CoreGui")
	local function pushLauncher()
		local lc = hui:FindFirstChild("AnimeDiceLauncher")
		if lc then lc.DisplayOrder = -999 end
	end
	pushLauncher()
	hui.ChildAdded:Connect(function(c)
		if c.Name == "AnimeDiceLauncher" then
			task.wait()
			pushLauncher()
		end
	end)
end

local StatusTab = Window:AddTab({ Title = "" })
local section = StatusTab:AddSection(LocalPlayer.Name, { NoCollapse = true })

local usernamePara = section:AddParagraph({
	Title = "Username",
	Content = LocalPlayer.Name,
	ContentSize = 14,
	Center = true,
})

do
	local myName = LocalPlayer.Name
	local myPrefix = myName:match("^(%D+)%d+$")

	local function refreshUsernameList()
		if not myPrefix then
			usernamePara:SetContent(myName)
			return
		end
		local matches = {}
		for _, p in ipairs(Players:GetPlayers()) do
			local prefix, num = p.Name:match("^(%D+)(%d+)$")
			if prefix == myPrefix then
				table.insert(matches, { name = p.Name, num = tonumber(num) or 0 })
			end
		end
		if #matches <= 1 then
			usernamePara:SetContent(myName)
			return
		end
		table.sort(matches, function(a, b) return a.num < b.num end)
		local names = {}
		for _, m in ipairs(matches) do
			local tag = m.name == myName and " ← ini" or ""
			table.insert(names, m.name .. tag)
		end
		usernamePara:SetContent(table.concat(names, "\n"))
	end

	Players.PlayerAdded:Connect(function() task.wait(0.5) refreshUsernameList() end)
	Players.PlayerRemoving:Connect(function() task.wait(0.5) refreshUsernameList() end)
	task.spawn(refreshUsernameList)
end

local monitorPara = section:AddParagraph({
	Title = "Monitor",
	Content = "Starting...",
	ContentSize = 14,
	Center = true,
})

------------------------------------------------------------
-- Auto-start monitoring loop
------------------------------------------------------------
task.spawn(function()
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		local ok, err = reportToMonitor()
		local ping = 0
		pcall(function()
			ping = math.floor((LocalPlayer:GetNetworkPing() or 0) * 1000)
		end)
		local pingStr = ping > 0 and (" " .. ping .. "ms") or ""
		if ok then
			monitorPara:SetContent("OK" .. pingStr)
		else
			monitorPara:SetContent("Gagal" .. pingStr)
		end
		task.wait(30)
	end
end)
