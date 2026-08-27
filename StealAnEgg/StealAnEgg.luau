--!nocheck
-- NaruHub | Monitoring Steal An Egg (ultra-lightweight)
-- Auto-monitoring only -- no UI inputs, no poster gen, no toggles.

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
			if child.Name == "StealAnEggGUI" or child.Name == "StealAnEggDropdown" or child.Name == "NaruHubMonitor" then
				child:Destroy()
			end
		end
	end
end

------------------------------------------------------------
-- Key Gate
------------------------------------------------------------
local SERVER_BASE_URL = "https://steal-egg-monitor.vercel.app"
local VERCEL_MONITOR_URL = SERVER_BASE_URL

local DEVICE_ID = "unknown"
pcall(function()
	if gethwid then
		DEVICE_ID = gethwid()
	end
end)

local GRANTED_VIA_GLOBAL = true
local ACCESS_KEY_USED = ""

do
	local HttpService = game:GetService("HttpService")

	local function checkAccess(key)
		local body = HttpService:JSONEncode({ key = key or "" })
		local ok, res = pcall(function()
			return request({
				Url = SERVER_BASE_URL .. "/api/check-access",
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = body,
			})
		end)
		if not ok or not res or not res.Body then
			return false, "Ga bisa hubungin server verifikasi -- coba lagi bentar.", true
		end
		local decodeOk, parsed = pcall(function()
			return HttpService:JSONDecode(res.Body)
		end)
		if not decodeOk or type(parsed) ~= "table" then
			return false, "Respon server ga valid."
		end
		if parsed.ok then
			return true
		end
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
		pcall(function()
			container = gethui and gethui()
		end)
		container = container or game:GetService("CoreGui")

		local screenGui = Instance.new("ScreenGui")
		screenGui.Name = "StealAnEggKeyGate"
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
			if submitting then
				return
			end
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
			if enterPressed then
				trySubmit()
			end
		end)

		resultEvent.Event:Wait()
		screenGui:Destroy()
	end
end

if not GRANTED_VIA_GLOBAL then
	return
end

------------------------------------------------------------
-- Game data access
------------------------------------------------------------
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local HttpService = game:GetService("HttpService")
local LocalPlayer = Players.LocalPlayer

local EggState = require(ReplicatedStorage.Client.EggState)
local AssetEarnings = require(ReplicatedStorage.Shared.Util.AssetEarnings)
local AssetItems = require(ReplicatedStorage.Shared.Util.AssetItems)
local AssetRoster = require(ReplicatedStorage.Client.AssetRoster)
local MutationsModule = require(ReplicatedStorage.Shared.Modules.Mutations)
local EggRecords = require(ReplicatedStorage.Shared.Util.EggRecords)
local Assets = require(ReplicatedStorage.Data.Assets)
local SaveModule = require(ReplicatedStorage.Shared.Save)

local function getMyOwnedEggs()
	local ownedData = EggState.SyncOwnedEggs()
	for _, entry in ipairs(ownedData) do
		if entry.OwnerUserId == LocalPlayer.UserId then
			return entry.Records
		end
	end
	return {}
end

------------------------------------------------------------
-- Simple status GUI (kotakan hitam)
------------------------------------------------------------
local guiContainer
pcall(function()
	guiContainer = gethui and gethui()
end)
guiContainer = guiContainer or game:GetService("CoreGui")

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "NaruHubMonitor"
screenGui.ResetOnSpawn = false
screenGui.DisplayOrder = 9998
screenGui.IgnoreGuiInset = true
screenGui.Parent = guiContainer

local box = Instance.new("Frame")
box.Size = UDim2.new(0, 260, 0, 130)
box.Position = UDim2.new(0, 12, 0.5, -65)
box.BackgroundColor3 = Color3.fromRGB(15, 15, 15)
box.BackgroundTransparency = 0.15
box.BorderSizePixel = 0
box.Parent = screenGui
Instance.new("UICorner", box).CornerRadius = UDim.new(0, 10)

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 10)
padding.PaddingLeft = UDim.new(0, 12)
padding.PaddingRight = UDim.new(0, 12)
padding.PaddingBottom = UDim.new(0, 10)
padding.Parent = box

