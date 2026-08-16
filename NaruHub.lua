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

local BRAND = Color3.fromRGB(255, 214, 10) -- kuning "lightning" (tema hitam-kuning)

-- Dipanggil dari tombol Close title bar SEBELUM Fluent:Destroy(), supaya state
-- yang butuh restore (AFK Mode, Boost FPS, dll) tidak nyangkut kalau window
-- ditutup lewat X, bukan cuma lewat reload script.
local onWindowClose: () -> ()? = nil

-- Generation guard: kalau script di-execute ulang (loadstring), run lama berhenti.
local MY_GEN
do
	local g = getgenv()
	g.__NaruHubGen = (g.__NaruHubGen or 0) + 1
	MY_GEN = g.__NaruHubGen
end

--==============================================================
-- Auto Save/Load Config per-HWID: semua Toggle/Slider/Input/Dropdown yang
-- dibuat lewat Section:Add* otomatis ke-load dari file lama & auto-save tiap
-- diubah, jadi tidak perlu setting ulang dari awal kalau device (HWID) sama.
--==============================================================
local ConfigData: { [string]: any } = {}
local CONFIG_PATH
do
	local ok, hwid = pcall(function()
		return gethwid and gethwid() or "default"
	end)
	local safeId = (ok and hwid and tostring(hwid):gsub("[^%w]", "")) or "default"
	CONFIG_PATH = "NaruHub_Config_" .. safeId .. ".json"
end

local function saveConfig()
	if not writefile then
		return
	end
	pcall(function()
		writefile(CONFIG_PATH, HttpService:JSONEncode(ConfigData))
	end)
end

do
	local ok = pcall(function()
		if isfile and isfile(CONFIG_PATH) then
			local decoded = HttpService:JSONDecode(readfile(CONFIG_PATH))
			if type(decoded) == "table" then
				ConfigData = decoded
			end
		end
	end)
	if not ok then
		ConfigData = {}
	end
end

-- Safety net: STATE.onCleanup (kalau ada) yang biasa nge-destroy UI lama, tapi
-- itu tidak selalu tersedia dari harness live-reload. Paksa hapus sisa UI generasi
-- sebelumnya di sini juga, independen dari mekanisme cleanup manapun.
do
	local hui = (gethui and gethui()) or game:GetService("CoreGui")
	local roots = { game:GetService("CoreGui"), hui }
	local staleNames = {
		NaruHubGUI = true,
		NaruHubMonitor = true,
		NaruHubEsp = true,
		NaruHubToast = true,
		NaruHubLauncher = true,
		NaruHubDropdown = true, -- 1 ScreenGui per dropdown, bisa banyak sekaligus
		NaruHubAfkScreen = true,
	}
	for _, root in ipairs(roots) do
		for _, child in ipairs(root:GetChildren()) do
			if staleNames[child.Name] then
				pcall(function() child:Destroy() end)
			end
		end
	end
end

--==============================================================
-- Game bindings
--==============================================================

local PurchaseSeed, CollectFruit, UseShovel, PlaceSprinkler, RequestDrop, PurchaseGear
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
		if net.GearShop then
			PurchaseGear = net.GearShop.PurchaseGear
		end
	end
end

-- Mailbox: kirim item ke pemain lain. Format ketahuan dari MailboxController
-- asli game -- SendBatch:Fire(userId, {{Category=, ItemKey=, Count=}, ...}, note).
local MailboxSendBatch, MailboxLookupPlayer
do
	local ok, net = pcall(function()
		return require(ReplicatedStorage.SharedModules.Networking)
	end)
	if ok and net and net.Mailbox then
		MailboxSendBatch = net.Mailbox.SendBatch
		MailboxLookupPlayer = net.Mailbox.LookupPlayer
	end
end

-- Kategori Mailbox asli (dari MailboxItemCatalog.Categories):
--  Pets, Sprinklers, WateringCans, Mushrooms, Gnomes, Raccoons, Crates,
--  SeedPacks, Trowels, Props, Seeds, HarvestedFruits, EmptyPots
local MAIL_CATEGORIES_SEED = { "Seeds", "SeedPacks" }
local MAIL_CATEGORIES_GEAR = {
	"Sprinklers", "WateringCans", "Mushrooms", "Gnomes", "Raccoons",
	"Trowels", "Props", "Crates", "EmptyPots",
}
local MAIL_CATEGORIES_PET = { "Pets" }
local MAIL_CATEGORY_FRUIT = "HarvestedFruits"

-- Data inventaris asli (PlayerStateClient replica) -- sama persis yang dibaca
-- MailboxController game buat nampilin apa aja yang bisa di-gift.
local function getInventoryData()
	local ok, PSC = pcall(function()
		return require(ReplicatedStorage.ClientModules.PlayerStateClient)
	end)
	if not ok or not PSC then
		return nil
	end
	local ok2, replica = pcall(function()
		return PSC:GetLocalReplica()
	end)
	if not ok2 or not replica or type(replica.Data) ~= "table" then
		return nil
	end
	return replica.Data.Inventory
end

