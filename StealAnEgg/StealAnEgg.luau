--!nocheck
-- NaruHub | Monitoring Steal An Egg (ultra-lightweight)
-- Auto-monitoring only -- no UI inputs, no poster gen, no toggles.

------------------------------------------------------------
-- Cleanup dari run sebelumnya
------------------------------------------------------------
_G.__NaruHubStopped__ = true -- kill any surviving loops from prior exec
task.wait(0.5)
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
			if child.Name == "StealAnEggGUI" or child.Name == "StealAnEggDropdown"
				or child.Name == "NaruHubMonitor" or child.Name == "StealAnEggLauncher"
				or child.Name == "StealAnEggMinBtn" or child.Name == "Rayfield"
				or child.Name == "NaruHubToggleBtn" then
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
-- Rayfield UI library (loaded from official CDN)
------------------------------------------------------------
local Rayfield = loadstring(game:HttpGet("https://sirius.menu/rayfield"))()

-- Runtime kill switch for our background loops (replaces the old
-- Fluent.GUI/Fluent.Unloaded checks). Any prior instance flips its
-- own copy to true when the new instance runs cleanup at the top.
_G.__NaruHubStopped__ = false

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
-- Rayfield Window
------------------------------------------------------------
local Window = Rayfield:CreateWindow({
	Name = "NaruHub | StealAnEgg",
	LoadingTitle = "NaruHub",
	LoadingSubtitle = "PREMIUM",
	Theme = "Default",
	DisableRayfieldPrompts = true,
	DisableBuildWarnings = true,
	ConfigurationSaving = {
		Enabled = true,
		FolderName = "NaruHub",
		FileName = "StealAnEgg",
	},
	KeySystem = false,
})

-- Floating "N" toggle button — always visible, click = show/hide window.
-- Rayfield's built-in "−" is often hidden under App Cloner / Zetsu title
-- bar on multi-instance mobile setups; this button lives in CoreGui with
-- max DisplayOrder so nothing can cover it.
do
	-- Parent to CoreGui directly (not gethui). Some executors (Arceus X)
	-- return CoreGui.RobloxGui from gethui() and hide custom ScreenGuis
	-- rendered under RobloxGui — CoreGui root escapes that.
	local coreGui = game:GetService("CoreGui")
	local hui = coreGui
	for _, o in ipairs(hui:GetChildren()) do
		if o.Name == "NaruHubToggleBtn" then pcall(function() o:Destroy() end) end
	end
	local sg = Instance.new("ScreenGui")
	sg.Name = "NaruHubToggleBtn"
	sg.ResetOnSpawn = false
	sg.IgnoreGuiInset = true
	sg.DisplayOrder = 2_000_000_000
	pcall(function() sg.Parent = hui end)
	if not sg.Parent then
		-- Fallback if CoreGui write is blocked
		sg.Parent = (gethui and gethui()) or game.Players.LocalPlayer:WaitForChild("PlayerGui")
	end

	local btn = Instance.new("TextButton")
	btn.Size = UDim2.fromOffset(36, 36)
	btn.Position = UDim2.fromOffset(4, 140)
	btn.BackgroundColor3 = Color3.fromRGB(6, 6, 7)
	btn.BackgroundTransparency = 0.15
	btn.Text = "N"
	btn.TextColor3 = Color3.fromRGB(255, 214, 10)
	btn.TextSize = 18
	btn.Font = Enum.Font.GothamBold
	btn.AutoButtonColor = false
	btn.Active = true
	btn.Draggable = true
	btn.Parent = sg
	local c = Instance.new("UICorner") c.CornerRadius = UDim.new(1, 0) c.Parent = btn
	local s = Instance.new("UIStroke") s.Color = Color3.fromRGB(255, 214, 10) s.Thickness = 1.5 s.Parent = btn

	local visible = true
	btn.MouseButton1Click:Connect(function()
		visible = not visible
		pcall(function()
			if Rayfield.SetVisibility then Rayfield:SetVisibility(visible) end
		end)
	end)
end

-- Post-load tweaks to the Rayfield GUI: scrub "Rayfield" branding text
-- and shrink the whole window (~70%) so it fits inside small App Cloner
-- panes on multi-instance mobile setups.
task.spawn(function()
	local hui = (gethui and gethui()) or game:GetService("CoreGui")
	local scaled = false
	for _ = 1, 30 do
		local rf = hui:FindFirstChild("Rayfield")
		if rf then
			for _, d in ipairs(rf:GetDescendants()) do
				if d:IsA("TextLabel") or d:IsA("TextButton") then
					local ok, txt = pcall(function() return d.Text end)
					if ok and txt and string.find(string.lower(txt), "rayfield") then
						pcall(function() d.Text = "" end)
					end
				end
			end
			if not scaled then
				local main = rf:FindFirstChild("Main")
				if main then
					local existing = main:FindFirstChildOfClass("UIScale")
					if not existing then
						local sc = Instance.new("UIScale")
						sc.Scale = 0.55
						sc.Parent = main
					else
						existing.Scale = 0.55
					end
					scaled = true
				end
			end
			-- Tighten spacing: shrink UIListLayout padding and UIPadding
			-- on every Rayfield section so rows sit closer together.
			for _, d in ipairs(rf:GetDescendants()) do
				if d:IsA("UIListLayout") then
					pcall(function() d.Padding = UDim.new(0, 3) end)
				elseif d:IsA("UIPadding") then
					pcall(function()
						d.PaddingTop = UDim.new(0, 3)
						d.PaddingBottom = UDim.new(0, 3)
					end)
				end
			end
		end
		task.wait(0.2)
	end
end)

