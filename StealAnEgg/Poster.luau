--!nocheck
return function(ctx)
	local Fluent = ctx.Fluent
	local Window = ctx.Window
	local ReplicatedStorage = ctx.ReplicatedStorage
	local Workspace = ctx.Workspace
	local LocalPlayer = ctx.LocalPlayer
	local SERVER_BASE_URL = ctx.SERVER_BASE_URL
	local DEVICE_ID = ctx.DEVICE_ID
	local ACCESS_KEY_USED = ctx.ACCESS_KEY_USED

	local PosterTab = Window:AddTab({ Title = "Auto Poster" })

	local AssetEarnings = require(ReplicatedStorage.Shared.Util.AssetEarnings)
	local AssetItems = require(ReplicatedStorage.Shared.Util.AssetItems)
	local AssetRoster = require(ReplicatedStorage.Client.AssetRoster)
	local MutationsModule = require(ReplicatedStorage.Shared.Modules.Mutations)
	local EggState = require(ReplicatedStorage.Client.EggState)
	local EggRecords = require(ReplicatedStorage.Shared.Util.EggRecords)
	local HttpService = game:GetService("HttpService")

	local function getMyOwnedEggs()
		local ownedData = EggState.SyncOwnedEggs()
		for _, entry in ipairs(ownedData) do
			if entry.OwnerUserId == LocalPlayer.UserId then
				return entry.Records
			end
		end
		return {}
	end

	local POSTER_SERVER_URL = SERVER_BASE_URL .. "/generate"

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
				local texId = ""
				pcall(function()
					texId = tool.TextureId or ""
				end)
				table.insert(pets, {
					uid = tool:GetAttribute("UID"),
					name = displayName,
					category = category,
					mutations = mutations,
					rate = rate,
					weight = weight,
					textureId = texId,
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
				local texId = ""
				pcall(function()
					local model = rec.Model
					if model and model:FindFirstChildWhichIsA("Tool") then
						texId = model:FindFirstChildWhichIsA("Tool").TextureId or ""
					end
				end)
				table.insert(pets, {
					uid = rec.UID,
					name = item.Category,
					category = item.Category,
					mutations = item.Mutations or {},
					rate = rec.MoneyPerSecond or 0,
					weight = weight,
					textureId = texId,
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
		local eggs = {}
		for uid, rec in pairs(records) do
			if rec.Placement ~= nil then
				local nightCredit = 0
				pcall(function()
					nightCredit = EggRecords.CurrentNightCredit(rec)
				end)
				local remaining, ready = 0, false
				pcall(function()
					remaining = EggRecords.GrowthSecondsRemaining(rec)
				end)
				ready = remaining <= 0
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
				})
			end
		end
		table.sort(eggs, function(a, b)
			return (a.rate or 0) > (b.rate or 0)
		end)
		return eggs
	end

	local SaveModule = require(ReplicatedStorage.Shared.Save)

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

	local section = PosterTab:AddSection("Jual Akun")

	local posterServerInput = section:AddInput("StealAnEgg_PosterServerUrl", {
		Title = "Poster Server URL",
		Placeholder = "http://127.0.0.1:8765/generate",
		Default = POSTER_SERVER_URL,
		Finished = true,
	})
	local webhookInput = section:AddInput("StealAnEgg_Webhook", {
		Title = "Discord Webhook URL",
		Placeholder = "https://discord.com/api/webhooks/...",
		Default = "",
		Finished = true,
	})
	local titleInput = section:AddInput("StealAnEgg_PosterTitle", {
		Title = "Judul",
		Default = "Jual Akun GACOR",
		Finished = true,
	})
	local badgeInput = section:AddInput("StealAnEgg_PosterBadge", {
		Title = "Badge",
		Default = "AKUN DATPOL",
		Finished = true,
	})
	local checklistInput = section:AddInput("StealAnEgg_PosterChecklist", {
		Title = "Detail Acc (pisah koma)",
		Default = "Data Polos, No Topi, No Sum",
		Finished = true,
	})
	local priceInput = section:AddInput("StealAnEgg_PosterPrice", {
		Title = "Harga (opsional)",
		Placeholder = "kosongin = auto-hitung",
		Default = "",
		Finished = true,
	})
	local hargaPerBInput = section:AddInput("StealAnEgg_HargaPerB", {
		Title = "Harga per 1B/s (ribuan)",
		Placeholder = "cth: 5 (= Rp 5.000)",
		Default = "5",
		Finished = true,
	})
	local ownerInput = section:AddInput("StealAnEgg_PosterOwner", {
		Title = "Nama FB (Hak Milik, watermark)",
		Default = "Putra Ramadhan",
		Finished = true,
	})
	local discordPriceFlowToggle = section:AddToggle("StealAnEgg_DiscordPriceFlow", {
		Title = "Isi Harga di Discord (tombol + form)",
		Default = true,
	})

	local statusPara = section:AddParagraph({
		Title = "Status",
		Content = "Pastikan poster_server.py (di folder StealAnEgg) sedang jalan sebelum generate.",
	})

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
		local ratePerB = (tonumber(hargaPerBInput.Value) or 5) * 1000
		local incomeB = totalRate / 1e9
		return formatRupiah(incomeB * ratePerB)
	end

	local function generateAndSend()
		statusPara:SetContent("Mengumpulkan data akun...")

		local activePets = collectActivePets()
		local allPets = excludeActiveFromBackpack(collectBackpackPets(), activePets)
		local growingEggs = collectGrowingEggs()
		local backpackEggs = collectBackpackEggs()
		local activeLimit = 0
		pcall(function()
			activeLimit = AssetRoster.ReadWearLimit()
		end)
		local runSpeed, moneyPerSecond, kandangLevel, treadmillLevel, currentMoney = collectAccountStats()
		local autoPrice = computeAutoPrice(activePets, allPets, growingEggs, backpackEggs)
		local useDiscordPriceFlow = discordPriceFlowToggle.Value == true

		local payload = {
			title = titleInput.Value ~= "" and titleInput.Value or "Jual Akun GACOR",
			badge = badgeInput.Value,
			checklist = splitComma(checklistInput.Value or ""),
			price = useDiscordPriceFlow and "" or (priceInput.Value ~= "" and priceInput.Value or autoPrice),
			suggestedPrice = autoPrice,
			webhookUrl = webhookInput.Value,
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
			ownerFacebook = ownerInput.Value,
			sourceAccount = LocalPlayer.Name,
		}

		local body = HttpService:JSONEncode(payload)
		local serverUrl = posterServerInput.Value ~= "" and posterServerInput.Value or POSTER_SERVER_URL
		serverUrl = serverUrl:gsub("/+$", "")
		if not serverUrl:match("/generate$") then
			serverUrl = serverUrl .. "/generate"
		end

		statusPara:SetContent("Render poster + kirim ke Discord...")

		local settled = false
		task.spawn(function()
			local ok, res = pcall(function()
				return request({
					Url = serverUrl,
					Method = "POST",
					Headers = {
						["Content-Type"] = "application/json",
						["X-Device-Id"] = DEVICE_ID,
						["X-Access-Key"] = ACCESS_KEY_USED,
					},
					Body = body,
				})
			end)
			if settled then
				return
			end
			settled = true
			if not ok then
				statusPara:SetContent("Gagal konek ke poster server: " .. tostring(res))
				return
			end
			if res.StatusCode == 200 then
				statusPara:SetContent("Berhasil! Poster sudah dikirim ke Discord (kalau webhook diisi) dan disimpan di StealAnEgg/last_poster.png.")
			else
				statusPara:SetContent(("Gagal (HTTP %s): %s"):format(tostring(res.StatusCode), tostring(res.Body or "")))
			end
		end)
		task.delay(60, function()
			if settled then
				return
			end
			settled = true
			statusPara:SetContent("Timeout 60 detik, ga ada respon dari '" .. serverUrl .. "'. Cek: server masih nyala? Kalau pakai hosting gratis, coba generate ulang (bisa jadi baru \"bangun\" dari sleep). Kalau local: HP & PC di WiFi yang sama? Ada firewall yang blokir?")
		end)
	end

	section:AddButton({ Title = "Generate & Kirim ke Discord", Callback = generateAndSend })

	------------------------------------------------------------
	-- Monitor Lokal (Dashboard)
	------------------------------------------------------------
	local monitorSection = PosterTab:AddSection("Monitor Lokal (Dashboard)")

	monitorSection:AddParagraph({
		Title = "Device ID kamu",
		Content = DEVICE_ID .. "\n\nDikirim ke server bareng tiap laporan monitor, buat identifikasi device -- "
			.. "ga ngaruh ke akses (akses sepenuhnya dari access key).",
	})

	local monitorUrlInput = monitorSection:AddInput("StealAnEgg_MonitorUrl", {
		Title = "Monitor Server URL (kosongin = pakai domain Poster Server di atas)",
		Placeholder = "http://127.0.0.1:8765/monitor",
		Default = "",
		Finished = true,
	})

	local monitorStatusPara = monitorSection:AddParagraph({
		Title = "Status",
		Content = "-",
	})

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
					textureId = p.textureId or "",
				})
			end

			local activeLimit = 0
			pcall(function()
				activeLimit = AssetRoster.ReadWearLimit()
			end)
			local autoPrice = computeAutoPrice(activePets, allPets, growingEggs, backpackEggs)
			local useDiscordPriceFlow = discordPriceFlowToggle.Value == true

			local fullData = {
				title = titleInput.Value ~= "" and titleInput.Value or "Jual Akun GACOR",
				badge = badgeInput.Value,
				checklist = splitComma(checklistInput.Value or ""),
				price = useDiscordPriceFlow and "" or (priceInput.Value ~= "" and priceInput.Value or autoPrice),
				suggestedPrice = autoPrice,
				webhookUrl = webhookInput.Value,
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
				ownerFacebook = ownerInput.Value,
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
			local url = monitorUrlInput.Value
			if url == "" then
				local base = posterServerInput.Value ~= "" and posterServerInput.Value or POSTER_SERVER_URL
				base = base:gsub("/+$", ""):gsub("/generate$", "")
				url = base ~= "" and (base .. "/monitor") or "http://127.0.0.1:8765/monitor"
			end
			request({
				Url = url,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["X-Device-Id"] = DEVICE_ID,
					["X-Access-Key"] = ACCESS_KEY_USED,
				},
				Body = body,
			})
		end)
		if ok then
			monitorStatusPara:SetContent("Terakhir lapor: " .. os.date("%H:%M:%S"))
		else
			monitorStatusPara:SetContent("Gagal lapor: " .. tostring(err))
		end
	end

	local monitorRunning = false
	monitorSection:AddToggle("StealAnEgg_MonitorReport", {
		Title = "Auto Report ke Dashboard (tiap 15 detik)",
		Default = true,
		Callback = function(enabled)
			monitorRunning = enabled
			if enabled then
				task.spawn(function()
					while monitorRunning and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
						pcall(reportToMonitor)
						task.wait(15)
					end
				end)
			end
		end,
	})

	monitorSection:AddButton({ Title = "Lapor Sekarang", Callback = reportToMonitor })
end
