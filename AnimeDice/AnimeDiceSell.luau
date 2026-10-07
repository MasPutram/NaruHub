--!nocheck
-- NaruHub | AnimeDice Sell Catalog v1.8.0
-- Sends enriched inventory data to dashboard catalog for marketplace listings.
-- Separate loadstring — does NOT interfere with the monitoring script.

------------------------------------------------------------
-- Key Gate
------------------------------------------------------------
local SERVER_BASE_URL = "https://naruhub.my.id"

local DEVICE_ID = "unknown"
pcall(function()
	if gethwid then DEVICE_ID = gethwid() end
end)

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
		if not ok or not res then return false, "Ga bisa hubungin server.", true end
		if not res.Body then return false, "Ga bisa hubungin server.", true end
		local decodeOk, parsed = pcall(function() return HttpService:JSONDecode(res.Body) end)
		if not decodeOk or type(parsed) ~= "table" then return false, "Respon server ga valid." end
		if parsed.ok then return true end
		return false, parsed.error or "Key salah."
	end

	local globalKey = ""
	pcall(function()
		if type(_G.NaruHub_Key) == "string" then globalKey = _G.NaruHub_Key end
	end)

	local granted, _, serverDown = checkAccess(globalKey)
	if not granted and globalKey ~= "" and serverDown then granted = true end
	ACCESS_KEY_USED = globalKey
	if not granted then return end
end

------------------------------------------------------------
-- NaruUI
------------------------------------------------------------
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local httpGet = game.HttpGet or HttpGet
local _naruSrc = httpGet(game, "https://raw.githubusercontent.com/MasPutram/NaruHub/main/NaruUI/NaruUI.luau?v=" .. tostring(tick()))
local NaruUI = loadstring(_naruSrc)()

------------------------------------------------------------
-- Device detection (match server players → devices via Termux API)
------------------------------------------------------------
local deviceUserMap = {}

local function fetchDeviceMap()
	local ok, result = pcall(function()
		local res = request({
			Url = SERVER_BASE_URL .. "/api/termux/devices",
			Method = "GET",
			Headers = { ["Content-Type"] = "application/json" },
		})
		if not res or not res.Body then return {} end
		local parsed = game:GetService("HttpService"):JSONDecode(res.Body)
		if not parsed or not parsed.ok or not parsed.devices then return {} end
		local usernameToDevice = {}
		for _, device in ipairs(parsed.devices) do
			local dname = device.customName or device.hostname or device.deviceId
			if device.packages then
				for _, pkg in ipairs(device.packages) do
					if pkg.username then
						usernameToDevice[pkg.username] = dname
					end
				end
			end
		end
		return usernameToDevice
	end)
	return ok and result or {}
end

local function buildDeviceMap()
	local map = fetchDeviceMap()
	local result = {}
	for _, player in ipairs(Players:GetPlayers()) do
		local dname = map[player.Name]
		if dname then
			result[player.Name] = dname
		end
	end
	return result
end

deviceUserMap = buildDeviceMap()

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
-- Color / visual helpers
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

local function getPantsId(model)
	if not model then return nil end
	local pants = model:FindFirstChildOfClass("Pants")
	if pants and pants.PantsTemplate ~= "" then
		return pants.PantsTemplate:match("(%d+)")
	end
	return nil
end

local function getMeshTextures(model)
	if not model then return nil end
	local textures = {}
	for _, desc in ipairs(model:GetDescendants()) do
		if desc:IsA("MeshPart") and desc.TextureID and desc.TextureID ~= "" then
			local id = desc.TextureID:match("(%d+)")
			if id then
				textures[desc.Name] = id
			end
		end
	end
	return next(textures) and textures or nil
end

