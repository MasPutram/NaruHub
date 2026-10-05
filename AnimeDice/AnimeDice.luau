--!nocheck
-- NaruHub | Monitoring Anime Dice v2.3.0
-- Monitoring only -- no auto-roll/sell/equip, baca data → POST ke dashboard.
-- Self-contained GUI (no external NaruUI fetch).

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
		if not container then pcall(function() container = game:GetService("CoreGui") end) end
		container = container or game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")

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
-- Services
------------------------------------------------------------
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")

------------------------------------------------------------
-- Inline GUI builder (replaces external NaruUI)
------------------------------------------------------------
local GUI_ALIVE = true
local screenGui

do
	local container
	pcall(function() container = gethui and gethui() end)
	if not container then pcall(function() container = game:GetService("CoreGui") end) end
	container = container or LocalPlayer:WaitForChild("PlayerGui")

	-- Clean up old copies
	pcall(function()
		for _, o in ipairs(container:GetChildren()) do
			if o.Name == "AnimeDiceGUI" then
				pcall(function() o:Destroy() end)
			end
		end
	end)

	screenGui = Instance.new("ScreenGui")
	screenGui.Name = "AnimeDiceGUI"
	screenGui.ResetOnSpawn = false
	screenGui.DisplayOrder = 100
	screenGui.IgnoreGuiInset = true
	screenGui.Parent = container
end

-- Main window frame
local BG = Color3.fromRGB(15, 15, 25)
local CARD = Color3.fromRGB(22, 22, 38)
local INK = Color3.fromRGB(232, 232, 240)
local DIM = Color3.fromRGB(100, 100, 130)
local ACCENT = Color3.fromRGB(255, 100, 100)

local mainFrame = Instance.new("Frame")
mainFrame.Name = "Main"
mainFrame.Size = UDim2.fromOffset(360, 260)
mainFrame.Position = UDim2.new(0.5, 0, 0.5, 0)
mainFrame.AnchorPoint = Vector2.new(0.5, 0.5)
mainFrame.BackgroundColor3 = BG
mainFrame.BackgroundTransparency = 0.04
mainFrame.BorderSizePixel = 0
mainFrame.ClipsDescendants = true
mainFrame.Parent = screenGui
Instance.new("UICorner", mainFrame).CornerRadius = UDim.new(0, 12)
local stroke = Instance.new("UIStroke", mainFrame)
stroke.Color = Color3.fromRGB(40, 40, 55)
stroke.Thickness = 1

-- Title bar
local titleBar = Instance.new("Frame")
titleBar.Name = "TitleBar"
titleBar.Size = UDim2.new(1, 0, 0, 36)
titleBar.BackgroundColor3 = CARD
titleBar.BorderSizePixel = 0
titleBar.Parent = mainFrame

local titleLabel = Instance.new("TextLabel")
titleLabel.Text = "NaruHub | Anime Dice v2.4.3"
titleLabel.Font = Enum.Font.GothamBold
titleLabel.TextSize = 13
titleLabel.TextColor3 = INK
titleLabel.BackgroundTransparency = 1
titleLabel.Size = UDim2.new(1, -76, 1, 0)
titleLabel.Position = UDim2.new(0, 12, 0, 0)
titleLabel.TextXAlignment = Enum.TextXAlignment.Left
titleLabel.Parent = titleBar

local badge = Instance.new("TextLabel")
badge.Text = "MONITOR"
badge.Font = Enum.Font.GothamBold
badge.TextSize = 9
badge.TextColor3 = ACCENT
badge.BackgroundColor3 = Color3.fromRGB(255, 100, 100)
badge.BackgroundTransparency = 0.88
badge.Size = UDim2.new(0, 62, 0, 20)
badge.Position = UDim2.new(1, -74, 0, 8)
badge.BorderSizePixel = 0
badge.Parent = titleBar
Instance.new("UICorner", badge).CornerRadius = UDim.new(0, 4)

-- Draggable title bar
do
	local dragging, dragStart, startPos
	titleBar.InputBegan:Connect(function(inp)
		if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then
			dragging = true
			dragStart = inp.Position
			startPos = mainFrame.Position
		end
	end)
	titleBar.InputEnded:Connect(function(inp)
		if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then
			dragging = false
		end
	end)
	UserInputService.InputChanged:Connect(function(inp)
		if dragging and (inp.UserInputType == Enum.UserInputType.MouseMovement or inp.UserInputType == Enum.UserInputType.Touch) then
			local delta = inp.Position - dragStart
			mainFrame.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
		end
	end)