local layout = Instance.new("UIListLayout")
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Padding = UDim.new(0, 4)
layout.Parent = box

local function makeLabel(text, order, size, color, font)
	local lbl = Instance.new("TextLabel")
	lbl.Text = text
	lbl.Font = font or Enum.Font.GothamBold
	lbl.TextSize = size or 13
	lbl.TextColor3 = color or Color3.fromRGB(220, 220, 220)
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.new(1, 0, 0, size and (size + 4) or 17)
	lbl.TextXAlignment = Enum.TextXAlignment.Left
	lbl.LayoutOrder = order
	lbl.Parent = box
	return lbl
end

local titleLabel = makeLabel("NaruHub | Monitoring Steal An Egg", 0, 11, Color3.fromRGB(167, 139, 250))
local userLabel = makeLabel("Username : " .. LocalPlayer.Name, 1, 13, Color3.fromRGB(255, 255, 255))
local statusLabel = makeLabel("Status : Idle", 2, 13, Color3.fromRGB(255, 214, 10))
local premiumLabel = makeLabel("PREMIUM", 3, 11, Color3.fromRGB(255, 214, 10))
local monitorLabel = makeLabel("Monitoring Already", 4, 11, Color3.fromRGB(52, 211, 153))
local byLabel = makeLabel("By Putra Ramadhan", 5, 10, Color3.fromRGB(139, 139, 163), Enum.Font.Gotham)

------------------------------------------------------------
-- Detect player activity
------------------------------------------------------------
local function getPlayerStatus()
	local character = LocalPlayer.Character
	if not character then
		return "Idle"
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return "Idle"
	end

	local anim = character:FindFirstChild("Animate")
	if anim then
		for _, track in ipairs(humanoid:GetPlayingAnimationTracks()) do
			local animName = track.Name:lower()
			if animName:find("treadmill") or animName:find("run") then
				return "Treadmil"
			end
			if animName:find("steal") or animName:find("grab") or animName:find("snatch") then
				return "Steal"
			end
		end
	end

	local moveDir = humanoid.MoveDirection
	if moveDir.Magnitude > 0.1 then
		return "Treadmil"
	end

	return "Idle"
end

------------------------------------------------------------
-- Data collection functions
------------------------------------------------------------
local function getRarity(category)
	local cfg = Assets.Directory[category]
	if cfg and cfg.Rarity and cfg.Rarity.DisplayName then
		return cfg.Rarity.DisplayName
	end
	return nil
end

local function mutationNamesFromString(str)
	if not str or str == "" then
		return {}
	end
	local ok, arr = pcall(function()
		return MutationsModule.ExtractMutationsFromString(str)
	end)
	if not ok or type(arr) ~= "table" then
		return {}
	end
	local names = {}
	for _, m in ipairs(arr) do
		if type(m) == "table" and m.Name then
			table.insert(names, m.Name)
		end
	end
	return names
end

local function collectBackpackPets()
	local backpack = LocalPlayer:FindFirstChildOfClass("Backpack")
	local pets = {}
	if not backpack then
		return pets
	end
	for _, tool in ipairs(backpack:GetChildren()) do
		if tool:GetAttribute("ItemType") == "Asset" then
			local category = tool:GetAttribute("Category")
			local scale = tool:GetAttribute("Scale") or 1
			local mutations = mutationNamesFromString(tool:GetAttribute("Mutations"))
			local rate = 0
			pcall(function()
				rate = AssetEarnings.RatePerSecond({
					Category = category,
					Scale = scale,
					Mutations = mutations,
				})
			end)
			local weight = 0
			pcall(function()
				weight = AssetItems.WeightKg({
					Category = category,
					Scale = scale,
					Mutations = mutations,
				})
			end)
			local displayName = tool:GetAttribute("DisplayName") or tool.Name
			displayName = displayName:gsub("%s*%([^%)]*[Kk][Gg][^%)]*%)%s*$", "")
			table.insert(pets, {
				uid = tool:GetAttribute("UID"),
				name = displayName,
				category = category,
				mutations = mutations,
				rate = rate,
				weight = weight,
				rarity = getRarity(category),
			})
		end
	end
	return pets
