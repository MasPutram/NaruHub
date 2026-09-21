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
local SERVER_BASE_URL = "https://naruhub.my.id"
local function redactKey(value)
	value = tostring(value or "")
	if value == "" then
		return ""
	end
	if #value <= 6 then
		return string.rep("*", #value)
	end
	return value:sub(1, 3) .. "***" .. value:sub(-2)
end

local function logRequest(_tag, _url, _method, _statusCode, _responseBody, _err, _extra)
end

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
-- NaruUI (loaded from GitHub)
------------------------------------------------------------
local httpGet = game.HttpGet or HttpGet
local _naruSrc = httpGet(game, "https://raw.githubusercontent.com/MasPutram/NaruHub/main/StealAnEgg/NaruUI.luau?v=" .. tostring(tick()))
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
-- HipHub "Auto Treadmill On Return" toggle helpers
-- Shared between Auto Place and Auto Sell (both need to pause HIP
-- so the character doesn't get snapped back to the treadmill
-- mid-action).
------------------------------------------------------------
local function findHipToggle()
	local pg = LocalPlayer:FindFirstChild("PlayerGui")
	local hip = pg and pg:FindFirstChild("HipHub")
	if not hip then return nil end
	for _, d in ipairs(hip:GetDescendants()) do
		if d:IsA("TextLabel") and d.Text == "Auto Treadmill On Return" then
			local p = d.Parent
			return p and p:FindFirstChildOfClass("TextButton") or nil
		end
	end
	return nil
end

local function hipToggleIsOn(btn)
	local inner = btn and btn:FindFirstChild("Frame")
	return inner and inner.Position.X.Scale >= 0.5
end

-- Wrap a callback with HIP off/on. Returns whatever `fn` returns.
local function withHipPaused(fn)
	local hipBtn = findHipToggle()
	local hipWasOn = hipBtn and hipToggleIsOn(hipBtn)
	local weFiredOff = false
	if hipWasOn and firesignal then
		pcall(function() firesignal(hipBtn.MouseButton1Click) end)
		weFiredOff = true
		task.wait(0.3)
	end

	local ok, result = pcall(fn)

	if weFiredOff and firesignal then
		for _ = 1, 3 do
			local b = findHipToggle()
			if not b then break end
			if hipToggleIsOn(b) then break end
			pcall(function() firesignal(b.MouseButton1Click) end)
			task.wait(0.4)
		end
	end
	return ok, result
end

------------------------------------------------------------
-- NaruUI Window (clean, status only -- no tabs visible)
------------------------------------------------------------
local Fluent = NaruUI.New({
	BrandColor = Color3.fromRGB(255, 214, 10),
	ConfigPrefix = "StealAnEgg",
})

local Window = Fluent:CreateWindow({
	Title = "NaruHub | StealAnEgg",
	Badge = "PREMIUM",
	TabWidth = 0,
	Size = UDim2.fromOffset(380, 400),
	AutoStartMinimized = false,
})

-- Force NaruUI launcher circle to be ALWAYS visible and act as a
-- min/restore toggle (fixes the case where the built-in "−" is
-- covered by an App Cloner / Zetsu window header). Also cleans up
-- any stale floating N from older script versions.
do
	local hui = (gethui and gethui()) or game:GetService("CoreGui")
	for _, o in ipairs(hui:GetChildren()) do
		if o.Name == "StealAnEggMinBtn" then pcall(function() o:Destroy() end) end
	end

	task.spawn(function()
		local wiredLogo
		while Fluent.GUI and Fluent.GUI.Parent do
			local lc = hui:FindFirstChild("StealAnEggLauncher")
			if lc then
				if not lc.Enabled then lc.Enabled = true end
				local logo = lc:FindFirstChild("Logo")
				if logo then
					-- Force logo below the Roblox topbar (default 20,20 lands on
					-- the menu/chat/backpack icons that steal our taps)
					if logo.Position ~= UDim2.fromOffset(4, 88) then
						logo.Position = UDim2.fromOffset(4, 88)
					end
				end
				if logo and logo ~= wiredLogo then
					wiredLogo = logo
					-- Disconnect NaruUI's existing MouseButton1Click handlers so
					-- our toggle isn't racing against them (they'd flip state
					-- right back).
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

-- Keep our GUI + launcher BELOW Roblox's core menu (Esc / settings) so it doesn't cover it
do
	local hui = (gethui and gethui()) or game:GetService("CoreGui")
	if Fluent.GUI then Fluent.GUI.DisplayOrder = -1000 end
	local function pushLauncher()
		local lc = hui:FindFirstChild("StealAnEggLauncher")
		if lc then lc.DisplayOrder = -999 end
	end
	pushLauncher()
	hui.ChildAdded:Connect(function(c)
		if c.Name == "StealAnEggLauncher" then
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
	local Players = game:GetService("Players")
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
		for _, m in ipairs(matches) do names[#names+1] = m.name end
		usernamePara:SetContent(table.concat(names, "\n"))
	end

	Players.PlayerAdded:Connect(function() task.wait(0.5) refreshUsernameList() end)
	Players.PlayerRemoving:Connect(function() task.wait(0.5) refreshUsernameList() end)
	task.spawn(refreshUsernameList)
end

local monitorPara = section:AddParagraph({
	Title = "Status",
	Content = "Starting...",
	ContentSize = 14,
	Center = true,
})

local AUTO_SELL_MIN_RATE = 1_000_000_000
local AUTO_SELL_RARITIES = { "Common", "Uncommon", "Rare", "Epic", "Mythic", "Legendary", "Cosmic" }
local AUTO_SELL_NEVER = { Eternal = true, Divine = true, Titan = true }
local autoSellEnabled = false
section:AddToggle("AutoSellToggle", {
	Title = "Auto Sell (< 1B/s)",
	Default = false,
	Callback = function(val)
		autoSellEnabled = val
		task.spawn(function()
			local Remotes = require(ReplicatedStorage.Shared.Remotes)
			pcall(function()
				Remotes.Haul.WriteAutoSell:InvokeServer(val and AUTO_SELL_RARITIES or {})
			end)
		end)
	end,
})

-- Auto Place is one-shot per toggle activation:
--   ON  -> wait 10s (let HIP settle) then run ONE pass, then rest
--   OFF -> stop rest state, next ON will fire another pass
local autoPlaceEnabled = false
local autoPlaceTrigger = 0
section:AddToggle("AutoPlaceToggle", {
	Title = "Auto Place Eggs (1x)",
	Default = false,
	Callback = function(val)
		autoPlaceEnabled = val
		if val then
			autoPlaceTrigger = autoPlaceTrigger + 1
		end
	end,
})

local autoBuyScrambledEnabled = false
section:AddToggle("AutoBuyScrambledToggle", {
	Title = "Auto Buy Dr Scramble (Token > Treadmill)",
	Default = false,
	Callback = function(val)
		autoBuyScrambledEnabled = val
	end,
})

local autoMutationEggEnabled = false
section:AddToggle("AutoMutationEggToggle", {
	Title = "Auto Mutation Egg (Plot, highest b/s first)",
	Default = false,
	Callback = function(val)
		autoMutationEggEnabled = val
	end,
})

local autoHatchEnabled = false
local autoHatchSignal = Instance.new("BindableEvent")
section:AddToggle("AutoHatchToggle", {
	Title = "Auto Hatch",
	Default = false,
	Callback = function(val)
		autoHatchEnabled = val
		if val and autoHatchSignal then
			autoHatchSignal:Fire()
		end
	end,
})

-- Manual leave button: click to kick this clone back to Roblox home.
-- Only fires on a deliberate click, never on its own -- no auto-leave path
-- lives in this script (rapid Kick+rejoin cascades trigger the Roblox
-- Funcaptcha and BAC anti-cheat, so we keep the only leave route the
-- operator can take from the dashboard via Siap Jual).
section:AddButton({
	Title = "Leave Game (balik ke Roblox home)",
	Callback = function()
		pcall(function()
			LocalPlayer:Kick("Leave via NaruHub")
		end)
	end,
})

Window:SelectTab(1)


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
			local remaining = 0
			pcall(function()
				remaining = EggRecords.GrowthSecondsRemaining(rec, now, speed, nightCredit, LocalPlayer)
			end)
			local ready = remaining <= 0
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
local DEFAULT_CHECKLIST = splitComma("Data Polos, No Topi, No Sum")
local MAX_EQUIP_PETS = 17

local function computeAutoPrice(petPool)
	local totalRate = 0
	for i = 1, math.min(MAX_EQUIP_PETS, #petPool) do
		totalRate += (petPool[i].rate or 0)
	end
	if totalRate <= 0 then
		return ""
	end
	return formatRupiah((totalRate / 1e9) * HARGA_PER_B * 1000)
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

		local petPool = {}
		for _, p in ipairs(activePets) do table.insert(petPool, p) end
		for _, p in ipairs(allPets) do table.insert(petPool, p) end
		for _, e in ipairs(growingEggs) do table.insert(petPool, e) end
		for _, e in ipairs(backpackEggs) do table.insert(petPool, e) end
		table.sort(petPool, function(a, b) return (a.rate or 0) > (b.rate or 0) end)

		local incomeAktif = 0
		for i = 1, math.min(MAX_EQUIP_PETS, #petPool) do
			incomeAktif += (petPool[i].rate or 0)
		end

		local highValuePetTotal = 0
		for _, p in ipairs(petPool) do
			if (p.rate or 0) >= 1e9 then highValuePetTotal += p.rate end
		end

		local topPets = {}
		for i = 1, math.min(3, #petPool) do
			local p = petPool[i]
			table.insert(topPets, {
				name = p.name or p.category,
				category = p.category,
				mutations = p.mutations or {},
				rate = p.rate or 0,
				rarity = p.rarity,
			})
		end

		local activeLimit = 0
		pcall(function() activeLimit = AssetRoster.ReadWearLimit() end)
		local autoPrice = computeAutoPrice(petPool)

		local bossToken = 0
		local mutationToken = 0
		local scrambleToken = 0
		local equippedTrail = ""
		pcall(function()
			local s = SaveModule.Get()
			if not s then return end
			bossToken = tonumber(s.BossTokens) or 0
			mutationToken = (type(s.BossMastery) == "table" and tonumber(s.BossMastery.MutationConsumables)) or 0
			equippedTrail = tostring(s.EquippedTrail or s.TrailEquipped or "")
		end)
		pcall(function()
			local Remotes = require(ReplicatedStorage.Shared.Remotes)
			local snap = Remotes.Scramble.Request:InvokeServer("snapshot")
			if snap and snap.Snapshot and snap.Snapshot.State then
				scrambleToken = tonumber(snap.Snapshot.State.Samples) or 0
			end
		end)

		local fullData = {
			title = "Jual Akun GACOR",
			badge = "AKUN DATPOL",
			checklist = DEFAULT_CHECKLIST,
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
			trail = equippedTrail,
			scrambleToken = scrambleToken,
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
			bossToken = bossToken,
			mutationToken = mutationToken,
			scrambleToken = scrambleToken,
			topPets = topPets,
			trail = equippedTrail,
			fullData = fullData,
		}

		local body = HttpService:JSONEncode(payload)
		local reqUrl = SERVER_BASE_URL .. "/api/monitor"
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
			-- Dashboard "Siap Jual": monitor-side sets forSale=true in Redis
			-- for this account; the /api/monitor response echoes it back and
			-- we leave the game (kick returns the client to Roblox home).
			pcall(function()
				local body = res.Body
				if type(body) == "string" and body ~= "" then
					local okDec, data = pcall(function()
						return HttpService:JSONDecode(body)
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
-- Auto Upgrade Kandang & Treadmill (no UI, runs forever)
------------------------------------------------------------
task.spawn(function()
	local BaseUpgrade = require(ReplicatedStorage.Client.BaseUpgrade)
	local TreadmillClient = require(LocalPlayer.PlayerScripts.GUI.TreadmillUpgrade.Client)

	-- Strict priority: pen only fires after treadmill is fully maxed.
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		pcall(function()
			local stats = SaveModule.Get()
			local _, tmCfg = TreadmillClient.GetNextConfig(stats)
			local tmMaxed = tmCfg == nil

			if not tmMaxed then
				if TreadmillClient.CanAffordNext(stats) then
					TreadmillClient.RequestCashUpgrade()
				end
			else
				local nextLevel, config = BaseUpgrade.ResolveNextTier(stats)
				if nextLevel and config and BaseUpgrade.IsNextTierAffordable(stats) then
					BaseUpgrade.PurchaseNextTier()
				end
			end
		end)
		task.wait(5)
	end
end)

------------------------------------------------------------
-- Auto Buy Trail Shop (no UI, runs forever)
-- Fully data-driven: reads Trails.Directory every tick, so any trail
-- the game adds later gets bought automatically without a script update.
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)
	local Trails = require(ReplicatedStorage.Data.Trails)

	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		pcall(function()
			local data = SaveModule.Get()
			local inv = data.TrailInventory or {}
			local sortedKeys = {}
			for key, cfg in pairs(Trails.Directory) do
				if cfg.DisplayInShop and cfg.Price and not inv[key] then
					table.insert(sortedKeys, key)
				end
			end
			table.sort(sortedKeys, function(a, b)
				return Trails.Directory[a].Price < Trails.Directory[b].Price
			end)
			for _, key in ipairs(sortedKeys) do
				local cfg = Trails.Directory[key]
				data = SaveModule.Get()
				if not (data.TrailInventory or {})[key] and (data.Money or 0) >= cfg.Price then
					pcall(function()
						Remotes.Trailwear.AskPurchase:InvokeServer(key)
					end)
					task.wait(0.5)
				end
			end
		end)
		task.wait(3)
	end
end)


------------------------------------------------------------
-- Auto Buy Dr Scramble Shop
-- Priority 1: MutationConsumable (Scrambled token)
-- Priority 2: TreadmillBooster (only if enough for 2x treadmill price)
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)

	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		if autoBuyScrambledEnabled then
			pcall(function()
				local snap = Remotes.Scramble.Request:InvokeServer("snapshot")
				if not snap or not snap.Snapshot then return end
				local state = snap.Snapshot.State
				if not state then return end
				local samples = state.Samples or 0
				local shop = snap.Snapshot.Shop
				if not shop then return end

				local mutItem, treadItem
				for _, item in ipairs(shop) do
					if item.Id == "MutationConsumable" and item.Quote then mutItem = item end
					if item.Id == "TreadmillBooster" and item.Quote then treadItem = item end
				end

				local function tryBuy(item)
					pcall(function()
						Remotes.Scramble.Request:InvokeServer("Shop", item.Id, {
							Quote = item.Quote,
							Sequence = state.ShopSequence,
						})
					end)
				end

				if mutItem and samples >= mutItem.Price then
					tryBuy(mutItem)
				elseif treadItem and samples >= treadItem.Price * 2 then
					tryBuy(treadItem)
				end
			end)
		end
		task.wait(5)
	end
end)

------------------------------------------------------------
-- Auto Mutation Egg
-- For each placed egg (highest b/s first):
--   1. Determine which mutation is needed (Scrambled first, then Boss)
--   2. Equip the matching token from Backpack
--   3. Teleport to the egg model in PlacedEggRenders
--   4. Apply mutation, retry until success (10% chance)
--   5. If token runs out, swap to the other type
-- Skips eggs that already have both Scrambled + Boss.
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)
	local myUserId = tostring(LocalPlayer.UserId)

	local function findEggModel(uid)
		local renders = Workspace:FindFirstChild("PlacedEggRenders")
		if renders then
			return renders:FindFirstChild(myUserId .. "_" .. uid)
		end
		return nil
	end

	local function teleportToEgg(model)
		local part = model.PrimaryPart or model:FindFirstChildWhichIsA("BasePart")
		if not part then return end
		local char = LocalPlayer.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if hrp then
			hrp.CFrame = part.CFrame + Vector3.new(0, 3, 0)
		end
	end

	local function findMutationTool(mutationId)
		local backpack = LocalPlayer:FindFirstChildOfClass("Backpack")
		if not backpack then return nil end
		for _, tool in ipairs(backpack:GetChildren()) do
			if tool:GetAttribute("ItemType") == "MutationConsumable"
				and tool:GetAttribute("MutationId") == mutationId then
				return tool
			end
		end
		return nil
	end

	local function equipTool(tool)
		local char = LocalPlayer.Character
		if not char then return end
		local humanoid = char:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid:EquipTool(tool)
		end
	end

	local function hasMutation(rec, name)
		if type(rec.Mutations) ~= "table" then return false end
		for _, m in pairs(rec.Mutations) do
			if m == name then return true end
		end
		return false
	end

	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		if autoMutationEggEnabled then
			pcall(function()
				local stats = SaveModule.Get()

				local candidates = {}
				for uid, rec in pairs(stats.EggInventory or {}) do
					if type(rec) == "table" and rec.Placement ~= nil then
						local hasScrambled = hasMutation(rec, "Scrambled")
						local hasBoss = hasMutation(rec, "Boss")
						if not (hasScrambled and hasBoss) then
							local rate = 0
							pcall(function()
								rate = AssetEarnings.RatePerSecond({
									Category = rec.AssetCategory,
									Scale = rec.AssetScale or 1,
									Mutations = rec.Mutations or {},
								})
							end)
							local needed = "Scrambled"
							if hasScrambled then needed = "Boss" end
							table.insert(candidates, { uid = uid, rate = rate, needed = needed, rec = rec })
						end
					end
				end
				table.sort(candidates, function(a, b) return a.rate > b.rate end)
				if #candidates == 0 then return end

				for _, pet in ipairs(candidates) do
					if not autoMutationEggEnabled then break end

					local neededMut = pet.needed
					local tool = findMutationTool(neededMut)
					if not tool then
						local alt = neededMut == "Scrambled" and "Boss" or "Scrambled"
						tool = findMutationTool(alt)
						if tool then neededMut = alt end
					end
					if not tool then break end

					equipTool(tool)
					task.wait(0.5)

					local eggModel = findEggModel(pet.uid)
					if eggModel then
						teleportToEgg(eggModel)
						task.wait(1)
					end

					while autoMutationEggEnabled do
						tool = findMutationTool(neededMut)
						if not tool then
							local alt = neededMut == "Scrambled" and "Boss" or "Scrambled"
							tool = findMutationTool(alt)
							if tool then
								neededMut = alt
								equipTool(tool)
								task.wait(0.5)
							else
								break
							end
						end

						local result
						pcall(function()
							result = Remotes.BossMastery.AskUseMutationConsumable:InvokeServer(pet.uid)
						end)
						if type(result) == "table" and result.Mutated then
							break
						end
						task.wait(4)
					end
				end
			end)
		end
		task.wait(5)
	end
end)


------------------------------------------------------------
-- Auto Close Event Popup (no UI, runs forever)
-- Roblox Experience Events popup ("Join Event -- SAMMY IS COMING" with a
-- "Notify Me" button) sits on top of the game and interrupts farming when
-- Sammy or another event NPC is about to arrive. Nuke it the instant it
-- appears. Matches STRICTLY on the popup's own texts so no other game
-- popup is touched:
--   - a TextButton whose text is exactly "Notify Me", or
--   - a TextLabel whose text is exactly "Join Event"
------------------------------------------------------------
task.spawn(function()
	local function isTriggerText(obj)
		if obj:IsA("TextButton") and tostring(obj.Text or "") == "Notify Me" then return true end
		if obj:IsA("TextLabel") and tostring(obj.Text or "") == "Join Event" then return true end
		return false
	end

	-- Walk up from the trigger to the outermost container whose parent is a
	-- service root (CoreGui/PlayerGui). Never touch our own UI or the game's
	-- CutsceneUI.
	local function killPopupFor(node)
		local top = node
		while top and top.Parent do
			local parent = top.Parent
			if parent == game or parent.ClassName == "CoreGui" or parent.ClassName == "PlayerGui"
				or parent.Name == "CoreGui" or parent.Name == "PlayerGui" then
				break
			end
			top = parent
		end
		if not top or not top.Parent then return false end
		local n = top.Name:lower()
		if n:find("naru") or n:find("fluent") or n == "cutsceneui" then return false end
		return (pcall(function() top:Destroy() end))
	end

	local function scanAndClose(root)
		if not root then return end
		local killed = {}
		local ok, descs = pcall(function() return root:GetDescendants() end)
		if not ok or type(descs) ~= "table" then return end
		for _, d in ipairs(descs) do
			if d.Parent and isTriggerText(d) then
				local top = d
				while top and top.Parent do
					local parent = top.Parent
					if parent == game or parent.ClassName == "CoreGui" or parent.ClassName == "PlayerGui"
						or parent.Name == "CoreGui" or parent.Name == "PlayerGui" then
						break
					end
					top = parent
				end
				if top and top.Parent and not killed[top] then
					killed[top] = true
					killPopupFor(d)
				end
			end
		end
	end

	local pg = LocalPlayer:FindFirstChildOfClass("PlayerGui") or LocalPlayer:WaitForChild("PlayerGui")
	local cg
	pcall(function() cg = game:GetService("CoreGui") end)

	-- Reactive: kill the moment the popup lands
	local function attachWatcher(root)
		if not root then return end
		pcall(function()
			root.DescendantAdded:Connect(function(d)
				if isTriggerText(d) then
					task.wait() -- let it finish parenting
					killPopupFor(d)
				end
			end)
		end)
	end
	attachWatcher(pg)
	attachWatcher(cg)

	-- Instant sweep for anything already open at script load
	scanAndClose(pg)
	scanAndClose(cg)

	-- Safety-net sweep every 2s in case DescendantAdded ever misses
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		scanAndClose(pg)
		scanAndClose(cg)
		task.wait(2)
	end
end)


------------------------------------------------------------
-- Auto Sell inventory backlog (< 1B/s, unplaced only, never Divine/Titan)
-- Requires equip (AskWearTool) then SellPet on the held UID.
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		if autoSellEnabled then
			-- Collect matching UIDs FIRST (cheap), then only bother with HIP
			-- pause if there is actually something to sell this tick.
			local toSell = {}
			pcall(function()
				local records = getMyOwnedEggs()
				for uid, rec in pairs(records) do
					if rec.Placement == nil then
						local rarity = getRarity(rec.AssetCategory)
						local rate = 0
						pcall(function()
							rate = AssetEarnings.RatePerSecond({
								Category = rec.AssetCategory,
								Scale = rec.AssetScale or 1,
								Mutations = rec.Mutations or {},
							})
						end)
						if not AUTO_SELL_NEVER[rarity] and rate > 0 and rate < AUTO_SELL_MIN_RATE then
							toSell[#toSell + 1] = uid
						end
					end
				end
			end)

			if #toSell > 0 then
				withHipPaused(function()
					for _, uid in ipairs(toSell) do
						if not autoSellEnabled then break end
						pcall(function()
							Remotes.EggWorld.AskWearTool:InvokeServer(uid)
						end)
						task.wait(0.3)
						pcall(function()
							Remotes.PetSatchel.SellPet:FireServer({ uid })
						end)
						task.wait(0.5)
					end
				end)
			end
		end
		task.wait(3)
	end
end)

------------------------------------------------------------
-- Auto Place Eggs (toggle-driven, higher rate first)
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)

	local function findMyPlot()
		local plots = Workspace:FindFirstChild("Plots")
		if not plots then return nil end
		local stats = SaveModule.Get()
		local myLevel = stats and stats.BaseUpgradeLevel or 0
		local candidates = {}
		for _, plot in ipairs(plots:GetChildren()) do
			if plot:GetAttribute("BaseUpgradeLevel") == myLevel then
				table.insert(candidates, plot)
			end
		end
		if #candidates == 1 then return candidates[1] end
		if #candidates == 0 then return nil end
		for _, plot in ipairs(candidates) do
			local loc = plot:FindFirstChild("LocalOfflineMoneyClaim")
			if loc then
				local area = loc:FindFirstChild("OfflineMoneyClaimArea")
				if area then
					local bb = area:FindFirstChild("OfflineMoneyClaimBillboard")
					if bb and bb.Enabled then return plot end
				end
			end
		end
		local char = LocalPlayer.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if hrp then
			local closest, closestDist = nil, math.huge
			for _, plot in ipairs(candidates) do
				local cp = plot:FindFirstChild("CenterPoint")
				if cp then
					local dist = (hrp.Position - cp.Position).Magnitude
					if dist < closestDist then closest, closestDist = plot, dist end
				end
			end
			if closest then return closest end
		end
		return candidates[1]
	end

	local function teleportToPlot(plot)
		local toUpdate = plot:FindFirstChild("ToUpdate")
		local target = toUpdate and toUpdate:FindFirstChild("PetArea")
		if not target then
			target = plot:FindFirstChild("CenterPoint")
			if toUpdate then target = toUpdate:FindFirstChild("CenterPoint") or target end
		end
		if not target then return end
		local char = LocalPlayer.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if hrp then
			hrp.CFrame = target.CFrame + Vector3.new(0, 3, 0)
		end
	end

	local function buildGrid()
		local spacing = 5
		local half = 60
		local positions = {}
		for z = -half, half, spacing do
			for x = -half, half, spacing do
				table.insert(positions, { x, z })
			end
		end
		table.sort(positions, function(a, b)
			return (a[1]*a[1] + a[2]*a[2]) < (b[1]*b[1] + b[2]*b[2])
		end)
		return positions
	end

	local function getUnplaced()
		local records = getMyOwnedEggs()
		local list = {}
		for uid, rec in pairs(records) do
			if rec.Placement == nil then
				local rate = 0
				pcall(function()
					rate = AssetEarnings.RatePerSecond({
						Category = rec.AssetCategory,
						Scale = rec.AssetScale or 1,
						Mutations = rec.Mutations or {},
					})
				end)
				table.insert(list, { uid = uid, rate = rate })
			end
		end
		table.sort(list, function(a, b) return a.rate > b.rate end)
		return list
	end

	local function tryPlaceAll(positions, unplaced)
		local gridIdx = 1
		local rejectStreak = 0
		local anyPlaced = false
		for _, egg in ipairs(unplaced) do
			if not autoPlaceEnabled then break end
			local placed = false
			while gridIdx <= #positions do
				local pos = positions[gridIdx]
				gridIdx = gridIdx + 1
				local localCF = CFrame.new(pos[1], -0.4, pos[2])
				local ok, result = pcall(function()
					return Remotes.EggWorld.AskPlaceEgg:InvokeServer({
						Uid = egg.uid,
						LocalCFrame = localCF,
					})
				end)
				if ok and result == true then
					rejectStreak = 0
					placed = true
					anyPlaced = true
					break
				else
					rejectStreak = rejectStreak + 1
					if rejectStreak >= 30 then return anyPlaced end
				end
				task.wait(0.1)
			end
			if not placed then return anyPlaced end
			task.wait(0.3)
		end
		return anyPlaced
	end

	local lastConsumedTrigger = 0
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		task.wait(1)
		if autoPlaceEnabled and autoPlaceTrigger > lastConsumedTrigger then
			lastConsumedTrigger = autoPlaceTrigger
			-- Let script HIP / other autoexec scripts settle first
			task.wait(10)
			if not autoPlaceEnabled then continue end
			pcall(function()
				local myPlot = findMyPlot()
				if not myPlot then return end
				local unplaced = getUnplaced()
				if #unplaced == 0 then return end

				local hipBtn = findHipToggle()
				local hipWasOn = hipBtn and hipToggleIsOn(hipBtn)
				local weFiredOff = false
				if hipWasOn and firesignal then
					pcall(function() firesignal(hipBtn.MouseButton1Click) end)
					weFiredOff = true
					task.wait(0.3)
				end

				teleportToPlot(myPlot)
				task.wait(1)
				local ok = tryPlaceAll(buildGrid(), unplaced)
				if not ok then
					teleportToPlot(myPlot)
					task.wait(2)
					unplaced = getUnplaced()
					if #unplaced > 0 then
						tryPlaceAll(buildGrid(), unplaced)
					end
				end

				-- Re-enable HIP AutoTreadmill: we fired 1 OFF earlier, so fire N ONs
				-- until state comes back to ON (or up to 3 attempts). Re-lookup btn
				-- in case HIP re-rendered its GUI mid-pass.
				if weFiredOff and firesignal then
					for attempt = 1, 3 do
						local b = findHipToggle()
						if not b then break end
						if hipToggleIsOn(b) then break end
						pcall(function() firesignal(b.MouseButton1Click) end)
						task.wait(0.4)
					end
				end

				-- Hatch anything that's already ready + equip best
				local now = Workspace:GetServerTimeNow()
				local hatched = 0
				for uid, rec in pairs(getMyOwnedEggs()) do
					if rec.Placement ~= nil then
						local speed = rec.GrowthSpeedMultiplier or 1
						local nightCredit = 0
						pcall(function()
							nightCredit = EggRecords.CurrentNightCredit(rec, now, speed)
						end)
						local remaining = 0
						pcall(function()
							remaining = EggRecords.GrowthSecondsRemaining(rec, now, speed, nightCredit, LocalPlayer)
						end)
						if remaining <= 0 then
							local h1, r1 = pcall(function()
								return Remotes.EggWorld.AskHatch:InvokeServer(uid)
							end)
							if h1 and r1 == true then
								pcall(function()
									Remotes.EggWorld.AskFinishHatch:InvokeServer(uid)
								end)
								hatched = hatched + 1
							end
							task.wait(0.2)
						end
					end
				end
				pcall(function()
					Remotes.Haul.WearBest:InvokeServer()
				end)
			end)
			-- Auto turn OFF the toggle so UI matches the "done" state
			pcall(function()
				local t = Fluent.Options and Fluent.Options["AutoPlaceToggle"]
				if t and t.SetValue then t:SetValue(false) end
			end)
		end
	end
end)