end

-- Content area
local content = Instance.new("Frame")
content.Name = "Content"
content.Size = UDim2.new(1, -24, 1, -48)
content.Position = UDim2.new(0, 12, 0, 42)
content.BackgroundTransparency = 1
content.Parent = mainFrame
local layout = Instance.new("UIListLayout", content)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Padding = UDim.new(0, 8)

-- Section header
local sectionLabel = Instance.new("TextLabel")
sectionLabel.Text = LocalPlayer.Name
sectionLabel.Font = Enum.Font.GothamBold
sectionLabel.TextSize = 14
sectionLabel.TextColor3 = INK
sectionLabel.BackgroundTransparency = 1
sectionLabel.Size = UDim2.new(1, 0, 0, 22)
sectionLabel.TextXAlignment = Enum.TextXAlignment.Left
sectionLabel.LayoutOrder = 1
sectionLabel.Parent = content

-- Username paragraph
local function makePara(title, initialContent, order)
	local frame = Instance.new("Frame")
	frame.Name = title
	frame.BackgroundColor3 = CARD
	frame.BackgroundTransparency = 0.3
	frame.Size = UDim2.new(1, 0, 0, 50)
	frame.AutomaticSize = Enum.AutomaticSize.Y
	frame.BorderSizePixel = 0
	frame.LayoutOrder = order
	frame.Parent = content
	Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 8)
	local pad = Instance.new("UIPadding", frame)
	pad.PaddingLeft = UDim.new(0, 10)
	pad.PaddingRight = UDim.new(0, 10)
	pad.PaddingTop = UDim.new(0, 8)
	pad.PaddingBottom = UDim.new(0, 8)

	local tl = Instance.new("TextLabel")
	tl.Text = title
	tl.Font = Enum.Font.GothamBold
	tl.TextSize = 10
	tl.TextColor3 = DIM
	tl.BackgroundTransparency = 1
	tl.Size = UDim2.new(1, 0, 0, 14)
	tl.TextXAlignment = Enum.TextXAlignment.Left
	tl.Parent = frame

	local cl = Instance.new("TextLabel")
	cl.Name = "Value"
	cl.Text = initialContent
	cl.Font = Enum.Font.Gotham
	cl.TextSize = 14
	cl.TextColor3 = INK
	cl.TextWrapped = true
	cl.RichText = true
	cl.BackgroundTransparency = 1
	cl.Size = UDim2.new(1, 0, 0, 18)
	cl.AutomaticSize = Enum.AutomaticSize.Y
	cl.Position = UDim2.new(0, 0, 0, 16)
	cl.TextXAlignment = Enum.TextXAlignment.Center
	cl.Parent = frame

	local function setContent(text)
		cl.Text = text
	end
	return frame, setContent
end

local _, setUserContent = makePara("Username", LocalPlayer.Name, 2)
local _, setMonitorContent = makePara("Monitor", "Starting...", 3)

