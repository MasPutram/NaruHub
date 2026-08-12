--!nocheck
-- NaruHub | Grow a Garden
-- Script #1: Auto Buy Seed
--
-- Catatan mekanik penting (Grow a Garden):
--  * Beli seed = Networking.SeedShop.PurchaseSeed:Fire(namaSeed) (Packet lib, arg String).
--  * Server MENOLAK purchase dari thread executor (identity 8). Harus di-fire di
--    identity 2. Tapi identity 2 melucuti akses Instance, jadi identity hanya
--    diturunkan sesaat saat :Fire lalu dikembalikan ke 8.
--  * Stok global: ReplicatedStorage.StockValues.SeedShop.Items.<Nama>.Value
--  * Harga: ReplicatedStorage.SharedModules.SeedData (PurchasePrice per SeedName)
--  * Saldo: Players.<me>.leaderstats.Sheckles

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")

local LocalPlayer = Players.LocalPlayer

local BRAND = Color3.fromRGB(65, 45, 21) -- #412D15 border NaruHub

-- Generation guard: kalau script di-execute ulang (loadstring), run lama berhenti.
local MY_GEN
do
	local g = getgenv()
	g.__NaruHubGen = (g.__NaruHubGen or 0) + 1
	MY_GEN = g.__NaruHubGen
end

--==============================================================
-- Game bindings
--==============================================================

local PurchaseSeed, CollectFruit, UseShovel, PlaceSprinkler, RequestDrop
do
	local ok, net = pcall(function()
		return require(ReplicatedStorage.SharedModules.Networking)
	end)
	if ok and net then
		if net.SeedShop then
			PurchaseSeed = net.SeedShop.PurchaseSeed
		end
		if net.Garden then
			CollectFruit = net.Garden.CollectFruit
		end
		if net.Shovel then
			UseShovel = net.Shovel.UseShovel
		end
		if net.Place then
			PlaceSprinkler = net.Place.PlaceSprinkler
		end
		if net.DroppedItem then
			RequestDrop = net.DroppedItem.RequestDrop
		end
	end
end

local CollectionService = game:GetService("CollectionService")

-- Berat buah (kg) pakai kalkulator asli game.
local fruitWeightFn
do
	local ok, FVC = pcall(function()
		return require(LocalPlayer.PlayerScripts.Controllers.FruitVisualizerController)
	end)
	if ok and FVC and FVC.CalculateFruitWeight then
		-- cache berat per fruit (weak key) -> hemat CPU, berat mature ~stabil
		local cache = setmetatable({}, { __mode = "k" })
		fruitWeightFn = function(fruit)
			local c = cache[fruit]
			if c ~= nil then
				return c ~= false and c or nil
			end
			local o, g = pcall(function()
				return FVC:CalculateFruitWeight(fruit)
			end)
			local val = (o and type(g) == "number") and g or nil
			cache[fruit] = val == nil and false or val
			return val
		end
	end
end

-- Sisa waktu tumbuh buah (detik). 0 = ready, nil = tak diketahui.
local fruitGrowthFn
do
	local ok, FVC = pcall(function()
		return require(LocalPlayer.PlayerScripts.Controllers.FruitVisualizerController)
	end)
	if ok and FVC and FVC.GetFruitGrowthData then
		fruitGrowthFn = function(fruit)
			local o, d = pcall(function()
				return FVC:GetFruitGrowthData(
					tonumber(fruit:GetAttribute("UserId")),
					fruit:GetAttribute("PlantId"),
					fruit:GetAttribute("FruitId")
				)
			end)
			if o and type(d) == "table" and type(d.MaxAge) == "number" and type(d.CurrentAge) == "number" and type(d.GrowthRate) == "number" then
				if d.CurrentAge >= d.MaxAge then
					return 0
				end
				if d.GrowthRate > 0 then
					return (d.MaxAge - d.CurrentAge) / d.GrowthRate
				end
			end
			return nil
		end
	end
end