end

local function collectActivePets()
	local pets = {}
	local records = AssetRoster.ReadOwnerPen(LocalPlayer.UserId)
	for _, rec in pairs(records) do
		local item = rec.ItemData
		if item then
			local weight = 0
			pcall(function()
				weight = AssetItems.WeightKg(item)
			end)
			table.insert(pets, {
				uid = rec.UID,
				name = item.Category,
				category = item.Category,
				mutations = item.Mutations or {},
				rate = rec.MoneyPerSecond or 0,
				weight = weight,
				rarity = getRarity(item.Category),
			})
		end
	end
	table.sort(pets, function(a, b)
		return (a.rate or 0) > (b.rate or 0)
	end)
	return pets
end

local function excludeActiveFromBackpack(backpackPets, activePets)
	local activeUids = {}
	for _, p in ipairs(activePets) do
		if p.uid then
			activeUids[p.uid] = true
		end
	end
	local result = {}
	for _, p in ipairs(backpackPets) do
		if not p.uid or not activeUids[p.uid] then
			table.insert(result, p)
		end
	end
	return result
end

local function collectGrowingEggs()
	local records = getMyOwnedEggs()
	local now = Workspace:GetServerTimeNow()
	local eggs = {}
	for uid, rec in pairs(records) do
		if rec.Placement ~= nil then
			local speed = rec.GrowthSpeedMultiplier or 1
			local nightCredit = 0
			pcall(function()
				nightCredit = EggRecords.CurrentNightCredit(rec, now, speed)
			end)
			local remaining, ready = 0, false
			pcall(function()
				remaining = EggRecords.GrowthSecondsRemaining(rec, now, speed, nightCredit, LocalPlayer)
			end)
			pcall(function()
				ready = EggRecords.GrowthSecondsRemaining(rec, now, speed, nightCredit, LocalPlayer) <= 0
			end)
			local weight = 0
			pcall(function()
				weight = AssetItems.WeightKg({
					Category = rec.AssetCategory,
					Scale = rec.AssetScale or 1,
					Mutations = rec.Mutations or {},
				})
			end)
			local rate = 0
			pcall(function()
				rate = AssetEarnings.RatePerSecond({
					Category = rec.AssetCategory,
					Scale = rec.AssetScale or 1,
					Mutations = rec.Mutations or {},
				})
			end)
			table.insert(eggs, {
				uid = uid,
				category = rec.AssetCategory,
				mutations = rec.Mutations or {},
				remainingSeconds = math.max(0, math.floor(remaining)),
				ready = ready,
				weight = weight,
				rate = rate,
				rarity = getRarity(rec.AssetCategory),
			})
		end
	end
	table.sort(eggs, function(a, b)
		return a.remainingSeconds < b.remainingSeconds
	end)
	return eggs
end

local function collectBackpackEggs()
	local records = getMyOwnedEggs()
	local eggs = {}
	for uid, rec in pairs(records) do
		if rec.Placement == nil then
			local weight = 0
			pcall(function()
				weight = AssetItems.WeightKg({
					Category = rec.AssetCategory,
					Scale = rec.AssetScale or 1,
					Mutations = rec.Mutations or {},
				})
			end)
			local rate = 0
			pcall(function()
				rate = AssetEarnings.RatePerSecond({
					Category = rec.AssetCategory,
					Scale = rec.AssetScale or 1,
					Mutations = rec.Mutations or {},
				})
			end)
			table.insert(eggs, {
				uid = uid,
				category = rec.AssetCategory,
				mutations = rec.Mutations or {},
				weight = weight,
				rate = rate,
				rarity = getRarity(rec.AssetCategory),
			})
		end
	end
	table.sort(eggs, function(a, b)
		return (a.rate or 0) > (b.rate or 0)
	end)
	return eggs