-- Launcher circle (NaruUI-style minimize/restore toggle)
do
	local launcherContainer
	pcall(function() launcherContainer = gethui and gethui() end)
	if not launcherContainer then pcall(function() launcherContainer = game:GetService("CoreGui") end) end
	launcherContainer = launcherContainer or LocalPlayer:WaitForChild("PlayerGui")

	pcall(function()
		for _, o in ipairs(launcherContainer:GetChildren()) do
			if o.Name == "AnimeDiceLauncher" then
				pcall(function() o:Destroy() end)
			end
		end
	end)

	local launcher = Instance.new("ScreenGui")
	launcher.Name = "AnimeDiceLauncher"
	launcher.ResetOnSpawn = false
	launcher.IgnoreGuiInset = true
	launcher.DisplayOrder = 2000000000
	launcher.Enabled = true
	pcall(function() launcher.Parent = launcherContainer end)
	if not launcher.Parent then
		launcher.Parent = LocalPlayer:WaitForChild("PlayerGui")
	end

	local logoBtn = Instance.new("ImageButton")
	logoBtn.Name = "Logo"
	logoBtn.Size = UDim2.fromOffset(42, 42)
	logoBtn.Position = UDim2.fromOffset(4, 100)
	logoBtn.BackgroundColor3 = Color3.fromRGB(6, 6, 7)
	logoBtn.BackgroundTransparency = 0.02
	logoBtn.AutoButtonColor = false
	logoBtn.Image = ""
	logoBtn.Parent = launcher

	Instance.new("UICorner", logoBtn).CornerRadius = UDim.new(1, 0)

	local logoStroke = Instance.new("UIStroke", logoBtn)
	logoStroke.Color = ACCENT
	logoStroke.Thickness = 1.5

	local lbl = Instance.new("TextLabel")
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.fromScale(1, 1)
	lbl.Font = Enum.Font.GothamBold
	lbl.TextSize = 24
	lbl.TextColor3 = Color3.fromRGB(255, 255, 255)
	lbl.Text = "N"
	lbl.Parent = logoBtn

	local function setMinimized(state)
		screenGui.Enabled = not state
	end

	local dragging, dragStart, startPos, movedFar = false, nil, nil, false
	logoBtn.InputBegan:Connect(function(inp)
		if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then
			dragging = true
			movedFar = false
			dragStart = inp.Position
			startPos = logoBtn.Position
		end
	end)
	UserInputService.InputChanged:Connect(function(inp)
		if dragging and (inp.UserInputType == Enum.UserInputType.MouseMovement or inp.UserInputType == Enum.UserInputType.Touch) then
			local delta = inp.Position - dragStart
			if delta.Magnitude > 4 then movedFar = true end
			logoBtn.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
		end
	end)
	UserInputService.InputEnded:Connect(function(inp)
		if inp.UserInputType == Enum.UserInputType.MouseButton1 or inp.UserInputType == Enum.UserInputType.Touch then
			if dragging and not movedFar then
				setMinimized(screenGui.Enabled)
			end
			dragging = false
		end
	end)
end

------------------------------------------------------------
-- My accounts in this server (same JobId from dashboard API)
------------------------------------------------------------
do
	local myName = LocalPlayer.Name
	local currentJobId = game.JobId
	local sameServerAccounts = {}

	local function fetchSameServerAccounts()
		local ok, result = pcall(function()
			local res = request({
				Url = SERVER_BASE_URL .. "/api/anime-dice/accounts",
				Method = "GET",
				Headers = { ["Content-Type"] = "application/json" },
			})
			if res and res.Body then
				local parsed = game:GetService("HttpService"):JSONDecode(res.Body)
				if parsed and parsed.accounts then
					local set = {}
					for _, acc in ipairs(parsed.accounts) do
						if acc.sourceAccount and acc.jobId == currentJobId then
							set[acc.sourceAccount] = true
						end
					end
					return set
				end
			end
			return {}
		end)
		sameServerAccounts = ok and result or {}
	end

	local function refreshPlayerList()
		local names = {}
		for name in pairs(sameServerAccounts) do
			local tag = name == myName and " ← ini" or ""
			table.insert(names, name .. tag)
		end
		if #names <= 1 then
			setUserContent(myName)
			return
		end
		table.sort(names)
		setUserContent(table.concat(names, "\n"))
	end

	task.spawn(function()
		task.wait(5)
		fetchSameServerAccounts()
		refreshPlayerList()
	end)

	task.spawn(function()
		while GUI_ALIVE and screenGui and screenGui.Parent do
			task.wait(35)
			fetchSameServerAccounts()
			refreshPlayerList()
		end
	end)
end

------------------------------------------------------------
-- Game data access
------------------------------------------------------------
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")

local DataController = require(ReplicatedStorage.Framework.Features.Data.DataController)
local EntryRegistry = require(ReplicatedStorage.Framework.Features.Inventory.EntryRegistry)
local MutationsConfig = require(ReplicatedStorage.Framework.Features.Inventory.Kinds.Unit.Mutations)
local TraitsConfig = require(ReplicatedStorage.Framework.Features.Traits.Traits)
local GradesConfig = require(ReplicatedStorage.Framework.Features.Grades.Grades)
local BuffController = require(ReplicatedStorage.Framework.Features.Buffs.BuffController)
local WeatherConfig = require(ReplicatedStorage.Framework.Features.Weather.WeatherConfig)
local ActiveWeatherProp = require(ReplicatedStorage.Packages.Network)
	.ClientComm.new(ReplicatedStorage.Network, false, "WeatherService")
	:GetProperty("ActiveWeather")

------------------------------------------------------------
-- Multiplier helpers
------------------------------------------------------------
local function getMutationChanceMult(mutation)
	if not mutation or mutation == "" then return 1 end
	local cfg = MutationsConfig[mutation]
	return cfg and cfg.chance or 1
end