-- If toggle was persisted ON, seed one trigger so it runs after re-exec
task.spawn(function()
	task.wait(1) -- let NaruUI restore config
	if autoPlaceEnabled then
		autoPlaceTrigger = autoPlaceTrigger + 1
	end
end)

------------------------------------------------------------
-- Auto Hatch (toggle-driven) + Equip Best on any hatch
-- Runs immediately when toggled ON, then every 30 minutes.
------------------------------------------------------------
local function doAutoHatch()
	pcall(function()
		local Remotes = require(ReplicatedStorage.Shared.Remotes)
		local records = getMyOwnedEggs()
		local now = Workspace:GetServerTimeNow()
		local hatched = 0
		for uid, rec in pairs(records) do
			if rec.Placement ~= nil then
				local speed = rec.GrowthSpeedMultiplier or 1
				local nightCredit = 0
				pcall(function()
					nightCredit = EggRecords.CurrentNightCredit(rec, now, speed)
				end)
				local remaining = 0
				pcall(function()
					remaining = EggRecords.GrowthSecondsRemaining(rec, now, speed, nightCredit, LocalPlayer)
				end)
				if remaining <= 0 then
					local ok1, r1 = pcall(function()
						return Remotes.EggWorld.AskHatch:InvokeServer(uid)
					end)
					if ok1 and r1 == true then
						pcall(function()
							Remotes.EggWorld.AskFinishHatch:InvokeServer(uid)
						end)
						hatched = hatched + 1
					end
					task.wait(0.3)
				end
			end
		end
		if hatched > 0 then
			pcall(function()
				Remotes.Haul.WearBest:InvokeServer()
			end)
		end
	end)
end

task.spawn(function()
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		if autoHatchEnabled then
			doAutoHatch()
		end
		local fired = false
		local conn = autoHatchSignal.Event:Connect(function() fired = true end)
		for _ = 1, 180 do
			if fired or Fluent.Unloaded then break end
			task.wait(10)
		end
		conn:Disconnect()
	end
end)

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
		task.wait(15)
	end
end)