------------------------------------------------------------
-- Rarity tier map
------------------------------------------------------------
local RARITY_TIER = {
	Common = 1, Uncommon = 2, Rare = 3, Epic = 4,
	Legendary = 5, Mythical = 6, Divine = 7, Exotic = 8,
	["Secret I"] = 9, Celestial = 9,
	["Secret II"] = 10, Heavenly = 10,
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
-- Collect catalog data (enriched for marketplace display)
------------------------------------------------------------
local function collectCatalog()
	local X = DataController.___X
	local inv = X.Inventory or {}
	local allEntries = EntryRegistry:allEntries()

	local slotUnitIds = {}
	for slotKey, slotVal in pairs(X.Slots or {}) do
		if type(slotVal) == "table" and slotVal.unitId then
			slotUnitIds[slotVal.unitId] = tonumber(slotKey) or slotKey
		end
	end

	local towerUnitIds = {}
	for _, uid in pairs(X.TowerTeam or {}) do
		if type(uid) == "string" then towerUnitIds[uid] = true end
	end

	local units = {}
	local backpack = {}

	for id, entry in pairs(inv) do
		if type(entry) == "table" and entry.name then
			local cfg = allEntries[entry.name]
			local rarity = cfg and cfg.rarity or "Unknown"
			local variant = cfg and cfg.variant or nil
			local kind = cfg and cfg.kind or "Unknown"
			local order = cfg and cfg.order or 0

			if kind == "Unit" then
				local attrs = entry.attributes or {}

				local income, damage, chance, health, speed
				if cfg then
					pcall(function() income = cfg:income() end)
					pcall(function() damage = cfg:damage() end)
					pcall(function() chance = cfg:chance() end)
					pcall(function() health = cfg:health() end)
					pcall(function() speed = cfg:speed() end)
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

				local placed = nil
				if slotUnitIds[id] then placed = "slot"
				elseif towerUnitIds[id] then placed = "tower" end

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
					speed = speed,
					placed = placed,
					colors = cfg and gradientToHexArray(cfg.gradient) or nil,
					modelName = cfg and cfg.baseModel and cfg.baseModel.Name or nil,
					shirtId = cfg and getShirtId(cfg.baseModel) or nil,
					pantsId = cfg and getPantsId(cfg.baseModel) or nil,
					meshTextures = cfg and getMeshTextures(cfg.baseModel) or nil,
				})
			else
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
					image = image,
				})
			end
		end
	end

	table.sort(units, function(a, b)
		if a.tier ~= b.tier then return a.tier > b.tier end
		return a.order > b.order
	end)

	return units, backpack
end

------------------------------------------------------------
-- POST catalog to dashboard
------------------------------------------------------------
local function reportCatalog()
	local ok, err = pcall(function()
		local units, backpack = collectCatalog()
		local X = DataController.___X

		local globalBuffs = {}
		pcall(function()
			globalBuffs.money = BuffController.GetBuff("Money Multiplier")
			globalBuffs.damage = BuffController.GetBuff("Damage Multiplier")
			globalBuffs.health = BuffController.GetBuff("Health Multiplier")
			globalBuffs.luck = BuffController.GetBuff("Luck")
		end)

		local payload = {
			game = "AnimeDice",
			sourceAccount = LocalPlayer.Name,
			deviceMap = deviceUserMap,
			money = X.Money or 0,
			rolls = X.Rolls or 0,
			rebirth = X.Rebirth or 0,
			dice = X.Dice or "Normal",
			vip = (X.OwnedGamepasses and X.OwnedGamepasses.VIP) or false,
			globalBuffs = globalBuffs,
			units = units,
			backpack = backpack,
			unitsCount = #units,
		}

		local body = HttpService:JSONEncode(payload)
		pcall(function()
			request({
				Url = SERVER_BASE_URL .. "/api/anime-dice/catalog",
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["X-Device-Id"] = DEVICE_ID,
					["X-Access-Key"] = ACCESS_KEY_USED,
				},
				Body = body,
			})
		end)
	end)
	return ok, err
end

------------------------------------------------------------
-- Number formatter
------------------------------------------------------------
local SUFFIXES = {
	"", "K", "M", "B", "T", "qa", "qi", "sx", "sp", "oc",
	"no", "dc", "ud", "dd", "td", "qad", "qid", "sxd", "spd", "ocd",
	"nod", "vg", "uvg",
}

local function formatNum(n)
	if not n or n == 0 then return "0" end
	if n < 1000 then return string.format("%.0f", n) end
	local tier = math.floor(math.log10(math.abs(n)) / 3)
	if tier < 1 then return string.format("%.0f", n) end
	if tier > #SUFFIXES - 1 then tier = #SUFFIXES - 1 end
	local scaled = n / (10 ^ (tier * 3))
	if scaled >= 100 then
		return string.format("%.0f%s", scaled, SUFFIXES[tier + 1])
	elseif scaled >= 10 then
		return string.format("%.1f%s", scaled, SUFFIXES[tier + 1])
	else
		return string.format("%.2f%s", scaled, SUFFIXES[tier + 1])
	end
end

------------------------------------------------------------
-- NaruUI Window
------------------------------------------------------------
local Fluent = NaruUI.New({
	ConfigPrefix = "AnimeDiceSell",
	BrandColor = Color3.fromRGB(76, 175, 80),
})