local function getGradeIncomeMult(grade)
	if not grade or grade == "" then return 1 end
	local cfg = GradesConfig[grade]
	return cfg and cfg.incomeMultiplier or 1
end

local function getTraitMults(trait)
	if not trait or trait == "" then return 1, 1, 1 end
	local cfg = TraitsConfig[trait]
	if not cfg then return 1, 1, 1 end
	return cfg.incomeMultiplier or 1, cfg.damageMultiplier or 1, cfg.healthMultiplier or 1
end

------------------------------------------------------------
-- Color helpers
------------------------------------------------------------
local function color3ToHex(c)
	return string.format("#%02X%02X%02X",
		math.floor(c.R * 255 + 0.5),
		math.floor(c.G * 255 + 0.5),
		math.floor(c.B * 255 + 0.5))
end

local function gradientToHexArray(gradient)
	if typeof(gradient) ~= "ColorSequence" then return nil end
	local seen = {}
	local colors = {}
	for _, kp in ipairs(gradient.Keypoints) do
		local hex = color3ToHex(kp.Value)
		if not seen[hex] then
			seen[hex] = true
			table.insert(colors, hex)
		end
	end
	return colors
end

local function getShirtId(model)
	if not model then return nil end
	local shirt = model:FindFirstChildOfClass("Shirt")
	if shirt and shirt.ShirtTemplate ~= "" then
		return shirt.ShirtTemplate:match("(%d+)")
	end
	return nil
end

------------------------------------------------------------
-- Rarity tier map
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

local function getDisplayRarity(cfg, mutation)
	if not cfg or not cfg.getRarity then return cfg and cfg.rarity or "Unknown" end
	local proxy = {}
	for k, v in pairs(cfg) do proxy[k] = v end
	if mutation then proxy.mutation = mutation end
	local ok, result = pcall(function() return cfg.getRarity(proxy) end)
	return ok and result or cfg.rarity
end

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
	local backpack = {}
	local totalUnitCount = 0
	local totalItemCount = 0

	for id, entry in pairs(inv) do
		if type(entry) == "table" and entry.name then
			local cfg = allEntries[entry.name]
			local rarity = cfg and cfg.rarity or "Unknown"
			local variant = cfg and cfg.variant or nil
			local kind = cfg and cfg.kind or "Unknown"
			local order = cfg and cfg.order or 0

			if kind == "Unit" then
				totalUnitCount += (entry.amount or 1)

				local attrs = entry.attributes or {}
				local income, damage, chance, health
				if cfg then
					pcall(function() income = cfg:income() end)
					pcall(function() damage = cfg:damage() end)
					pcall(function() chance = cfg:chance() end)
					pcall(function() health = cfg:health() end)
				end
				local mutChance = getMutationChanceMult(attrs.mutation)
				if chance and mutChance ~= 1 then chance = chance * mutChance end

				local gradeIncome = getGradeIncomeMult(attrs.grade)
				local traitIncome, traitDamage, traitHealth = getTraitMults(attrs.trait)
				local level = attrs.level or 1
				local levelMult = 0.75 + 0.25 * level
				local mutIncomeMult = mutChance ~= 1 and mutChance ^ 0.725 or 1
				local mutCombatMult = mutChance ~= 1 and mutChance ^ 0.58 or 1
				if income then income = income * gradeIncome * traitIncome * levelMult * mutIncomeMult end
				if damage then damage = damage * traitDamage * mutCombatMult end
				if health then health = health * traitHealth * mutCombatMult end

				local displayRarity = getDisplayRarity(cfg, attrs.mutation)

				table.insert(units, {
					id = id,
					name = entry.name,
					amount = entry.amount or 1,
					rarity = rarity,
					displayRarity = displayRarity,
					variant = variant,
					order = order,
					tier = RARITY_TIER[displayRarity] or RARITY_TIER[rarity] or 0,
					mutation = attrs.mutation,
					level = attrs.level,
					trait = attrs.trait,
					grade = attrs.grade,
					locked = attrs.locked or nil,
					income = income,
					damage = damage,
					chance = chance,
					health = health,
					colors = cfg and gradientToHexArray(cfg.gradient) or nil,
					modelName = cfg and cfg.baseModel and cfg.baseModel.Name or nil,
					shirtId = cfg and getShirtId(cfg.baseModel) or nil,
				})
			else
				totalItemCount += (entry.amount or 1)
				local slot, tier
				if cfg then
					slot = cfg.slot or cfg.Slot or cfg.gearSlot or cfg.GearSlot or cfg.category or cfg.Category
					tier = cfg.tier or cfg.Tier
				end
				local image
				if cfg and cfg.image then
					local raw = tostring(cfg.image)
					image = raw:match("(%d+)$")
				end
				table.insert(backpack, {
					name = entry.name,
					amount = entry.amount or 1,
					kind = kind,
					rarity = rarity,
					slot = slot,
					tier = tier,
					image = image,
				})
			end
		end
	end

	table.sort(units, function(a, b)
		if a.tier ~= b.tier then return a.tier > b.tier end
		return a.order > b.order
	end)

	table.sort(backpack, function(a, b)
		return (a.amount or 0) > (b.amount or 0)
	end)

	return units, totalUnitCount, backpack, totalItemCount
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