local MainTab = Window:CreateTab("Main", nil)

local usernamePara = MainTab:CreateParagraph({
	Title = "Username",
	Content = LocalPlayer.Name,
})

do
	local Players = game:GetService("Players")
	local myName = LocalPlayer.Name
	local myPrefix = myName:match("^(%D+)%d+$")

	local function refreshUsernameList()
		if not myPrefix then
			usernamePara:Set({ Title = "Username", Content = myName })
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
			usernamePara:Set({ Title = "Username", Content = myName })
			return
		end
		table.sort(matches, function(a, b) return a.num < b.num end)
		local names = {}
		for _, m in ipairs(matches) do names[#names+1] = m.name end
		usernamePara:Set({ Title = "Username", Content = table.concat(names, "\n") })
	end

	Players.PlayerAdded:Connect(function() task.wait(0.5) refreshUsernameList() end)
	Players.PlayerRemoving:Connect(function() task.wait(0.5) refreshUsernameList() end)
	task.spawn(refreshUsernameList)
end

local monitorPara = MainTab:CreateParagraph({
	Title = "Status",
	Content = "Starting...",
})

local AUTO_SELL_MIN_RATE = 300_000_000
local AUTO_SELL_RARITIES = { "Common", "Uncommon", "Rare", "Epic", "Mythic", "Legendary", "Cosmic" }
local AUTO_SELL_NEVER = { Eternal = true, Divine = true, Titan = true }
local autoSellEnabled = false
MainTab:CreateToggle({
	Name = "Auto Sell (< 300M/s)",
	CurrentValue = false,
	Flag = "AutoSellToggle",
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
local autoPlaceToggleRef
autoPlaceToggleRef = MainTab:CreateToggle({
	Name = "Auto Place Eggs (1x)",
	CurrentValue = false,
	Flag = "AutoPlaceToggle",
	Callback = function(val)
		autoPlaceEnabled = val
		if val then
			autoPlaceTrigger = autoPlaceTrigger + 1
		end
	end,
})

local hopBusy = false
MainTab:CreateButton({
	Name = "Hop Server (1-3 players)",
	Callback = function()
		if hopBusy then return end
		hopBusy = true
		task.spawn(function()
			local TeleportService = game:GetService("TeleportService")
			local HttpService = game:GetService("HttpService")
			local placeId = game.PlaceId
			local currentJobId = game.JobId

			local lastFailReason
			local failConn = TeleportService.TeleportInitFailed:Connect(function(_, result, err)
				lastFailReason = tostring(result) .. " " .. tostring(err)
			end)

			local function fetchCandidates()
				local cursor
				local candidates = {}
				for _ = 1, 5 do
					local url = "https://games.roblox.com/v1/games/" .. placeId ..
						"/servers/Public?sortOrder=Asc&limit=100" ..
						(cursor and ("&cursor=" .. cursor) or "")
					local ok, body = pcall(function()
						return game:HttpGet(url)
					end)
					if not ok then break end
					local ok2, data = pcall(function()
						return HttpService:JSONDecode(body)
					end)
					if not ok2 or not data or not data.data then break end
					for _, s in ipairs(data.data) do
						if s.id ~= currentJobId and s.playing and s.playing >= 1
							and s.playing <= 3 and s.playing < (s.maxPlayers or 6) then
							table.insert(candidates, { id = s.id, playing = s.playing })
						end
					end
					cursor = data.nextPageCursor
					if not cursor or #candidates >= 40 then break end
				end
				table.sort(candidates, function(a, b) return a.playing < b.playing end)
				return candidates
			end

			local candidates = fetchCandidates()
			if #candidates == 0 then
				monitorPara:Set({ Title = "Status", Content = "No 1-3p server found" })
				failConn:Disconnect()
				hopBusy = false
				return
			end

			for i, c in ipairs(candidates) do
				if i > 10 then break end
				monitorPara:Set({ Title = "Status", Content = "Hop try " .. i .. " (" .. c.playing .. "p)" })
				lastFailReason = nil
				pcall(function()
					TeleportService:TeleportToPlaceInstance(placeId, c.id, LocalPlayer)
				end)
				-- wait for either successful teleport (script torn down) or TeleportInitFailed
				local waited = 0
				while waited < 8 and lastFailReason == nil do
					task.wait(0.5)
					waited += 0.5
				end
				if lastFailReason == nil then
					-- teleport in progress or succeeded
					break
				end
			end

			failConn:Disconnect()
			if lastFailReason then
				monitorPara:Set({ Title = "Status", Content = "Hop failed: " .. lastFailReason:sub(1, 30) })
			end
			hopBusy = false
		end)
	end,
})

-- (only one tab; Rayfield picks it by default)


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

	while not _G.__NaruHubStopped__ do
		local treadmillBusy = false
		pcall(function()
			local stats = SaveModule.Get()
			local nextLevel, config = TreadmillClient.GetNextConfig(stats)
			if nextLevel and config then
				if TreadmillClient.CanAffordNext(stats) then
					TreadmillClient.RequestCashUpgrade()
				end
				-- Treadmill still has tiers left → hold pen upgrades, priority is treadmill
				treadmillBusy = true
			end
		end)
		if not treadmillBusy then
			pcall(function()
				local stats = SaveModule.Get()
				local nextLevel, config = BaseUpgrade.ResolveNextTier(stats)
				if nextLevel and config and BaseUpgrade.IsNextTierAffordable(stats) then
					BaseUpgrade.PurchaseNextTier()
				end
			end)
		end
		task.wait(5)
	end
end)

------------------------------------------------------------
-- Auto Buy Trail Shop (no UI, runs forever)
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)
	local Trails = require(ReplicatedStorage.Data.Trails)

	local sortedKeys = {}
	for key, cfg in pairs(Trails.Directory) do
		if cfg.DisplayInShop and cfg.Price then
			table.insert(sortedKeys, key)
		end
	end
	table.sort(sortedKeys, function(a, b)
		return Trails.Directory[a].Price < Trails.Directory[b].Price
	end)

	while not _G.__NaruHubStopped__ do
		pcall(function()
			local data = SaveModule.Get()
			for _, key in ipairs(sortedKeys) do
				local cfg = Trails.Directory[key]
				if not data.TrailInventory[key] and data.Money >= cfg.Price then
					pcall(function()
						Remotes.Trailwear.AskPurchase:InvokeServer(key)
					end)
					task.wait(0.5)
					data = SaveModule.Get()
				end
			end
		end)
		task.wait(3)
	end
end)