local Window = Fluent:CreateWindow({
	Title = "NaruHub | AD Catalog v1.8.0",
	Badge = "SELL",
	TabWidth = 90,
	Size = UDim2.fromOffset(420, 460),
	AutoStartMinimized = false,
})

local Tab = Window:AddTab({ Title = "Catalog" })
local section = Tab:AddSection(LocalPlayer.Name, { NoCollapse = true })

local statusPara = section:AddParagraph({
	Title = "Status",
	Content = "Starting...",
	ContentSize = 13,
	Center = true,
})

local deviceMapPara = section:AddParagraph({
	Title = "Device Map",
	Content = "Detecting...",
	ContentSize = 12,
})

local statsPara = section:AddParagraph({
	Title = "Inventory",
	Content = "Loading...",
	ContentSize = 13,
})

local topUnitsPara = section:AddParagraph({
	Title = "Top Units (by Income)",
	Content = "Loading...",
	ContentSize = 12,
})

local function buildInventoryDisplay()
	local units, backpack = collectCatalog()

	pcall(function()
		deviceUserMap = buildDeviceMap()
		if next(deviceUserMap) then
			local lines = {}
			for username, dname in pairs(deviceUserMap) do
				table.insert(lines, username .. "  ⟶  " .. dname)
			end
			table.sort(lines)
			deviceMapPara:SetContent(table.concat(lines, "\n"))
		else
			deviceMapPara:SetContent("No matches in this server")
		end
	end)

	local totalIncome = 0
	for _, u in ipairs(units) do
		if u.income then totalIncome += u.income end
	end

	local statsLines = {
		"Units: " .. #units,
		"Items: " .. #backpack,
		"Total Income: $" .. formatNum(totalIncome) .. "/s",
	}
	statsPara:SetContent(table.concat(statsLines, "\n"))

	table.sort(units, function(a, b)
		return (a.income or 0) > (b.income or 0)
	end)

	local topLines = {}
	for i = 1, math.min(10, #units) do
		local u = units[i]
		local parts = {}
		if u.mutation then table.insert(parts, u.mutation) end
		if u.grade then table.insert(parts, u.grade) end
		if u.trait then table.insert(parts, u.trait) end
		local suffix = #parts > 0 and " [" .. table.concat(parts, " | ") .. "]" or ""
		local rarity = u.displayRarity or u.rarity or ""
		local lvl = u.level and (" Lv" .. u.level) or ""
		table.insert(topLines,
			i .. ". " .. u.name .. lvl ..
			"\n   " .. rarity .. suffix ..
			"\n   $" .. formatNum(u.income or 0) .. "/s"
		)
	end
	topUnitsPara:SetContent(table.concat(topLines, "\n\n"))

	return #units, #backpack
end

------------------------------------------------------------
-- Report loop (every 60s — less frequent than monitor)
------------------------------------------------------------
task.spawn(function()
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		local ok, err = reportCatalog()
		if ok then
			statusPara:SetContent("Catalog sent OK (" .. os.date("%H:%M:%S") .. ")")
		else
			statusPara:SetContent("Gagal: " .. tostring(err))
		end
		pcall(buildInventoryDisplay)
		task.wait(60)
	end
end)

------------------------------------------------------------
-- Trade Tab
------------------------------------------------------------
do
	local ClientComm = require(ReplicatedStorage.Packages.Network).ClientComm
	local TradeComm = ClientComm.new(ReplicatedStorage.Network, false, "TradeService")
	local RequestTrade = TradeComm:GetSignal("RequestTrade")
	local ChangeOffer = TradeComm:GetSignal("ChangeOffer")
	local AdvanceTrade = TradeComm:GetSignal("AdvanceTrade")
	local CancelTrade = TradeComm:GetSignal("CancelTrade")
	local TradeEvent = TradeComm:GetSignal("TradeEvent")

	local TradeTab = Window:AddTab({ Title = "Trade" })
	local tradeSection = TradeTab:AddSection("Smart Trade", { NoCollapse = true })

	local tradeStatusPara = tradeSection:AddParagraph({
		Title = "Status",
		Content = "Idle",
		ContentSize = 13,
		Center = true,
	})

	-- Target player dropdown
	local targetPlayer = nil
	local function getPlayerNames()
		local names = {}
		for _, p in ipairs(Players:GetPlayers()) do
			if p ~= LocalPlayer then
				table.insert(names, p.Name)
			end
		end
		table.sort(names)
		return names
	end

	local targetDropdown = tradeSection:AddDropdown("TradeTarget", {
		Title = "Target Player",
		Values = getPlayerNames(),
	})
	targetDropdown:OnChanged(function(v)
		targetPlayer = Players:FindFirstChild(v)
	end)

	tradeSection:AddButton({
		Title = "Refresh Players",
		Callback = function()
			targetDropdown:SetValues(getPlayerNames())
		end,
	})

	-- Items to send
	local itemSection = TradeTab:AddSection("Items to Send", { NoCollapse = true })

	local itemInputs = {}
	local TRADE_ITEMS = { "Gem", "Trait Reroll Token", "Lucky Spin Token", "Jackpot Token" }
	for _, itemName in ipairs(TRADE_ITEMS) do
		itemInputs[itemName] = itemSection:AddInput("Trade_" .. itemName, {
			Title = itemName,
			Placeholder = "0",
			Default = "0",
			Numeric = true,
			Finished = true,
		})
	end

	-- Units to send
	local unitSection = TradeTab:AddSection("Units to Send", { NoCollapse = true })

	local chanceFilterInput = unitSection:AddInput("TradeChanceFilter", {
		Title = "Min Chance (1 in X)",
		Placeholder = "e.g. 1e21",
		Default = "1e21",
		Finished = true,
	})

	local unitCountInput = unitSection:AddInput("TradeUnitCount", {
		Title = "Max Units to Send",
		Placeholder = "0 = all",
		Default = "0",
		Numeric = true,
		Finished = true,
	})

	local unitPreviewPara = unitSection:AddParagraph({
		Title = "Preview",
		Content = "Set filter to preview",
		ContentSize = 11,
	})

	local function previewUnits()
		local units, _ = collectCatalog()
		local minChance = tonumber(chanceFilterInput.Value) or 1e21
		local maxCount = tonumber(unitCountInput.Value) or 0

		local filtered = {}
		for _, u in ipairs(units) do
			if u.chance and u.chance >= minChance and not u.placed and not u.locked then
				table.insert(filtered, u)
			end
		end

		table.sort(filtered, function(a, b)
			return (a.chance or 0) > (b.chance or 0)
		end)

		if maxCount > 0 and #filtered > maxCount then
			local trimmed = {}
			for i = 1, maxCount do
				trimmed[i] = filtered[i]
			end
			filtered = trimmed
		end

		if #filtered == 0 then
			unitPreviewPara:SetContent("No matching units")
			return
		end

		local groups = {}
		local groupOrder = {}
		for _, u in ipairs(filtered) do
			local gk = u.name .. "|" .. tostring(u.chance)
			if not groups[gk] then
				groups[gk] = { name = u.name, chance = u.chance, count = 0, minLevel = 999 }
				table.insert(groupOrder, gk)
			end
			groups[gk].count += 1
			groups[gk].minLevel = math.min(groups[gk].minLevel, u.level or 0)
		end

		local lines = {}
		for _, gk in ipairs(groupOrder) do
			local g = groups[gk]
			local countStr = g.count > 1 and (" (" .. g.count .. ")") or ""
			table.insert(lines, "1 in " .. formatNum(g.chance) .. " Lvl " .. g.minLevel .. countStr .. "  " .. g.name)
		end
		unitPreviewPara:SetContent(table.concat(lines, "\n") .. "\n\nTotal: " .. #filtered .. " units")
	end

	unitSection:AddButton({
		Title = "Preview Units",
		Callback = previewUnits,
	})

	-- Auto toggles
	local optSection = TradeTab:AddSection("Options", { NoCollapse = true })

	local autoReady = false
	optSection:AddToggle("TradeAutoReady", {
		Title = "Auto Ready",
		Default = false,
		Callback = function(v) autoReady = v end,
	})

	local autoAccept = false
	optSection:AddToggle("TradeAutoAccept", {
		Title = "Auto Accept",
		Default = false,
		Callback = function(v) autoAccept = v end,
	})

	-- Trade execution state
	local tradeActive = false
	local tradePendingItems = {}
	local tradePendingUnits = {}
	local currentTradeState = nil

	local function buildTradeQueue()
		local itemQueue = {}
		local units, backpack = collectCatalog()

		for _, itemName in ipairs(TRADE_ITEMS) do
			local qty = tonumber(itemInputs[itemName].Value) or 0
			if qty > 0 then
				for _, bp in ipairs(backpack) do
					if bp.name == itemName then
						local sendAmt = math.min(qty, bp.amount)
						if sendAmt > 0 then
							table.insert(itemQueue, { name = itemName, amount = sendAmt })
						end
						break
					end
				end
			end
		end

		local minChance = tonumber(chanceFilterInput.Value) or 1e21
		local maxCount = tonumber(unitCountInput.Value) or 0
		local unitQueue = {}

		for _, u in ipairs(units) do
			if u.chance and u.chance >= minChance and not u.placed and not u.locked then
				table.insert(unitQueue, { id = u.id, name = u.name, chance = u.chance, amount = 1 })
			end
		end
		table.sort(unitQueue, function(a, b) return (a.chance or 0) > (b.chance or 0) end)
		if maxCount > 0 and #unitQueue > maxCount then
			local trimmed = {}
			for i = 1, maxCount do trimmed[i] = unitQueue[i] end
			unitQueue = trimmed
		end

		return itemQueue, unitQueue
	end

	local function offerAllItems()
		if not currentTradeState then return end

		local itemQueue, unitQueue = buildTradeQueue()
		local totalOffered = 0

		tradeStatusPara:SetContent("Offering items...")
		for _, item in ipairs(itemQueue) do
			local inv = DataController.___X.Inventory or {}
			for entryId, entry in pairs(inv) do
				if entry.name == item.name then
					local alreadyOffered = currentTradeState.ownOffer[entryId] or 0
					local canOffer = math.min(item.amount - alreadyOffered, (entry.amount or 0) - alreadyOffered)
					if canOffer > 0 then
						ChangeOffer:Fire(entryId, canOffer)
						totalOffered += 1
						task.wait(0.15)
					end
					break
				end
			end
		end

		tradeStatusPara:SetContent("Offering units...")
		for _, unit in ipairs(unitQueue) do
			if unit.id then
				local alreadyOffered = currentTradeState.ownOffer[unit.id] or 0
				if alreadyOffered == 0 then
					ChangeOffer:Fire(unit.id, 1)
					totalOffered += 1
					task.wait(0.15)
				end
			end
		end

		tradeStatusPara:SetContent("Offered " .. totalOffered .. " entries. " .. (autoReady and "Auto-readying..." or "Waiting for Ready..."))

		if autoReady then
			task.wait(0.5)
			AdvanceTrade:Fire()
			tradeStatusPara:SetContent("Ready sent. Waiting for partner...")
		end
	end

	-- Listen for trade events
	TradeEvent:Connect(function(event, data)
		if event == "Started" then
			currentTradeState = { ownOffer = {}, otherOffer = {}, phase = "Offer" }
			tradeStatusPara:SetContent("Trade started with " .. (data.partner and data.partner.Name or "?"))
			if tradeActive then
				task.spawn(function()
					task.wait(0.5)
					offerAllItems()
				end)
			end

		elseif event == "Updated" then
			currentTradeState = data
			if tradeActive and data.phase == "Confirm" and autoAccept and not data.ownAccepted then
				task.wait(0.3)
				AdvanceTrade:Fire()
				tradeStatusPara:SetContent("Auto-accepted!")
			end

		elseif event == "Ended" then
			local reason = data.reason or "?"
			currentTradeState = nil
			tradeActive = false
			tradeStatusPara:SetContent("Trade ended: " .. reason)
		end
	end)

	-- Start trade button
	tradeSection:AddButton({
		Title = "Start Trade",
		Callback = function()
			if not targetPlayer or not targetPlayer.Parent then
				tradeStatusPara:SetContent("ERROR: Select a valid target player")
				return
			end

			local itemQueue, unitQueue = buildTradeQueue()
			if #itemQueue == 0 and #unitQueue == 0 then
				tradeStatusPara:SetContent("ERROR: Nothing to send. Set items/units first")
				return
			end

			tradeActive = true
			tradeStatusPara:SetContent("Requesting trade with " .. targetPlayer.Name .. "...")
			RequestTrade:Fire(targetPlayer)
		end,
	})

	tradeSection:AddButton({
		Title = "Cancel Trade",
		Callback = function()
			tradeActive = false
			CancelTrade:Fire()
			tradeStatusPara:SetContent("Trade cancelled")
		end,
	})

	-- Refresh player list periodically
	task.spawn(function()
		while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
			task.wait(15)
			pcall(function()
				targetDropdown:SetValues(getPlayerNames())
			end)
		end
	end)
end