------------------------------------------------------------
-- Active server event (weather system)
------------------------------------------------------------
local function collectActiveEvent()
	local ok, result = pcall(function()
		local current = ActiveWeatherProp:Get()
		if not current or not current.name then return nil end
		local remaining = current.duration - (workspace:GetServerTimeNow() - current.startedAt)
		if remaining <= 0 then return nil end
		local buffs
		pcall(function()
			local cfg = WeatherConfig.Get(current.name)
			if cfg and cfg.buffs then
				buffs = {}
				for buffName, buffData in pairs(cfg.buffs) do
					buffs[buffName] = { bucket = buffData.bucket, amount = buffData.amount }
				end
			end
		end)
		return {
			name = current.name,
			duration = current.duration,
			startedAt = current.startedAt,
			remaining = remaining,
			buffs = buffs,
		}
	end)
	return ok and result or nil
end

------------------------------------------------------------
-- Report to monitor (dashboard)
------------------------------------------------------------
local function reportToMonitor()
	local ok, err = pcall(function()
		local stats = collectAccountStats()
		local units, totalUnitCount, backpackItems, totalItemCount = collectInventory()
		local ownedDice = collectOwnedDice()
		local upgradesSummary = collectUpgradesSummary()
		local discoveredCount = countDiscovered()
		local gamepasses = collectGamepasses()

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

		local allUnits = {}
		for _, u in ipairs(units) do
			table.insert(allUnits, {
				name = u.name,
				rarity = u.rarity,
				variant = u.variant,
				mutation = u.mutation,
				level = u.level,
				trait = u.trait,
				grade = u.grade,
				locked = u.locked,
				amount = u.amount,
				income = u.income,
				damage = u.damage,
				chance = u.chance,
				health = u.health,
				colors = u.colors,
				modelName = u.modelName,
				shirtId = u.shirtId,
			})
		end

		local globalBuffs = {}
		pcall(function()
			globalBuffs.money = BuffController.GetBuff("Money Multiplier")
			globalBuffs.damage = BuffController.GetBuff("Damage Multiplier")
			globalBuffs.health = BuffController.GetBuff("Health Multiplier")
			globalBuffs.luck = BuffController.GetBuff("Luck")
		end)

		local activeEvent = collectActiveEvent()

		local payload = {
			game = "AnimeDice",
			sourceAccount = LocalPlayer.Name,
			jobId = game.JobId,
			placeId = game.PlaceId,
			activeEvent = activeEvent,
			money = stats.money,
			rolls = stats.rolls,
			rebirth = stats.rebirth,
			dice = stats.dice,
			autoRoll = stats.autoRoll,
			autoSell = stats.autoSell,
			vip = stats.vip,
			unitsCount = totalUnitCount,
			unitTypesCount = #units,
			discoveredCount = discoveredCount,
			ownedDiceCount = #ownedDice,
			ownedDice = ownedDice,
			gamepasses = gamepasses,
			topUnits = topUnits,
			upgrades = upgradesSummary,
			allUnits = allUnits,
			backpack = backpackItems,
			totalItemCount = totalItemCount,
			globalBuffs = globalBuffs,
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
-- Monitoring loop
------------------------------------------------------------
task.spawn(function()
	while GUI_ALIVE and screenGui and screenGui.Parent do
		local ok, err = reportToMonitor()
		local ping = 0
		pcall(function()
			ping = math.floor((LocalPlayer:GetNetworkPing() or 0) * 1000)
		end)
		local pingStr = ping > 0 and (" " .. ping .. "ms") or ""
		if ok then
			setMonitorContent("OK" .. pingStr)
		else
			setMonitorContent("Gagal" .. pingStr)
		end
		task.wait(30)
	end
end)
