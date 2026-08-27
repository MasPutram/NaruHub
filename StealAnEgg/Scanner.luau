--!nocheck
return function(ctx)
	local Fluent = ctx.Fluent
	local Window = ctx.Window
	local ReplicatedStorage = ctx.ReplicatedStorage
	local Workspace = ctx.Workspace
	local LocalPlayer = ctx.LocalPlayer
	local EggState = require(ReplicatedStorage.Client.EggState)
	local EggRecords = require(ReplicatedStorage.Shared.Util.EggRecords)
	local formatSeconds = ctx.formatSeconds
	local mutationLabel = ctx.mutationLabel
	local getGrowthInfo = ctx.getGrowthInfo

	local function getMyOwnedEggs()
		local ownedData = EggState.SyncOwnedEggs()
		for _, entry in ipairs(ownedData) do
			if entry.OwnerUserId == LocalPlayer.UserId then
				return entry.Records
			end
		end
		return {}
	end

	local Tab = Window:AddTab({ Title = "Scanner" })

	------------------------------------------------------------
	-- 1. Scan Isi Tas
	------------------------------------------------------------
	do
		local section = Tab:AddSection("Scan Isi Tas")
		local bagPara = section:AddParagraph({
			Title = "Ringkasan Tas",
			Content = "Klik \"Scan Tas Sekarang\" buat mulai.",
		})

		local function scanBag()
			local backpack = LocalPlayer:FindFirstChildOfClass("Backpack")
			if not backpack then
				bagPara:SetContent("Backpack tidak ditemukan.")
				return
			end

			local groups = {}
			local order = {}
			local total = 0

			for _, tool in ipairs(backpack:GetChildren()) do
				total += 1
				local itemType = tool:GetAttribute("ItemType")
				local category = tool:GetAttribute("Category") or tool:GetAttribute("GearName") or tool.Name
				local mutation = tool:GetAttribute("Mutations")
				local label = category
				if mutation and mutation ~= "" then
					label = label .. " [" .. mutation .. "]"
				end
				if itemType then
					label = label .. " (" .. itemType .. ")"
				end
				if not groups[label] then
					groups[label] = 0
					table.insert(order, label)
				end
				groups[label] += 1
			end

			table.sort(order)
			local lines = {}
			for _, label in ipairs(order) do
				table.insert(lines, string.format("%dx %s", groups[label], label))
			end

			bagPara:SetContent(string.format(
				"Total item: %d\n%s",
				total,
				#lines > 0 and table.concat(lines, "\n") or "(kosong)"
			))
		end

		section:AddButton({ Title = "Scan Tas Sekarang", Callback = scanBag })

		local AssetEarnings = require(ReplicatedStorage.Shared.Util.AssetEarnings)
		local AssetRoster = require(ReplicatedStorage.Client.AssetRoster)
		local MutationsModule = require(ReplicatedStorage.Shared.Modules.Mutations)

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

		local function autoEquipEmptySlots()
			local backpack = LocalPlayer:FindFirstChildOfClass("Backpack")
			if not backpack then
				return
			end
			local limit = 0
			pcall(function()
				limit = AssetRoster.ReadWearLimit()
			end)
			if limit <= 0 then
				return
			end

			local activeRecords = AssetRoster.ReadOwnerPen(LocalPlayer.UserId)
			local activeCount = 0
			for _ in pairs(activeRecords) do
				activeCount += 1
			end
			if activeCount >= limit then
				return
			end

			local candidates = {}
			for _, tool in ipairs(backpack:GetChildren()) do
				if tool:GetAttribute("ItemType") == "Asset" then
					local uid = tool:GetAttribute("UID")
					if uid and not activeRecords[uid] then
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
						table.insert(candidates, { uid = uid, rate = rate })
					end
				end
			end
			table.sort(candidates, function(a, b)
				return a.rate > b.rate
			end)

			local ci = 1
			while activeCount < limit and ci <= #candidates do
				if AssetRoster.WearAsset(candidates[ci].uid) then
					activeCount += 1
				end
				ci += 1
			end
		end

		local function autoUnequipAll()
			local activeRecords = AssetRoster.ReadOwnerPen(LocalPlayer.UserId)
			local uids = {}
			for uid in pairs(activeRecords) do
				table.insert(uids, uid)
			end
			for i, uid in ipairs(uids) do
				AssetRoster.DoffAsset(uid)
				if i < #uids then
					task.wait(0.2)
				end
			end
		end

		local autoEquipRunning = false
		section:AddToggle("StealAnEgg_AutoEquip", {
			Title = "Auto Equip",
			Default = false,
			Callback = function(enabled)
				autoEquipRunning = enabled
				if enabled then
					task.spawn(function()
						while autoEquipRunning and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
							pcall(autoEquipEmptySlots)
							task.wait(5)
						end
					end)
				end
			end,
		})

		local autoUnequipRunning = false
		section:AddToggle("StealAnEgg_AutoUnequip", {
			Title = "Auto Un-equip All",
			Default = false,
			Callback = function(enabled)
				autoUnequipRunning = enabled
				if enabled then
					task.spawn(function()
						while autoUnequipRunning and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
							pcall(autoUnequipAll)
							task.wait(2)
						end
					end)
				end
			end,
		})

		section:AddParagraph({
			Title = "Catatan",
			Content = "Auto Equip ngisi slot kosong tiap 5 detik. Auto Un-equip All lepas semua pet aktif tiap 2 detik.",
		})

		local function formatMoney(v)
			v = v or 0
			local abs = math.abs(v)
			if abs >= 1e12 then
				return string.format("$%.1fT/s", v / 1e12)
			elseif abs >= 1e9 then
				return string.format("$%.1fB/s", v / 1e9)
			elseif abs >= 1e6 then
				return string.format("$%.1fM/s", v / 1e6)
			elseif abs >= 1e3 then
				return string.format("$%.1fK/s", v / 1e3)
			end
			return string.format("$%d/s", v)
		end

		local incomePara = section:AddParagraph({
			Title = "Total Income Pet Aktif",
			Content = "Klik \"Cek Income Aktif\" atau nyalain Auto Equip/Un-equip buat mulai.",
		})

		local function refreshActiveIncome()
			local activeRecords = AssetRoster.ReadOwnerPen(LocalPlayer.UserId)
			local total, count = 0, 0
			for _, rec in pairs(activeRecords) do
				total += rec.MoneyPerSecond or 0
				count += 1
			end
			local limit = 0
			pcall(function()
				limit = AssetRoster.ReadWearLimit()
			end)
			incomePara:SetContent(string.format(
				"%d/%d Active -- Total: %s",
				count, limit, formatMoney(total)
			))
		end

		section:AddButton({ Title = "Cek Income Pet Aktif Sekarang", Callback = refreshActiveIncome })
	end

	------------------------------------------------------------
	-- 2 & 3. Monitor Telur di Kandang + Prediksi Hatch Berikutnya
	------------------------------------------------------------
	do
		local section = Tab:AddSection("Monitor Telur & Kandang")
		local monitorPara = section:AddParagraph({
			Title = "Telur di Kandang",
			Content = "Klik \"Scan Kandang Sekarang\" atau aktifkan Auto Monitor.",
		})
		local forecastPara = section:AddParagraph({
			Title = "Prediksi Hatch Berikutnya",
			Content = "-",
		})

		local function refreshEggs()
			local records = getMyOwnedEggs()
			local growing = {}

			for uid, rec in pairs(records) do
				if rec.Placement ~= nil then
					local remaining, ready = getGrowthInfo(rec)
					table.insert(growing, {
						uid = uid,
						species = rec.AssetCategory or "?",
						mutation = mutationLabel(rec.Mutations),
						remaining = remaining,
						ready = ready,
					})
				end
			end

			table.sort(growing, function(a, b)
				return a.remaining < b.remaining
			end)

			if #growing == 0 then
				monitorPara:SetContent("Tidak ada telur yang sedang ditaruh di kandang.")
				forecastPara:SetContent("-")
				return
			end

			local lines = {}
			for _, g in ipairs(growing) do
				local status = g.ready and "SIAP MENETAS!" or formatSeconds(g.remaining)
				local speciesLabel = g.mutation and (g.species .. " [" .. g.mutation .. "]") or g.species
				table.insert(lines, string.format("%s -- %s", speciesLabel, status))
			end
			monitorPara:SetContent(table.concat(lines, "\n"))

			local soonest = growing[1]
			local soonestLabel = soonest.mutation and (soonest.species .. " [" .. soonest.mutation .. "]") or soonest.species
			if soonest.ready then
				forecastPara:SetContent(soonestLabel .. " sudah SIAP dihatch sekarang!")
			else
				forecastPara:SetContent(soonestLabel .. " dalam " .. formatSeconds(soonest.remaining))
			end
		end

		section:AddButton({ Title = "Scan Kandang Sekarang", Callback = refreshEggs })

		local autoRunning = false
		section:AddToggle("StealAnEgg_AutoMonitor", {
			Title = "Auto Monitor (tiap 3 detik)",
			Default = false,
			Callback = function(enabled)
				autoRunning = enabled
				if enabled then
					task.spawn(function()
						while autoRunning and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
							pcall(refreshEggs)
							task.wait(3)
						end
					end)
				end
			end,
		})

		section:AddParagraph({
			Title = "Catatan",
			Content = "Spesies & mutasi telur sudah ditentukan server sejak ditaruh -- cuma "
				.. "disembunyikan visualnya sampai animasi hatch selesai. Panel di atas "
				.. "membaca data itu langsung, jadi kelihatan sebelum telurnya benar-benar menetas.",
		})
	end

	------------------------------------------------------------
	-- 3.5. Auto Upgrade Kandang & Treadmill
	------------------------------------------------------------
	do
		local BaseUpgrade = require(ReplicatedStorage.Client.BaseUpgrade)
		local TreadmillClient = require(LocalPlayer.PlayerScripts.GUI.TreadmillUpgrade.Client)
		local SaveModule = require(ReplicatedStorage.Shared.Save)

		local section = Tab:AddSection("Auto Upgrade Kandang & Treadmill")

		local kandangTargetInput = section:AddInput("StealAnEgg_KandangTarget", {
			Title = "Target Level Kandang",
			Placeholder = "cth: 15",
			Default = "",
			Finished = true,
		})
		local treadmillTargetInput = section:AddInput("StealAnEgg_TreadmillTarget", {
			Title = "Target Level Treadmill",
			Placeholder = "cth: 12",
			Default = "",
			Finished = true,
		})

		local function parseTarget(input)
			local n = tonumber(input.Value)
			if n and n > 0 then
				return math.floor(n)
			end
			return math.huge
		end

		local upgradeStatusPara = section:AddParagraph({
			Title = "Status Upgrade",
			Content = "-",
		})

		local function tryUpgradeKandang()
			local stats = SaveModule.Get()
			local target = parseTarget(kandangTargetInput)
			if stats.BaseUpgradeLevel >= target then
				return "Kandang: udah di target (Lv." .. stats.BaseUpgradeLevel .. ")"
			end
			local nextLevel, config = BaseUpgrade.ResolveNextTier(stats)
			if not nextLevel or not config then
				return "Kandang: udah MAX level (Lv." .. stats.BaseUpgradeLevel .. ")"
			end
			if nextLevel > target then
				return "Kandang: nyampe target di Lv." .. stats.BaseUpgradeLevel
			end
			if not BaseUpgrade.IsNextTierAffordable(stats) then
				return "Kandang: uang kurang buat Lv." .. nextLevel .. " (butuh $" .. tostring(config.Cost) .. ")"
			end
			BaseUpgrade.PurchaseNextTier()
			return "Kandang: upgrade ke Lv." .. nextLevel .. " diminta"
		end

		local function tryUpgradeTreadmill()
			local stats = SaveModule.Get()
			local target = parseTarget(treadmillTargetInput)
			if stats.TreadmillUpgradeLevel >= target then
				return "Treadmill: udah di target (Lv." .. stats.TreadmillUpgradeLevel .. ")"
			end
			local nextLevel, config = TreadmillClient.GetNextConfig(stats)
			if not nextLevel or not config then
				return "Treadmill: udah MAX level (Lv." .. stats.TreadmillUpgradeLevel .. ")"
			end
			if nextLevel > target then
				return "Treadmill: nyampe target di Lv." .. stats.TreadmillUpgradeLevel
			end
			if not TreadmillClient.CanAffordNext(stats) then
				return "Treadmill: uang kurang buat Lv." .. nextLevel .. " (butuh $" .. tostring(config.Price) .. ")"
			end
			TreadmillClient.RequestCashUpgrade()
			return "Treadmill: upgrade ke Lv." .. nextLevel .. " diminta"
		end

		local autoUpgradeRunning = false
		section:AddToggle("StealAnEgg_AutoUpgrade", {
			Title = "Auto Upgrade",
			Default = false,
			Callback = function(enabled)
				autoUpgradeRunning = enabled
				if enabled then
					task.spawn(function()
						while autoUpgradeRunning and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
							local kOk, kMsg = pcall(tryUpgradeKandang)
							local tOk, tMsg = pcall(tryUpgradeTreadmill)
							upgradeStatusPara:SetContent(
								(kOk and kMsg or ("Kandang: error - " .. tostring(kMsg)))
									.. "\n"
									.. (tOk and tMsg or ("Treadmill: error - " .. tostring(tMsg)))
							)
							task.wait(5)
						end
					end)
				end
			end,
		})

		section:AddParagraph({
			Title = "Catatan",
			Content = "Cek tiap 5 detik. Target dibaca dari input di atas tiap kali cek (ganti kapan aja, ga perlu "
				.. "matiin toggle dulu). Kosongin field = upgrade terus sampai level MAX beneran. "
				.. "Loop otomatis berhenti minta upgrade begitu level sekarang udah >= target atau "
				.. "udah MAX, tapi toggle-nya sendiri tetap nyala (buat terus mantau kalau kamu naikin target).",
		})
	end

	------------------------------------------------------------
	-- 3b. Deteksi Hasil Fuse
	------------------------------------------------------------
	do
		local section = Tab:AddSection("Deteksi Hasil Fuse")

		local fusePara = section:AddParagraph({
			Title = "Hasil Fuse Terakhir",
			Content = "Belum ada -- otomatis muncul begitu kamu fuse pet.",
		})

		local FuseMachineSignals = require(ReplicatedStorage.Client.FuseMachineSignals)
		local AssetEarnings = require(ReplicatedStorage.Shared.Util.AssetEarnings)
		local AssetItems = require(ReplicatedStorage.Shared.Util.AssetItems)

		local function formatRate(v)
			v = v or 0
			local abs = math.abs(v)
			if abs >= 1e12 then
				return string.format("$%.2fT/s", v / 1e12)
			elseif abs >= 1e9 then
				return string.format("$%.2fB/s", v / 1e9)
			elseif abs >= 1e6 then
				return string.format("$%.2fM/s", v / 1e6)
			elseif abs >= 1e3 then
				return string.format("$%.2fK/s", v / 1e3)
			end
			return string.format("$%d/s", v)
		end

		local function formatFuseResult(result)
			local rate = 0
			pcall(function()
				rate = AssetEarnings.RatePerSecond({
					Category = result.AssetCategory,
					Scale = result.AssetScale,
					Mutations = result.Mutations or {},
				})
			end)
			local weight = 0
			pcall(function()
				weight = AssetItems.WeightKg({
					Category = result.AssetCategory,
					Scale = result.AssetScale,
					Mutations = result.Mutations or {},
				})
			end)
			local mutText = (result.Mutations and #result.Mutations > 0) and table.concat(result.Mutations, ", ") or "Tidak ada"
			return string.format(
				"%s\nBerat: %.2f Kg\nRate: %s\nMutasi: %s\nJam: %s",
				result.AssetCategory or "?",
				weight,
				formatRate(rate),
				mutText,
				os.date("%H:%M:%S")
			)
		end

		local ok, err = pcall(function()
			FuseMachineSignals.FuseStarted:Connect(function(result)
				local formatOk, content = pcall(formatFuseResult, result)
				fusePara:SetContent(formatOk and content or ("Fuse kedeteksi tapi gagal diformat: " .. tostring(content)))
			end)
		end)
		if not ok then
			fusePara:SetContent("Gagal pasang detector: " .. tostring(err))
		end

		local SCALE_TIER_TABLE = {
			{ min = 0.1, max = 0.2, weight = 5 },
			{ min = 0.3, max = 0.45, weight = 18 },
			{ min = 0.85, max = 1.05, weight = 2000 },
			{ min = 1.45, max = 1.55, weight = 250 },
			{ min = 1.9, max = 2.1, weight = 125 },
			{ min = 2.85, max = 3.15, weight = 62.5 },
			{ min = 3.8, max = 4.2, weight = 31.25 },
			{ min = 5.8, max = 6.2, weight = 15.625 },
			{ min = 9.5, max = 12.5, weight = 3 },
			{ min = 12, max = 17, weight = 0.05 },
			{ min = 20, max = 35, weight = 0.0001 },
		}
		local DOUBLE_BONUS_CHANCE = 0.01
		local DOUBLE_BONUS_CAP = 150

		local function tierWeightMultiplier(avgScale, tierMin, tierMax)
			local tierMid = (tierMin + tierMax) / 2
			local logAvg = math.log(avgScale) / math.log(2)
			local logMid = math.log(tierMid) / math.log(2)
			return math.exp(logAvg * logMid * 0.6)
		end

		local function computeFuseOdds(scales)
			local avgScale = (scales[1] + scales[2] + scales[3]) / 3
			local total = 0
			local adjusted = {}
			for _, tier in ipairs(SCALE_TIER_TABLE) do
				local mult = tierWeightMultiplier(avgScale, tier.min, tier.max)
				local w = tier.weight * mult
				table.insert(adjusted, { min = tier.min, max = tier.max, weight = w })
				total += w
			end
			return adjusted, total, avgScale
		end

		local fuseOddsPara = section:AddParagraph({
			Title = "Peluang Fuse (dari 3 pet di slot sekarang)",
			Content = "Klik \"Hitung Peluang Sekarang\" -- taruh dulu 3 pet di mesin fuse.",
		})

		local function hitungPeluangFuse()
			local SaveModule = require(ReplicatedStorage.Shared.Save)
			local ok2, stats = pcall(SaveModule.Get)
			if not ok2 or not stats or not stats.Inventory then
				fuseOddsPara:SetContent("Gagal baca data akun.")
				return
			end

			local scales, category = {}, nil
			for _, item in pairs(stats.Inventory) do
				if item.InFuse == true then
					table.insert(scales, item.Scale)
					category = category or item.Category
				end
			end

			if #scales ~= 3 then
				fuseOddsPara:SetContent(string.format(
					"Baru %d/3 slot keisi -- taruh dulu 3 pet kategori sama di mesin fuse.",
					#scales
				))
				return
			end

			local adjusted, total, avgScale = computeFuseOdds(scales)
			local lines = {}
			for _, tier in ipairs(adjusted) do
				local pct = (tier.weight / total) * 100
				table.insert(lines, string.format("%.2f-%.2fx: %s", tier.min, tier.max,
					pct < 0.01 and string.format("%.4f%%", pct) or string.format("%.2f%%", pct)))
			end

			fuseOddsPara:SetContent(string.format(
				"%s | Rata2 scale input: %.2f\n%s\n+ Bonus: tiap hasil ada ~1%% peluang di-dobel lagi (berulang, dibatasi scale 150) -- di luar tabel di atas.",
				category or "?",
				avgScale,
				table.concat(lines, "\n")
			))
		end

		section:AddButton({ Title = "Hitung Peluang Sekarang", Callback = hitungPeluangFuse })
	end
end