local function fmtTime(sec: number): string
	sec = math.floor(sec)
	if sec >= 3600 then
		return ("%dh %dm"):format(sec // 3600, (sec % 3600) // 60)
	elseif sec >= 60 then
		return ("%dm %ds"):format(sec // 60, sec % 60)
	end
	return ("%ds"):format(sec)
end

local setIdentity = setthreadidentity or set_thread_identity or setidentity or setthreadcontext
local getIdentity = getthreadidentity or get_thread_identity or getidentity

local function getSheckles(): number?
	local ls = LocalPlayer:FindFirstChild("leaderstats")
	local s = ls and ls:FindFirstChild("Sheckles")
	return s and s.Value or nil
end

local stockItems = ReplicatedStorage:FindFirstChild("StockValues")
stockItems = stockItems and stockItems:FindFirstChild("SeedShop")
stockItems = stockItems and stockItems:FindFirstChild("Items")

local function getStock(name: string): number
	if not stockItems then
		return 0
	end
	local v = stockItems:FindFirstChild(name)
	return (v and v.Value) or 0
end

local priceByName: { [string]: number } = {}
local ALL_SEEDS: { string } = {}
do
	local ok, SeedData = pcall(function()
		return require(ReplicatedStorage.SharedModules.SeedData)
	end)
	if ok and type(SeedData) == "table" then
		local seen = {}
		for _, entry in ipairs(SeedData) do
			local n = entry.SeedName or entry.Name
			if n then
				if entry.PurchasePrice then
					priceByName[n] = entry.PurchasePrice
				end
				if not seen[n] then
					seen[n] = true
					table.insert(ALL_SEEDS, n)
				end
			end
		end
		table.sort(ALL_SEEDS)
	end
end

-- Kategori attribute Tool -> nama kategori Networking.DroppedItem.RequestDrop.
-- Sama seperti tabel lookup asli game (DroppedItemController).
local DROP_CATEGORY_BY_ATTR: { [string]: string } = {
	SeedTool = "Seeds",
	Sprinkler = "Sprinklers",
	WateringCan = "WateringCans",
	Mushroom = "Mushrooms",
	Gnome = "Gnomes",
	Raccoon = "Raccoons",
	Crate = "Crates",
	Teleporter = "Teleporters",
	PlayerMagnet = "Magnets",
	FruitMagnet = "FruitMagnets",
	PetTeleporter = "PetTeleporters",
	SeedPack = "SeedPacks",
	Wheelbarrow = "Wheelbarrows",
	Trowel = "Trowels",
	Crowbar = "Crowbars",
	Ladder = "Ladders",
	FreezeRay = "FreezeRays",
	PowerHose = "PowerHoses",
	Rake = "Rakes",
	Sign = "Signs",
	EmptyPot = "EmptyPots",
	Flashbang = "Flashbangs",
	Bird = "Birds",
}

-- Rarity per nama seed/fruit (SeedName == FruitName di game ini).
local rarityBySeedName: { [string]: string } = {}
local ALL_GEAR: { string } = {}
local rarityByGearName: { [string]: string } = {}
local RARITY_LIST: { string } = {}
do
	local seen = {}
	local ok, SeedData = pcall(function()
		return require(ReplicatedStorage.SharedModules.SeedData)
	end)
	if ok and type(SeedData) == "table" then
		for _, entry in ipairs(SeedData) do
			local n = entry.SeedName or entry.Name
			if n and entry.Rarity then
				rarityBySeedName[n] = entry.Rarity
				if not seen[entry.Rarity] then
					seen[entry.Rarity] = true
					table.insert(RARITY_LIST, entry.Rarity)
				end
			end
		end
	end
	local ok2, GearShopData = pcall(function()
		return require(ReplicatedStorage.SharedModules.GearShopData)
	end)
	if ok2 and type(GearShopData) == "table" and type(GearShopData.Data) == "table" then
		local seenGear = {}
		for _, entry in ipairs(GearShopData.Data) do
			local n = entry.ItemName
			if n then
				if entry.Rarity then
					rarityByGearName[n] = entry.Rarity
					if not seen[entry.Rarity] then
						seen[entry.Rarity] = true
						table.insert(RARITY_LIST, entry.Rarity)
					end
				end
				if not seenGear[n] then
					seenGear[n] = true
					table.insert(ALL_GEAR, n)
				end
			end
		end
	end
	table.sort(RARITY_LIST)
	table.sort(ALL_GEAR)
end

-- Spesies pet (dari PetModules -- data animasi/wander, key = nama spesies).
local ALL_PETS: { string } = {}
do
	local ok, PetModules = pcall(function()
		return require(ReplicatedStorage.SharedModules.PetModules)
	end)
	if ok and type(PetModules) == "table" then
		for name in pairs(PetModules) do
			table.insert(ALL_PETS, name)
		end
		table.sort(ALL_PETS)
	end
end

-- Mutasi buah: dikumpulkan dari backpack saat load (tidak ada daftar statis resmi).
-- Kosong = filter mutasi diabaikan. Update: buka ulang script kalau ada mutasi baru.
local ALL_MUTATIONS: { string } = {}
do
	local seen = {}
	local function scan(container)
		if not container then
			return
		end
		for _, t in ipairs(container:GetChildren()) do
			if t:IsA("Tool") and t:GetAttribute("HarvestedFruit") == true then
				local m = t:GetAttribute("Mutation")
				if m and m ~= "" and not seen[m] then
					seen[m] = true
					table.insert(ALL_MUTATIONS, m)
				end
			end
		end
	end
	scan(LocalPlayer:FindFirstChild("Backpack"))
	scan(LocalPlayer.Character)
	table.sort(ALL_MUTATIONS)
end

local function getSeedNames(): { string }
	local names = {}
	if stockItems then
		for _, sv in ipairs(stockItems:GetChildren()) do
			table.insert(names, sv.Name)
		end
	end
	table.sort(names)
	return names
end

-- Fire pembelian satu seed. Identity 2 hanya sesaat saat :Fire.
local function buySeed(name: string): boolean
	if not PurchaseSeed then
		return false
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok = pcall(function()
		PurchaseSeed:Fire(name)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	return ok
end

--==============================================================
-- Garden: shovel fruit by kg
--==============================================================
local myUserId = LocalPlayer.UserId
local myPrefix = tostring(myUserId) .. "_"

local function getMyPlotFruits(): { any }
	local list = {}
	local gardens = workspace:FindFirstChild("Gardens")
	if not gardens then
		return list
	end
	for _, plot in ipairs(gardens:GetChildren()) do
		local plants = plot:FindFirstChild("Plants")
		if plants then
			local mine = false
			for _, pl in ipairs(plants:GetChildren()) do
				if pl:GetAttribute("UserId") == myUserId or pl.Name:sub(1, #myPrefix) == myPrefix then
					mine = true
					break
				end
			end
			if mine then
				for _, pl in ipairs(plants:GetChildren()) do
					local seed = pl:GetAttribute("SeedName")
					local fruits = pl:FindFirstChild("Fruits")
					if fruits then
						for _, f in ipairs(fruits:GetChildren()) do
							if f:IsA("Model") then
								local fid = f:GetAttribute("FruitId")
								local pid = f:GetAttribute("PlantId") or pl:GetAttribute("PlantId")
								if fid and pid then
									list[#list + 1] = { plantId = pid, fruitId = fid, seed = seed, model = f }
								end
							end
						end
					end
				end
				return list
			end
		end
	end
	return list
end

local function getEquippedShovel(): Instance?
	local char = LocalPlayer.Character
	local function findIn(c)
		if not c then
			return nil
		end
		for _, t in ipairs(c:GetChildren()) do
			if t:IsA("Tool") and (t.Name == "Shovel" or t:GetAttribute("Shovel")) then
				return t
			end
		end
		return nil
	end
	local sh = char and findIn(char)
	if sh then
		return sh
	end
	sh = findIn(LocalPlayer:FindFirstChild("Backpack"))
	if sh and char then
		local hum = char:FindFirstChildWhichIsA("Humanoid")
		if hum then
			pcall(function()
				hum:EquipTool(sh)
			end)
		end
		return sh.Parent == char and sh or nil
	end
	return nil
end

-- Shovel satu fruit. Identity 2 hanya sesaat saat Fire.
local function shovelFruit(plantId: string, fruitId: string, shovelAttr: string, tool: Instance): boolean
	if not UseShovel then
		return false
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok = pcall(function()
		UseShovel:Fire(plantId, fruitId or "", shovelAttr, tool)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	return ok
end

-- Plot model milikku (untuk Sprinklers folder + posisi).
local function getMyPlot(): Instance?
	local gardens = workspace:FindFirstChild("Gardens")
	if not gardens then
		return nil
	end
	for _, plot in ipairs(gardens:GetChildren()) do
		local plants = plot:FindFirstChild("Plants")
		if plants then
			for _, pl in ipairs(plants:GetChildren()) do
				if pl:GetAttribute("UserId") == myUserId or pl.Name:sub(1, #myPrefix) == myPrefix then
					return plot
				end
			end
		end
	end
	return nil
end

local function getEquippedSprinkler(): Instance?
	local char = LocalPlayer.Character
	local function findIn(c)
		if not c then
			return nil
		end
		for _, t in ipairs(c:GetChildren()) do
			if t:IsA("Tool") and t:GetAttribute("Sprinkler") then
				return t
			end
		end
		return nil
	end
	local sp = char and findIn(char)
	if sp then
		return sp
	end
	sp = findIn(LocalPlayer:FindFirstChild("Backpack"))
	if sp and char then
		local hum = char:FindFirstChildWhichIsA("Humanoid")
		if hum then
			pcall(function()
				hum:EquipTool(sp)
			end)
		end
		return sp.Parent == char and sp or nil
	end
	return nil
end

-- Cari & equip sprinkler tool dgn tipe tertentu (nil = tipe itu habis).
local function getSprinklerToolByType(typeName: string): Instance?
	local char = LocalPlayer.Character
	local function findIn(c)
		if not c then
			return nil
		end
		for _, t in ipairs(c:GetChildren()) do
			if t:IsA("Tool") and t:GetAttribute("Sprinkler") == typeName then
				return t
			end
		end
		return nil
	end
	local sp = char and findIn(char)
	if sp then
		return sp
	end
	sp = findIn(LocalPlayer:FindFirstChild("Backpack"))
	if sp and char then
		local hum = char:FindFirstChildWhichIsA("Humanoid")
		if hum then
			pcall(function()
				hum:EquipTool(sp)
			end)
		end
		return sp.Parent == char and sp or nil
	end
	return nil
end

local function getOwnedSprinklerTypes(): { string }
	local set, list = {}, {}
	local function scan(c)
		if not c then
			return
		end
		for _, t in ipairs(c:GetChildren()) do
			local a = t:IsA("Tool") and t:GetAttribute("Sprinkler")
			if a and not set[a] then
				set[a] = true
				list[#list + 1] = a
			end
		end
	end
	scan(LocalPlayer:FindFirstChild("Backpack"))
	scan(LocalPlayer.Character)
	table.sort(list)
	return list
end

local function placeSprinkler(pos: Vector3, attr: string, tool: Instance, plotId: number): boolean
	if not PlaceSprinkler then
		return false
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok = pcall(function()
		PlaceSprinkler:Fire(pos, attr, tool, plotId)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	return ok
end

-- Tentukan (kategori, id) drop dari sebuah Tool, sama seperti logika asli game
-- (DroppedItemController): fruit & pet pakai Id unik, sisanya pakai nama attribute-nya.
local function getDropCategoryAndId(tool: Instance): (string?, string?)
	if tool:GetAttribute("HarvestedFruit") == true then
		local id = tool:GetAttribute("Id")
		if id then
			return "HarvestedFruits", id
		end
	end
	local petId = tool:GetAttribute("PetId")
	if type(petId) == "string" and petId ~= "" then
		return "Pets", petId
	end
	for attrName, category in pairs(DROP_CATEGORY_BY_ATTR) do
		local v = tool:GetAttribute(attrName)
		if v then
			return category, v
		end
	end
	return nil, nil
end

-- Equip tool -> fire RequestDrop(category, id) di identity 2 -> selesai.
local function dropTool(tool: Instance): boolean
	if not RequestDrop then
		return false
	end
	local category, id = getDropCategoryAndId(tool)
	if not category or not id then
		return false
	end
	local char = LocalPlayer.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum then
		pcall(function()
			hum:EquipTool(tool)
		end)
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok = pcall(function()
		RequestDrop:Fire(category, id)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	return ok
end

-- Counter live untuk Monitor HUD (bukan config).
local Monitor = { Shovel = 0, Sprinkler = 0, MatchX = 0, MatchY = 0, LastGoodKg = 0, Ready = 0, FruitList = {} }
local SPRINKLER_LIFETIME = 120
local sprinklerTimes = {} -- os.clock() tiap placement (untuk countdown)

--==============================================================
-- Logo (tertanam, sudah dikompres ~256px)
--==============================================================

local LOGO_B64 = "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F4BHx7SNknO2HYXPitdYiTD0Z5XBslogIjNlbm7uAeFJ+HLglGFJ6Qjw+Ji2pdi2X8A343WWo6b5f368vsi64MtvhxF4basw36ev8Rl3m3FwTNvm5Jy395WEKxKH/iz+YLy2yLpgw29l8E3gWD/e6rbhEfDcmLbl8PRfFa+3lPD0v75uGrLIugDsEgJwHGPHbX2+b93dibWsvrP39+XuLBw7/2yLsng9kXXDJ9gMm/vAGwe/yznfvQzX3SbgFdWUrYxt1b2cSsDG/sOhx8RriawbwM62AGZQGuK21zZK0EUlYK8c5X1Xw4YSrUkfrz1Q0/n3Y4X7lnVt48aNO9linKJQvC2eA9x7tT3uywW8Id53NYC9y3BjpZqZfyfEz4usK8BdU0plgM5FFYABbgOcFHvQV8ufxmVhPDHec7Xm5+f3Lyu14h7l2P+CtW7iZ0XWFR9KG4bdBt4Szyl5M/uLw1K1SjUVwCnxXmuRc37kqJaA0di/yBZbbHHTTTfd2eLtFQXjTOChwP28f+AuwB1zzrctP7ewsHAAcG5TO/cAHyiv3wRb2luGHy8BL4rni6w7Oeftyk06igIy79F4r08pXQP8DLjY+gKA8yxenxVa4IoySo8/2O2z5eQie/2OYbcqQT2A02PamuCjA5VlxB5/YGQAEpF1A9hqOcNny+UVQNxgwwq/VQr9Qu/n2Dt4WSGcGdPWFGBP4JriXp+J54isW8AHB4VjXKxVEdPVJGCPlNKXfL/B+8Tfi6xbtv2VRQcGDgIOBY4EjrYOQeucA04FPplSsm28z7ddfH3LbIvnb6G6rUm9ptGBlNLZMV0iMqE8Tt9WPopgswnvDzwMeJRtNwY8A3iBLy6ybb5PBN4DfNQ3AP2KVyQ/BS6yZnq8h4jMOM3EExEREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREZFx+H+J2wq6++I1pAAAAABJRU5ErkJggg=="

local function buildLogoAsset(): string?
	local dec = base64_decode or base64decode
	if not dec and crypt and crypt.base64 then
		dec = crypt.base64.decode
	end
	if not (dec and writefile and getcustomasset) then
		return nil
	end
	local ok, asset = pcall(function()
		writefile("NaruHub_logo.png", dec(LOGO_B64))
		return getcustomasset("NaruHub_logo.png")
	end)
	return ok and asset or nil
end

local LOGO_ASSET = buildLogoAsset()

--==============================================================
-- State
--==============================================================

-- Cuaca dideteksi lewat atribut ReplicatedStorage.WeatherValues: <attr>_Playing / <attr>_EndTime.
local WEATHERS = {
	{ id = "Rain", attr = "Rain", emoji = "🌧️" },
	{ id = "Thunderstorm", attr = "Lightning", emoji = "⛈️" },
	{ id = "Rainbow", attr = "Rainbow", emoji = "🌈" },
	{ id = "Eclipse", attr = "Eclipse", emoji = "🌑" },
	{ id = "Snowfall", attr = "Snowfall", emoji = "❄️" },
	{ id = "Starfall", attr = "Starfall", emoji = "🌠" },
	{ id = "Aurora", attr = "Aurora", emoji = "🌌" },
	{ id = "Sunburst", attr = "Sunburst", emoji = "☀️" },
}

local State = {
	Enabled = false,
	BuyAll = true,
	Selected = {} :: { [string]: boolean },
	BuyDelay = 0.2,
	BoughtSession = 0,

	WeatherNotify = true,
	WeatherNotifyEnd = false,
	WeatherSel = {} :: { [string]: boolean },
	WebhookUrl = "",

	ShovelEnabled = false,
	ShovelDryRun = true,
	ShovelMode = "Below",
	ShovelKg = 5,
	ShovelSeeds = {} :: { [string]: boolean },
	ShovelLimit = 30,
	ShovelDelay = 0.2,
	ShovelNoTP = false,

	SprinklerEnabled = false,
	SprinklerDelay = 1.5,
	SprinklerNoTP = false,
	EspEnabled = false,
	MonitorShow = true,
	MonSort = "High",

	-- Auto Pumpkin (Misc): place sprinkler + shovel, khusus Atlantic Giant Pumpkin
	PumpkinEnabled = false,
	PumpkinSprinkler = "Syrup Sprinkler",
	PumpkinKg = 50,
	PumpkinDelay = 0.15,
	PumpkinNoTP = false,

	-- Automatically Drop Item (Automatically tab)
	DropDelay = 0.25,

	DropSeedEnabled = false,
	DropSeedList = {} :: { [string]: boolean },

	DropFruitEnabled = false,
	DropFruitList = {} :: { [string]: boolean },
	DropFruitRarity = {} :: { [string]: boolean },
	DropFruitMutation = {} :: { [string]: boolean },
	DropFruitMode = "Below",
	DropFruitKg = 1,

	DropGearEnabled = false,
	DropGearList = {} :: { [string]: boolean },
	DropGearRarity = {} :: { [string]: boolean },

	DropPetEnabled = false,
	DropPetList = {} :: { [string]: boolean },
}

for _, w in ipairs(WEATHERS) do
	State.WeatherSel[w.id] = true
end

-- Kirim embed ke Discord webhook (jalan di identity 8, non-blocking).
local httpRequest = request or http_request or (http and http.request)
local function sendWebhook(title: string, desc: string, color: number?)
	local url = State.WebhookUrl
	if not httpRequest or not url or url == "" then
		return false
	end
	local ok, body = pcall(function()
		return HttpService:JSONEncode({
			username = "NaruHub",
			embeds = {
				{
					title = title,
					description = desc,
					color = color or 4886754,
					footer = { text = "NaruHub • Grow a Garden" },
				},
			},
		})
	end)
	if not ok then
		return false
	end
	task.spawn(function()
		if setIdentity then
			pcall(setIdentity, 8)
		end
		pcall(function()
			httpRequest({
				Url = url,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = body,
			})
		end)
	end)
	return true
end

local function isTargeted(name: string): boolean
	if State.BuyAll then
		return true
	end
	return State.Selected[name] == true
end

local function buyLoopFor(name: string, aliveFn): number
	local price = priceByName[name]
	local bought = 0

	for _ = 1, 60 do
		if not State.Enabled or (aliveFn and not aliveFn()) then
			break
		end
		if getStock(name) <= 0 then
			break
		end

		local balBefore = getSheckles()
		if balBefore and price and balBefore < price then
			break
		end

		if not buySeed(name) then
			break
		end

		if balBefore then
			local success = false
			for _ = 1, 6 do
				task.wait(State.BuyDelay)
				local now = getSheckles()
				if now and now < balBefore then
					success = true
					break
				end
			end
			if success then
				bought += 1
				State.BoughtSession += 1
			else
				break
			end
		else
			task.wait(State.BuyDelay)
			bought += 1
			State.BoughtSession += 1
		end
	end

	return bought
end

--==============================================================
-- UI (Fluent)
--==============================================================

local Fluent = loadstring(game:HttpGet("https://github.com/dawid-scripts/Fluent/releases/latest/download/main.lua"))()
local SaveManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/dawid-scripts/Fluent/master/Addons/SaveManager.lua"))()
local InterfaceManager = loadstring(game:HttpGet("https://raw.githubusercontent.com/dawid-scripts/Fluent/master/Addons/InterfaceManager.lua"))()

local Window = Fluent:CreateWindow({
	Title = "NaruHub",
	SubTitle = "Grow a Garden",
	TabWidth = 150,
	Size = UDim2.fromOffset(560, 430),
	Acrylic = false,
	Theme = "Darker",
	MinimizeKey = Enum.KeyCode.RightControl,
})

local Tabs = {
	Shop = Window:AddTab({ Title = "Seed Shop", Icon = "sprout" }),
	Garden = Window:AddTab({ Title = "Garden", Icon = "shovel" }),
	Automatically = Window:AddTab({ Title = "Automatically", Icon = "zap" }),
	Misc = Window:AddTab({ Title = "Misc", Icon = "package" }),
	Weather = Window:AddTab({ Title = "Weather", Icon = "cloud-lightning" }),
	Settings = Window:AddTab({ Title = "Settings", Icon = "settings" }),
}

-- --- Seed Shop tab ------------------------------------------------
local buySection = Tabs.Shop:AddSection("Auto Buy")

local StatusParagraph = buySection:AddParagraph({
	Title = "Status",
	Content = "Idle",
})

local function setStatus(text: string)
	pcall(function()
		StatusParagraph:SetDesc(text)
	end)
	pcall(function()
		StatusParagraph:SetContent(text)
	end)
end

buySection:AddToggle("NaruHub_AutoBuy", {
	Title = "Auto Buy",
	Description = "Beli otomatis seed yang ada stok & terjangkau.",
	Default = false,
	Callback = function(state)
		State.Enabled = state
		setStatus(state and "Auto buy aktif..." or "Dimatikan")
	end,
})

buySection:AddToggle("NaruHub_BuyAll", {
	Title = "Beli Semua Stok",
	Description = "ON = semua seed. OFF = hanya pilihan di dropdown.",
	Default = true,
	Callback = function(state)
		State.BuyAll = state
	end,
})

local seedSection = Tabs.Shop:AddSection("Pilihan Seed (mode manual)")

local seedDropdown = seedSection:AddDropdown("NaruHub_Seeds", {
	Title = "Target Seeds",
	Description = "Dipakai saat 'Beli Semua Stok' OFF.",
	Values = getSeedNames(),
	Multi = true,
	Default = {},
})

seedDropdown:OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.Selected = sel
end)

seedSection:AddSlider("NaruHub_BuyDelay", {
	Title = "Buy Delay (detik)",
	Description = "Jeda antar pembelian.",
	Default = 0.2,
	Min = 0.1,
	Max = 1,
	Rounding = 2,
	Callback = function(v)
		State.BuyDelay = v
	end,
})

seedSection:AddButton({
	Title = "Refresh Daftar Seed",
	Description = "Muat ulang daftar seed dari game.",
	Callback = function()
		pcall(function()
			seedDropdown:SetValues(getSeedNames())
		end)
		Fluent:Notify({ Title = "NaruHub", Content = "Daftar seed diperbarui.", Duration = 3 })
	end,
})

-- --- Settings tab -------------------------------------------------
-- --- Misc tab: Auto Pumpkin -------------------------------------
local pumpkinSection = Tabs.Misc:AddSection("Auto Pumpkin (Atlantic Giant Pumpkin)")

local PumpkinStatus = pumpkinSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setPumpkinStatus(text: string)
	pcall(function() PumpkinStatus:SetDesc(text) end)
	pcall(function() PumpkinStatus:SetContent(text) end)
end

do
	local types = getOwnedSprinklerTypes()
	if #types == 0 then
		types = { "Syrup Sprinkler", "Super Syrup Sprinkler" }
	end
	State.PumpkinSprinkler = types[1] or "Syrup Sprinkler"
	pumpkinSection:AddDropdown("NaruHub_PumpkinSprinkler", {
		Title = "Sprinkler yang dipakai",
		Description = "Pilih sprinkler yang ditaruh sebelum shovel.",
		Values = types,
		Multi = false,
		Default = types[1],
	}):OnChanged(function(v)
		State.PumpkinSprinkler = v
	end)
end

pumpkinSection:AddInput("NaruHub_PumpkinKg", {
	Title = "Shovel buah di bawah (kg)",
	Default = "50",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.PumpkinKg = tonumber(v) or State.PumpkinKg
	end,
})

pumpkinSection:AddSlider("NaruHub_PumpkinDelay", {
	Title = "Kecepatan / delay (detik)",
	Description = "Makin kecil makin cepat (place & shovel). Tetap satu per satu.",
	Default = 0.15,
	Min = 0.05,
	Max = 1,
	Rounding = 2,
	Callback = function(v)
		State.PumpkinDelay = v
	end,
})

pumpkinSection:AddToggle("NaruHub_Pumpkin", {
	Title = "Auto Pumpkin",
	Description = "Place sprinkler di pumpkin -> shovel buah < kg -> ulang. Sprinkler habis = stop.",
	Default = false,
	Callback = function(s)
		State.PumpkinEnabled = s
		setPumpkinStatus(s and "Aktif..." or "Dimatikan")
	end,
})

pumpkinSection:AddToggle("NaruHub_PumpkinNoTP", {
	Title = "Disable Teleport",
	Description = "ON = tanpa teleport (shovel hanya buah dekat karakter).",
	Default = false,
	Callback = function(s)
		State.PumpkinNoTP = s
	end,
})

-- --- Weather tab -------------------------------------------------
local weatherSection = Tabs.Weather:AddSection("Weather Alert")

local WeatherStatus = weatherSection:AddParagraph({
	Title = "Cuaca terakhir",
	Content = "-",
})
local function setWeatherStatus(text: string)
	pcall(function() WeatherStatus:SetDesc(text) end)
	pcall(function() WeatherStatus:SetContent(text) end)
end

weatherSection:AddToggle("NaruHub_WeatherNotify", {
	Title = "Weather Notify",
	Description = "Munculkan notif saat cuaca muncul.",
	Default = true,
	Callback = function(s)
		State.WeatherNotify = s
	end,
})

weatherSection:AddToggle("NaruHub_WeatherNotifyEnd", {
	Title = "Notif saat cuaca selesai",
	Description = "Juga notif ketika cuaca berakhir.",
	Default = false,
	Callback = function(s)
		State.WeatherNotifyEnd = s
	end,
})

do
	local values = {}
	for _, w in ipairs(WEATHERS) do
		values[#values + 1] = w.id
	end
	local drop = weatherSection:AddDropdown("NaruHub_WeatherSel", {
		Title = "Cuaca yang dinotif",
		Description = "Pilih cuaca mana yang memicu notif.",
		Values = values,
		Multi = true,
		Default = {},
	})
	drop:OnChanged(function(value)
		local sel = {}
		for name, on in pairs(value) do
			if on then
				sel[name] = true
			end
		end
		State.WeatherSel = sel
	end)
	-- pastikan UI tersinkron: semua terpilih di awal
	local allSet = {}
	for _, w in ipairs(WEATHERS) do
		allSet[w.id] = true
	end
	pcall(function()
		drop:SetValue(allSet)
	end)
end

local webhookSection = Tabs.Weather:AddSection("Discord Webhook (notif ke HP)")

webhookSection:AddInput("NaruHub_Webhook", {
	Title = "Webhook URL",
	Description = "Tempel Discord webhook URL. Rahasia, jangan dibagikan.",
	Default = "",
	Placeholder = "https://discord.com/api/webhooks/...",
	Finished = true,
	Callback = function(v)
		State.WebhookUrl = v or ""
	end,
})

webhookSection:AddButton({
	Title = "Test Webhook",
	Description = "Kirim pesan uji ke webhook.",
	Callback = function()
		if State.WebhookUrl == "" then
			Fluent:Notify({ Title = "NaruHub", Content = "Isi Webhook URL dulu.", Duration = 5 })
			return
		end
		local ok = sendWebhook("✅ NaruHub Terhubung", "Webhook berhasil. Notif cuaca akan dikirim ke sini.", 4437377)
		Fluent:Notify({
			Title = "NaruHub",
			Content = ok and "Pesan uji dikirim." or "Gagal (cek URL / executor http).",
			Duration = 5,
		})
	end,
})

-- --- Automatically tab (Auto Shovel Fruit by kg) -----------------------
local shovelSection = Tabs.Automatically:AddSection("Auto Shovel Fruit (by kg)")

local ShovelStatus = shovelSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setShovelStatus(text: string)
	pcall(function() ShovelStatus:SetDesc(text) end)
	pcall(function() ShovelStatus:SetContent(text) end)
end

shovelSection:AddToggle("NaruHub_ShovelDryRun", {
	Title = "Dry Run (aman: hitung saja, tidak menghapus)",
	Description = "Matikan kalau sudah yakin mau benar-benar shovel.",
	Default = true,
	Callback = function(s)
		State.ShovelDryRun = s
	end,
})

shovelSection:AddToggle("NaruHub_ShovelEnabled", {
	Title = "Auto Shovel Fruit",
	Description = "Shovel buah yang kg-nya di luar target.",
	Default = false,
	Callback = function(s)
		State.ShovelEnabled = s
		setShovelStatus(s and (State.ShovelDryRun and "DRY RUN aktif..." or "AKTIF - menghapus buah!") or "Dimatikan")
	end,
})

shovelSection:AddDropdown("NaruHub_ShovelMode", {
	Title = "Mode",
	Description = "Below = shovel yang < kg. Above = shovel yang > kg.",
	Values = { "Below", "Above" },
	Multi = false,
	Default = "Below",
}):OnChanged(function(v)
	State.ShovelMode = v
end)

shovelSection:AddInput("NaruHub_ShovelKg", {
	Title = "Target kg",
	Default = "5",
	Placeholder = "mis. 100",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.ShovelKg = tonumber(v) or State.ShovelKg
	end,
})

local shovelFilterSection = Tabs.Automatically:AddSection("Filter & Batas")

shovelFilterSection:AddDropdown("NaruHub_ShovelSeeds", {
	Title = "Seed filter (kosong = semua)",
	Description = "Pilih seed, mis. Atlantic Giant Pumpkin.",
	Values = ALL_SEEDS,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.ShovelSeeds = sel
end)

shovelFilterSection:AddSlider("NaruHub_ShovelLimit", {
	Title = "Limit per pass",
	Default = 30,
	Min = 1,
	Max = 200,
	Rounding = 0,
	Callback = function(v)
		State.ShovelLimit = v
	end,
})

shovelFilterSection:AddSlider("NaruHub_ShovelDelay", {
	Title = "Shovel Delay (detik)",
	Default = 0.2,
	Min = 0.05,
	Max = 1,
	Rounding = 2,
	Callback = function(v)
		State.ShovelDelay = v
	end,
})

shovelFilterSection:AddToggle("NaruHub_ShovelNoTP", {
	Title = "Disable Teleport (Shovel)",
	Description = "ON = shovel tanpa teleport (hanya buah dekat karakter yang kena).",
	Default = false,
	Callback = function(s)
		State.ShovelNoTP = s
	end,
})

-- --- Automatically tab: Automatically Drop Item -------------------------
-- Catatan: drop = equip item lalu Networking.DroppedItem.RequestDrop:Fire(category, id),
-- sama seperti tombol drop asli game. Tidak perlu teleport (item dari inventory).

local dropDelaySection = Tabs.Automatically:AddSection("Automatically Drop Item")
dropDelaySection:AddSlider("NaruHub_DropDelay", {
	Title = "Drop Delay (detik, semua kategori)",
	Default = 0.25,
	Min = 0.1,
	Max = 2,
	Rounding = 2,
	Callback = function(v)
		State.DropDelay = v
	end,
})

-- Drop Seed ---------------------------------------------------------------
local dropSeedSection = Tabs.Automatically:AddSection("Drop Seed")
local DropSeedStatus = dropSeedSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setDropSeedStatus(text: string)
	pcall(function() DropSeedStatus:SetDesc(text) end)
	pcall(function() DropSeedStatus:SetContent(text) end)
end

dropSeedSection:AddDropdown("NaruHub_DropSeedList", {
	Title = "Select seed",
	Description = "Wajib pilih minimal satu (kosong = tidak drop apa-apa, biar aman).",
	Values = ALL_SEEDS,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropSeedList = sel
end)

dropSeedSection:AddToggle("NaruHub_DropSeedEnabled", {
	Title = "Toggle Drop Seed",
	Description = "Drop seluruh stack seed yang dipilih di atas.",
	Default = false,
	Callback = function(s)
		State.DropSeedEnabled = s
		setDropSeedStatus(s and "Aktif..." or "Dimatikan")
	end,
})

-- Drop Fruits ---------------------------------------------------------------
local dropFruitSection = Tabs.Automatically:AddSection("Drop Fruits")
local DropFruitStatus = dropFruitSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setDropFruitStatus(text: string)
	pcall(function() DropFruitStatus:SetDesc(text) end)
	pcall(function() DropFruitStatus:SetContent(text) end)
end

dropFruitSection:AddDropdown("NaruHub_DropFruitList", {
	Title = "Select drop fruit",
	Description = "Kosong = semua jenis fruit (asal cocok filter lain di bawah).",
	Values = ALL_SEEDS, -- SeedName == FruitName di game ini
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropFruitList = sel
end)

dropFruitSection:AddDropdown("NaruHub_DropFruitRarity", {
	Title = "Select rarity (OR)",
	Description = "Kosong = semua rarity. Buah lolos kalau cocok Fruit ATAU Rarity ATAU Mutation yang dipilih.",
	Values = RARITY_LIST,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropFruitRarity = sel
end)

dropFruitSection:AddDropdown("NaruHub_DropFruitMutation", {
	Title = "Drop mutation",
	Description = "Kosong = abaikan filter mutasi. Daftar diambil dari buah yang ada di backpack saat script dimuat.",
	Values = ALL_MUTATIONS,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropFruitMutation = sel
end)

dropFruitSection:AddDropdown("NaruHub_DropFruitMode", {
	Title = "Threshold mode",
	Description = "Below = drop yang beratnya < kg. Above = drop yang beratnya > kg.",
	Values = { "Below", "Above" },
	Multi = false,
	Default = "Below",
}):OnChanged(function(v)
	State.DropFruitMode = v
end)

dropFruitSection:AddInput("NaruHub_DropFruitKg", {
	Title = "Threshold (kg)",
	Default = "1",
	Placeholder = "mis. 5",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.DropFruitKg = tonumber(v) or State.DropFruitKg
	end,
})

dropFruitSection:AddToggle("NaruHub_DropFruitEnabled", {
	Title = "Toggle Auto Drop Fruit",
	Description = "Fruit ATAU Rarity ATAU Mutation cocok (kalau dipilih) DAN lolos threshold kg -> di-drop.",
	Default = false,
	Callback = function(s)
		State.DropFruitEnabled = s
		setDropFruitStatus(s and "Aktif..." or "Dimatikan")
	end,
})

-- Drop Gear ---------------------------------------------------------------
local dropGearSection = Tabs.Automatically:AddSection("Drop Gear")
local DropGearStatus = dropGearSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setDropGearStatus(text: string)
	pcall(function() DropGearStatus:SetDesc(text) end)
	pcall(function() DropGearStatus:SetContent(text) end)
end

dropGearSection:AddDropdown("NaruHub_DropGearList", {
	Title = "Select gear",
	Description = "Kosong = semua gear (asal cocok rarity kalau dipilih).",
	Values = ALL_GEAR,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropGearList = sel
end)

dropGearSection:AddDropdown("NaruHub_DropGearRarity", {
	Title = "Rarity",
	Description = "Kosong = semua rarity.",
	Values = RARITY_LIST,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropGearRarity = sel
end)

dropGearSection:AddToggle("NaruHub_DropGearEnabled", {
	Title = "Toggle Auto Drop Gear",
	Description = "Wajib pilih minimal Gear atau Rarity (kalau dua-duanya kosong, tidak drop apa-apa, biar aman).",
	Default = false,
	Callback = function(s)
		State.DropGearEnabled = s
		setDropGearStatus(s and "Aktif..." or "Dimatikan")
	end,
})

-- Drop Pets ---------------------------------------------------------------
local dropPetSection = Tabs.Automatically:AddSection("Drop Pets")
local DropPetStatus = dropPetSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setDropPetStatus(text: string)
	pcall(function() DropPetStatus:SetDesc(text) end)
	pcall(function() DropPetStatus:SetContent(text) end)
end

dropPetSection:AddDropdown("NaruHub_DropPetList", {
	Title = "Select pets",
	Description = "Wajib pilih minimal satu spesies (kosong = tidak drop apa-apa, biar aman).",
	Values = ALL_PETS,
	Multi = true,
	Default = {},
}):OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.DropPetList = sel
end)

dropPetSection:AddToggle("NaruHub_DropPetEnabled", {
	Title = "Toggle Auto Drop Pets",
	Default = false,
	Callback = function(s)
		State.DropPetEnabled = s
		setDropPetStatus(s and "Aktif..." or "Dimatikan")
	end,
})

local monSection = Tabs.Garden:AddSection("Monitor / ESP / Sprinkler")

monSection:AddToggle("NaruHub_MonitorShow", {
	Title = "Tampilkan Monitor HUD",
	Default = true,
	Callback = function(s)
		State.MonitorShow = s
		local h = (gethui and gethui()) or game:GetService("CoreGui")
		local m = h:FindFirstChild("NaruHubMonitor")
		if m then
			m.Enabled = s
		end
	end,
})

monSection:AddDropdown("NaruHub_MonSort", {
	Title = "Urutkan daftar buah (kg)",
	Values = { "High", "Low" },
	Multi = false,
	Default = "High",
}):OnChanged(function(v)
	State.MonSort = v
end)

monSection:AddToggle("NaruHub_Esp", {
	Title = "Fruit ESP (kg di atas buah)",
	Description = "Ikut seed filter. Hijau = keeper, merah = target shovel.",
	Default = false,
	Callback = function(s)
		State.EspEnabled = s
	end,
})

monSection:AddToggle("NaruHub_Sprinkler", {
	Title = "Auto Place Sprinkler (satu-satu)",
	Description = "Taruh sprinkler dari inventory ke plot, 1 per interval.",
	Default = false,
	Callback = function(s)
		State.SprinklerEnabled = s
	end,
})

monSection:AddSlider("NaruHub_SprinklerDelay", {
	Title = "Sprinkler Delay (detik)",
	Default = 1.5,
	Min = 0.3,
	Max = 5,
	Rounding = 1,
	Callback = function(v)
		State.SprinklerDelay = v
	end,
})

monSection:AddToggle("NaruHub_SprinklerNoTP", {
	Title = "Disable Teleport (Sprinkler)",
	Description = "ON = taruh sprinkler tanpa memindah karakter.",
	Default = false,
	Callback = function(s)
		State.SprinklerNoTP = s
	end,
})

-- --- Settings tab ------------------------------------------------
SaveManager:SetLibrary(Fluent)
InterfaceManager:SetLibrary(Fluent)
SaveManager:IgnoreThemeSettings()
SaveManager:SetIgnoreIndexes({})
InterfaceManager:SetFolder("NaruHub")
SaveManager:SetFolder("NaruHub/GrowAGarden")
InterfaceManager:BuildInterfaceSection(Tabs.Settings)
SaveManager:BuildConfigSection(Tabs.Settings)

Window:SelectTab(1)

getgenv().NaruHub = {
	Fluent = Fluent,
	Options = Fluent.Options,
	Window = Window,
	State = State,
}

--==============================================================
-- Skin: border #412D15 + background dark transparent
--==============================================================

local conns = {}

local function paintStroke(inst)
	if inst:IsA("UIStroke") then
		inst.Color = BRAND
	end
end

local function paintAll()
	for _, d in ipairs(Fluent.GUI:GetDescendants()) do
		paintStroke(d)
	end
end

-- Transparency dulu (memicu re-theme Fluent), BARU cat border,
-- kalau tidak border brown-nya ketimpa balik.
pcall(function()
	Fluent:ToggleTransparency(true)
end)

pcall(function()
	paintAll()
	table.insert(conns, Fluent.GUI.DescendantAdded:Connect(paintStroke))
end)

-- Reapply beberapa frame untuk menangkap re-theme yang tertunda.
task.spawn(function()
	for _ = 1, 3 do
		task.wait(0.2)
		pcall(paintAll)
	end
end)

--==============================================================
-- Logo di title bar + logo mengambang saat minimize
--==============================================================

local TILT = -10 -- kemiringan sticker (derajat)

-- (1) Logo nempel di title bar (placeholder), miring ~10 derajat
pcall(function()
	local tb = Window.TitleBar.Frame
	local titleHolder = tb:FindFirstChildWhichIsA("Frame") -- holder teks judul
	if titleHolder then
		local p, s = titleHolder.Position, titleHolder.Size
		titleHolder.Position = UDim2.new(0, 46, p.Y.Scale, p.Y.Offset)
		titleHolder.Size = UDim2.new(1, -46, s.Y.Scale, s.Y.Offset)
	end
	local titleLogo = Instance.new("ImageLabel")
	titleLogo.Name = "NaruHubTitleLogo"
	titleLogo.BackgroundTransparency = 1
	titleLogo.Size = UDim2.fromOffset(28, 28)
	titleLogo.Position = UDim2.new(0, 12, 0.5, 0)
	titleLogo.AnchorPoint = Vector2.new(0, 0.5)
	titleLogo.Rotation = TILT
	titleLogo.Image = LOGO_ASSET or ""
	titleLogo.ScaleType = Enum.ScaleType.Fit
	titleLogo.ZIndex = 50
	titleLogo.Parent = tb
end)

-- (2) Logo mengambang: hanya tampil saat minimize, di pojok, miring ~10 derajat
local hui = (gethui and gethui()) or game:GetService("CoreGui")
pcall(function()
	for _, o in ipairs(hui:GetChildren()) do
		if o.Name == "NaruHubLauncher" then
			o:Destroy()
		end
	end
end)

local launcher = Instance.new("ScreenGui")
launcher.Name = "NaruHubLauncher"
launcher.ResetOnSpawn = false
launcher.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
launcher.DisplayOrder = 9999
launcher.Enabled = false -- tampil hanya saat minimize
launcher.Parent = hui

local logoBtn = Instance.new("ImageButton")
logoBtn.Name = "Logo"
logoBtn.Size = UDim2.fromOffset(60, 60)
logoBtn.Position = UDim2.new(0, 28, 0, 28) -- pojok kiri atas
logoBtn.BackgroundColor3 = Color3.fromRGB(18, 18, 20)
logoBtn.BackgroundTransparency = 0.12
logoBtn.AutoButtonColor = false
logoBtn.Rotation = TILT
logoBtn.Image = ""
logoBtn.Parent = launcher

local logoCorner = Instance.new("UICorner")
logoCorner.CornerRadius = UDim.new(1, 0)
logoCorner.Parent = logoBtn

local logoStroke = Instance.new("UIStroke")
logoStroke.Color = BRAND
logoStroke.Thickness = 2
logoStroke.Parent = logoBtn

local logoImg = Instance.new("ImageLabel")
logoImg.Name = "Img"
logoImg.BackgroundTransparency = 1
logoImg.Size = UDim2.fromScale(0.72, 0.72)
logoImg.Position = UDim2.fromScale(0.5, 0.5)
logoImg.AnchorPoint = Vector2.new(0.5, 0.5)
logoImg.Image = LOGO_ASSET or ""
logoImg.ScaleType = Enum.ScaleType.Fit
logoImg.Parent = logoBtn

if not LOGO_ASSET then
	logoImg:Destroy()
	local lbl = Instance.new("TextLabel")
	lbl.BackgroundTransparency = 1
	lbl.Size = UDim2.fromScale(1, 1)
	lbl.Font = Enum.Font.GothamBold
	lbl.TextSize = 24
	lbl.TextColor3 = Color3.fromRGB(255, 255, 255)
	lbl.Text = "N"
	lbl.Parent = logoBtn
end

-- (3) Minimize: klik "-" -> sembunyi window + logo muncul; klik logo -> restore
local function setMinimized(state: boolean)
	pcall(function()
		Fluent.GUI.Enabled = not state
	end)
	launcher.Enabled = state
end

pcall(function()
	Window.TitleBar.MinButton:SetCallback(function()
		setMinimized(true)
	end)
end)
pcall(function()
	Window.Minimize = function()
		setMinimized(true)
	end
end)

-- drag + click (klik logo = restore)
local dragging, dragStart, startPos, movedFar = false, nil, nil, false
logoBtn.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch then
		dragging = true
		movedFar = false
		dragStart = input.Position
		startPos = logoBtn.Position
	end
end)

table.insert(conns, UserInputService.InputChanged:Connect(function(input)
	if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement
		or input.UserInputType == Enum.UserInputType.Touch) then
		local delta = input.Position - dragStart
		if delta.Magnitude > 4 then
			movedFar = true
		end
		logoBtn.Position = UDim2.new(
			startPos.X.Scale, startPos.X.Offset + delta.X,
			startPos.Y.Scale, startPos.Y.Offset + delta.Y
		)
	end
end))

table.insert(conns, UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch then
		if dragging and not movedFar then
			setMinimized(false)
		end
		dragging = false
	end
end))

--==============================================================
-- Toast notif custom (independen dari Fluent; tetap tampil saat minimize)
--==============================================================
pcall(function()
	for _, o in ipairs(hui:GetChildren()) do
		if o.Name == "NaruHubToast" then
			o:Destroy()
		end
	end
end)

local toastGui = Instance.new("ScreenGui")
toastGui.Name = "NaruHubToast"
toastGui.ResetOnSpawn = false
toastGui.IgnoreGuiInset = true
toastGui.DisplayOrder = 100000
toastGui.Parent = hui

local function showToast(emoji: string, title: string, sub: string?, accent: Color3?)
	-- Handler event game jalan di identity 2 yang tak boleh sentuh CoreGui/gethui.
	-- Naikkan ke 8 supaya bisa bikin GUI.
	if setIdentity then
		pcall(setIdentity, 8)
	end
	local col = accent or BRAND
	local slot = #toastGui:GetChildren()

	local frame = Instance.new("Frame")
	frame.AnchorPoint = Vector2.new(0.5, 0)
	frame.Size = UDim2.fromOffset(340, 58)
	frame.Position = UDim2.new(0.5, 0, 0, -80)
	frame.BackgroundColor3 = Color3.fromRGB(18, 18, 22)
	frame.BackgroundTransparency = 0.06
	frame.BorderSizePixel = 0
	frame.Parent = toastGui

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = frame

	local stroke = Instance.new("UIStroke")
	stroke.Color = col
	stroke.Thickness = 2
	stroke.Parent = frame

	local bar = Instance.new("Frame")
	bar.Size = UDim2.new(0, 5, 1, -16)
	bar.Position = UDim2.new(0, 8, 0, 8)
	bar.BackgroundColor3 = col
	bar.BorderSizePixel = 0
	bar.Parent = frame
	Instance.new("UICorner", bar).CornerRadius = UDim.new(1, 0)

	if LOGO_ASSET then
		local logo = Instance.new("ImageLabel")
		logo.BackgroundTransparency = 1
		logo.Size = UDim2.fromOffset(34, 34)
		logo.Position = UDim2.new(0, 22, 0.5, 0)
		logo.AnchorPoint = Vector2.new(0, 0.5)
		logo.Image = LOGO_ASSET
		logo.ScaleType = Enum.ScaleType.Fit
		logo.Parent = frame
	end

	local titleLbl = Instance.new("TextLabel")
	titleLbl.BackgroundTransparency = 1
	titleLbl.Position = UDim2.new(0, 64, 0, 9)
	titleLbl.Size = UDim2.new(1, -76, 0, 22)
	titleLbl.Font = Enum.Font.GothamBold
	titleLbl.TextSize = 15
	titleLbl.TextXAlignment = Enum.TextXAlignment.Left
	titleLbl.TextColor3 = Color3.fromRGB(240, 240, 245)
	titleLbl.Text = (emoji ~= "" and (emoji .. "  ") or "") .. title
	titleLbl.Parent = frame

	local subLbl = Instance.new("TextLabel")
	subLbl.BackgroundTransparency = 1
	subLbl.Position = UDim2.new(0, 64, 0, 30)
	subLbl.Size = UDim2.new(1, -76, 0, 18)
	subLbl.Font = Enum.Font.Gotham
	subLbl.TextSize = 12
	subLbl.TextXAlignment = Enum.TextXAlignment.Left
	subLbl.TextColor3 = Color3.fromRGB(185, 185, 195)
	subLbl.Text = sub or ""
	subLbl.Parent = frame

	local targetY = 18 + slot * 66
	TweenService:Create(frame, TweenInfo.new(0.4, Enum.EasingStyle.Quart, Enum.EasingDirection.Out), {
		Position = UDim2.new(0.5, 0, 0, targetY),
	}):Play()

	task.delay(6, function()
		local t = TweenService:Create(frame, TweenInfo.new(0.35, Enum.EasingStyle.Quart, Enum.EasingDirection.In), {
			Position = UDim2.new(0.5, 0, 0, -80),
			BackgroundTransparency = 1,
		})
		t:Play()
		t.Completed:Wait()
		frame:Destroy()
	end)
end

--==============================================================
-- Monitor HUD (shovel / sprinkler / match / last good kg)
--==============================================================
pcall(function()
	for _, o in ipairs(hui:GetChildren()) do
		if o.Name == "NaruHubMonitor" or o.Name == "NaruHubEsp" then
			o:Destroy()
		end
	end
end)

local monitorGui = Instance.new("ScreenGui")
monitorGui.Name = "NaruHubMonitor"
monitorGui.ResetOnSpawn = false
monitorGui.DisplayOrder = 99999
monitorGui.Parent = hui

local monPanel = Instance.new("Frame")
monPanel.Size = UDim2.fromOffset(342, 366)
monPanel.Position = UDim2.new(1, -364, 0, 60)
monPanel.BackgroundColor3 = Color3.fromRGB(16, 16, 20)
monPanel.BackgroundTransparency = 0.1
monPanel.BorderSizePixel = 0
monPanel.Parent = monitorGui
Instance.new("UICorner", monPanel).CornerRadius = UDim.new(0, 12)
local monStroke = Instance.new("UIStroke")
monStroke.Color = BRAND
monStroke.Thickness = 2
monStroke.Parent = monPanel

local monHeader = Instance.new("Frame")
monHeader.Size = UDim2.new(1, 0, 0, 30)
monHeader.BackgroundTransparency = 1
monHeader.Parent = monPanel
if LOGO_ASSET then
	local l = Instance.new("ImageLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.fromOffset(20, 20)
	l.Position = UDim2.new(0, 10, 0.5, 0)
	l.AnchorPoint = Vector2.new(0, 0.5)
	l.Rotation = -10
	l.Image = LOGO_ASSET
	l.ScaleType = Enum.ScaleType.Fit
	l.Parent = monHeader
end
local monTitle = Instance.new("TextLabel")
monTitle.BackgroundTransparency = 1
monTitle.Position = UDim2.new(0, 38, 0, 0)
monTitle.Size = UDim2.new(1, -44, 1, 0)
monTitle.Font = Enum.Font.GothamBold
monTitle.TextSize = 13
monTitle.TextXAlignment = Enum.TextXAlignment.Left
monTitle.TextColor3 = Color3.fromRGB(240, 240, 245)
monTitle.Text = "NaruHub Monitor"
monTitle.Parent = monHeader

local function mkRow(y, txt)
	local r = Instance.new("TextLabel")
	r.BackgroundTransparency = 1
	r.Position = UDim2.new(0, 14, 0, y)
	r.Size = UDim2.new(1, -28, 0, 22)
	r.Font = Enum.Font.Gotham
	r.TextSize = 13
	r.TextXAlignment = Enum.TextXAlignment.Left
	r.TextColor3 = Color3.fromRGB(210, 210, 220)
	r.Text = txt
	r.Parent = monPanel
	return r
end
local rowShovel = mkRow(34, "Shovel: 0")
local rowSpr = mkRow(56, "Sprinkler: 0")
local rowMatch = mkRow(78, "Match: 0/0")
local rowLast = mkRow(100, "Last good: - kg")
local rowReady = mkRow(122, "Siap panen: 0")

-- divider + judul daftar buah
local monDiv = Instance.new("Frame")
monDiv.Size = UDim2.new(1, -24, 0, 1)
monDiv.Position = UDim2.new(0, 12, 0, 150)
monDiv.BackgroundColor3 = BRAND
monDiv.BackgroundTransparency = 0.3
monDiv.BorderSizePixel = 0
monDiv.Parent = monPanel

local monListTitle = Instance.new("TextLabel")
monListTitle.BackgroundTransparency = 1
monListTitle.Position = UDim2.new(0, 14, 0, 156)
monListTitle.Size = UDim2.new(1, -28, 0, 18)
monListTitle.Font = Enum.Font.GothamBold
monListTitle.TextSize = 12
monListTitle.TextXAlignment = Enum.TextXAlignment.Left
monListTitle.TextColor3 = Color3.fromRGB(180, 200, 255)
monListTitle.Text = "Buah di garden"
monListTitle.Parent = monPanel

local monList = Instance.new("ScrollingFrame")
monList.Position = UDim2.new(0, 12, 0, 178)
monList.Size = UDim2.new(1, -20, 1, -186)
monList.BackgroundTransparency = 1
monList.BorderSizePixel = 0
monList.ScrollBarThickness = 4
monList.CanvasSize = UDim2.new()
monList.AutomaticCanvasSize = Enum.AutomaticSize.Y
monList.Parent = monPanel
local monLayout = Instance.new("UIListLayout")
monLayout.Padding = UDim.new(0, 4)
monLayout.SortOrder = Enum.SortOrder.LayoutOrder
monLayout.Parent = monList

local monCards = {}
-- update 4 angka stat saja (dipanggil live tiap shovel/place)
local function updateMonitorStats()
	monitorGui.Enabled = State.MonitorShow
	rowShovel.Text = ("Shovel: %d"):format(Monitor.Shovel)
	-- sprinkler: aktif + countdown terdekat (hidup 120s)
	local nowc = os.clock()
	local active, soonest = 0, nil
	for i = #sprinklerTimes, 1, -1 do
		local rem = SPRINKLER_LIFETIME - (nowc - sprinklerTimes[i])
		if rem <= 0 then
			table.remove(sprinklerTimes, i)
		else
			active += 1
			if not soonest or rem < soonest then
				soonest = rem
			end
		end
	end
	rowSpr.Text = ("Sprinkler: %d (aktif %d%s)"):format(
		Monitor.Sprinkler, active, soonest and (", %ds"):format(math.floor(soonest)) or "")
	rowMatch.Text = ("Match: %d/%d"):format(Monitor.MatchX, Monitor.MatchY)
	rowLast.Text = ("Last good: %s kg"):format(Monitor.LastGoodKg > 0 and string.format("%.2f", Monitor.LastGoodKg) or "-")
	rowReady.Text = ("Siap panen: %d"):format(Monitor.Ready)
end

local function updateMonitor()
	updateMonitorStats()

	-- daftar per-buah: kartu 2 baris (reuse supaya tidak churn)
	local fl = Monitor.FruitList
	for i, entry in ipairs(fl) do
		local card = monCards[i]
		if not card then
			local f = Instance.new("Frame")
			f.Size = UDim2.new(1, -6, 0, 38)
			f.BackgroundColor3 = Color3.fromRGB(26, 26, 32)
			f.BackgroundTransparency = 0.35
			f.BorderSizePixel = 0
			f.LayoutOrder = i
			f.Parent = monList
			Instance.new("UICorner", f).CornerRadius = UDim.new(0, 6)
			local accent = Instance.new("Frame")
			accent.Name = "Accent"
			accent.Size = UDim2.new(0, 3, 1, -10)
			accent.Position = UDim2.new(0, 5, 0, 5)
			accent.BorderSizePixel = 0
			accent.Parent = f
			Instance.new("UICorner", accent).CornerRadius = UDim.new(1, 0)
			local top = Instance.new("TextLabel")
			top.BackgroundTransparency = 1
			top.Position = UDim2.new(0, 14, 0, 4)
			top.Size = UDim2.new(1, -18, 0, 16)
			top.Font = Enum.Font.GothamBold
			top.TextSize = 12
			top.TextXAlignment = Enum.TextXAlignment.Left
			top.TextTruncate = Enum.TextTruncate.AtEnd
			top.Parent = f
			local bot = Instance.new("TextLabel")
			bot.BackgroundTransparency = 1
			bot.Position = UDim2.new(0, 14, 0, 20)
			bot.Size = UDim2.new(1, -18, 0, 14)
			bot.Font = Enum.Font.Gotham
			bot.TextSize = 11
			bot.TextXAlignment = Enum.TextXAlignment.Left
			bot.Parent = f
			card = { frame = f, accent = accent, top = top, bot = bot }
			monCards[i] = card
		end
		card.frame.Visible = true
		card.top.TextColor3 = entry.target and Color3.fromRGB(140, 255, 160) or Color3.fromRGB(235, 235, 240)
		local mutTxt = (entry.mut and entry.mut ~= "") and ("  (" .. entry.mut .. ")") or ""
		card.top.Text = ("%d.  %s  %.1fkg%s"):format(i, entry.seed, entry.kg, mutTxt)
		if entry.rem == nil then
			card.bot.Text = "Still growth  |  -  |  -"
			card.bot.TextColor3 = Color3.fromRGB(150, 155, 165)
			card.accent.BackgroundColor3 = Color3.fromRGB(90, 90, 100)
		elseif entry.rem <= 0 then
			card.bot.Text = "Still growth  |  --  |  ✓ Ready"
			card.bot.TextColor3 = Color3.fromRGB(140, 255, 160)
			card.accent.BackgroundColor3 = Color3.fromRGB(120, 220, 140)
		else
			card.bot.Text = ("Still growth  |  %s  |  Growing"):format(fmtTime(entry.rem))
			card.bot.TextColor3 = Color3.fromRGB(255, 105, 105)
			card.accent.BackgroundColor3 = Color3.fromRGB(235, 85, 85)
		end
	end
	for i = #fl + 1, #monCards do
		monCards[i].frame.Visible = false
	end
	monListTitle.Text = ("Buah di garden (%d)"):format(#fl)
end
updateMonitor()

-- Tombol filter urut kg (High/Low) langsung di panel
local sortBtn = Instance.new("TextButton")
sortBtn.Size = UDim2.fromOffset(78, 20)
sortBtn.Position = UDim2.new(1, -88, 0, 6)
sortBtn.BackgroundColor3 = Color3.fromRGB(38, 38, 46)
sortBtn.BackgroundTransparency = 0.1
sortBtn.BorderSizePixel = 0
sortBtn.AutoButtonColor = true
sortBtn.Font = Enum.Font.GothamBold
sortBtn.TextSize = 11
sortBtn.TextColor3 = Color3.fromRGB(225, 225, 235)
sortBtn.Text = "kg: High \226\150\188"
sortBtn.ZIndex = 5
sortBtn.Parent = monPanel
Instance.new("UICorner", sortBtn).CornerRadius = UDim.new(0, 5)
local sortStroke = Instance.new("UIStroke")
sortStroke.Color = BRAND
sortStroke.Thickness = 1
sortStroke.Parent = sortBtn
sortBtn.MouseButton1Click:Connect(function()
	State.MonSort = (State.MonSort == "High") and "Low" or "High"
	sortBtn.Text = State.MonSort == "High" and "kg: High \226\150\188" or "kg: Low \226\150\178"
	table.sort(Monitor.FruitList, function(a, b)
		if State.MonSort == "Low" then
			return a.kg < b.kg
		end
		return a.kg > b.kg
	end)
	pcall(updateMonitor)
	-- sinkron dropdown Fluent kalau ada
	pcall(function()
		Fluent.Options.NaruHub_MonSort:SetValue(State.MonSort)
	end)
end)

do
	local dragging, ds, sp2 = false, nil, nil
	monHeader.InputBegan:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then
			dragging, ds, sp2 = true, i.Position, monPanel.Position
		end
	end)
	table.insert(conns, UserInputService.InputChanged:Connect(function(i)
		if dragging and (i.UserInputType == Enum.UserInputType.MouseMovement or i.UserInputType == Enum.UserInputType.Touch) then
			local d = i.Position - ds
			monPanel.Position = UDim2.new(sp2.X.Scale, sp2.X.Offset + d.X, sp2.Y.Scale, sp2.Y.Offset + d.Y)
		end
	end))
	table.insert(conns, UserInputService.InputEnded:Connect(function(i)
		if i.UserInputType == Enum.UserInputType.MouseButton1 or i.UserInputType == Enum.UserInputType.Touch then
			dragging = false
		end
	end))
end

-- ESP: billboard kg di atas fruit (target seed). Dibangun ulang tiap refresh.
local espGui = Instance.new("ScreenGui")
espGui.Name = "NaruHubEsp"
espGui.ResetOnSpawn = false
espGui.Parent = hui
local ESP_CAP = 80
local function clearEsp()
	for _, c in ipairs(espGui:GetChildren()) do
		c:Destroy()
	end
end
local function updateEsp(fruits)
	clearEsp()
	if not State.EspEnabled then
		return
	end
	local n = 0
	for _, fr in ipairs(fruits) do
		if n >= ESP_CAP then
			break
		end
		if next(State.ShovelSeeds) and not State.ShovelSeeds[fr.seed] then
			continue
		end
		local part = fr.model.PrimaryPart or fr.model:FindFirstChildWhichIsA("BasePart")
		local w = fruitWeightFn and fruitWeightFn(fr.model)
		if part and w then
			local keeper = (State.ShovelMode == "Below" and w >= State.ShovelKg)
				or (State.ShovelMode == "Above" and w <= State.ShovelKg)
			local bb = Instance.new("BillboardGui")
			bb.Adornee = part
			bb.Size = UDim2.fromOffset(90, 22)
			bb.StudsOffsetWorldSpace = Vector3.new(0, 3, 0)
			bb.AlwaysOnTop = true
			bb.MaxDistance = 250
			bb.Parent = espGui
			local t = Instance.new("TextLabel")
			t.BackgroundTransparency = 1
			t.Size = UDim2.fromScale(1, 1)
			t.Font = Enum.Font.GothamBold
			t.TextSize = 14
			t.TextStrokeTransparency = 0.4
			t.TextColor3 = keeper and Color3.fromRGB(120, 255, 140) or Color3.fromRGB(255, 120, 120)
			t.Text = ("%.1f kg"):format(w)
			t.Parent = bb
			n += 1
		end
	end
end

if not PurchaseSeed then
	setStatus("PurchaseSeed tidak ditemukan - update script")
	Fluent:Notify({
		Title = "NaruHub",
		Content = "Networking.SeedShop.PurchaseSeed tidak ada. Beli tidak akan jalan.",
		Duration = 8,
	})
else
	Fluent:Notify({ Title = "NaruHub", Content = "Loaded. Klik logo untuk minimize.", Duration = 6 })
end

--==============================================================
-- Cleanup (live-reload) + main loop
--==============================================================

local aliveFn = function()
	return getgenv().__NaruHubGen == MY_GEN and not Fluent.Unloaded
end

local function cleanup()
	pcall(function() Fluent:Destroy() end)
	pcall(function() launcher:Destroy() end)
	pcall(function() toastGui:Destroy() end)
	pcall(function() monitorGui:Destroy() end)
	pcall(function() espGui:Destroy() end)
	for _, c in ipairs(conns) do
		pcall(function() c:Disconnect() end)
		pcall(function() c:disconnect() end)
	end
end

if STATE then
	STATE.onCleanup(cleanup)
	aliveFn = function()
		return STATE.alive() and getgenv().__NaruHubGen == MY_GEN and not Fluent.Unloaded
	end
end

--==============================================================
-- Weather Alert: deteksi via WeatherValues (terdeteksi -> berjalan) + webhook
--==============================================================
do
	local WV = ReplicatedStorage:FindFirstChild("WeatherValues")
	if WV then
		local active = {} -- [id] = true selama _Playing (dedup per-episode)

		local function notify(w, phase: string, remain: number?)
			local title, sub, color, desc
			if phase == "terdeteksi" then
				title = w.id .. " terdeteksi!"
				sub = "Cuaca akan aktif • " .. os.date("%H:%M:%S")
				color = 16763904
				desc = "🔍 **Terdeteksi** — cuaca akan aktif."
			elseif phase == "berjalan" then
				title = w.id .. " berjalan"
				sub = remain and (("Berakhir dalam ~%ds"):format(remain)) or ("Aktif • " .. os.date("%H:%M:%S"))
				color = 4437377
				desc = "▶️ **Berjalan**" .. (remain and (" — berakhir dalam ~" .. remain .. "s") or "")
			else
				title = w.id .. " selesai"
				sub = os.date("%H:%M:%S")
				color = 6710886
				desc = "⏹️ **Selesai**"
			end
			showToast(w.emoji, title, sub)
			setWeatherStatus(("%s %s • %s"):format(w.emoji, w.id, phase))
			sendWebhook(("%s %s"):format(w.emoji, w.id), desc, color)
		end

		local function onChange(w)
			if not aliveFn() then
				return
			end
			local playing = WV:GetAttribute(w.attr .. "_Playing")
			if playing then
				if active[w.id] then
					return
				end
				active[w.id] = true
				if not (State.WeatherNotify and State.WeatherSel[w.id]) then
					return
				end
				if setIdentity then
					pcall(setIdentity, 8)
				end
				notify(w, "terdeteksi")
				task.delay(2, function()
					if not aliveFn() then
						return
					end
					if WV:GetAttribute(w.attr .. "_Playing") then
						local endT = tonumber(WV:GetAttribute(w.attr .. "_EndTime")) or 0
						local remain = math.max(0, math.floor(endT - workspace:GetServerTimeNow()))
						if setIdentity then
							pcall(setIdentity, 8)
						end
						notify(w, "berjalan", remain > 0 and remain or nil)
					end
				end)
			else
				if not active[w.id] then
					return
				end
				active[w.id] = false
				if State.WeatherNotify and State.WeatherNotifyEnd and State.WeatherSel[w.id] then
					if setIdentity then
						pcall(setIdentity, 8)
					end
					notify(w, "selesai")
				end
			end
		end

		for _, w in ipairs(WEATHERS) do
			-- tandai yang sudah aktif saat load agar tidak langsung spam
			if WV:GetAttribute(w.attr .. "_Playing") then
				active[w.id] = true
			end
			local sig = WV:GetAttributeChangedSignal(w.attr .. "_Playing")
			local c = sig:Connect(function()
				onChange(w)
			end)
			table.insert(conns, c)
		end
	end
end

task.spawn(function()
	while aliveFn() do
		task.wait(0.4)
		if not State.Enabled or not PurchaseSeed then
			continue
		end

		local names = getSeedNames()
		local balance = getSheckles()
		local didBuy = false
		local blockedByFunds = false
		local anyTarget = false

		for _, name in ipairs(names) do
			if not State.Enabled or not aliveFn() then
				break
			end
			if not isTargeted(name) then
				continue
			end
			if getStock(name) <= 0 then
				continue
			end
			anyTarget = true

			local price = priceByName[name]
			if balance and price and balance < price then
				blockedByFunds = true
				continue
			end

			setStatus(("Membeli %s..."):format(name))
			local n = buyLoopFor(name, aliveFn)
			if n > 0 then
				didBuy = true
				balance = getSheckles() or balance
			end
		end

		if State.Enabled then
			if didBuy then
				setStatus(("Total dibeli sesi ini: %d"):format(State.BoughtSession))
			elseif blockedByFunds and not anyTarget then
				setStatus(("Saldo kurang (%s)"):format(tostring(balance)))
			elseif blockedByFunds then
				setStatus(("Saldo kurang (%s) - menunggu..."):format(tostring(balance)))
			else
				setStatus("Menunggu restock...")
			end
		end
	end
end)

task.spawn(function()
	while aliveFn() do
		task.wait(0.5)
		if not State.ShovelEnabled or not UseShovel then
			continue
		end
		local tool = getEquippedShovel()
		if not tool then
			setShovelStatus("Shovel tidak ditemukan (perlu tool Shovel)")
			continue
		end
		local shovelAttr = tool:GetAttribute("Shovel")
		local list = getMyPlotFruits()
		local hits, done = 0, 0

		local char = LocalPlayer.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		local savedCF = hrp and hrp.CFrame
		local didTeleport = false

		for _, fr in ipairs(list) do
			if not State.ShovelEnabled or not aliveFn() then
				break
			end
			if done >= State.ShovelLimit then
				break
			end
			if next(State.ShovelSeeds) and not State.ShovelSeeds[fr.seed] then
				continue
			end
			local w = fruitWeightFn and fruitWeightFn(fr.model)
			if not w then
				continue
			end
			local hit = (State.ShovelMode == "Below" and w < State.ShovelKg)
				or (State.ShovelMode == "Above" and w > State.ShovelKg)
			if not hit then
				continue
			end
			hits += 1
			if State.ShovelDryRun then
				done += 1
			else
				-- Shovel butuh dekat buah: teleport dulu (kecuali di-disable).
				local part = fr.model.PrimaryPart or fr.model:FindFirstChildWhichIsA("BasePart")
				if not State.ShovelNoTP and hrp and part then
					hrp.CFrame = CFrame.new(part.Position + Vector3.new(0, 4, 0))
					didTeleport = true
					task.wait(0.12)
				end
				if shovelFruit(fr.plantId, fr.fruitId, shovelAttr, tool) then
					done += 1
					Monitor.Shovel += 1
					task.wait(State.ShovelDelay)
				end
			end
		end

		-- balikin posisi pemain setelah keliling shovel
		if hrp and savedCF and didTeleport then
			hrp.CFrame = savedCF
		end

		if State.ShovelEnabled then
			if State.ShovelDryRun then
				setShovelStatus(("DRY RUN: %d fruit cocok (%s %g kg) - tidak dihapus"):format(hits, State.ShovelMode, State.ShovelKg))
			else
				setShovelStatus(("Shovel %d fruit (%s %g kg)"):format(done, State.ShovelMode, State.ShovelKg))
			end
		end
	end
end)

-- Monitor scan: Match X/Y + last good kg + refresh HUD & ESP
task.spawn(function()
	while aliveFn() do
		task.wait(3.0)
		-- Skip pekerjaan berat kalau HUD & ESP sama-sama mati (tapi bersihkan ESP sisa).
		if not State.MonitorShow and not State.EspEnabled then
			if #espGui:GetChildren() > 0 then
				clearEsp()
			end
			continue
		end
		local fruitList = getMyPlotFruits()
		local plot = getMyPlot()
		-- Target aktif: kalau Auto Pumpkin nyala pakai config pumpkin, selain itu config Garden.
		local aMode, aKg, aSeeds
		if State.PumpkinEnabled then
			aMode, aKg, aSeeds = "Below", State.PumpkinKg, { ["Atlantic Giant Pumpkin"] = true }
		else
			aMode, aKg, aSeeds = State.ShovelMode, State.ShovelKg, State.ShovelSeeds
		end
		local function inTarget(seed)
			return (not next(aSeeds)) or aSeeds[seed] == true
		end

		local matchX, matchY = 0, 0
		local lastGood = 0 -- keeper terbesar scan ini (bukan stale)
		local readyCnt = 0
		local plantHasKeeper = {}
		local fl = {}

		for _, fr in ipairs(fruitList) do
			local w = fruitWeightFn and fruitWeightFn(fr.model)
			if w then
				local rem = fruitGrowthFn and fruitGrowthFn(fr.model) -- 0=ready, >0 detik, nil=?
				if inTarget(fr.seed) then
					if rem == 0 then
						readyCnt += 1
					end
					local keeper = (aMode == "Below" and w >= aKg) or (aMode == "Above" and w <= aKg)
					if keeper then
						plantHasKeeper[fr.plantId] = true
						if w > lastGood then
							lastGood = w
						end
					end
				end
				fl[#fl + 1] = {
					seed = fr.seed or "?",
					kg = w,
					target = aSeeds[fr.seed] == true,
					rem = rem,
					mut = fr.model:GetAttribute("Mutation"),
				}
			end
		end

		if plot then
			local plants = plot:FindFirstChild("Plants")
			if plants then
				for _, pl in ipairs(plants:GetChildren()) do
					if pl:IsA("Model") and (pl:GetAttribute("UserId") == myUserId or pl.Name:sub(1, #myPrefix) == myPrefix) then
						if inTarget(pl:GetAttribute("SeedName")) then
							matchY += 1
							local pid = pl:GetAttribute("PlantId")
							if pid and plantHasKeeper[pid] then
								matchX += 1
							end
						end
					end
				end
			end
		end

		-- urut daftar by kg: High (terberat dulu) / Low (teringan dulu)
		table.sort(fl, function(a, b)
			if State.MonSort == "Low" then
				return a.kg < b.kg
			end
			return a.kg > b.kg
		end)
		Monitor.FruitList = fl

		Monitor.MatchX, Monitor.MatchY = matchX, matchY
		Monitor.LastGoodKg = lastGood
		Monitor.Ready = readyCnt
		pcall(updateMonitor)
		pcall(function()
			updateEsp(fruitList)
		end)
	end
end)

-- Auto place sprinkler: satu per interval, hindari yang terlalu dekat.
task.spawn(function()
	while aliveFn() do
		task.wait(State.SprinklerDelay)
		if not State.SprinklerEnabled or not PlaceSprinkler then
			continue
		end
		local tool = getEquippedSprinkler()
		if not tool then
			continue
		end
		local plot = getMyPlot()
		if not plot then
			continue
		end
		local attr = tool:GetAttribute("Sprinkler")
		local plotId = LocalPlayer:GetAttribute("PlotId")
		local sprinklers = plot:FindFirstChild("Sprinklers")
		local plants = plot:FindFirstChild("Plants")
		if not plants then
			continue
		end
		local minDist = 14
		for _, pl in ipairs(plants:GetChildren()) do
			if not State.SprinklerEnabled or not aliveFn() then
				break
			end
			-- hanya taruh di plant sesuai seed filter (mis. Atlantic Giant Pumpkin)
			if next(State.ShovelSeeds) and not State.ShovelSeeds[pl:GetAttribute("SeedName")] then
				continue
			end
			local part = pl.PrimaryPart or pl:FindFirstChild("Base")
			if part then
				local pos = part.Position
				local tooClose = false
				if sprinklers then
					for _, s in ipairs(sprinklers:GetChildren()) do
						local sp = s.PrimaryPart or s:FindFirstChildWhichIsA("BasePart")
						if sp and (sp.Position - pos).Magnitude < minDist then
							tooClose = true
							break
						end
					end
				end
				if not tooClose then
					local hrp = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
					local savedCF = hrp and hrp.CFrame
					if not State.SprinklerNoTP and hrp then
						hrp.CFrame = CFrame.new(pos + Vector3.new(0, 4, 0))
						task.wait(0.12)
					end
					if placeSprinkler(pos, attr, tool, plotId) then
						Monitor.Sprinkler += 1
						table.insert(sprinklerTimes, os.clock())
						pcall(updateMonitorStats)
					end
					if not State.SprinklerNoTP and hrp and savedCF then
						hrp.CFrame = savedCF
					end
					break -- satu per interval
				end
			end
		end
	end
end)

-- Auto Pumpkin (Misc): place sprinkler pilihan di pumpkin -> shovel pumpkin < kg -> ulang.
task.spawn(function()
	local SEED = "Atlantic Giant Pumpkin"
	while aliveFn() do
		task.wait(0.4)
		if not State.PumpkinEnabled then
			continue
		end
		local plot = getMyPlot()
		if not plot then
			continue
		end
		local plants = plot:FindFirstChild("Plants")
		if not plants then
			continue
		end
		local plotId = LocalPlayer:GetAttribute("PlotId")
		local sprinklers = plot:FindFirstChild("Sprinklers")
		local minDist = 14

		-- FASE 1: place sprinkler pilihan di pumpkin (spasi), stop kalau habis
		local placedThis = 0
		local ranOut = false
		for _, pl in ipairs(plants:GetChildren()) do
			if not State.PumpkinEnabled or not aliveFn() then
				break
			end
			if pl:GetAttribute("SeedName") ~= SEED then
				continue
			end
			local sprTool = getSprinklerToolByType(State.PumpkinSprinkler)
			if not sprTool then
				ranOut = true
				break
			end
			local part = pl.PrimaryPart or pl:FindFirstChild("Base")
			if part then
				local pos = part.Position
				local tooClose = false
				if sprinklers then
					for _, s in ipairs(sprinklers:GetChildren()) do
						local sp = s.PrimaryPart or s:FindFirstChildWhichIsA("BasePart")
						if sp and (sp.Position - pos).Magnitude < minDist then
							tooClose = true
							break
						end
					end
				end
				if not tooClose then
					local hrp = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
					local savedCF = hrp and hrp.CFrame
					if not State.PumpkinNoTP and hrp then
						hrp.CFrame = CFrame.new(pos + Vector3.new(0, 4, 0))
						task.wait(0.1)
					end
					if placeSprinkler(pos, sprTool:GetAttribute("Sprinkler"), sprTool, plotId) then
						Monitor.Sprinkler += 1
						placedThis += 1
						table.insert(sprinklerTimes, os.clock())
						pcall(updateMonitorStats)
					end
					if not State.PumpkinNoTP and hrp and savedCF then
						hrp.CFrame = savedCF
					end
					task.wait(State.PumpkinDelay)
					if placedThis >= 10 then
						break
					end
				end
			end
		end

		if ranOut then
			setPumpkinStatus(("Sprinkler '%s' habis - berhenti"):format(State.PumpkinSprinkler))
			State.PumpkinEnabled = false
			pcall(function()
				Fluent.Options.NaruHub_Pumpkin:SetValue(false)
			end)
			continue
		end

		if not State.PumpkinEnabled or not aliveFn() then
			continue
		end

		-- FASE 2: shovel pumpkin fruit < kg (teleport tiap buah)
		local shovel = getEquippedShovel()
		local doneShovel = 0
		if shovel then
			local shovelAttr = shovel:GetAttribute("Shovel")
			local list = getMyPlotFruits()
			local hrp = LocalPlayer.Character and LocalPlayer.Character:FindFirstChild("HumanoidRootPart")
			local savedCF = hrp and hrp.CFrame
			local didTP = false
			for _, fr in ipairs(list) do
				if not State.PumpkinEnabled or not aliveFn() then
					break
				end
				if fr.seed ~= SEED then
					continue
				end
				local w = fruitWeightFn and fruitWeightFn(fr.model)
				if not w or w >= State.PumpkinKg then
					continue
				end
				local part = fr.model.PrimaryPart or fr.model:FindFirstChildWhichIsA("BasePart")
				if not State.PumpkinNoTP and hrp and part then
					hrp.CFrame = CFrame.new(part.Position + Vector3.new(0, 4, 0))
					didTP = true
					task.wait(0.12)
				end
				if shovelFruit(fr.plantId, fr.fruitId, shovelAttr, shovel) then
					doneShovel += 1
					Monitor.Shovel += 1
					pcall(updateMonitorStats)
					setPumpkinStatus(("Shovel %d (<%gkg)..."):format(doneShovel, State.PumpkinKg))
					task.wait(State.PumpkinDelay)
				end
			end
			if hrp and savedCF and didTP then
				hrp.CFrame = savedCF
			end
		end

		if State.PumpkinEnabled then
			setPumpkinStatus(("Place %d | Shovel %d (<%gkg)"):format(placedThis, doneShovel, State.PumpkinKg))
		end
	end
end)

-- Automatically Drop Item: helper filter + loop per kategori --------------

local function collectDropCandidates(): { Instance }
	local list = {}
	local bp = LocalPlayer:FindFirstChild("Backpack")
	if bp then
		for _, t in ipairs(bp:GetChildren()) do
			if t:IsA("Tool") then
				list[#list + 1] = t
			end
		end
	end
	local char = LocalPlayer.Character
	if char then
		for _, t in ipairs(char:GetChildren()) do
			if t:IsA("Tool") then
				list[#list + 1] = t
			end
		end
	end
	return list
end

-- Fruit lolos kalau (Fruit ATAU Rarity ATAU Mutation cocok, kalau ada yang dipilih)
-- DAN lolos threshold berat (selalu dicek, wajib).
local function fruitMatchesFilter(fruitName: string, mutation: string?, weight: number?): boolean
	local hasType = next(State.DropFruitList) ~= nil
	local hasRarity = next(State.DropFruitRarity) ~= nil
	local hasMut = next(State.DropFruitMutation) ~= nil
	local passSelector
	if not hasType and not hasRarity and not hasMut then
		passSelector = true
	else
		local typeOk = hasType and State.DropFruitList[fruitName] == true
		local rarityOk = hasRarity and rarityBySeedName[fruitName] and State.DropFruitRarity[rarityBySeedName[fruitName]] == true
		local mutOk = hasMut and mutation and mutation ~= "" and State.DropFruitMutation[mutation] == true
		passSelector = typeOk or rarityOk or mutOk
	end
	if not passSelector or not weight then
		return false
	end
	if State.DropFruitMode == "Below" then
		return weight < State.DropFruitKg
	else
		return weight > State.DropFruitKg
	end
end

-- Gear lolos kalau nama ATAU rarity cocok (wajib pilih minimal satu, biar aman).
local function gearMatchesFilter(gearName: string): boolean
	local hasName = next(State.DropGearList) ~= nil
	local hasRarity = next(State.DropGearRarity) ~= nil
	if not hasName and not hasRarity then
		return false
	end
	local nameOk = hasName and State.DropGearList[gearName] == true
	local rarityOk = hasRarity and rarityByGearName[gearName] and State.DropGearRarity[rarityByGearName[gearName]] == true
	return nameOk or rarityOk
end

-- Auto Drop Seed
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropSeedEnabled then
			continue
		end
		if not next(State.DropSeedList) then
			setDropSeedStatus("Pilih seed dulu (kosong = tidak drop apa-apa).")
			continue
		end
		local done = 0
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropSeedEnabled or not aliveFn() then
				break
			end
			local seedName = t:GetAttribute("SeedTool")
			if seedName and State.DropSeedList[seedName] then
				if dropTool(t) then
					done += 1
					setDropSeedStatus(("Drop %d seed..."):format(done))
					task.wait(State.DropDelay)
				end
			end
		end
		if State.DropSeedEnabled then
			setDropSeedStatus(done > 0 and ("Selesai: %d seed di-drop."):format(done) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Auto Drop Fruit
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropFruitEnabled then
			continue
		end
		local done = 0
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropFruitEnabled or not aliveFn() then
				break
			end
			if t:GetAttribute("HarvestedFruit") == true then
				local fruitName = t:GetAttribute("FruitName")
				local mutation = t:GetAttribute("Mutation")
				local weight = t:GetAttribute("Weight")
				if fruitName and fruitMatchesFilter(fruitName, mutation, weight) then
					if dropTool(t) then
						done += 1
						setDropFruitStatus(("Drop %d fruit..."):format(done))
						task.wait(State.DropDelay)
					end
				end
			end
		end
		if State.DropFruitEnabled then
			setDropFruitStatus(done > 0 and ("Selesai: %d fruit di-drop."):format(done) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Auto Drop Gear
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropGearEnabled then
			continue
		end
		if not next(State.DropGearList) and not next(State.DropGearRarity) then
			setDropGearStatus("Pilih gear atau rarity dulu (kosong = tidak drop apa-apa).")
			continue
		end
		local done = 0
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropGearEnabled or not aliveFn() then
				break
			end
			local category, gearName = getDropCategoryAndId(t)
			if category and category ~= "Seeds" and category ~= "HarvestedFruits" and category ~= "Pets" then
				if gearName and gearMatchesFilter(gearName) then
					if dropTool(t) then
						done += 1
						setDropGearStatus(("Drop %d gear..."):format(done))
						task.wait(State.DropDelay)
					end
				end
			end
		end
		if State.DropGearEnabled then
			setDropGearStatus(done > 0 and ("Selesai: %d gear di-drop."):format(done) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Auto Drop Pets
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropPetEnabled then
			continue
		end
		if not next(State.DropPetList) then
			setDropPetStatus("Pilih pet dulu (kosong = tidak drop apa-apa).")
			continue
		end
		local done = 0
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropPetEnabled or not aliveFn() then
				break
			end
			local petId = t:GetAttribute("PetId")
			local petName = t:GetAttribute("Pet")
			if type(petId) == "string" and petId ~= "" and petName and State.DropPetList[petName] then
				if dropTool(t) then
					done += 1
					setDropPetStatus(("Drop %d pet..."):format(done))
					task.wait(State.DropDelay)
				end
			end
		end
		if State.DropPetEnabled then
			setDropPetStatus(done > 0 and ("Selesai: %d pet di-drop."):format(done) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Ticker 1 detik: countdown sprinkler live + refresh counter
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if State.MonitorShow then
			pcall(updateMonitorStats)
		end
	end
end)

print("[NaruHub] Loaded - Auto Buy Seed (Fluent UI + logo).")