end

local function collectAccountStats()
	local runSpeed, moneyPerSecond
	local leaderstats = LocalPlayer:FindFirstChild("leaderstats")
	if leaderstats then
		local speedValue = leaderstats:FindFirstChild("Speed")
		if speedValue then
			runSpeed = speedValue.Value
		end
		local moneyValue = leaderstats:FindFirstChild("Money/s")
		if moneyValue then
			moneyPerSecond = moneyValue.Value
		end
	end

	local kandangLevel, treadmillLevel, currentMoney
	pcall(function()
		local stats = SaveModule.Get()
		if stats then
			kandangLevel = stats.BaseUpgradeLevel
			treadmillLevel = stats.TreadmillUpgradeLevel
			currentMoney = stats.Money
		end
	end)

	return runSpeed, moneyPerSecond, kandangLevel, treadmillLevel, currentMoney
end

------------------------------------------------------------
-- Helpers
------------------------------------------------------------
local function splitComma(text)
	local out = {}
	for part in text:gmatch("[^,]+") do
		local trimmed = part:match("^%s*(.-)%s*$")
		if trimmed ~= "" then
			table.insert(out, trimmed)
		end
	end
	return out
end

local function formatRupiah(n)
	n = math.floor(n + 0.5)
	local s = tostring(math.abs(n))
	local reversed = s:reverse():gsub("(%d%d%d)", "%1."):reverse()
	reversed = reversed:gsub("^%.", "")
	return "Rp " .. (n < 0 and "-" or "") .. reversed
end

local HARGA_PER_B = 5

