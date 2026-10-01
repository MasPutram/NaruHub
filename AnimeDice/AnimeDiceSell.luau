--!nocheck
-- NaruHub | AnimeDice Sell Catalog v1.4.0
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
-- NaruUI Window
------------------------------------------------------------
local Fluent = NaruUI.New({
	ConfigPrefix = "AnimeDiceSell",
	BrandColor = Color3.fromRGB(76, 175, 80),
})

local Window = Fluent:CreateWindow({
	Title = "NaruHub | AD Catalog v1.4.0",
	Badge = "SELL",
	TabWidth = 0,
	Size = UDim2.fromOffset(380, 260),
	AutoStartMinimized = false,
})

local Tab = Window:AddTab({ Title = "" })
local section = Tab:AddSection(LocalPlayer.Name, { NoCollapse = true })

local statusPara = section:AddParagraph({
	Title = "Catalog",
	Content = "Starting...",
	ContentSize = 14,
	Center = true,
})

------------------------------------------------------------
-- Report loop (every 60s — less frequent than monitor)
------------------------------------------------------------
task.spawn(function()
	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		local ok, err = reportCatalog()
		if ok then
			statusPara:SetContent("Catalog sent OK")
		else
			statusPara:SetContent("Gagal: " .. tostring(err))
		end
		task.wait(60)
	end
end)