local function mailLookupUser(username: string): (number?, string?)
	if not MailboxLookupPlayer or not username or username == "" then
		return nil
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok, userId, displayName = pcall(function()
		return MailboxLookupPlayer:Fire(username)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	if ok and typeof(userId) == "number" and userId > 0 then
		return userId, displayName
	end
	return nil
end

-- Katalog asli game (dipakai UI Mailbox bawaan) -- dipakai buat GetValue
-- (harga fruit) & Resolve (nama tampilan). Reuse langsung, nggak perlu
-- reimplementasi rumus harga fruit sendiri.
local MailboxItemCatalog
do
	local ok, mod = pcall(function()
		return require(LocalPlayer.PlayerScripts.Controllers.MailboxController.MailboxItemCatalog)
	end)
	if ok then
		MailboxItemCatalog = mod
	end
end

local function mailFruitValue(itemKey: string, entry: any): number
	if not MailboxItemCatalog then
		return 0
	end
	-- p4 (arg ke-4) HARUS Instance ber-attribute "Friends" (dipakai buat
	-- friend-boost) -- FruitValueCalc GetAttribute langsung tanpa nil-check,
	-- jadi nil bikin GetValue silently return 0 (dibungkus pcall internal).
	local ok, v = pcall(function()
		return MailboxItemCatalog.GetValue("HarvestedFruits", itemKey, entry, LocalPlayer)
	end)
	if ok and typeof(v) == "number" then
		return v
	end
	return 0
end

local function mailSendBatch(userId: number, items: { any }, note: string?): (boolean, string?)
	if not MailboxSendBatch then
		return false, "Mailbox remote tidak ditemukan"
	end
	if not items or #items == 0 then
		return false, "Tidak ada item dipilih"
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok, success, msg = pcall(function()
		return MailboxSendBatch:Fire(userId, items, note or "")
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	if not ok then
		return false, "Gagal fire remote"
	end
	if not success then
		return false, (msg and msg ~= "" and msg) or "Gagal mengirim mail"
	end
	return true, (msg and msg ~= "" and msg) or "Mail terkirim!"
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

-- Nama leaderstat currency beda per place (Sheckles di World 1, Leaves di
-- Fall Harvest/World 2) walau simbol tampilannya sama-sama "¢". Dicoba nama
-- yang diketahui dulu, baru fallback ke Int/NumberValue pertama yang ketemu
-- biar tetap jalan kalau ada place baru lagi nanti dengan nama lain.
local function getSheckles(): number?
	local ls = LocalPlayer:FindFirstChild("leaderstats")
	if not ls then
		return nil
	end
	local s = ls:FindFirstChild("Sheckles") or ls:FindFirstChild("Leaves")
	if not s then
		for _, c in ipairs(ls:GetChildren()) do
			if c:IsA("IntValue") or c:IsA("NumberValue") then
				s = c
				break
			end
		end
	end
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

local gearStockItems = ReplicatedStorage:FindFirstChild("StockValues")
gearStockItems = gearStockItems and gearStockItems:FindFirstChild("GearShop")
gearStockItems = gearStockItems and gearStockItems:FindFirstChild("Items")

local function getGearStock(name: string): number
	if not gearStockItems then
		return 0
	end
	local v = gearStockItems:FindFirstChild(name)
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
local gearPriceByName: { [string]: number } = {}
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
				if entry.Cost then
					gearPriceByName[n] = entry.Cost
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

local function buyGear(name: string): boolean
	if not PurchaseGear then
		return false
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok = pcall(function()
		PurchaseGear:Fire(name)
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

-- Fruit yang stack-nya banyak (mis. puluhan Cactus) disimpan game sebagai
-- Configuration "proxy" ringan (attribute FruitProxy=true), BUKAN Tool -- cuma
-- 1 Tool nyata yang aktif setiap saat. Untuk drop, proxy harus di-"promote" dulu
-- jadi Tool asli lewat Networking.Backpack.PromoteFruit, baru bisa di-equip.
-- Id proxy tidak selalu sama dengan Id Tool hasil promote, jadi dideteksi lewat
-- "Tool baru yang sebelumnya belum ada" (snapshot before/after), bukan match Id.
local function promoteFruitProxy(proxy: Instance): Instance?
	local id = proxy:GetAttribute("Id")
	local fruitName = proxy:GetAttribute("FruitName")
	if not id or not fruitName then
		return nil
	end
	local ok, net = pcall(function()
		return require(ReplicatedStorage.SharedModules.Networking)
	end)
	if not ok or not net or not net.Backpack or not net.Backpack.PromoteFruit then
		return nil
	end

	local before = {}
	local function snap(c)
		if not c then
			return
		end
		for _, t in ipairs(c:GetChildren()) do
			if t:IsA("Tool") and t:GetAttribute("HarvestedFruit") == true and t:GetAttribute("FruitName") == fruitName then
				before[t] = true
			end
		end
	end
	snap(LocalPlayer:FindFirstChild("Backpack"))
	snap(LocalPlayer.Character)

	pcall(function()
		net.Backpack.PromoteFruit:Fire(id)
	end)

	for _ = 1, 30 do
		task.wait(0.05)
		local function check(c)
			if not c then
				return nil
			end
			for _, t in ipairs(c:GetChildren()) do
				if t:IsA("Tool") and t:GetAttribute("HarvestedFruit") == true and t:GetAttribute("FruitName") == fruitName and not before[t] then
					return t
				end
			end
			return nil
		end
		local found = check(LocalPlayer:FindFirstChild("Backpack")) or check(LocalPlayer.Character)
		if found then
			return found
		end
	end
	return nil
end

-- Equip tool (tunggu betul-betul ke-equip, seperti klik pilih di inventory asli)
-- -> baru fire RequestDrop(category, id) di identity 2 (backspace). Bukan spam
-- fire tanpa equip -- kalau tool gagal ke-equip dalam waktu wajar, batal (return false).
local function dropTool(tool: Instance): boolean
	if not RequestDrop then
		return false
	end

	if tool.ClassName == "Configuration" and tool:GetAttribute("FruitProxy") == true then
		local promoted = promoteFruitProxy(tool)
		if not promoted then
			return false
		end
		tool = promoted
	end
	local category, id = getDropCategoryAndId(tool)
	if not category or not id then
		return false
	end
	local char = LocalPlayer.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not char or not hum then
		return false
	end

	if tool.Parent ~= char then
		pcall(function()
			hum:EquipTool(tool)
		end)
		local equipped = false
		for _ = 1, 10 do
			if tool.Parent == char then
				equipped = true
				break
			end
			task.wait(0.05)
		end
		if not equipped then
			return false
		end
	end

	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local fireOk = pcall(function()
		RequestDrop:Fire(category, id)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	if not fireOk then
		return false
	end

	-- Fire itu fire-and-forget: pcall cuma nangkep error di sisi client, BUKAN
	-- konfirmasi server benar-benar memproses drop-nya. Verifikasi tool beneran
	-- hilang (di-destroy) sebelum dianggap sukses -- kalau tidak, jangan dihitung
	-- (biar tidak salah lapor "sukses" padahal tool masih nyangkut di karakter).
	for _ = 1, 30 do
		if tool.Parent == nil then
			return true
		end
		task.wait(0.05)
	end
	return false
end

-- Counter live untuk Monitor HUD (bukan config).
local Monitor = { Shovel = 0, Sprinkler = 0, MatchX = 0, MatchY = 0, LastGoodKg = 0, Ready = 0, FruitList = {} }
local SPRINKLER_LIFETIME = 120
local sprinklerTimes = {} -- os.clock() tiap placement (untuk countdown)

--==============================================================
-- Logo (tertanam, sudah dikompres ~256px)
--==============================================================

local LOGO_B64 = "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABfnSURBVHhe7d0JlC1FfcdxVEziBkFQQUFcUHABYxQNsmnUxENcUEHFNaAEN1TiEiUsUXE5ARcSXBNFD4qKUSKiHCFuiAu4YSSCC4gRDKDCE/TxZubWt3L+9/zvPdX/6Ttvlu6+y/w+55gwPX27686rqq6u5V9bbCEiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIi0gTgrjnnP43HRWSG5ZxvBbwT+F1K6SrgC8CbgacC98s53zp+RkRmBLBLHgGYB34EfBQ4CtgP2DZeQ0SmVM55a+DSWPhHAf4P+CJworcS7p1z3jJeV0SmBHBP4POxsC8HsBG4BDgNeBGwJ3C7eA8RmXDAS3POG2IhXyngCuCTwCuBvYGt4r1EZAJZxx9wTizUBvgf4P3AN4A/xN+PAvwvcBbwGmCvnPPt431FZIIAL7eRgVCQ54CPA7vmnLfLOR8I/LP3CVxTnrsU4ErgE8ARwAPjvUVkAgAPAM6rKcDXAc8J524LPBo4Gvgs8Kv4uTrAQs75O8DbgMfpdUFkwvi7/KImP/BpYOd4vsk5bwPs683+s4Gr4ufr+OvC6cAzbXJSvK6IjEHO+c+Ar9YU2Gtzzn8bz49sliGwP/B6f2W4IV4rAq4HzgQO3bhx493jNUWkQz5r8BibIBQLa875DOBu8TOj2LnAk73pf2Hsb6ixwVscz9JkJJExsp584NuxhAK/BJ4Sz9+cnPP2wLOBr/l1iNcuWf9CSumD1qKI1xKRDgB/7GsGUk0BfdeozjyfKPRim0mYUrIn+g98duGNwCb/fAr/G1kheOvhSKtE4r1EpGX+Xv/fNQXzh3VPaHuFiOcuxSuABaC3VEWQUroW+FfgQfGeItIi4A7Au2Oh9EL7eus7KM61aceLRhQ2xwq/VwZ2zZGtAq8srGWxXzWVItKqnPPBwNWxUOacvwLcf3DeatcdDHhlMKgQFr2CDPjw42OrqRSR1uSc725DdzWF8YZer/d8P+fg+PvVGlQEKfUbBaNaBTYNee+YVhFpCfAy4KaawvheYCfg5/F3a1G2CJaoCCyuwX1jWkWkBT556IKagnhRSum78XgTvCLopZSsL2DR64FPQHptzvlPYnpFpGEWUgx4UyyIJqVki4sWFdImDCqCUS0C4LvqHxDpCPB4mygUCqG9u988YmZhI4pXg0WVgAHeoQAmIh3wDsKzawqhtQT6k4DaslRFAHwPeHhMr4i0oNfrvTY+9X383loDrbwSDPhogf2fynEPbfbCmFaRiQQ8z6Pz/D3whJzzbsBt4nmTan5+3iIM/yQUQntn32T/vzzehiVaAzah6Y9iekUmhk2xrcm41oy+PKX0eeAttijHI/beMn5+UgB3AT4Tv0tKycKRW6CQVvWbAinVVQLnWsSjmF6RiQAcHjNtHW/WXgy8D3jSpC6jTSm9sSbt9kpgFcGiAtqkUX0DwPdt2nJMq8jYAc8tM+ty+aq7j/mU3Yl6XfA0/Tak18bzW68EzIhK4GcWFi2mVWSsgENCxrWQXa/ygJ22Cm/RDLwIuCyl9E+bNm26T7z+uAC725M3pNO+n/ULtNo5aAbzBsIx2y5t95hWkbEBnhEy6XB6q0ft2Rk4IKX0lpTS15dafQf83l8R7le9y3hY6DCLLhTSaKyPo5N+gZpKwOIUTkxFKetcXEwDPCyeU8o538tDcNvquNrKwI6nlE4C7hw/Pw7WkRnSZ25OKXUxQmAq97EWk4KUykSwHv6QOfeK54xiTzLg1bbJR3mNAeAXwGHxc+PQ6/VeWFMQOxshqGkJ2IYomjUo42UbcpQZM+e8Tzxnc2wxjAXYtJj84Vp9voR27L3gPoU4blBiIwStVwLGaoHw8+kxjSKd8ok/ZaZcFHprubzP4NCU0qIdgm23H+Dp8TNdA/4i7ivQVSXgLYFYCbwqplGkM9bBFzJkvwLIOd8C2MH+Z6vw4ueWYvv1pZROsM628tp+/bet9HpN85mOlUqqrte+DbES8MpHAUZkPGwLrZBB7Ql5kC9xtc007H8/yjl/yI7nnLeO1xjFOhQt0m55fb/Hl0btAtQV30ugEoDUQwG1XgnEGYPeKXiHmEaR1tk69iIj2tPorDJzRtaxl1J663KHsjzk94k117G4/2MNtgnsGDswbWSgi0og3sOWEsf0ibTONuEsMuGyZ8nZBKGUkoXk2jVesw7wVODX4Rp/sOPx3C7lnO9hs/SKNA0qwmX/LVaj5lXAKp6HxvSJtCrn/Mhq1lwZm/yTUrItuTY7rm1TYVNKF4fP0+v1XhDP7ZJVYjECsYUBK39uQ6xkgC/HtIm0yprhZSZcLV8bcNTmlr9u2LBhm5TS52o+/5J4bpesI84WPBXpsf6ARqMLectiUSSj8POKt0MTWTXL+GUGbMB3rGMx3qeUc97SOhXjB21brnhul2xn4pCe/i5C5bG18Fb/v5VrFGpeBayFtGVMm0grrNd/mEMbBJxqYbvi/Uq271/8XK/XOzye16WU0vvK9DS9jNi3M39sWbHUtAKeFtMl0grbYLPMfE2y1wJ7qsZ7loC313zu2fG8rtj0XB/2HKTFNNYf4IXdOh7fUByrtAJSSufHdIm0Iuf8kGHubIntr7dUayBWAt4j/uR4XlesXyQ0y2v3BVgt7yuxWZOXF8eG1/d7PySmS6RxwIOHObNF1sve6/VGNm1tN95w/qaFhYWxxdq3Zc1FWppuBVzg93hicawSRAQ4KaZJpHHAHsOc2QHglFERhLzfoDz3Bqug4nldyDlvD/ymSItFFGqkL8CWIg9aRMB5fsyUrYCf2iSqmC6RRtnYfPnk6QLwLeCBMS3eLK5sBgpcOa5pw8DxRTpMYyMCg76Rchg2vmasZGm2yKr4wpjG3m+Xy5/uz4jpsdYB8LVw7rfHMVfeWwHD5cNNzhAEPlLc5yt+rK8457hqikQa5rPgmnyyrQjwxpo03TmldFk478x4XhdSSqcVabDOyUb+VmUTv5x/UL5mAJ+P6RFplEf1aXTG20oBn4qrDL1lcl047+3lOV0oA6b4A7qRv5VXJnvYPXxl4o2D48U5tu35bWOaRBpjG360vZfeMtkMwl1C2h5VE1Pg78pz2matkTLEeFMVgBvOkQC+agdCR6BNQlIocWmPheoq58CPk4fN3rdMX830XCsUq45atBrA+cX9G5sTUA71Ae/0Y3GB0AHV1Ig0yMN+10b3HQcPLV6ZBAS8OZzzqy5HBoAPFPdusgL4z+IeR/qxSlASC7FWTY1Ig4CdlrP5R5f8Xbuyu67PJizP+eao+QRNK6ft+r2bGgmwRUH9/RaB5/ixOBLwypgekcZ4B1QlUu6kAI4u0rlVDOFlE4eq36YdvV7vNcU97RUk9kusikdF6g9vxg1aBoBjY3pEGuOBP2+IGW+CvHWQVh8ZiHv+tb6EGPiHwf08ZFgjHYE2ymG7Gvs9nh9/b2wyUkyPSGN8W+1KoZo0wMlFeg8ITWR7Ilc6DpsGnFBNUTO85XUPv8ex8fcGeF1Mj0hjgDvFWH2TyAJpFGl+Xfid7be3Q/WbNcfuXdyryU5AW2uwvd/jE36sEpR03JGSZMYB2wLXVnLmhAL+fZDumk0//8vWElS/XTMsiEdxHyugTXUCXm0dmRZGLaV0pR+LqwKfFdMj0hjgjrZrTyVnTrBBS8A3H6mE9G5jCW3OeZuygmxqKrCxzUnsHsAjimNxQdBfxTSJNMa20I4RcSfdoBKYm5t7oM0bCL9btMBoLRYWFuLGKU1WAF+1ewwmAfmxciqwfbd+H4FIK3x4rbJX3jSwQuPpPyT8asNy9ypYjlA4rXneZAXwYQsAWlbAoQK4pK3XGpE+a0pbJ9owV04RmyFo36EmpNi3bcfi+F1Xypcm99/N/bqNvf8bG14sN2etmQX40ZgmkUbZarMyk08b4DX2Pcr5+n783fG7rpTvhVhes7GnvwEOtyW/xc+VDsDNBVQVWTN7UgJXFJlu6th8eZtRV7N8+JD4fVciLAJqdONQCwtm8xvKSUWh+b+xy/UOsk7ZEFS5N960st7ymk1OrD/gvvE7L0fcMq3JaEDGJgGF14vY/D83pkmkcd4J9ZNhzpxSFtPAAoja+oFw/Fub266sziBYp1/DNNr8j+L1e73eYTFNIo0744wzLBDnj8vMN61SSja3fg+gsvfgYMRgucqOOf98o7sDRV7BlE9/m5m5XUyXSONyzrcod8KZdsAP5+fn900pVUY2rEMvfvc6FqcPGE4w8p7/Rhb/jBI7/4B3xHSJtMYKTTVLTjfgC94xWHaw2YKne8XvHtmoQrhWF0//svPPwrPtFtMl0ppyt9pZAZxWTuLxYxZ3b+TEmptvvvleIQx4Y1GAR4lzC2xyUEyXSKssIGc1W84G227MFwmVx94Uv/8AcFZxnmm76R/f/RUEVLoHXFjNmrPBh+7elVL6RTi+aIEN8LxwjhXGxsb968TrA++P6RJpHfCNMiPOEuD6lNLHUkrDyMceiqsficfYPn0h9Ld1ynX69Pc5CztV/2VEOhC34po1NuEmpdSPu18c+0zx/cvpuKSU7Olfnt64mqe/Iv/IeAz2pptlvhVX5VXANhmJsfiajPgzSrL9v6odf7bqb82Ll0RWJaU0jHgzyzx02HAPhBjh15v+C8MPtMDLfnz6L+qTEOlMSuncMkPOKn/v/m3d0J7/rpFw36P460Xl3rbpSPz3EOkUcE6ZKdtgnXGTEHnIm/iLNkKxwh+fzE2rGfO3Fsm28d9DpFPA2dWs2jxbcWjhutpuYi+Hd/JVluG2na4RTf8nxn8Lkc7ZHnVlxmyDDb35vU6OvxsHf//vP5HrXgmaVHcP4L3x30FkLID/KDNnG3zt+61yzltPwquA8YLZ7nhffdP/ssGWYCJjF2Pst8FjDmxp96sJ5DmzvPCX032tD+IR8d9AZGyA06vZtnk+1t3fCdfv2Xq/w7jVDSuWG56KTARbOVdm0jZYpN5wz13qeuNnhb9dVKYTW5gvi79Q/h1Exi7n/KEyo7YBuCDeF3h1PG9WxBmFtvsSsGP8G4iMnU1GqWbf5gFfivf1eITfjedOu/je78eeEL+/yEQod79ti8Xpi/c1wF6xsEyzuiG/lNKJ8XuLTAzgPWWGbYPNNfB77WCbdtiWZMX9/yWeP61i4Qe+nnO+deUPLjJJgFPKTNsG4GN+r/5OuBaDwCoDO2ZzA2LQjmnkvf7leL9Nf94l/r1FJkpKqfUnMHCq3Qt4eXHs0rm5uX4IrIWFhadUPzFdvPDH9/6nxb+1yMSxMNRlxm3DYK++OOcgpfQbYD//XeszEttQ996v0N4yNYCTyszbkrf6vfp7ENgcAOAi/+9NCwsLTwJuB/wmfnDSea9/+fOqdiMSGQsrnJUc3QLfsms7Hx+/AXiY3Rt4cnHOM4HnVD852eI8/7XsRygyFhYqu8jArQBemHN+jP93ZU5AiMl3Qrkv3yTz9/7Y9H9W+d1EJh7whjITt8HCblvgS//vi8L9HxfOvSTOoV+rplf9+Xt/JY0ppQ+W30tkKgDHlxm5Db5V16fsv1NKth35MAjm8ccff8u2diey+QfA/sCDer3ea4Gb4zmrEbcL1xJfmVq9Xu/YavZuHvCqwTbk1tEH3KlMQ4zO2wRbfxAX3wAvjuetlL/3l/v52X/vU95HZGoMmuZtsSdlSuk9QH9zDo/Gs2uZBl8X8Mv42bUAXlrew1gMPuuEjOculzf94yq/N8f7iEyNuCNu07zZXdl7AHgwcDfrAATOzznfA3hFec5a2aSjmu96p3ID0JWywm/x/Yqfv2dbisf7iEwNa55Xs3mz6iLxAvuWawBsdyIvnMMtutYKuDjnfPvwXY+J5y2XNfXLsN4+CrBXeX2RqQMcVc3q7QMOAj4SDj+m6REJm5RjIchs8421BCQd0fR/e/xbikwd4GVlxu4CcEQMRGIr56xvoNy9Z1LUBPi4XL3+MhOAl1Sze/uAf4wVgDvQtvSOB8epLrbfwsLCgfHvKDKVfJZep4B31rwC2HGLELRPbG6PU5zuC3w6/g1FphZweDXLty+l9BHg4/G4sTkBwIfj8XGIy3xtKFNz/WWmAIdVs337fPivPzMwsjgBgK0ObHQ68GrEuf6DVY0iM8Pm6YdM3jrv8BsuAqph03Y/EQ92qebp/6sNGzbcMf79RKbaOJbg+oKfLxc//8R2yy1+/qW/CrS6ZfdS4tPfRkvi305k6tk6/DKjd8ELuAXOGPx8jg8NludY8NDa14S21cT3s8U+mvEnswd4ejX7t88XBNl2YX0pJasMbm1Ta4tzbgSOG6wh6FJ8+vd6Pa3zl9mUcz64zOxd8JBgPy9+/r6lBfjrcN4XbNitPNa2ZJP9i3f/lJINTd4q/t1EZgLQeURee7cHri1+/sFg6S7w2eK4jcHbq0BnsQLj0x94avybicwMG3IrM3wX/B17uCzXXwf6T9mc825l4A7vIDxn+OEW1fT86+kvs832rasWg/Z5IdtQ/HyZxQQo0nRCOP/LwNXlsTbUPP0Pqf61RGYMcECZ6bvgT9rfFz/b4pphL7uHCO9HEPLf/x64sHw6N81X/JVP/0u1rZfMvNjx1pUQVusXVuhDuv4mnH9dSum68liTap7+R5TpEZlJwGPLjD8O3rzfuiZtlTUBwK/bWChU8/S/Sst9ZV0A/rJaHLpnIwIWr68mbRbDbxgr0F8dGo8XULPi77iYFpGZZGGzq8Whez4x6C4xbabmVWDRRpxr4U//8nXE5ijsFNMhMpNs/X21SHQjPHF/B+wY0zYAnDjqs2tVM+33tHh/kZkFPKJaJLoRCt0fgHvGtA34NOFvVK/QjJrWhGL8y/oBPDwUgM75zMAlA21YBWGdgPGza2GFP4T5vjDeV2Smzc/P71ktFt3z9/AHxLRFsT9grXzef1kBHBbvKTLTbJOOarEYj7m5uT+PaavT6/Ua2cjEK51y6M/WJmwT7ycy02zjzGrRGA/ri4hpG8UWCMXPr1RN59/J8T4iMw/YPRSMz9la/PJYF4BHx7SNknO2HYXPitdYiTD0Z5XBslogIjNlbm7uAeFJ+HLglGFJ6Qjw+Ji2pdi2X8A343WWo6b5f368vsi64MtvhxF4basw36ev8Rl3m3FwTNvm5Jy395WEKxKH/iz+YLy2yLpgw29l8E3gWD/e6rbhEfDcmLbl8PRfFa+3lPD0v75uGrLIugDsEgJwHGPHbX2+b93dibWsvrP39+XuLBw7/2yLsng9kXXDJ9gMm/vAGwe/yznfvQzX3SbgFdWUrYxt1b2cSsDG/sOhx8RriawbwM62AGZQGuK21zZK0EUlYK8c5X1Xw4YSrUkfrz1Q0/n3Y4X7lnVt48aNO9linKJQvC2eA9x7tT3uywW8Id53NYC9y3BjpZqZfyfEz4usK8BdU0plgM5FFYABbgOcFHvQV8ufxmVhPDHec7Xm5+f3Lyu14h7l2P+CtW7iZ0XWFR9KG4bdBt4Szyl5M/uLw1K1SjUVwCnxXmuRc37kqJaA0di/yBZbbHHTTTfd2eLtFQXjTOChwP28f+AuwB1zzrctP7ewsHAAcG5TO/cAHyiv3wRb2luGHy8BL4rni6w7Oeftyk06igIy79F4r08pXQP8DLjY+gKA8yxenxVa4IoySo8/2O2z5eQie/2OYbcqQT2A02PamuCjA5VlxB5/YGQAEpF1A9hqOcNny+UVQNxgwwq/VQr9Qu/n2Dt4WSGcGdPWFGBP4JriXp+J54isW8AHB4VjXKxVEdPVJGCPlNKXfL/B+8Tfi6xbtv2VRQcGDgIOBY4EjrYOQeucA04FPplSsm28z7ddfH3LbIvnb6G6rUm9ptGBlNLZMV0iMqE8Tt9WPopgswnvDzwMeJRtNwY8A3iBLy6ybb5PBN4DfNQ3AP2KVyQ/BS6yZnq8h4jMOM3EExEREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREZFx+H+J2wq6++I1pAAAAABJRU5ErkJggg=="

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

	GearEnabled = false,
	GearBuyAll = true,
	GearSelected = {} :: { [string]: boolean },
	GearBuyDelay = 0.2,
	GearBoughtSession = 0,

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
	MonitorShow = false,
	MonSort = "High",

	-- Performance Booster (Misc)
	PerfAfkMode = false,
	PerfBoostFps = false,

	-- Auto Claim Mailbox (Misc)
	MailAutoClaimEnabled = false,
	MailAutoClaimInterval = 35,

	-- Auto Sell Fruit (Misc): Daily Deal (bonus 2.2x, reset ~12 jam) diprioritaskan
	-- dulu tiap cycle, baru fallback ke Sell All normal kalau deal lagi kosong.
	SellDailyDealEnabled = false,
	SellAllEnabled = false,
	SellCheckInterval = 30,

	-- Anti AFK (Misc): klik asli (mousemoveabs+mouse1click, bukan cuma jiggle
	-- kursor) tiap interval biar Roblox ngga nganggap idle.
	AntiAfkEnabled = false,
	AntiAfkInterval = 45,

	-- Auto Pumpkin (Misc): place sprinkler + shovel, khusus Atlantic Giant Pumpkin
	PumpkinEnabled = false,
	PumpkinSprinkler = "Syrup Sprinkler",
	PumpkinKg = 50,
	PumpkinDelay = 0.15,
	PumpkinNoTP = false,

	-- Automatically tab: akordeon (group mana yang sedang terbuka)
	AutoOpenGroup = "Auto Shovel Fruit",

	-- Automatically Drop Item (Automatically tab)
	DropDelay = 0.25,

	DropSeedEnabled = false,
	DropSeedList = {} :: { [string]: boolean },
	DropSeedCount = 0, -- 0 = tidak dibatasi

	DropFruitEnabled = false,
	DropFruitList = {} :: { [string]: boolean },
	DropFruitRarity = {} :: { [string]: boolean },
	DropFruitMutation = {} :: { [string]: boolean },
	DropFruitMode = "Below",
	DropFruitKg = 1,
	DropFruitCount = 0,

	DropGearEnabled = false,
	DropGearList = {} :: { [string]: boolean },
	DropGearRarity = {} :: { [string]: boolean },
	DropGearCount = 0,

	DropPetEnabled = false,
	DropPetList = {} :: { [string]: boolean },
	DropPetCount = 0,
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

local function isGearTargeted(name: string): boolean
	if State.GearBuyAll then
		return true
	end
	return State.GearSelected[name] == true
end

local function gearBuyLoopFor(name: string, aliveFn): number
	local price = gearPriceByName[name]
	local bought = 0

	for _ = 1, 60 do
		if not State.GearEnabled or (aliveFn and not aliveFn()) then
			break
		end
		if getGearStock(name) <= 0 then
			break
		end

		local balBefore = getSheckles()
		if balBefore and price and balBefore < price then
			break
		end

		if not buyGear(name) then
			break
		end

		if balBefore then
			local success = false
			for _ = 1, 6 do
				task.wait(State.GearBuyDelay)
				local now = getSheckles()
				if now and now < balBefore then
					success = true
					break
				end
			end
			if success then
				bought += 1
				State.GearBoughtSession += 1
			else
				break
			end
		else
			task.wait(State.GearBuyDelay)
			bought += 1
			State.GearBoughtSession += 1
		end
	end

	return bought
end

--==============================================================
-- UI (NaruUI -- custom, bukan Fluent lagi)
--==============================================================
-- Dibangun sendiri dari Instance biasa: teks tajam (tidak ada lagi bug blur
-- Fluent saat maximize), ukuran & warna full terkontrol. API-nya sengaja dibuat
-- mirip Fluent (CreateWindow/AddTab/AddSection/AddToggle/dst) supaya seluruh
-- kode fitur di bawah ini tidak perlu diubah sama sekali.

local NaruTween = game:GetService("TweenService")

local UI_FONT = Enum.Font.GothamMedium
local UI_FONT_BOLD = Enum.Font.GothamBold
-- Tema "Lightning": hitam pekat + kuning terang, modern & kontras tinggi.
local UI_COL_BG = Color3.fromRGB(8, 8, 9)
local UI_COL_SIDEBAR = Color3.fromRGB(4, 4, 5)
local UI_COL_ROW = Color3.fromRGB(17, 17, 18)
local UI_COL_ROW2 = Color3.fromRGB(24, 24, 26)
local UI_COL_TEXT = Color3.fromRGB(250, 250, 250)
local UI_COL_DIM = Color3.fromRGB(145, 145, 148)
local UI_COL_ACCENT = Color3.fromRGB(255, 214, 10) -- kuning lightning
local UI_COL_ACCENT_DIM = Color3.fromRGB(60, 52, 10) -- kuning gelap (state terpilih, bg lembut)
local UI_COL_OFF = Color3.fromRGB(48, 48, 50)

local function uiNew(class, props, parent)
	local o = Instance.new(class)
	for k, v in pairs(props) do
		o[k] = v
	end
	if parent then
		o.Parent = parent
	end
	return o
end

local function uiCorner(radius, parent)
	return uiNew("UICorner", { CornerRadius = UDim.new(0, radius) }, parent)
end

local function uiStroke(color, thickness, parent)
	return uiNew("UIStroke", { Color = color, Thickness = thickness or 1 }, parent)
end

local Fluent = {}
Fluent.Options = {}
Fluent.Unloaded = false

function Fluent:Notify(cfg)
	if Fluent._notify then
		Fluent._notify(cfg)
	end
end

function Fluent:ToggleTransparency(_state) end

function Fluent:Destroy()
	if self.GUI then
		pcall(function() self.GUI:Destroy() end)
	end
	self.Unloaded = true
end

function Fluent:CreateWindow(cfg)
	local screenGui = uiNew("ScreenGui", {
		Name = "NaruHubGUI",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		DisplayOrder = 100,
	}, (gethui and gethui()) or game:GetService("CoreGui"))
	self.GUI = screenGui

	local size = cfg.Size or UDim2.fromOffset(720, 480)
	local main = uiNew("Frame", {
		Name = "Main",
		Size = size,
		Position = UDim2.new(0.5, 0, 0.5, 0),
		AnchorPoint = Vector2.new(0.5, 0.5),
		BackgroundColor3 = UI_COL_BG,
		BackgroundTransparency = 0.06,
		BorderSizePixel = 0,
		ClipsDescendants = true,
	}, screenGui)
	uiCorner(10, main)
	uiStroke(Color3.fromRGB(38, 38, 40), 1, main)

	local titleBar = uiNew("Frame", {
		Name = "TitleBar",
		Size = UDim2.new(1, 0, 0, 46),
		BackgroundColor3 = UI_COL_SIDEBAR,
		BorderSizePixel = 0,
	}, main)
	uiCorner(10, titleBar)
	uiNew("Frame", {
		Size = UDim2.new(1, 0, 0, 10),
		Position = UDim2.new(0, 0, 1, -10),
		BackgroundColor3 = UI_COL_SIDEBAR,
		BorderSizePixel = 0,
		ZIndex = 0,
	}, titleBar)

	local titleHolder = uiNew("Frame", {
		Name = "TitleHolder",
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 20, 0, 0),
		Size = UDim2.new(1, -150, 1, 0),
	}, titleBar)
	uiNew("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, titleHolder)
	local titleLbl = uiNew("TextLabel", {
		BackgroundTransparency = 1,
		AutomaticSize = Enum.AutomaticSize.X,
		Size = UDim2.new(0, 0, 0, 20),
		Font = UI_FONT_BOLD,
		TextSize = 17,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = UI_COL_TEXT,
		Text = cfg.Title or "Window",
		LayoutOrder = 1,
	}, titleHolder)
	local premiumBadge = uiNew("Frame", {
		BackgroundColor3 = UI_COL_ACCENT_DIM,
		Size = UDim2.fromOffset(66, 18),
		LayoutOrder = 2,
	}, titleHolder)
	uiCorner(4, premiumBadge)
	uiNew("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Font = UI_FONT_BOLD,
		TextSize = 11,
		TextColor3 = UI_COL_ACCENT,
		Text = "PREMIUM",
	}, premiumBadge)

	local function titleBtn(text, xOffsetFromRight)
		local btn = uiNew("TextButton", {
			Size = UDim2.fromOffset(28, 28),
			Position = UDim2.new(1, xOffsetFromRight, 0.5, 0),
			AnchorPoint = Vector2.new(0, 0.5),
			BackgroundColor3 = UI_COL_ROW,
			BackgroundTransparency = 0.2,
			AutoButtonColor = true,
			Font = UI_FONT_BOLD,
			TextSize = 16,
			TextColor3 = UI_COL_TEXT,
			Text = text,
		}, titleBar)
		uiCorner(6, btn)
		return btn
	end

	local closeBtn = titleBtn("\226\156\149", -36)
	local minBtn = titleBtn("\226\128\148", -72)

	local sidebar = uiNew("Frame", {
		Name = "Sidebar",
		Position = UDim2.new(0, 0, 0, 46),
		Size = UDim2.new(0, cfg.TabWidth or 150, 1, -46),
		BackgroundColor3 = UI_COL_SIDEBAR,
		BorderSizePixel = 0,
	}, main)
	local sideList = uiNew("Frame", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -12, 1, -12),
		Position = UDim2.fromOffset(6, 6),
	}, sidebar)
	uiNew("UIListLayout", {
		Padding = UDim.new(0, 4),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, sideList)

	local content = uiNew("Frame", {
		Name = "Content",
		Position = UDim2.new(0, cfg.TabWidth or 150, 0, 46),
		Size = UDim2.new(1, -(cfg.TabWidth or 150), 1, -46),
		BackgroundTransparency = 1,
	}, main)

	-- Garis horizontal: pemisah title bar dari body (sidebar + content)
	uiNew("Frame", {
		Size = UDim2.new(1, 0, 0, 1),
		Position = UDim2.new(0, 0, 0, 46),
		BackgroundColor3 = Color3.fromRGB(34, 34, 36),
		BorderSizePixel = 0,
		ZIndex = 5,
	}, main)

	-- Garis vertikal: pemisah sidebar dari content
	uiNew("Frame", {
		Size = UDim2.new(0, 1, 1, -46),
		Position = UDim2.new(0, cfg.TabWidth or 150, 0, 46),
		BackgroundColor3 = Color3.fromRGB(34, 34, 36),
		BorderSizePixel = 0,
		ZIndex = 5,
	}, main)

	do
		local dragging, dragStart, startPos = false, nil, nil
		titleBar.InputBegan:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
				dragging = true
				dragStart = input.Position
				startPos = main.Position
			end
		end)
		UserInputService.InputChanged:Connect(function(input)
			if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
				local delta = input.Position - dragStart
				main.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
			end
		end)
		UserInputService.InputEnded:Connect(function(input)
			if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
				dragging = false
			end
		end)
	end

	local Window = {}
	Window.Root = main
	Window.ContainerHolder = content
	Window.Minimize = function() end
	Window.Maximize = function() end

	local maxBtnFrame = uiNew("Frame", { Visible = false, Size = UDim2.fromOffset(0, 0) }, titleBar)
	Window.TitleBar = {
		Frame = titleBar,
		MinButton = {
			SetCallback = function(_self, fn)
				minBtn.MouseButton1Click:Connect(fn)
			end,
		},
		MaxButton = {
			Frame = maxBtnFrame,
			SetCallback = function(_self, _fn) end,
		},
		CloseButton = {
			SetCallback = function(_self, fn)
				closeBtn.MouseButton1Click:Connect(fn)
			end,
		},
	}
	closeBtn.MouseButton1Click:Connect(function()
		if onWindowClose then
			pcall(onWindowClose)
		end
		Fluent:Destroy()
	end)

	local tabs = {}
	local tabButtons = {}

	function Window:AddTab(tcfg)
		local idx = #tabs + 1
		local btn = uiNew("TextButton", {
			Size = UDim2.new(1, 0, 0, 32),
			BackgroundColor3 = idx == 1 and UI_COL_ACCENT_DIM or UI_COL_ROW,
			BackgroundTransparency = idx == 1 and 0.15 or 1,
			AutoButtonColor = false,
			Font = UI_FONT,
			TextSize = 14,
			TextColor3 = idx == 1 and UI_COL_ACCENT or UI_COL_DIM,
			Text = "   " .. (tcfg.Title or ("Tab " .. idx)),
			TextXAlignment = Enum.TextXAlignment.Left,
			LayoutOrder = idx,
		}, sideList)
		uiCorner(6, btn)
		local tabAccentBar = uiNew("Frame", {
			Size = UDim2.new(0, 3, 0.6, 0),
			Position = UDim2.new(0, 0, 0.5, 0),
			AnchorPoint = Vector2.new(0, 0.5),
			BackgroundColor3 = UI_COL_ACCENT,
			BorderSizePixel = 0,
			Visible = idx == 1,
		}, btn)
		uiCorner(2, tabAccentBar)
		tabButtons[idx] = { Btn = btn, Bar = tabAccentBar }

		local scroll = uiNew("ScrollingFrame", {
			Name = tcfg.Title or ("Tab" .. idx),
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			ScrollBarThickness = 4,
			ScrollBarImageColor3 = UI_COL_ACCENT,
			CanvasSize = UDim2.new(0, 0, 0, 0),
			AutomaticCanvasSize = Enum.AutomaticSize.Y,
			Visible = idx == 1,
		}, content)
		uiNew("UIPadding", {
			PaddingLeft = UDim.new(0, 14),
			PaddingRight = UDim.new(0, 14),
			PaddingTop = UDim.new(0, 10),
			PaddingBottom = UDim.new(0, 14),
		}, scroll)
		uiNew("UIListLayout", {
			Padding = UDim.new(0, 14),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}, scroll)

		local Tab = { ScrollFrame = scroll, Index = idx }

		btn.MouseButton1Click:Connect(function()
			Window:SelectTab(idx)
		end)

		function Tab:AddSection(title)
			-- Gaya list collapsible (kayak HipHub): baris judul + panah, klik buat
			-- buka/tutup isinya. Default tertutup, cuma nunjukin judulnya saja.
			local secFrame = uiNew("Frame", {
				BackgroundTransparency = 1,
				AutomaticSize = Enum.AutomaticSize.Y,
				Size = UDim2.new(1, 0, 0, 0),
			}, scroll)
			uiNew("UIListLayout", {
				Padding = UDim.new(0, 8),
				SortOrder = Enum.SortOrder.LayoutOrder,
			}, secFrame)

			local expanded = false

			local headerBtn = uiNew("TextButton", {
				BackgroundColor3 = UI_COL_ROW,
				BackgroundTransparency = 0.1,
				AutoButtonColor = false,
				BorderSizePixel = 0,
				Size = UDim2.new(1, 0, 0, 38),
				Text = "",
				LayoutOrder = 0,
			}, secFrame)
			uiCorner(8, headerBtn)
			uiNew("Frame", {
				BackgroundColor3 = UI_COL_ACCENT,
				Size = UDim2.new(0, 3, 0, 16),
				Position = UDim2.new(0, 12, 0.5, 0),
				AnchorPoint = Vector2.new(0, 0.5),
				BorderSizePixel = 0,
			}, headerBtn)
			uiNew("TextLabel", {
				BackgroundTransparency = 1,
				Position = UDim2.new(0, 24, 0, 0),
				Size = UDim2.new(1, -50, 1, 0),
				Font = UI_FONT_BOLD,
				TextSize = 15,
				TextXAlignment = Enum.TextXAlignment.Left,
				TextColor3 = UI_COL_TEXT,
				Text = title,
			}, headerBtn)
			local chevron = uiNew("TextLabel", {
				BackgroundTransparency = 1,
				Position = UDim2.new(1, -30, 0, 0),
				Size = UDim2.new(0, 20, 1, 0),
				Font = UI_FONT_BOLD,
				TextSize = 14,
				TextColor3 = UI_COL_ACCENT,
				Text = "\226\128\186", -- ">"
			}, headerBtn)

			local contentHolder = uiNew("Frame", {
				BackgroundColor3 = UI_COL_ROW,
				BackgroundTransparency = 0.15,
				BorderSizePixel = 0,
				AutomaticSize = Enum.AutomaticSize.Y,
				Size = UDim2.new(1, 0, 0, 0),
				Visible = false,
				LayoutOrder = 1,
			}, secFrame)
			uiCorner(8, contentHolder)
			uiNew("UIPadding", {
				PaddingLeft = UDim.new(0, 14),
				PaddingRight = UDim.new(0, 14),
				PaddingTop = UDim.new(0, 13),
				PaddingBottom = UDim.new(0, 13),
			}, contentHolder)
			uiNew("UIListLayout", {
				Padding = UDim.new(0, 10),
				SortOrder = Enum.SortOrder.LayoutOrder,
			}, contentHolder)

			headerBtn.MouseButton1Click:Connect(function()
				expanded = not expanded
				contentHolder.Visible = expanded
				chevron.Text = expanded and "\226\136\168" or "\226\128\186" -- "v" : ">"
			end)

			local Section = { Frame = contentHolder, _order = 0 }

			local function nextOrder()
				Section._order += 1
				return Section._order
			end

			local function row(height)
				return uiNew("Frame", {
					BackgroundTransparency = 1,
					Size = UDim2.new(1, 0, 0, height or 36),
					LayoutOrder = nextOrder(),
				}, contentHolder)
			end

			function Section:AddParagraph(pcfg)
				local r = row(0)
				r.AutomaticSize = Enum.AutomaticSize.Y
				uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.new(1, 0, 0, 18),
					Font = UI_FONT_BOLD,
					TextSize = 13,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextColor3 = UI_COL_TEXT,
					Text = pcfg.Title or "",
				}, r)
				local contentLbl = uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Position = UDim2.new(0, 0, 0, 18),
					Size = UDim2.new(1, 0, 0, 16),
					AutomaticSize = Enum.AutomaticSize.Y,
					Font = UI_FONT,
					TextSize = 13,
					TextWrapped = true,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextYAlignment = Enum.TextYAlignment.Top,
					TextColor3 = UI_COL_DIM,
					Text = pcfg.Content or "",
				}, r)
				uiNew("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder }, r)
				local obj = {}
				function obj:SetDesc(t)
					contentLbl.Text = t
				end
				function obj:SetContent(t)
					contentLbl.Text = t
				end
				return obj
			end

			function Section:AddButton(bcfg)
				local r = row(32)
				local btn2 = uiNew("TextButton", {
					Size = UDim2.fromScale(1, 1),
					BackgroundColor3 = UI_COL_ROW2,
					AutoButtonColor = true,
					Font = UI_FONT,
					TextSize = 13,
					TextColor3 = UI_COL_TEXT,
					Text = bcfg.Title or "Button",
				}, r)
				uiCorner(6, btn2)
				if bcfg.Callback then
					btn2.MouseButton1Click:Connect(bcfg.Callback)
				end
				return {}
			end

			function Section:AddToggle(id, tcfg2)
				local r = row(30)
				uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.new(1, -56, 1, 0),
					Font = UI_FONT,
					TextSize = 14,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextColor3 = UI_COL_TEXT,
					Text = tcfg2.Title or id,
				}, r)
				local pill = uiNew("Frame", {
					Size = UDim2.fromOffset(40, 22),
					Position = UDim2.new(1, 0, 0.5, 0),
					AnchorPoint = Vector2.new(1, 0.5),
					BackgroundColor3 = tcfg2.Default and UI_COL_ACCENT or UI_COL_OFF,
				}, r)
				uiCorner(11, pill)
				local knob = uiNew("Frame", {
					Size = UDim2.fromOffset(18, 18),
					Position = tcfg2.Default and UDim2.new(1, -2, 0.5, 0) or UDim2.new(0, 2, 0.5, 0),
					AnchorPoint = tcfg2.Default and Vector2.new(1, 0.5) or Vector2.new(0, 0.5),
					BackgroundColor3 = Color3.fromRGB(255, 255, 255),
				}, pill)
				uiCorner(9, knob)
				local click = uiNew("TextButton", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "" }, pill)

				local state = tcfg2.Default or false
				local obj = {}
				local function apply(v, fire)
					state = v
					obj.Value = v
					pill.BackgroundColor3 = v and UI_COL_ACCENT or UI_COL_OFF
					NaruTween:Create(knob, TweenInfo.new(0.12), {
						Position = v and UDim2.new(1, -2, 0.5, 0) or UDim2.new(0, 2, 0.5, 0),
						AnchorPoint = v and Vector2.new(1, 0.5) or Vector2.new(0, 0.5),
					}):Play()
					if fire then
						ConfigData[id] = v
						saveConfig()
						if tcfg2.Callback then
							tcfg2.Callback(v)
						end
					end
				end
				click.MouseButton1Click:Connect(function()
					apply(not state, true)
				end)
				function obj:SetValue(v)
					apply(v, true)
				end
				obj.Value = state
				Fluent.Options[id] = obj
				if ConfigData[id] ~= nil then
					task.defer(function()
						apply(ConfigData[id] and true or false, true)
					end)
				elseif tcfg2.Default then
					task.defer(function()
						if tcfg2.Callback then
							tcfg2.Callback(true)
						end
					end)
				end
				return obj
			end

			function Section:AddSlider(id, scfg)
				local r = row(38)
				uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.new(1, 0, 0, 16),
					Font = UI_FONT,
					TextSize = 13,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextColor3 = UI_COL_TEXT,
					Text = scfg.Title or id,
				}, r)
				local track = uiNew("Frame", {
					Position = UDim2.new(0, 0, 0, 22),
					Size = UDim2.new(1, -46, 0, 6),
					BackgroundColor3 = UI_COL_OFF,
				}, r)
				uiCorner(3, track)
				local min, max = scfg.Min or 0, scfg.Max or 100
				local rounding = scfg.Rounding or 0
				local value = scfg.Default or min
				local obj = { Value = value }
				local function pct(v)
					return math.clamp((v - min) / (max - min), 0, 1)
				end
				local fill = uiNew("Frame", {
					Size = UDim2.new(pct(value), 0, 1, 0),
					BackgroundColor3 = UI_COL_ACCENT,
				}, track)
				uiCorner(3, fill)
				local knob2 = uiNew("Frame", {
					Size = UDim2.fromOffset(14, 14),
					Position = UDim2.new(pct(value), 0, 0.5, 0),
					AnchorPoint = Vector2.new(0.5, 0.5),
					BackgroundColor3 = Color3.fromRGB(255, 255, 255),
				}, track)
				uiCorner(7, knob2)
				local valLbl = uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Position = UDim2.new(1, -40, 0, 18),
					Size = UDim2.new(0, 40, 0, 16),
					Font = UI_FONT,
					TextSize = 12,
					TextXAlignment = Enum.TextXAlignment.Right,
					TextColor3 = UI_COL_DIM,
					Text = tostring(value),
				}, r)

				local function fmt(v)
					if rounding <= 0 then
						return tostring(math.floor(v + 0.5))
					end
					local m = 10 ^ rounding
					return tostring(math.floor(v * m + 0.5) / m)
				end

				local function setFromAlpha(a, fire)
					local raw = min + (max - min) * a
					if rounding <= 0 then
						raw = math.floor(raw + 0.5)
					else
						local m = 10 ^ rounding
						raw = math.floor(raw * m + 0.5) / m
					end
					value = raw
					fill.Size = UDim2.new(pct(value), 0, 1, 0)
					knob2.Position = UDim2.new(pct(value), 0, 0.5, 0)
					valLbl.Text = fmt(value)
					obj.Value = value
					if fire then
						ConfigData[id] = value
						saveConfig()
						if scfg.Callback then
							scfg.Callback(value)
						end
					end
				end

				local dragging = false
				local click2 = uiNew("TextButton", { Size = UDim2.new(1, 0, 0, 20), Position = UDim2.new(0, 0, 0, 17), BackgroundTransparency = 1, Text = "" }, r)
				click2.MouseButton1Down:Connect(function()
					dragging = true
				end)
				UserInputService.InputEnded:Connect(function(input)
					if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
						dragging = false
					end
				end)
				UserInputService.InputChanged:Connect(function(input)
					if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
						local rel = (input.Position.X - track.AbsolutePosition.X) / math.max(track.AbsoluteSize.X, 1)
						setFromAlpha(math.clamp(rel, 0, 1), true)
					end
				end)

				function obj:SetValue(v)
					setFromAlpha(pct(v), true)
				end
				Fluent.Options[id] = obj
				if ConfigData[id] ~= nil then
					task.defer(function()
						obj:SetValue(ConfigData[id])
					end)
				end
				return obj
			end

			function Section:AddInput(id, icfg)
				local r = row(36)
				uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.new(0.55, 0, 1, 0),
					Font = UI_FONT,
					TextSize = 14,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextColor3 = UI_COL_TEXT,
					Text = icfg.Title or id,
				}, r)
				local box = uiNew("TextBox", {
					Size = UDim2.new(0.42, 0, 0, 26),
					Position = UDim2.new(1, 0, 0.5, 0),
					AnchorPoint = Vector2.new(1, 0.5),
					BackgroundColor3 = UI_COL_ROW2,
					Font = UI_FONT,
					TextSize = 13,
					TextColor3 = UI_COL_TEXT,
					PlaceholderText = icfg.Placeholder or "",
					Text = tostring(icfg.Default or ""),
					ClearTextOnFocus = false,
				}, r)
				uiCorner(6, box)
				uiNew("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, box)

				local function commit()
					local v = box.Text
					if icfg.Numeric then
						v = tostring(tonumber(v) or icfg.Default or 0)
						box.Text = v
					end
					ConfigData[id] = v
					saveConfig()
					if icfg.Callback then
						icfg.Callback(v)
					end
				end
				if icfg.Finished then
					box.FocusLost:Connect(commit)
				else
					box:GetPropertyChangedSignal("Text"):Connect(commit)
				end

				local obj = {}
				function obj:SetValue(v)
					box.Text = tostring(v)
					commit()
				end
				Fluent.Options[id] = obj
				if ConfigData[id] ~= nil then
					task.defer(function()
						obj:SetValue(ConfigData[id])
					end)
				end
				return obj
			end

			function Section:AddDropdown(id, dcfg)
				local r = row(36)
				uiNew("TextLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.new(1, 0, 0, 16),
					Font = UI_FONT,
					TextSize = 13,
					TextXAlignment = Enum.TextXAlignment.Left,
					TextColor3 = UI_COL_TEXT,
					Text = dcfg.Title or id,
				}, r)
				local head = uiNew("TextButton", {
					Position = UDim2.new(0, 0, 0, 20),
					Size = UDim2.new(1, 0, 0, 26),
					BackgroundColor3 = UI_COL_ROW2,
					AutoButtonColor = true,
					Font = UI_FONT,
					TextSize = 13,
					TextColor3 = UI_COL_TEXT,
					TextXAlignment = Enum.TextXAlignment.Left,
					Text = "  --",
				}, r)
				uiCorner(6, head)

				local values = dcfg.Values or {}
				local multi = dcfg.Multi or false
				local selected = {}

				local listGui = uiNew("ScreenGui", { Name = "NaruHubDropdown", ResetOnSpawn = false, DisplayOrder = 200 }, (gethui and gethui()) or game:GetService("CoreGui"))
				-- Backdrop full-layar, transparan, di belakang list -- klik di mana
				-- saja di luar list akan menutup dropdown (bukan cuma klik opsi).
				local backdrop = uiNew("TextButton", {
					Visible = false,
					Size = UDim2.fromScale(1, 1),
					BackgroundTransparency = 1,
					AutoButtonColor = false,
					Text = "",
					ZIndex = 49,
				}, listGui)
				local listFrame = uiNew("Frame", {
					Visible = false,
					BackgroundColor3 = UI_COL_ROW2,
					BorderSizePixel = 0,
					ZIndex = 50,
				}, listGui)
				uiCorner(6, listFrame)
				uiStroke(BRAND, 1, listFrame)

				-- Search selalu ada (bukan cuma kalau item banyak).
				local searchBox = uiNew("TextBox", {
					Position = UDim2.new(0, 4, 0, 4),
					Size = UDim2.new(1, -8, 0, 24),
					BackgroundColor3 = UI_COL_ROW,
					Font = UI_FONT,
					TextSize = 12,
					TextColor3 = UI_COL_TEXT,
					PlaceholderText = "Cari...",
					ClearTextOnFocus = false,
					ZIndex = 51,
				}, listFrame)
				uiCorner(5, searchBox)
				uiNew("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, searchBox)
				local listTop = 30

				local listScroll = uiNew("ScrollingFrame", {
					Position = UDim2.new(0, 0, 0, listTop),
					Size = UDim2.new(1, 0, 1, -listTop),
					BackgroundTransparency = 1,
					BorderSizePixel = 0,
					ScrollBarThickness = 3,
					CanvasSize = UDim2.new(0, 0, 0, 0),
					AutomaticCanvasSize = Enum.AutomaticSize.Y,
					ZIndex = 50,
				}, listFrame)
				uiNew("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder }, listScroll)

				local function headerText()
					local names = {}
					for name in pairs(selected) do
						table.insert(names, name)
					end
					table.sort(names)
					if #names == 0 then
						return "  --"
					end
					return "  " .. table.concat(names, ", ")
				end

				local optionBtns = {}

				local function fireChange()
					ConfigData[id] = multi and selected or (next(selected))
					saveConfig()
					if dcfg._onChanged then
						if multi then
							dcfg._onChanged(selected)
						else
							dcfg._onChanged((next(selected)))
						end
					end
				end

				local function setSelected(name, on)
					if not multi then
						selected = {}
					end
					selected[name] = on or nil
					head.Text = headerText()
					for n, b in pairs(optionBtns) do
						b.BackgroundColor3 = selected[n] and UI_COL_ACCENT_DIM or UI_COL_ROW2
					end
				end

				local function closeDropdown()
					listFrame.Visible = false
					backdrop.Visible = false
				end

				local function rebuildOptions()
					for _, c in ipairs(listScroll:GetChildren()) do
						if c:IsA("TextButton") then
							c:Destroy()
						end
					end
					optionBtns = {}
					for i, name in ipairs(values) do
						local ob = uiNew("TextButton", {
							Size = UDim2.new(1, 0, 0, 26),
							BackgroundColor3 = selected[name] and UI_COL_ACCENT_DIM or UI_COL_ROW2,
							AutoButtonColor = true,
							Font = UI_FONT,
							TextSize = 12,
							TextColor3 = UI_COL_TEXT,
							Text = "  " .. name,
							TextXAlignment = Enum.TextXAlignment.Left,
							LayoutOrder = i,
							ZIndex = 50,
						}, listScroll)
						optionBtns[name] = ob
						ob.MouseButton1Click:Connect(function()
							if multi then
								setSelected(name, not selected[name])
							else
								setSelected(name, true)
								closeDropdown()
							end
							fireChange()
						end)
					end
					if searchBox and searchBox.Text ~= "" then
						local q = searchBox.Text:lower()
						for name, ob in pairs(optionBtns) do
							ob.Visible = name:lower():find(q, 1, true) ~= nil
						end
					end
				end
				rebuildOptions()

				if searchBox then
					searchBox:GetPropertyChangedSignal("Text"):Connect(function()
						local q = searchBox.Text:lower()
						for name, ob in pairs(optionBtns) do
							ob.Visible = (q == "") or (name:lower():find(q, 1, true) ~= nil)
						end
					end)
				end

				backdrop.MouseButton1Click:Connect(closeDropdown)

				if dcfg.Default then
					if type(dcfg.Default) == "table" then
						for _, name in ipairs(dcfg.Default) do
							selected[name] = true
						end
					elseif type(dcfg.Default) == "string" then
						selected[dcfg.Default] = true
					end
					head.Text = headerText()
					for n, b in pairs(optionBtns) do
						b.BackgroundColor3 = selected[n] and UI_COL_ACCENT_DIM or UI_COL_ROW2
					end
				end

				head.MouseButton1Click:Connect(function()
					local opening = not listFrame.Visible
					listFrame.Visible = opening
					backdrop.Visible = opening
					if opening then
						-- Nimpa DI DALAM window (overlay konten, flush ke tepi kanan
						-- window), bukan nambah panel baru di luar window.
						local mainAbs, mainSize = main.AbsolutePosition, main.AbsoluteSize
						local listW = math.min(240, mainSize.X - 20)
						local x = mainAbs.X + mainSize.X - listW
						listFrame.Position = UDim2.fromOffset(x, mainAbs.Y)
						listFrame.Size = UDim2.fromOffset(listW, mainSize.Y)
						searchBox.Text = ""
						for _, ob in pairs(optionBtns) do
							ob.Visible = true
						end
					end
				end)

				local obj = {}
				function obj:OnChanged(fn)
					dcfg._onChanged = fn
				end
				function obj:SetValue(v)
					if type(v) == "table" then
						selected = {}
						for name, on in pairs(v) do
							if on then
								selected[name] = true
							end
						end
					else
						selected = { [v] = true }
					end
					head.Text = headerText()
					for n, b in pairs(optionBtns) do
						b.BackgroundColor3 = selected[n] and UI_COL_ACCENT_DIM or UI_COL_ROW2
					end
					fireChange()
				end
				function obj:SetValues(newValues)
					values = newValues
					rebuildOptions()
				end
				Fluent.Options[id] = obj
				if ConfigData[id] ~= nil then
					task.defer(function()
						obj:SetValue(ConfigData[id])
					end)
				elseif dcfg._onChanged and dcfg.Default then
					task.defer(fireChange)
				end
				return obj
			end

			return Section
		end

		tabs[idx] = Tab
		return Tab
	end

	function Window:SelectTab(idx)
		if type(idx) == "table" then
			idx = idx.Index
		end
		for i, t in ipairs(tabs) do
			local active = (i == idx)
			t.ScrollFrame.Visible = active
			local tb = tabButtons[i]
			tb.Btn.BackgroundColor3 = active and UI_COL_ACCENT_DIM or UI_COL_ROW
			tb.Btn.BackgroundTransparency = active and 0.15 or 1
			tb.Btn.TextColor3 = active and UI_COL_ACCENT or UI_COL_DIM
			tb.Bar.Visible = active
		end
	end

	self.Window = Window
	return Window
end

local Window = Fluent:CreateWindow({
	Title = "NaruHub",
	SubTitle = "Grow a Garden",
	TabWidth = 160,
	Size = UDim2.fromOffset(720, 480),
})

-- Urutan sesuai roadmap: Garden dulu (info kebun), baru fitur automasi,
-- lalu belanja, lalu sisanya. (Automatically = tab ke-2, dipakai di wiring
-- dropdown "Pilih Fitur" di bawah -- kalau urutan ini diubah lagi, index-nya
-- ikut diupdate.)
local Tabs = {
	Garden = Window:AddTab({ Title = "Garden" }),
	Automatically = Window:AddTab({ Title = "Automatically" }),
	Shop = Window:AddTab({ Title = "Shop" }),
	Mail = Window:AddTab({ Title = "Mail" }),
	MailFruit = Window:AddTab({ Title = "Mail Fruit" }),
	Misc = Window:AddTab({ Title = "Misc" }),
	Weather = Window:AddTab({ Title = "Weather" }),
	Settings = Window:AddTab({ Title = "Settings" }),
}

-- --- Shop tab: Shop Seed (1 fitur = 1 section, bukan dipecah-pecah) ------
local shopSeedSection = Tabs.Shop:AddSection("Shop Seed")

local seedDropdown = shopSeedSection:AddDropdown("NaruHub_Seeds", {
	Title = "Select Seed",
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

shopSeedSection:AddSlider("NaruHub_BuyDelay", {
	Title = "Buy Delay (detik)",
	Default = 0.2,
	Min = 0.1,
	Max = 1,
	Rounding = 2,
	Callback = function(v)
		State.BuyDelay = v
	end,
})

shopSeedSection:AddButton({
	Title = "Refresh Daftar Seed",
	Callback = function()
		pcall(function()
			seedDropdown:SetValues(getSeedNames())
		end)
		Fluent:Notify({ Title = "NaruHub", Content = "Daftar seed diperbarui.", Duration = 3 })
	end,
})

local StatusParagraph = shopSeedSection:AddParagraph({
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

shopSeedSection:AddToggle("NaruHub_AutoBuy", {
	Title = "Auto Buy Seed",
	Default = false,
	Callback = function(state)
		State.Enabled = state
		setStatus(state and "Auto buy aktif..." or "Dimatikan")
	end,
})

shopSeedSection:AddToggle("NaruHub_BuyAll", {
	Title = "Auto Buy All Seeds (beli semua stok)",
	Default = true,
	Callback = function(state)
		State.BuyAll = state
	end,
})

-- --- Shop tab: Shop Gear (stock realtime dari StockValues.GearShop) ------
local shopGearSection = Tabs.Shop:AddSection("Shop Gear")

local gearDropdown = shopGearSection:AddDropdown("NaruHub_Gears", {
	Title = "Select Gear",
	Values = ALL_GEAR,
	Multi = true,
	Default = {},
})

gearDropdown:OnChanged(function(value)
	local sel = {}
	for name, on in pairs(value) do
		if on then
			sel[name] = true
		end
	end
	State.GearSelected = sel
end)

shopGearSection:AddSlider("NaruHub_GearBuyDelay", {
	Title = "Buy Delay (detik)",
	Default = 0.2,
	Min = 0.1,
	Max = 1,
	Rounding = 2,
	Callback = function(v)
		State.GearBuyDelay = v
	end,
})

local GearStatusParagraph = shopGearSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setGearStatus(text: string)
	pcall(function() GearStatusParagraph:SetDesc(text) end)
	pcall(function() GearStatusParagraph:SetContent(text) end)
end

shopGearSection:AddToggle("NaruHub_AutoBuyGear", {
	Title = "Auto Buy Gear",
	Default = false,
	Callback = function(state)
		State.GearEnabled = state
		setGearStatus(state and "Auto buy aktif..." or "Dimatikan")
	end,
})

shopGearSection:AddToggle("NaruHub_GearBuyAll", {
	Title = "Auto Buy All Gear (beli semua stok)",
	Default = true,
	Callback = function(state)
		State.GearBuyAll = state
	end,
})

-- --- Mail tab: MailBox (kirim seed/pack, gear, pets) ----------------------
-- Recipient dishare 1 composer buat 3 kategori, sesuai gimana Mailbox asli
-- game kerja (Networking.Mailbox.SendBatch:Fire(userId, items, note)).
-- Dibungkus do..end supaya semua local sekali-pakai di sini dilepas lagi
-- setelah selesai (chunk utama kena limit 200 local Luau kalau enggak).
do
local BackpackSetFruitFavorite, BackpackSetPetFavorite
do
	local ok, net = pcall(function()
		return require(ReplicatedStorage.SharedModules.Networking)
	end)
	if ok and net and net.Backpack then
		BackpackSetFruitFavorite = net.Backpack.SetFruitFavorite
		BackpackSetPetFavorite = net.Backpack.SetPetFavorite
	end
end

-- Item favorit ditolak server kalau langsung di-mail -- unfavorite dulu,
-- kasih jeda dikit biar replika kesinkron, baru lanjut kirim.
local function mailClearFavorite(kind: "Fruit" | "Pet", itemKey: string)
	local remote = kind == "Fruit" and BackpackSetFruitFavorite or BackpackSetPetFavorite
	if not remote then
		return
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	pcall(function()
		remote:Fire(itemKey, false)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	task.wait(0.3)
end

local mailRecipientSection = Tabs.Mail:AddSection("Kirim ke")
mailRecipientSection:AddInput("NaruHub_MailUsername", {
	Title = "Username Tujuan",
	Default = "",
	Placeholder = "Username Roblox",
	Finished = true,
	Callback = function(v)
		State.MailUsername = v
	end,
})
local mailRecipientStatus = mailRecipientSection:AddParagraph({ Title = "Status Tujuan", Content = "Belum dicek." })
local function setMailRecipientStatus(text: string)
	pcall(function()
		mailRecipientStatus:SetDesc(text)
	end)
end
mailRecipientSection:AddButton({
	Title = "Cek Username",
	Callback = function()
		local uname = State.MailUsername or ""
		if uname == "" then
			setMailRecipientStatus("Isi username dulu.")
			return
		end
		setMailRecipientStatus("Mencari...")
		task.spawn(function()
			local userId, displayName = mailLookupUser(uname)
			if not userId then
				State.MailRecipientId = nil
				setMailRecipientStatus("Username tidak ditemukan.")
				return
			end
			State.MailRecipientId = userId
			State.MailRecipientName = displayName or uname
			setMailRecipientStatus(("Ketemu: %s (id %d)"):format(displayName or uname, userId))
		end)
	end,
})

-- Ambil daftar item mail-able dari inventory asli + map label->{Category,ItemKey,Available}.
-- p3IsFruit dipakai kalau nanti butuh dibedain (tab Fruit pakai fungsi sendiri).
local function buildMailItemList(categories: { string })
	local labels = {}
	local map = {}
	local inv = getInventoryData()
	if not inv then
		return labels, map
	end
	for _, cat in ipairs(categories) do
		local bucket = inv[cat]
		if type(bucket) == "table" then
			if cat == "Pets" then
				for petId, entry in pairs(bucket) do
					if type(entry) == "table" and entry.Id and entry.Equipped ~= true then
						local isFav = entry.IsFavorite == true
						local label = ("%s #%s%s"):format(tostring(entry.Name or "Pet"), tostring(petId):sub(1, 6), isFav and " *" or "")
						labels[#labels + 1] = label
						map[label] = { Category = cat, ItemKey = petId, Available = 1, IsFavorite = isFav }
					end
				end
			else
				for name, count in pairs(bucket) do
					if type(count) == "number" and count > 0 then
						local label = ("%s (x%d)"):format(tostring(name), count)
						labels[#labels + 1] = label
						map[label] = { Category = cat, ItemKey = name, Available = count }
					end
				end
			end
		end
	end
	table.sort(labels)
	return labels, map
end

-- Bikin 1 section "Mail <kategori>" lengkap (dropdown multi + refresh + kirim).
-- withQty = true buat kategori yang stackable (seed/gear), false buat pets (Count selalu 1).
local function buildMailCategorySection(title: string, categories: { string }, idPrefix: string, withQty: boolean)
	local section = Tabs.Mail:AddSection(title)
	local labels, map = buildMailItemList(categories)
	local dropdown = section:AddDropdown(idPrefix .. "Items", {
		Title = "Pilih item",
		Values = labels,
		Multi = true,
		Default = {},
	})
	section:AddButton({
		Title = "Refresh Daftar",
		Callback = function()
			local newLabels, newMap = buildMailItemList(categories)
			map = newMap
			dropdown:SetValues(newLabels)
		end,
	})
	local currentQty = 1
	if withQty then
		section:AddInput(idPrefix .. "Qty", {
			Title = "Jumlah per item",
			Default = "1",
			Numeric = true,
			Finished = true,
			Callback = function(v)
				currentQty = math.max(1, tonumber(v) or 1)
			end,
		})
	end
	local statusPara = section:AddParagraph({ Title = "Status", Content = "Idle" })
	local function setStatus(text: string)
		pcall(function()
			statusPara:SetDesc(text)
		end)
	end
	local selected = {}
	dropdown:OnChanged(function(value)
		selected = {}
		for name, on in pairs(value) do
			if on then
				selected[name] = true
			end
		end
	end)
	section:AddButton({
		Title = "Kirim " .. title,
		Callback = function()
			if not State.MailRecipientId then
				setStatus("Cek username tujuan dulu (section Kirim ke).")
				return
			end
			local items = {}
			for label in pairs(selected) do
				local info = map[label]
				if info then
					local count = withQty and math.min(currentQty, info.Available) or 1
					table.insert(items, { Category = info.Category, ItemKey = info.ItemKey, Count = count })
				end
			end
			if #items == 0 then
				setStatus("Pilih item dulu.")
				return
			end
			setStatus(("Mengirim %d jenis item..."):format(#items))
			task.spawn(function()
				-- Pet favorit ditolak server kalau langsung di-mail -- unfavorite dulu.
				for label in pairs(selected) do
					local info = map[label]
					if info and info.IsFavorite then
						setStatus("Unfavorite dulu...")
						mailClearFavorite("Pet", info.ItemKey)
					end
				end
				local ok, msg = mailSendBatch(State.MailRecipientId, items, "")
				setStatus((ok and "Terkirim: " or "Gagal: ") .. (msg or ""))
				if ok then
					local newLabels, newMap = buildMailItemList(categories)
					map = newMap
					dropdown:SetValues(newLabels)
					selected = {}
				end
			end)
		end,
	})
	return section
end

buildMailCategorySection("Mail Seed & Packs", MAIL_CATEGORIES_SEED, "NaruHub_MailSeed", true)
buildMailCategorySection("Mail Gear", MAIL_CATEGORIES_GEAR, "NaruHub_MailGear", true)
buildMailCategorySection("Mail Pets", MAIL_CATEGORIES_PET, "NaruHub_MailPet", false)

-- --- Mail Fruit tab (tab terpisah dari MailBox) ---------------------------
-- fruitPool: cache {label=..., Category="HarvestedFruits", ItemKey=id, Value=..}
-- dipakai bareng sama Fruit Inventory list, Cart, dan Bulk Mail biar kalau
-- satu fruit udah kepake di satu pengiriman, ga kepilih lagi di pengiriman lain.
local fruitPool = {}
local fruitLabelMap = {}

-- PENTING: fruit yang bisa di-mail TIDAK muncul di PlayerStateClient replica
-- (Data.Inventory.HarvestedFruits kosong walau tas penuh) -- itu cuma dipakai
-- buat mail seed/gear/pets. Sumber yang bener buat fruit adalah instance
-- Tool/Configuration di Backpack (dan Character kalau lagi dipegang):
--  * Tool asli: attribute HarvestedFruit=true (fruit yang cuma 1 di tas).
--  * Configuration "proxy": attribute FruitProxy=true (stack banyak fruit
--    sama, misal 20x Maple Cactus) -- TIDAK perlu di-promote dulu, Id proxy
--    bisa langsung dipakai di Mailbox.SendBatch (sudah dicoba & berhasil).
local function rebuildFruitPool()
	fruitPool = {}
	fruitLabelMap = {}
	local labels = {}
	local function scan(container: Instance?)
		if not container then
			return
		end
		for _, c in ipairs(container:GetChildren()) do
			local isFruit = c:GetAttribute("HarvestedFruit") == true or c:GetAttribute("FruitProxy") == true
			if isFruit and c:GetAttribute("PottedPlant") ~= true then
				local id = c:GetAttribute("Id")
				local fruitName = c:GetAttribute("FruitName") or c:GetAttribute("Fruit")
				if id and fruitName then
					local entry = {
						FruitName = fruitName,
						Mutation = c:GetAttribute("Mutation"),
						SizeMultiplier = c:GetAttribute("SizeMultiplier"),
					}
					local isFav = c:GetAttribute("IsFavorite") == true
					local value = mailFruitValue(id, entry)
					local mutation = entry.Mutation
					local label
					if mutation and mutation ~= "" then
						label = ("%s [%s] - %d\xC2\xA2%s"):format(fruitName, mutation, value, isFav and " *" or "")
					else
						label = ("%s - %d\xC2\xA2%s"):format(fruitName, value, isFav and " *" or "")
					end
					-- Label bisa dobel kalau ada 2 fruit identik persis; disambiguasi pake id.
					if fruitLabelMap[label] then
						label = label .. " #" .. id:sub(1, 4)
					end
					local rec = { Category = MAIL_CATEGORY_FRUIT, ItemKey = id, Value = value, Label = label, IsFavorite = isFav }
					fruitLabelMap[label] = rec
					table.insert(fruitPool, rec)
					table.insert(labels, label)
				end
			end
		end
	end
	scan(LocalPlayer:FindFirstChild("Backpack"))
	scan(LocalPlayer.Character)
	table.sort(labels)
	return labels
end

local fruitInvSection = Tabs.MailFruit:AddSection("Fruit Inventory")
local fruitDropdown = fruitInvSection:AddDropdown("NaruHub_MailFruitItems", {
	Title = "Pilih fruit",
	Values = {},
	Multi = true,
	Default = {},
})
fruitInvSection:AddButton({
	Title = "Refresh Inventory",
	Callback = function()
		local labels = rebuildFruitPool()
		local ok = pcall(function()
			fruitDropdown:SetValues(labels)
		end)
		if not ok then
			Fluent:Notify({
				Title = "NaruHub",
				Content = "Gagal refresh tampilan dropdown, coba klik sekali lagi.",
				Duration = 5,
			})
		end
	end,
})
fruitInvSection:AddButton({
	Title = "Add All Visible",
	Callback = function()
		local all = {}
		for _, rec in ipairs(fruitPool) do
			all[rec.Label] = true
		end
		fruitDropdown:SetValue(all)
	end,
})
local fruitTargetValue = 0
fruitInvSection:AddInput("NaruHub_MailFruitTarget", {
	Title = "Target Value (Sheckles)",
	Default = "0",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		fruitTargetValue = tonumber(v) or 0
	end,
})
fruitInvSection:AddButton({
	Title = "Auto Fill to Target",
	Callback = function()
		if fruitTargetValue <= 0 then
			return
		end
		local sorted = {}
		for _, rec in ipairs(fruitPool) do
			table.insert(sorted, rec)
		end
		table.sort(sorted, function(a, b)
			return a.Value > b.Value
		end)
		local total = 0
		local picked = {}
		for _, rec in ipairs(sorted) do
			if total >= fruitTargetValue then
				break
			end
			picked[rec.Label] = true
			total = total + rec.Value
		end
		fruitDropdown:SetValue(picked)
	end,
})

local fruitSelected = {}
local refreshCartLabel: () -> () -- didefinisikan di bawah (section Mail Cart), dipanggil di sini
fruitDropdown:OnChanged(function(value)
	fruitSelected = {}
	for label, on in pairs(value) do
		if on then
			fruitSelected[label] = true
		end
	end
	if refreshCartLabel then
		refreshCartLabel()
	end
end)

-- --- Mail Fruit tab: Mail Cart --------------------------------------------
local mailCartSection = Tabs.MailFruit:AddSection("Mail Cart")
mailCartSection:AddInput("NaruHub_MailFruitUsername", {
	Title = "Recipient Username",
	Default = "",
	Placeholder = "Username Roblox",
	Finished = true,
	Callback = function(v)
		State.MailUsername = v
	end,
})
local cartStatus = mailCartSection:AddParagraph({ Title = "Cart", Content = "0 fruit - 0\xC2\xA2" })
function refreshCartLabel()
	local n, total = 0, 0
	for label in pairs(fruitSelected) do
		local rec = fruitLabelMap[label]
		if rec then
			n = n + 1
			total = total + rec.Value
		end
	end
	pcall(function()
		cartStatus:SetDesc(("%d fruit - %d\xC2\xA2"):format(n, total))
	end)
end
mailCartSection:AddInput("NaruHub_MailFruitNote", {
	Title = "Note (optional)",
	Default = "",
	Placeholder = "message",
	Finished = true,
	Callback = function(v)
		State.MailFruitNote = v
	end,
})
local cartSendStatus = mailCartSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setCartStatus(text: string)
	pcall(function()
		cartSendStatus:SetDesc(text)
	end)
end
mailCartSection:AddButton({
	Title = "Send Fruit Mail",
	Callback = function()
		refreshCartLabel()
		local uname = State.MailUsername or ""
		if uname == "" then
			setCartStatus("Isi Recipient Username dulu.")
			return
		end
		local items = {}
		for label in pairs(fruitSelected) do
			local rec = fruitLabelMap[label]
			if rec then
				table.insert(items, { Category = rec.Category, ItemKey = rec.ItemKey, Count = 1 })
			end
		end
		if #items == 0 then
			setCartStatus("Cart kosong, pilih fruit dulu.")
			return
		end
		setCartStatus("Mencari user...")
		task.spawn(function()
			local userId = mailLookupUser(uname)
			if not userId then
				setCartStatus("Username tidak ditemukan.")
				return
			end
			for label in pairs(fruitSelected) do
				local rec = fruitLabelMap[label]
				if rec and rec.IsFavorite then
					setCartStatus("Unfavorite dulu...")
					mailClearFavorite("Fruit", rec.ItemKey)
				end
			end
			setCartStatus(("Mengirim %d fruit..."):format(#items))
			local ok, msg = mailSendBatch(userId, items, State.MailFruitNote or "")
			setCartStatus((ok and "Terkirim: " or "Gagal: ") .. (msg or ""))
			if ok then
				fruitDropdown:SetValues(rebuildFruitPool())
				fruitSelected = {}
				refreshCartLabel()
			end
		end)
	end,
})
refreshCartLabel()

-- --- Mail Fruit tab: Bulk Mail (banyak akun sekaligus) --------------------
local bulkMailSection = Tabs.MailFruit:AddSection("Bulk Mail")
local bulkTargetValue = 0
bulkMailSection:AddInput("NaruHub_BulkMailTarget", {
	Title = "Target Value per Akun (Sheckles)",
	Default = "0",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		bulkTargetValue = tonumber(v) or 0
	end,
})
local bulkUsernamesRaw = ""
bulkMailSection:AddInput("NaruHub_BulkMailUsernames", {
	Title = "Usernames (pisah koma/baris baru)",
	Default = "",
	Placeholder = "user1, user2, user3",
	Finished = true,
	Callback = function(v)
		bulkUsernamesRaw = v
	end,
})
local bulkStatus = bulkMailSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setBulkStatus(text: string)
	pcall(function()
		bulkStatus:SetDesc(text)
	end)
end
local bulkRunning = false
bulkMailSection:AddButton({
	Title = "Kirim Bulk Mail",
	Callback = function()
		if bulkRunning then
			return
		end
		local usernames = {}
		for part in (bulkUsernamesRaw or ""):gmatch("[^,\n]+") do
			local trimmed = part:match("^%s*(.-)%s*$")
			if trimmed ~= "" then
				table.insert(usernames, trimmed)
			end
		end
		if #usernames == 0 then
			setBulkStatus("Isi daftar username dulu.")
			return
		end
		if bulkTargetValue <= 0 then
			setBulkStatus("Isi Target Value per Akun dulu.")
			return
		end
		bulkRunning = true
		task.spawn(function()
			-- Pool lokal (urut value desc) yang dikonsumsi tiap akun, biar fruit
			-- yang udah kepake ga kekirim dobel ke akun lain.
			local pool = {}
			for _, rec in ipairs(fruitPool) do
				table.insert(pool, rec)
			end
			table.sort(pool, function(a, b)
				return a.Value > b.Value
			end)
			local poolIdx = 1
			local doneCount, failCount = 0, 0
			for i, uname in ipairs(usernames) do
				setBulkStatus(("[%d/%d] Cari %s..."):format(i, #usernames, uname))
				local userId = mailLookupUser(uname)
				if not userId then
					failCount = failCount + 1
					setBulkStatus(("[%d/%d] %s tidak ditemukan, skip."):format(i, #usernames, uname))
				else
					local items, picked, total = {}, {}, 0
					while poolIdx <= #pool and total < bulkTargetValue do
						local rec = pool[poolIdx]
						poolIdx = poolIdx + 1
						table.insert(items, { Category = rec.Category, ItemKey = rec.ItemKey, Count = 1 })
						table.insert(picked, rec)
						total = total + rec.Value
						if #items >= 20 then
							break
						end
					end
					if #items == 0 then
						setBulkStatus(("[%d/%d] Fruit habis, stop di %s."):format(i, #usernames, uname))
						break
					end
					for _, rec in ipairs(picked) do
						if rec.IsFavorite then
							setBulkStatus(("[%d/%d] Unfavorite dulu..."):format(i, #usernames))
							mailClearFavorite("Fruit", rec.ItemKey)
						end
					end
					setBulkStatus(("[%d/%d] Kirim %d fruit ke %s..."):format(i, #usernames, #items, uname))
					local ok = mailSendBatch(userId, items, State.MailFruitNote or "")
					if ok then
						doneCount = doneCount + 1
					else
						failCount = failCount + 1
					end
				end
				task.wait(1.5)
			end
			bulkRunning = false
			setBulkStatus(("Selesai. Berhasil %d, gagal %d."):format(doneCount, failCount))
			fruitDropdown:SetValues(rebuildFruitPool())
			fruitSelected = {}
			refreshCartLabel()
		end)
	end,
})

task.defer(function()
	local labels = rebuildFruitPool()
	pcall(function()
		fruitDropdown:SetValues(labels)
	end)
end)
end -- do (Mail tab scope)

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
	Default = false,
	Callback = function(s)
		State.PumpkinEnabled = s
		setPumpkinStatus(s and "Aktif..." or "Dimatikan")
	end,
})

pumpkinSection:AddToggle("NaruHub_PumpkinNoTP", {
	Title = "Disable Teleport",
	Default = false,
	Callback = function(s)
		State.PumpkinNoTP = s
	end,
})

pumpkinSection:AddToggle("NaruHub_MonitorShow", {
	Title = "Tampilkan Monitor HUD",
	Default = false,
	Callback = function(s)
		State.MonitorShow = s
		local h = (gethui and gethui()) or game:GetService("CoreGui")
		local m = h:FindFirstChild("NaruHubMonitor")
		if m then
			m.Enabled = s
		end
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
	Default = true,
	Callback = function(s)
		State.WeatherNotify = s
	end,
})

weatherSection:AddToggle("NaruHub_WeatherNotifyEnd", {
	Title = "Notif saat cuaca selesai",
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
	Default = "",
	Placeholder = "https://discord.com/api/webhooks/...",
	Finished = true,
	Callback = function(v)
		State.WebhookUrl = v or ""
	end,
})

webhookSection:AddButton({
	Title = "Test Webhook",
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

-- Catatan: dulu ada dropdown "Pilih Fitur" terpisah buat sembunyi/tampil
-- section, sekarang sudah tidak perlu -- tiap section di Automatically ini
-- sendiri sudah collapsible (klik judulnya buat expand/collapse).

local shovelSection = Tabs.Automatically:AddSection("Auto Shovel Fruit")

shovelSection:AddDropdown("NaruHub_ShovelSeeds", {
	Title = "Seed filter (kosong = semua)",
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

shovelSection:AddDropdown("NaruHub_ShovelMode", {
	Title = "Mode",
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

shovelSection:AddSlider("NaruHub_ShovelLimit", {
	Title = "Limit per pass",
	Default = 30,
	Min = 1,
	Max = 200,
	Rounding = 0,
	Callback = function(v)
		State.ShovelLimit = v
	end,
})

shovelSection:AddSlider("NaruHub_ShovelDelay", {
	Title = "Shovel Delay (detik)",
	Default = 0.2,
	Min = 0.05,
	Max = 1,
	Rounding = 2,
	Callback = function(v)
		State.ShovelDelay = v
	end,
})

local ShovelStatus = shovelSection:AddParagraph({ Title = "Status", Content = "Idle" })
local function setShovelStatus(text: string)
	pcall(function() ShovelStatus:SetDesc(text) end)
	pcall(function() ShovelStatus:SetContent(text) end)
end

shovelSection:AddToggle("NaruHub_ShovelDryRun", {
	Title = "Dry Run (aman: hitung saja, tidak menghapus)",
	Default = true,
	Callback = function(s)
		State.ShovelDryRun = s
	end,
})

shovelSection:AddToggle("NaruHub_ShovelNoTP", {
	Title = "Disable Teleport (Shovel)",
	Default = false,
	Callback = function(s)
		State.ShovelNoTP = s
	end,
})

shovelSection:AddToggle("NaruHub_ShovelEnabled", {
	Title = "Auto Shovel Fruit",
	Default = false,
	Callback = function(s)
		State.ShovelEnabled = s
		setShovelStatus(s and (State.ShovelDryRun and "DRY RUN aktif..." or "AKTIF - menghapus buah!") or "Dimatikan")
	end,
})

-- --- Automatically tab: Auto Place Sprinkler -----------------------------
local sprinklerSection = Tabs.Automatically:AddSection("Pengaturan Sprinkler")

sprinklerSection:AddToggle("NaruHub_Sprinkler", {
	Title = "Auto Place Sprinkler (satu-satu)",
	Default = false,
	Callback = function(s)
		State.SprinklerEnabled = s
	end,
})

sprinklerSection:AddSlider("NaruHub_SprinklerDelay", {
	Title = "Sprinkler Delay (detik)",
	Default = 1.5,
	Min = 0.3,
	Max = 5,
	Rounding = 1,
	Callback = function(v)
		State.SprinklerDelay = v
	end,
})

sprinklerSection:AddToggle("NaruHub_SprinklerNoTP", {
	Title = "Disable Teleport (Sprinkler)",
	Default = false,
	Callback = function(s)
		State.SprinklerNoTP = s
	end,
})

-- --- Automatically tab: Automatically Drop Item --------------------------
-- Catatan: drop = equip item lalu Networking.DroppedItem.RequestDrop:Fire(category, id),
-- sama seperti tombol drop asli game. Tidak perlu teleport (item dari inventory).

local dropDelaySection = Tabs.Automatically:AddSection("Drop Settings (semua kategori)")
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

dropSeedSection:AddInput("NaruHub_DropSeedCount", {
	Title = "Jumlah yang mau di-drop",
	Default = "0",
	Placeholder = "mis. 10",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.DropSeedCount = tonumber(v) or 0
	end,
})

dropSeedSection:AddToggle("NaruHub_DropSeedEnabled", {
	Title = "Toggle Drop Seed",
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

dropFruitSection:AddInput("NaruHub_DropFruitCount", {
	Title = "Jumlah yang mau di-drop",
	Default = "0",
	Placeholder = "mis. 10",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.DropFruitCount = tonumber(v) or 0
	end,
})

dropFruitSection:AddToggle("NaruHub_DropFruitEnabled", {
	Title = "Toggle Auto Drop Fruit",
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

dropGearSection:AddInput("NaruHub_DropGearCount", {
	Title = "Jumlah yang mau di-drop",
	Default = "0",
	Placeholder = "mis. 10",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.DropGearCount = tonumber(v) or 0
	end,
})

dropGearSection:AddToggle("NaruHub_DropGearEnabled", {
	Title = "Toggle Auto Drop Gear",
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

dropPetSection:AddInput("NaruHub_DropPetCount", {
	Title = "Jumlah yang mau di-drop",
	Default = "0",
	Placeholder = "mis. 10",
	Numeric = true,
	Finished = true,
	Callback = function(v)
		State.DropPetCount = tonumber(v) or 0
	end,
})

dropPetSection:AddToggle("NaruHub_DropPetEnabled", {
	Title = "Toggle Auto Drop Pets",
	Default = false,
	Callback = function(s)
		State.DropPetEnabled = s
		setDropPetStatus(s and "Aktif..." or "Dimatikan")
	end,
})

-- --- Garden tab: info kebun saja (read-only, tidak ada kontrol) --
local gardenInfoSection = Tabs.Garden:AddSection("Info Kebun")
local currencyLabel = "Sheckles"
do
	local ls = LocalPlayer:FindFirstChild("leaderstats")
	local stat = ls and (ls:FindFirstChild("Sheckles") or ls:FindFirstChild("Leaves"))
	if stat then
		currencyLabel = stat.Name
	end
end
local GardenSheckles = gardenInfoSection:AddParagraph({ Title = currencyLabel, Content = "-" })
local GardenPlants = gardenInfoSection:AddParagraph({ Title = "Tanaman di kebun", Content = "-" })

local function updateGardenInfo()
	local sheckles = getSheckles()
	pcall(function()
		GardenSheckles:SetDesc(sheckles and ("%s ¢"):format(tostring(sheckles)) or "-")
	end)
	pcall(function()
		GardenSheckles:SetContent(sheckles and ("%s ¢"):format(tostring(sheckles)) or "-")
	end)

	local counts, order = {}, {}
	local plot = getMyPlot()
	if plot then
		local plants = plot:FindFirstChild("Plants")
		if plants then
			for _, pl in ipairs(plants:GetChildren()) do
				local seed = pl:GetAttribute("SeedName")
				if seed then
					if not counts[seed] then
						counts[seed] = 0
						order[#order + 1] = seed
					end
					counts[seed] += 1
				end
			end
		end
	end
	table.sort(order)
	local lines = {}
	for _, name in ipairs(order) do
		lines[#lines + 1] = ("%s x%d"):format(name, counts[name])
	end
	local text = #lines > 0 and table.concat(lines, "\n") or "Tidak ada tanaman terdeteksi."
	pcall(function() GardenPlants:SetDesc(text) end)
	pcall(function() GardenPlants:SetContent(text) end)
end

-- --- Misc tab: Monitor & ESP (display, bukan bagian Auto Pumpkin) -------
local displaySection = Tabs.Misc:AddSection("Monitor & ESP")

displaySection:AddDropdown("NaruHub_MonSort", {
	Title = "Urutkan daftar buah (kg)",
	Values = { "High", "Low" },
	Multi = false,
	Default = "High",
}):OnChanged(function(v)
	State.MonSort = v
end)

displaySection:AddToggle("NaruHub_Esp", {
	Title = "Fruit ESP (kg di atas buah)",
	Default = false,
	Callback = function(s)
		State.EspEnabled = s
	end,
})

-- --- Misc tab: Performance Booster ---------------------------------------
-- AFK Mode: lepas workspace.Gardens dari tree (tetap dipegang variabel Lua,
-- jadi bisa dipasang balik) + layar hitam penuh. Boost FPS: cuma sembunyikan
-- Decal/Texture (Transparency=1), tidak menyentuh Material/warna part.
local perfSection = Tabs.Misc:AddSection("Performance Booster")

local savedGardens: Instance?
local savedGardensParent: Instance?
local afkScreenGui: ScreenGui?

local function setAfkMode(on: boolean)
	if on then
		local gardens = workspace:FindFirstChild("Gardens")
		if gardens and gardens.Parent then
			savedGardens = gardens
			savedGardensParent = gardens.Parent
			gardens.Parent = nil
		end
		if not afkScreenGui then
			afkScreenGui = Instance.new("ScreenGui")
			afkScreenGui.Name = "NaruHubAfkScreen"
			afkScreenGui.ResetOnSpawn = false
			afkScreenGui.IgnoreGuiInset = true
			afkScreenGui.DisplayOrder = 50 -- di bawah window utama (DisplayOrder 100) biar GUI tetap bisa diklik buat matiin AFK Mode
			afkScreenGui.Parent = (gethui and gethui()) or game:GetService("CoreGui")
			local blackFrame = Instance.new("Frame")
			blackFrame.Size = UDim2.fromScale(1, 1)
			blackFrame.BackgroundColor3 = Color3.new(0, 0, 0)
			blackFrame.BorderSizePixel = 0
			blackFrame.Parent = afkScreenGui

			local holder = Instance.new("Frame")
			holder.BackgroundTransparency = 1
			holder.AutomaticSize = Enum.AutomaticSize.XY
			holder.Position = UDim2.fromScale(0.5, 0.5)
			holder.AnchorPoint = Vector2.new(0.5, 0.5)
			holder.Parent = blackFrame
			local layout = Instance.new("UIListLayout")
			layout.FillDirection = Enum.FillDirection.Vertical
			layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
			layout.Padding = UDim.new(0, 10)
			layout.Parent = holder

			local logo = Instance.new("ImageLabel")
			logo.Name = "Logo"
			logo.BackgroundTransparency = 1
			logo.Size = UDim2.fromOffset(160, 160)
			logo.Image = LOGO_ASSET or ""
			logo.ScaleType = Enum.ScaleType.Fit
			logo.LayoutOrder = 1
			logo.Parent = holder

			local titleLbl = Instance.new("TextLabel")
			titleLbl.BackgroundTransparency = 1
			titleLbl.Size = UDim2.fromOffset(0, 28)
			titleLbl.AutomaticSize = Enum.AutomaticSize.X
			titleLbl.Font = Enum.Font.GothamBold
			titleLbl.TextSize = 24
			titleLbl.TextColor3 = Color3.fromRGB(230, 230, 232)
			titleLbl.Text = "AFK MODE BY NARU"
			titleLbl.LayoutOrder = 2
			titleLbl.Parent = holder

			local subLbl = Instance.new("TextLabel")
			subLbl.BackgroundTransparency = 1
			subLbl.Size = UDim2.fromOffset(0, 18)
			subLbl.AutomaticSize = Enum.AutomaticSize.X
			subLbl.Font = Enum.Font.GothamMedium
			subLbl.TextSize = 14
			subLbl.TextColor3 = Color3.fromRGB(110, 110, 115)
			subLbl.Text = "AFK Mode -- NaruHub"
			subLbl.LayoutOrder = 3
			subLbl.Parent = holder
		end
		afkScreenGui.Enabled = true
	else
		if savedGardens and savedGardensParent then
			savedGardens.Parent = savedGardensParent
		end
		savedGardens = nil
		savedGardensParent = nil
		if afkScreenGui then
			afkScreenGui.Enabled = false
		end
	end
end

perfSection:AddToggle("NaruHub_AfkMode", {
	Title = "AFK Mode (destroy garden + black screen)",
	Default = false,
	Callback = function(s)
		State.PerfAfkMode = s
		pcall(setAfkMode, s)
	end,
})

local hiddenTextures: { [Instance]: number } = {}
local textureWatchConn: RBXScriptConnection?

local function hideOneTexture(d: Instance)
	if (d:IsA("Decal") or d:IsA("Texture")) and hiddenTextures[d] == nil and d.Transparency < 1 then
		hiddenTextures[d] = d.Transparency
		d.Transparency = 1
	end
end

local function setBoostFps(on: boolean)
	if on then
		for _, d in ipairs(workspace:GetDescendants()) do
			hideOneTexture(d)
		end
		textureWatchConn = workspace.DescendantAdded:Connect(hideOneTexture)
	else
		if textureWatchConn then
			textureWatchConn:Disconnect()
			textureWatchConn = nil
		end
		for d, origT in pairs(hiddenTextures) do
			if d and d.Parent then
				pcall(function() d.Transparency = origT end)
			end
		end
		hiddenTextures = {}
	end
end

perfSection:AddToggle("NaruHub_BoostFps", {
	Title = "Boost FPS (hilangkan texture)",
	Default = false,
	Callback = function(s)
		State.PerfBoostFps = s
		task.spawn(setBoostFps, s)
	end,
})

-- --- Misc tab: Auto Claim Mailbox ------------------------------------------
-- ClaimAll:Fire() kena cooldown 30 detik di game sendiri (dicek client-side
-- di MailboxController asli) -- interval slider dikunci minimal 30 biar ga
-- nembak sia-sia pas masih cooldown.
do
	local MailboxClaimAll, MailboxClaimAllFinished
	do
		local ok, net = pcall(function()
			return require(ReplicatedStorage.SharedModules.Networking)
		end)
		if ok and net and net.Mailbox then
			MailboxClaimAll = net.Mailbox.ClaimAll
			MailboxClaimAllFinished = net.Mailbox.ClaimAllFinished
		end
	end

	-- ClaimAll:Fire() kena cooldown 30 detik oleh game sendiri (dicek
	-- client-side di MailboxController asli). Hasil beneran nyampe async
	-- lewat event ClaimAllFinished, di-listen di bawah.
	local function mailClaimAll()
		if not MailboxClaimAll then
			return false
		end
		local prev = (getIdentity and getIdentity()) or 8
		if setIdentity then
			pcall(setIdentity, 2)
		end
		local ok = pcall(function()
			MailboxClaimAll:Fire()
		end)
		if setIdentity then
			pcall(setIdentity, prev)
		end
		return ok
	end

	local mailClaimSection = Tabs.Misc:AddSection("Auto Claim Mailbox")
	local claimStatusPara = mailClaimSection:AddParagraph({ Title = "Status", Content = "Idle" })
	local function setClaimStatus(text: string)
		pcall(function()
			claimStatusPara:SetDesc(text)
		end)
	end

	pcall(function()
		MailboxClaimAllFinished.OnClientEvent:Connect(function(result)
			local claimed = 0
			if type(result) == "table" and type(result.Claimed) == "table" then
				for _ in pairs(result.Claimed) do
					claimed = claimed + 1
				end
			end
			if claimed > 0 then
				setClaimStatus(("Claimed %d gift%s (%s)"):format(claimed, claimed ~= 1 and "s" or "", os.date("%H:%M:%S")))
			elseif type(result) == "table" and type(result.Reason) == "string" and result.Reason ~= "" then
				setClaimStatus(result.Reason)
			else
				setClaimStatus("Tidak ada mail baru (" .. os.date("%H:%M:%S") .. ")")
			end
		end)
	end)

	mailClaimSection:AddSlider("NaruHub_MailAutoClaimInterval", {
		Title = "Interval Claim (detik)",
		Min = 30,
		Max = 180,
		Default = 35,
		Callback = function(v)
			State.MailAutoClaimInterval = v
		end,
	})
	mailClaimSection:AddToggle("NaruHub_MailAutoClaim", {
		Title = "Auto Claim Mailbox",
		Default = false,
		Callback = function(s)
			State.MailAutoClaimEnabled = s
			setClaimStatus(s and "Aktif, nunggu interval..." or "Dimatikan")
		end,
	})

	task.spawn(function()
		while getgenv().__NaruHubGen == MY_GEN do
			task.wait(math.max(30, State.MailAutoClaimInterval or 35))
			if State.MailAutoClaimEnabled then
				setClaimStatus("Claiming... (" .. os.date("%H:%M:%S") .. ")")
				mailClaimAll()
			end
		end
	end)
end

-- --- Misc tab: Auto Sell Fruit (Daily Deal + Normal) ------------------------
-- Daily Deal (Networking.NPCS.UseDailyDealAll) ngasih bonus ~2.2x harga
-- normal tapi reset tiap ~12 jam & cuma bisa dipake sekali per reset -- jadi
-- tiap cycle SELALU dicek dulu, baru fallback ke Sell All normal kalau lagi
-- kosong. Ini biar Auto Sell All ngga "buang" bonus daily deal yang lagi
-- ready dengan jual di harga normal duluan.
do
	local NPCS_CheckDailyDeal, NPCS_PreviewSellAll, NPCS_UseDailyDealAll, NPCS_SellAll
	do
		local ok, net = pcall(function()
			return require(ReplicatedStorage.SharedModules.Networking)
		end)
		if ok and net and net.NPCS then
			NPCS_CheckDailyDeal = net.NPCS.CheckDailyDeal
			NPCS_PreviewSellAll = net.NPCS.PreviewSellAll
			NPCS_UseDailyDealAll = net.NPCS.UseDailyDealAll
			NPCS_SellAll = net.NPCS.SellAll
		end
	end

	local function fireNPC(remote)
		if not remote then
			return nil
		end
		local prev = (getIdentity and getIdentity()) or 8
		if setIdentity then
			pcall(setIdentity, 2)
		end
		local ok, result = pcall(function()
			return remote:Fire()
		end)
		if setIdentity then
			pcall(setIdentity, prev)
		end
		if ok then
			return result
		end
		return nil
	end

	local function fmtHM(seconds: number): string
		seconds = math.max(0, math.floor(seconds))
		local h = math.floor(seconds / 3600)
		local m = math.floor((seconds % 3600) / 60)
		return ("%dj %dm"):format(h, m)
	end

	local sellSection = Tabs.Misc:AddSection("Auto Sell Fruit")
	local dealStatusPara = sellSection:AddParagraph({ Title = "Daily Deal", Content = "Mengecek..." })
	local function setDealStatus(text: string)
		pcall(function()
			dealStatusPara:SetDesc(text)
		end)
	end
	local sellStatusPara = sellSection:AddParagraph({ Title = "Status", Content = "Idle" })
	local function setSellStatus(text: string)
		pcall(function()
			sellStatusPara:SetDesc(text)
		end)
	end

	sellSection:AddSlider("NaruHub_SellCheckInterval", {
		Title = "Interval Cek (detik)",
		Min = 15,
		Max = 120,
		Default = 30,
		Callback = function(v)
			State.SellCheckInterval = v
		end,
	})
	sellSection:AddToggle("NaruHub_SellDailyDeal", {
		Title = "Auto Sell Daily Deal (bonus ~2.2x, prioritas)",
		Default = false,
		Callback = function(s)
			State.SellDailyDealEnabled = s
		end,
	})
	sellSection:AddToggle("NaruHub_SellAll", {
		Title = "Auto Sell All (harga normal, fallback)",
		Default = false,
		Callback = function(s)
			State.SellAllEnabled = s
		end,
	})

	-- Status "Daily Deal" ini nyala terus (independen dari toggle) biar user
	-- selalu bisa lihat sisa waktu reset-nya tanpa harus nyalain auto sell dulu.
	task.spawn(function()
		while getgenv().__NaruHubGen == MY_GEN do
			local deal = fireNPC(NPCS_CheckDailyDeal)
			if not deal then
				setDealStatus("Gagal cek (coba lagi nanti)")
			elseif deal.Available then
				setDealStatus("AKTIF sekarang! (bonus ~2.2x)")
			else
				setDealStatus(("Reset dalam %s"):format(fmtHM(deal.TimeRemaining or 0)))
			end
			task.wait(20)
		end
	end)

	task.spawn(function()
		while getgenv().__NaruHubGen == MY_GEN do
			task.wait(math.max(15, State.SellCheckInterval or 30))
			if State.SellDailyDealEnabled or State.SellAllEnabled then
				local preview = fireNPC(NPCS_PreviewSellAll)
				local fruitCount = (preview and preview.FruitCount) or 0
				if fruitCount <= 0 then
					setSellStatus("Tidak ada fruit buat dijual (" .. os.date("%H:%M:%S") .. ")")
				else
					local deal = State.SellDailyDealEnabled and fireNPC(NPCS_CheckDailyDeal)
					if deal and deal.Available then
						setSellStatus(("Daily Deal aktif, menjual %d fruit..."):format(fruitCount))
						local result = fireNPC(NPCS_UseDailyDealAll)
						if result and result.Success then
							setSellStatus(("Daily Deal! Terjual %d fruit seharga %s (%s)"):format(
								result.SoldCount or fruitCount, tostring(result.SellPrice), os.date("%H:%M:%S")))
						else
							setSellStatus("Daily Deal gagal, coba lagi nanti (" .. os.date("%H:%M:%S") .. ")")
						end
					elseif State.SellAllEnabled then
						setSellStatus(("Sell All normal, menjual %d fruit..."):format(fruitCount))
						local result = fireNPC(NPCS_SellAll)
						if result and result.Success then
							setSellStatus(("Terjual %d fruit (harga normal, %s)"):format(fruitCount, os.date("%H:%M:%S")))
						else
							setSellStatus("Sell All gagal, coba lagi nanti (" .. os.date("%H:%M:%S") .. ")")
						end
					elseif deal then
						setSellStatus(("Nunggu Daily Deal (~%s lagi), Auto Sell All mati"):format(fmtHM(deal.TimeRemaining or 0)))
					end
				end
			end
		end
	end)
end

-- --- Misc tab: Anti AFK ------------------------------------------------
-- Klik asli (mousemoveabs + mouse1click, input OS-level lewat executor) ke
-- titik netral layar (bukan tombol apapun) tiap interval. Ini beneran nge-
-- klik, bukan cuma jiggle kursor -- makanya kalau pas ada menu/GUI Roblox
-- lain yang lagi kebuka pas titik itu, bisa ke-close karena kena klik asli.
do
	local antiAfkSection = Tabs.Misc:AddSection("Anti AFK")
	local antiAfkStatusPara = antiAfkSection:AddParagraph({ Title = "Status", Content = "Idle" })
	local function setAntiAfkStatus(text: string)
		pcall(function()
			antiAfkStatusPara:SetDesc(text)
		end)
	end

	antiAfkSection:AddSlider("NaruHub_AntiAfkInterval", {
		Title = "Interval Klik (detik)",
		Min = 15,
		Max = 180,
		Default = 45,
		Callback = function(v)
			State.AntiAfkInterval = v
		end,
	})
	antiAfkSection:AddToggle("NaruHub_AntiAfk", {
		Title = "Anti AFK (Auto Clicker)",
		Default = false,
		Callback = function(s)
			State.AntiAfkEnabled = s
			setAntiAfkStatus(s and "Aktif, nunggu interval..." or "Dimatikan")
		end,
	})

	task.spawn(function()
		while getgenv().__NaruHubGen == MY_GEN do
			task.wait(math.max(15, State.AntiAfkInterval or 45))
			if State.AntiAfkEnabled then
				local ok = pcall(function()
					if isrbxactive and not isrbxactive() then
						setAntiAfkStatus("Window Roblox ga fokus, klik dilewati.")
						return
					end
					local cam = workspace.CurrentCamera
					local vp = (cam and cam.ViewportSize) or Vector2.new(800, 600)
					-- titik netral: tengah layar, agak ke atas dikit biar ga kena
					-- hotbar/inventory yang biasanya nempel di bawah.
					local x, y = vp.X * 0.5, vp.Y * 0.4
					if mousemoveabs then
						mousemoveabs(x, y)
					end
					if mouse1click then
						mouse1click()
					end
				end)
				setAntiAfkStatus((ok and "Klik... " or "Gagal klik ") .. os.date("%H:%M:%S"))
			end
		end
	end)
end

-- --- Settings tab ------------------------------------------------
local settingsInfoSection = Tabs.Settings:AddSection("Info")
settingsInfoSection:AddParagraph({
	Title = "NaruHub - Grow a Garden",
	Content = "Semua toggle/slider/dropdown otomatis tersimpan per-HWID dan ke-load lagi tiap execute ulang di device yang sama.",
})

local startupSection = Tabs.Settings:AddSection("Auto Start")
startupSection:AddToggle("NaruHub_AutoMinimize", {
	Title = "Auto Start Minimized",
	Default = false,
	Callback = function(s)
		State.AutoStartMinimized = s
	end,
})

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

--==============================================================
-- Logo di title bar + logo mengambang saat minimize
--==============================================================

local TILT = 0 -- tidak miring (normal)

-- (1) Logo nempel di title bar, ukuran lebih besar + ada jarak ke teks judul
pcall(function()
	local tb = Window.TitleBar.Frame
	local titleHolder = tb:FindFirstChild("TitleHolder") -- holder teks judul
	if titleHolder then
		local p, s = titleHolder.Position, titleHolder.Size
		titleHolder.Position = UDim2.new(0, 66, p.Y.Scale, p.Y.Offset)
		titleHolder.Size = UDim2.new(1, -66, s.Y.Scale, s.Y.Offset)
	end
	local titleLogo = Instance.new("ImageLabel")
	titleLogo.Name = "NaruHubTitleLogo"
	titleLogo.BackgroundTransparency = 1
	titleLogo.Size = UDim2.fromOffset(42, 42)
	titleLogo.Position = UDim2.new(0, 14, 0.5, 0)
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
logoBtn.Size = UDim2.fromOffset(76, 76)
logoBtn.Position = UDim2.new(0, 28, 0, 28) -- pojok kiri atas
logoBtn.BackgroundColor3 = Color3.fromRGB(6, 6, 7)
logoBtn.BackgroundTransparency = 0.02
logoBtn.AutoButtonColor = false
logoBtn.Rotation = TILT
logoBtn.Image = ""
logoBtn.Parent = launcher

local logoCorner = Instance.new("UICorner")
logoCorner.CornerRadius = UDim.new(1, 0)
logoCorner.Parent = logoBtn

local logoStroke = Instance.new("UIStroke")
logoStroke.Color = BRAND
logoStroke.Thickness = 1.5
logoStroke.Parent = logoBtn

local logoImg = Instance.new("ImageLabel")
logoImg.Name = "Img"
logoImg.BackgroundTransparency = 1
logoImg.Size = UDim2.fromScale(0.78, 0.78)
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
	lbl.TextSize = 30
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

if ConfigData.NaruHub_AutoMinimize then
	task.defer(function()
		pcall(function()
			setMinimized(true)
		end)
	end)
end

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
monitorGui.Enabled = State.MonitorShow
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
	pcall(function() setAfkMode(false) end)
	pcall(function() setBoostFps(false) end)
	pcall(function() Fluent:Destroy() end)
	onWindowClose = nil
	pcall(function() launcher:Destroy() end)
	pcall(function() toastGui:Destroy() end)
	pcall(function() monitorGui:Destroy() end)
	pcall(function() espGui:Destroy() end)
	for _, c in ipairs(conns) do
		pcall(function() c:Disconnect() end)
		pcall(function() c:disconnect() end)
	end
end

onWindowClose = cleanup

if STATE then
	STATE.onCleanup(cleanup)
	aliveFn = function()
		return STATE.alive() and getgenv().__NaruHubGen == MY_GEN and not Fluent.Unloaded
	end
end

task.spawn(function()
	while aliveFn() do
		pcall(updateGardenInfo)
		task.wait(3)
	end
end)

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
		task.wait(0.4)
		if not State.GearEnabled or not PurchaseGear then
			continue
		end

		local balance = getSheckles()
		local didBuy = false
		local blockedByFunds = false
		local anyTarget = false

		for _, name in ipairs(ALL_GEAR) do
			if not State.GearEnabled or not aliveFn() then
				break
			end
			if not isGearTargeted(name) then
				continue
			end
			if getGearStock(name) <= 0 then
				continue
			end
			anyTarget = true

			local price = gearPriceByName[name]
			if balance and price and balance < price then
				blockedByFunds = true
				continue
			end

			setGearStatus(("Membeli %s..."):format(name))
			local n = gearBuyLoopFor(name, aliveFn)
			if n > 0 then
				didBuy = true
				balance = getSheckles() or balance
			end
		end

		if State.GearEnabled then
			if didBuy then
				setGearStatus(("Total dibeli sesi ini: %d"):format(State.GearBoughtSession))
			elseif blockedByFunds and not anyTarget then
				setGearStatus(("Saldo kurang (%s)"):format(tostring(balance)))
			elseif blockedByFunds then
				setGearStatus(("Saldo kurang (%s) - menunggu..."):format(tostring(balance)))
			else
				setGearStatus("Menunggu restock...")
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
	local function scan(c)
		if not c then
			return
		end
		for _, t in ipairs(c:GetChildren()) do
			if t:IsA("Tool") or (t.ClassName == "Configuration" and t:GetAttribute("FruitProxy") == true) then
				list[#list + 1] = t
			end
		end
	end
	scan(LocalPlayer:FindFirstChild("Backpack"))
	scan(LocalPlayer.Character)
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

-- Auto Drop Seed -- pick (equip) -> backspace (drop) -> pick lagi -> ulang,
-- terlacak (X/Y) sampai target tercapai (0 = tidak dibatasi), lalu berhenti sendiri.
local dropSeedTotal, dropSeedWasOn = 0, false
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropSeedEnabled then
			dropSeedWasOn = false
			continue
		end
		if not dropSeedWasOn then
			dropSeedTotal = 0
			dropSeedWasOn = true
		end
		if not next(State.DropSeedList) then
			setDropSeedStatus("Pilih seed dulu (kosong = tidak drop apa-apa).")
			continue
		end
		local target = State.DropSeedCount
		if target and target > 0 and dropSeedTotal >= target then
			State.DropSeedEnabled = false
			pcall(function() Fluent.Options.NaruHub_DropSeedEnabled:SetValue(false) end)
			setDropSeedStatus(("Selesai: %d/%d seed di-drop."):format(dropSeedTotal, target))
			continue
		end
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropSeedEnabled or not aliveFn() then
				break
			end
			if target and target > 0 and dropSeedTotal >= target then
				break
			end
			local seedName = t:GetAttribute("SeedTool")
			if seedName and State.DropSeedList[seedName] then
				if dropTool(t) then
					dropSeedTotal += 1
					local suffix = (target and target > 0) and ("/" .. target) or ""
					setDropSeedStatus(("Drop %d%s seed..."):format(dropSeedTotal, suffix))
					task.wait(State.DropDelay)
				end
			end
		end
		if State.DropSeedEnabled then
			local target2 = State.DropSeedCount
			local suffix = (target2 and target2 > 0) and ("/" .. target2) or ""
			setDropSeedStatus(dropSeedTotal > 0 and ("Progress: %d%s seed di-drop."):format(dropSeedTotal, suffix) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Auto Drop Fruit
local dropFruitTotal, dropFruitWasOn = 0, false
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropFruitEnabled then
			dropFruitWasOn = false
			continue
		end
		if not dropFruitWasOn then
			dropFruitTotal = 0
			dropFruitWasOn = true
		end
		local target = State.DropFruitCount
		if target and target > 0 and dropFruitTotal >= target then
			State.DropFruitEnabled = false
			pcall(function() Fluent.Options.NaruHub_DropFruitEnabled:SetValue(false) end)
			setDropFruitStatus(("Selesai: %d/%d fruit di-drop."):format(dropFruitTotal, target))
			continue
		end
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropFruitEnabled or not aliveFn() then
				break
			end
			if target and target > 0 and dropFruitTotal >= target then
				break
			end
			if t:GetAttribute("HarvestedFruit") == true then
				local fruitName = t:GetAttribute("FruitName")
				local mutation = t:GetAttribute("Mutation")
				local weight = t:GetAttribute("Weight")
				if fruitName and fruitMatchesFilter(fruitName, mutation, weight) then
					if dropTool(t) then
						dropFruitTotal += 1
						local suffix = (target and target > 0) and ("/" .. target) or ""
						setDropFruitStatus(("Drop %d%s fruit..."):format(dropFruitTotal, suffix))
						task.wait(State.DropDelay)
					end
				end
			end
		end
		if State.DropFruitEnabled then
			local target2 = State.DropFruitCount
			local suffix = (target2 and target2 > 0) and ("/" .. target2) or ""
			setDropFruitStatus(dropFruitTotal > 0 and ("Progress: %d%s fruit di-drop."):format(dropFruitTotal, suffix) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Auto Drop Gear
local dropGearTotal, dropGearWasOn = 0, false
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropGearEnabled then
			dropGearWasOn = false
			continue
		end
		if not dropGearWasOn then
			dropGearTotal = 0
			dropGearWasOn = true
		end
		if not next(State.DropGearList) and not next(State.DropGearRarity) then
			setDropGearStatus("Pilih gear atau rarity dulu (kosong = tidak drop apa-apa).")
			continue
		end
		local target = State.DropGearCount
		if target and target > 0 and dropGearTotal >= target then
			State.DropGearEnabled = false
			pcall(function() Fluent.Options.NaruHub_DropGearEnabled:SetValue(false) end)
			setDropGearStatus(("Selesai: %d/%d gear di-drop."):format(dropGearTotal, target))
			continue
		end
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropGearEnabled or not aliveFn() then
				break
			end
			if target and target > 0 and dropGearTotal >= target then
				break
			end
			local category, gearName = getDropCategoryAndId(t)
			if category and category ~= "Seeds" and category ~= "HarvestedFruits" and category ~= "Pets" then
				if gearName and gearMatchesFilter(gearName) then
					if dropTool(t) then
						dropGearTotal += 1
						local suffix = (target and target > 0) and ("/" .. target) or ""
						setDropGearStatus(("Drop %d%s gear..."):format(dropGearTotal, suffix))
						task.wait(State.DropDelay)
					end
				end
			end
		end
		if State.DropGearEnabled then
			local target2 = State.DropGearCount
			local suffix = (target2 and target2 > 0) and ("/" .. target2) or ""
			setDropGearStatus(dropGearTotal > 0 and ("Progress: %d%s gear di-drop."):format(dropGearTotal, suffix) or "Aktif - tidak ada yang cocok.")
		end
	end
end)

-- Auto Drop Pets
local dropPetTotal, dropPetWasOn = 0, false
task.spawn(function()
	while aliveFn() do
		task.wait(1)
		if not State.DropPetEnabled then
			dropPetWasOn = false
			continue
		end
		if not dropPetWasOn then
			dropPetTotal = 0
			dropPetWasOn = true
		end
		if not next(State.DropPetList) then
			setDropPetStatus("Pilih pet dulu (kosong = tidak drop apa-apa).")
			continue
		end
		local target = State.DropPetCount
		if target and target > 0 and dropPetTotal >= target then
			State.DropPetEnabled = false
			pcall(function() Fluent.Options.NaruHub_DropPetEnabled:SetValue(false) end)
			setDropPetStatus(("Selesai: %d/%d pet di-drop."):format(dropPetTotal, target))
			continue
		end
		for _, t in ipairs(collectDropCandidates()) do
			if not State.DropPetEnabled or not aliveFn() then
				break
			end
			if target and target > 0 and dropPetTotal >= target then
				break
			end
			local petId = t:GetAttribute("PetId")
			local petName = t:GetAttribute("Pet")
			if type(petId) == "string" and petId ~= "" and petName and State.DropPetList[petName] then
				if dropTool(t) then
					dropPetTotal += 1
					local suffix = (target and target > 0) and ("/" .. target) or ""
					setDropPetStatus(("Drop %d%s pet..."):format(dropPetTotal, suffix))
					task.wait(State.DropDelay)
				end
			end
		end
		if State.DropPetEnabled then
			local target2 = State.DropPetCount
			local suffix = (target2 and target2 > 0) and ("/" .. target2) or ""
			setDropPetStatus(dropPetTotal > 0 and ("Progress: %d%s pet di-drop."):format(dropPetTotal, suffix) or "Aktif - tidak ada yang cocok.")
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