local function computeAutoPrice(activePets, allPets, growingEggs, backpackEggs)
	local MAX_EQUIP_PETS = 17
	local pool = {}
	for _, p in ipairs(activePets) do
		table.insert(pool, p)
	end
	for _, p in ipairs(allPets) do
		table.insert(pool, p)
	end
	for _, e in ipairs(growingEggs) do
		table.insert(pool, e)
	end
	for _, e in ipairs(backpackEggs) do
		table.insert(pool, e)
	end
	table.sort(pool, function(a, b)
		return (a.rate or 0) > (b.rate or 0)
	end)
	local totalRate = 0
	for i = 1, math.min(MAX_EQUIP_PETS, #pool) do
		totalRate += (pool[i].rate or 0)
	end
	if totalRate <= 0 then
		return ""
	end
	local ratePerB = HARGA_PER_B * 1000
	local incomeB = totalRate / 1e9
	return formatRupiah(incomeB * ratePerB)
end

------------------------------------------------------------
-- Report to monitor (dashboard)
------------------------------------------------------------
local function reportToMonitor()
	local ok, err = pcall(function()
		local activePets = collectActivePets()
		local allPets = excludeActiveFromBackpack(collectBackpackPets(), activePets)
		local growingEggs = collectGrowingEggs()
		local backpackEggs = collectBackpackEggs()
		local runSpeed, moneyPerSecond, kandangLevel, treadmillLevel, currentMoney = collectAccountStats()

		local incomeEggBackpack = 0
		for _, e in ipairs(backpackEggs) do
			incomeEggBackpack += (e.rate or 0)
		end
		local incomeEggSedangTumbuh = 0
		for _, e in ipairs(growingEggs) do
			incomeEggSedangTumbuh += (e.rate or 0)
		end

		local MAX_EQUIP_PETS = 17
		local petPool = {}
		for _, p in ipairs(activePets) do
			table.insert(petPool, p)
		end
		for _, p in ipairs(allPets) do
			table.insert(petPool, p)
		end
		for _, e in ipairs(growingEggs) do
			table.insert(petPool, e)
		end
		for _, e in ipairs(backpackEggs) do
			table.insert(petPool, e)
		end
		table.sort(petPool, function(a, b)
			return (a.rate or 0) > (b.rate or 0)
		end)
		local incomeAktif = 0
		for i = 1, math.min(MAX_EQUIP_PETS, #petPool) do
			incomeAktif += (petPool[i].rate or 0)
		end

		local HIGH_VALUE_THRESHOLD = 1000000000
		local highValuePetTotal = 0
		for _, p in ipairs(petPool) do
			if (p.rate or 0) >= HIGH_VALUE_THRESHOLD then
				highValuePetTotal += p.rate
			end
		end

		local pool = {}
		for _, p in ipairs(activePets) do
			table.insert(pool, p)
		end
		for _, p in ipairs(allPets) do
			table.insert(pool, p)
		end
		table.sort(pool, function(a, b)
			return (a.rate or 0) > (b.rate or 0)
		end)
		local topPets = {}
		for i = 1, math.min(3, #pool) do
			local p = pool[i]
			table.insert(topPets, {
				name = p.name or p.category,
				category = p.category,
				mutations = p.mutations or {},
				rate = p.rate or 0,
				rarity = p.rarity,
			})
		end

		local activeLimit = 0
		pcall(function()
			activeLimit = AssetRoster.ReadWearLimit()
		end)
		local autoPrice = computeAutoPrice(activePets, allPets, growingEggs, backpackEggs)

		local fullData = {
			title = "Jual Akun GACOR",
			badge = "AKUN DATPOL",
			checklist = splitComma("Data Polos, No Topi, No Sum"),
			price = "",
			suggestedPrice = autoPrice,
			webhookUrl = "",
			allPets = allPets,
			activePets = activePets,
			activeLimit = activeLimit,
			growingEggs = growingEggs,
			backpackEggs = backpackEggs,
			runSpeed = runSpeed,
			totalMoneyPerSecond = moneyPerSecond,
			currentMoney = currentMoney,
			kandangLevel = kandangLevel,
			treadmillLevel = treadmillLevel,
			ownerFacebook = "Putra Ramadhan",
			sourceAccount = LocalPlayer.Name,
		}

		local payload = {
			sourceAccount = LocalPlayer.Name,
			money = currentMoney,
			speed = runSpeed,
			income = moneyPerSecond,
			incomeAktif = incomeAktif,
			incomeEggBackpack = incomeEggBackpack,
			incomeEggSedangTumbuh = incomeEggSedangTumbuh,
			highValuePetTotal = highValuePetTotal,
			kandangLevel = kandangLevel,
			treadmillLevel = treadmillLevel,
			petsCount = #allPets + #activePets,
			stolenCount = #backpackEggs,
			topPets = topPets,
			fullData = fullData,
		}

		local body = HttpService:JSONEncode(payload)
		request({
			Url = SERVER_BASE_URL .. "/api/monitor",
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["X-Device-Id"] = DEVICE_ID,
				["X-Access-Key"] = ACCESS_KEY_USED,
			},
			Body = body,
		})
	end)
	return ok, err
end

------------------------------------------------------------
-- Auto-start monitoring loop
------------------------------------------------------------
task.spawn(function()
	while screenGui and screenGui.Parent do
		local ok, err = reportToMonitor()
		if ok then
			monitorLabel.Text = "Monitoring OK -- " .. os.date("%H:%M:%S")
		else
			monitorLabel.Text = "Gagal lapor: " .. tostring(err)
		end

		local st = getPlayerStatus()
		statusLabel.Text = "Status : " .. st

		task.wait(15)
	end
end)