------------------------------------------------------------
-- Auto Sell inventory backlog (< 300M/s, unplaced only, never Divine/Titan)
-- Requires equip (AskWearTool) then SellPet on the held UID.
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)
	while not _G.__NaruHubStopped__ do
		if autoSellEnabled then
			pcall(function()
				local records = getMyOwnedEggs()
				for uid, rec in pairs(records) do
					if not autoSellEnabled then break end
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
							pcall(function()
								Remotes.EggWorld.AskWearTool:InvokeServer(uid)
							end)
							task.wait(0.3)
							pcall(function()
								Remotes.PetSatchel.SellPet:FireServer({ uid })
							end)
							task.wait(0.5)
						end
					end
				end
			end)
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

	-- Locate HIP "Auto Treadmill On Return" toggle so we can pause it while placing
	local function findHipToggle()
		local pg = LocalPlayer:FindFirstChild("PlayerGui")
		local hip = pg and pg:FindFirstChild("HipHub")
		if not hip then return nil end
		for _, d in ipairs(hip:GetDescendants()) do
			if d:IsA("TextLabel") and d.Text == "Auto Treadmill On Return" then
				return d.Parent and d.Parent:FindFirstChild("TextButton") or nil
			end
		end
		return nil
	end
	local function hipToggleIsOn(btn)
		local inner = btn and btn:FindFirstChild("Frame")
		return inner and inner.Position.X.Scale >= 0.5
	end

	local lastConsumedTrigger = 0
	while not _G.__NaruHubStopped__ do
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
				if autoPlaceToggleRef and autoPlaceToggleRef.Set then
					autoPlaceToggleRef:Set(false)
				end
			end)
		end
	end
end)

-- If toggle was persisted ON, seed one trigger so it runs after re-exec
task.spawn(function()
	task.wait(1) -- let Rayfield restore config
	if autoPlaceEnabled then
		autoPlaceTrigger = autoPlaceTrigger + 1
	end
end)

------------------------------------------------------------
-- Auto Hatch every 30 min + Equip Best on any hatch
------------------------------------------------------------
task.spawn(function()
	local Remotes = require(ReplicatedStorage.Shared.Remotes)
	while not _G.__NaruHubStopped__ do
		pcall(function()
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
		task.wait(1800)
	end
end)

------------------------------------------------------------
-- Auto-start monitoring loop
------------------------------------------------------------
task.spawn(function()
	while not _G.__NaruHubStopped__ do
		local ok, err = reportToMonitor()
		if ok then
			monitorPara:Set({ Title = "Status", Content = "OK" })
		else
			monitorPara:Set({ Title = "Status", Content = "Gagal" })
		end
		task.wait(15)
	end
end)
