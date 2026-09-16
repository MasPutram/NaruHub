--!nocheck
return function(ctx)
	local Fluent = ctx.Fluent
	local Window = ctx.Window
	local ReplicatedStorage = ctx.ReplicatedStorage
	local Workspace = ctx.Workspace
	local LocalPlayer = ctx.LocalPlayer

	local MiscTab = Window:AddTab({ Title = "Misc" })

	------------------------------------------------------------
	-- Auto Treadmill
	------------------------------------------------------------
	do
		local section = MiscTab:AddSection("Auto Treadmill")

		local statusPara = section:AddParagraph({
			Title = "Status",
			Content = "-",
		})

		local function setStatus(msg)
			pcall(function()
				statusPara:SetContent(tostring(msg))
			end)
		end

		local PlotState = require(ReplicatedStorage.Client.PlotState)

		local function boardTreadmillOnce()
			local char = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
			local hrp = char:WaitForChild("HumanoidRootPart", 10)
			if not hrp then
				setStatus("Gagal: HumanoidRootPart ga ketemu.")
				return false
			end

			local ok, slot = pcall(function()
				return PlotState.ResolveLocalSlot()
			end)
			if not ok or not slot then
				setStatus("Gagal: plot sendiri belum kebaca.")
				return false
			end

			local renderName = "TreadmillRender_" .. tostring(slot)
			local rendersFolder = Workspace:WaitForChild("__ClientTreadmillRenders", 10)
			if not rendersFolder then
				setStatus("Gagal: render treadmill belum muncul (folder ga ada).")
				return false
			end

			local render = rendersFolder:FindFirstChild(renderName)
			local waited = 0
			while not render and waited < 15 do
				task.wait(0.5)
				waited += 0.5
				render = rendersFolder:FindFirstChild(renderName)
			end
			if not render then
				setStatus("Gagal: " .. renderName .. " ga muncul dalam 15 detik.")
				return false
			end

			local root = render:WaitForChild("Root", 5)
			if not root then
				setStatus("Gagal: Root treadmill ga ketemu.")
				return false
			end

			hrp.CFrame = root.CFrame
			setStatus("Berhasil naik treadmill (slot " .. tostring(slot) .. ").")
			return true
		end

		local hasBoarded = false
		section:AddToggle("StealAnEgg_AutoTreadmill", {
			Title = "Auto Treadmill (naik sekali di awal)",
			Default = true,
			Callback = function(enabled)
				if not enabled or hasBoarded then
					return
				end
				hasBoarded = true
				task.spawn(function()
					if not LocalPlayer.Character then
						LocalPlayer.CharacterAdded:Wait()
					end
					task.wait(1)
					boardTreadmillOnce()
				end)
			end,
		})
	end

	------------------------------------------------------------
	-- Performance Booster
	------------------------------------------------------------
	do
		local PlotState = require(ReplicatedStorage.Client.PlotState)
		local section = MiscTab:AddSection("Performance Booster")

		local statusPara = section:AddParagraph({
			Title = "Status",
			Content = "-",
		})

		local function setStatus(msg)
			pcall(function()
				statusPara:SetContent(tostring(msg))
			end)
		end

		-- Hide All Pet
		local hidePetsEnabled = false
		local petAddedConn = nil
		local petEnabledConns = {}

		local function hidePetEntry(entry)
			pcall(function()
				for _, desc in ipairs(entry:GetDescendants()) do
					if desc:IsA("BasePart") then
						desc.LocalTransparencyModifier = 1
					elseif desc:IsA("Decal") or desc:IsA("Texture") then
						desc.Transparency = 1
					end
				end
				local data = entry:FindFirstChild("Data")
				if data and data:IsA("BillboardGui") then
					data.Enabled = false
					if not petEnabledConns[data] then
						petEnabledConns[data] = data:GetPropertyChangedSignal("Enabled"):Connect(function()
							if hidePetsEnabled and data.Enabled then
								data.Enabled = false
							end
						end)
					end
				end
			end)
		end

		local function showPetEntry(entry)
			pcall(function()
				for _, desc in ipairs(entry:GetDescendants()) do
					if desc:IsA("BasePart") then
						desc.LocalTransparencyModifier = 0
					elseif desc:IsA("Decal") or desc:IsA("Texture") then
						desc.Transparency = 0
					end
				end
				local data = entry:FindFirstChild("Data")
				if data and data:IsA("BillboardGui") then
					if petEnabledConns[data] then
						petEnabledConns[data]:Disconnect()
						petEnabledConns[data] = nil
					end
					data.Enabled = true
				end
			end)
		end

		section:AddToggle("StealAnEgg_HideAllPet", {
			Title = "Hide All Pet (kurangin lag render)",
			Default = false,
			Callback = function(enabled)
				hidePetsEnabled = enabled
				local folder = Workspace:FindFirstChild("ClientRenderedAssets")
				if not folder then
					setStatus("Hide All Pet: folder ClientRenderedAssets ga ketemu.")
					return
				end

				if enabled then
					for _, entry in ipairs(folder:GetChildren()) do
						hidePetEntry(entry)
					end
					if not petAddedConn then
						petAddedConn = folder.ChildAdded:Connect(function(entry)
							if hidePetsEnabled then
								task.defer(hidePetEntry, entry)
							end
						end)
					end
					setStatus("Semua pet + nametag-nya disembunyiin.")
				else
					if petAddedConn then
						petAddedConn:Disconnect()
						petAddedConn = nil
					end
					for _, entry in ipairs(folder:GetChildren()) do
						showPetEntry(entry)
					end
					setStatus("Pet dimunculin lagi.")
				end
			end,
		})

		-- Hide Other Treadmill
		local hideTreadmillsEnabled = false
		local treadmillAddedConn = nil
		local treadmillModConns = {}

		local function partsOf(model)
			local parts = {}
			if model:IsA("BasePart") then
				table.insert(parts, model)
			end
			for _, desc in ipairs(model:GetDescendants()) do
				if desc:IsA("BasePart") then
					table.insert(parts, desc)
				end
			end
			return parts
		end

		local function hideTreadmillModel(model)
			pcall(function()
				for _, part in ipairs(partsOf(model)) do
					part.LocalTransparencyModifier = 1
					if not treadmillModConns[part] then
						treadmillModConns[part] = part:GetPropertyChangedSignal("LocalTransparencyModifier"):Connect(function()
							if hideTreadmillsEnabled and part.LocalTransparencyModifier ~= 1 then
								part.LocalTransparencyModifier = 1
							end
						end)
					end
				end
			end)
		end

		local function showTreadmillModel(model)
			pcall(function()
				for _, part in ipairs(partsOf(model)) do
					if treadmillModConns[part] then
						treadmillModConns[part]:Disconnect()
						treadmillModConns[part] = nil
					end
					part.LocalTransparencyModifier = 0
				end
			end)
		end

		local function forEachOtherPlotTreadmill(mySlot, fn)
			local plots = Workspace:FindFirstChild("Plots")
			if not plots then
				return
			end
			for _, plot in ipairs(plots:GetChildren()) do
				if plot.Name ~= tostring(mySlot) then
					local upgrade = plot:FindFirstChild("TreadmillUpgrade")
					local bottom = plot:FindFirstChild("TreadmillBottom")
					if upgrade then
						fn(upgrade)
					end
					if bottom then
						fn(bottom)
					end
				end
			end
		end

		section:AddToggle("StealAnEgg_HideOtherTreadmill", {
			Title = "Hide Other Treadmill (punya sendiri tetep keliatan)",
			Default = false,
			Callback = function(enabled)
				hideTreadmillsEnabled = enabled
				local plots = Workspace:FindFirstChild("Plots")
				if not plots then
					setStatus("Hide Other Treadmill: folder Plots ga ketemu.")
					return
				end

				local ok, mySlot = pcall(function()
					return PlotState.ResolveLocalSlot()
				end)
				if not ok or not mySlot then
					setStatus("Hide Other Treadmill: plot sendiri belum kebaca.")
					return
				end

				if enabled then
					forEachOtherPlotTreadmill(mySlot, hideTreadmillModel)
					if not treadmillAddedConn then
						treadmillAddedConn = plots.DescendantAdded:Connect(function(desc)
							if not hideTreadmillsEnabled then
								return
							end
							if desc.Name ~= "TreadmillUpgrade" and desc.Name ~= "TreadmillBottom" then
								return
							end
							local plot = desc.Parent
							if plot and plot.Name ~= tostring(mySlot) then
								task.defer(hideTreadmillModel, desc)
							end
						end)
					end
					setStatus("Treadmill orang lain disembunyiin (punya sendiri tetep keliatan).")
				else
					if treadmillAddedConn then
						treadmillAddedConn:Disconnect()
						treadmillAddedConn = nil
					end
					forEachOtherPlotTreadmill(mySlot, showTreadmillModel)
					setStatus("Treadmill orang lain dimunculin lagi.")
				end
			end,
		})

		-- Soft Graphics
		local softGraphicsEnabled = false
		local originalTerrainSettings = nil
		local lightingEffectConns = {}
		local lightingChildAddedConn = nil

		local function suppressEffect(effect)
			if not effect:IsA("PostEffect") then
				return
			end
			effect.Enabled = false
			if not lightingEffectConns[effect] then
				lightingEffectConns[effect] = effect:GetPropertyChangedSignal("Enabled"):Connect(function()
					if softGraphicsEnabled and effect.Enabled then
						effect.Enabled = false
					end
				end)
			end
		end

		local function releaseEffect(effect)
			if lightingEffectConns[effect] then
				lightingEffectConns[effect]:Disconnect()
				lightingEffectConns[effect] = nil
			end
			if effect:IsA("PostEffect") then
				effect.Enabled = true
			end
		end

		section:AddToggle("StealAnEgg_SoftGraphics", {
			Title = "Soft Graphics (grafik seminim mungkin)",
			Default = false,
			Callback = function(enabled)
				softGraphicsEnabled = enabled

				pcall(function()
					local UserGameSettings = UserSettings():GetService("UserGameSettings")
					UserGameSettings.SavedQualityLevel = enabled and Enum.SavedQualitySetting.QualityLevel1
						or Enum.SavedQualitySetting.Automatic
				end)

				pcall(function()
					local Lighting = game:GetService("Lighting")
					if enabled then
						for _, effect in ipairs(Lighting:GetChildren()) do
							suppressEffect(effect)
						end
						if not lightingChildAddedConn then
							lightingChildAddedConn = Lighting.ChildAdded:Connect(function(child)
								if softGraphicsEnabled then
									task.defer(suppressEffect, child)
								end
							end)
						end
					else
						if lightingChildAddedConn then
							lightingChildAddedConn:Disconnect()
							lightingChildAddedConn = nil
						end
						for _, effect in ipairs(Lighting:GetChildren()) do
							releaseEffect(effect)
						end
					end
					Lighting.GlobalShadows = not enabled
				end)

				pcall(function()
					local terrain = Workspace.Terrain
					if enabled then
						if not originalTerrainSettings then
							originalTerrainSettings = {
								Decoration = terrain.Decoration,
								WaterWaveSize = terrain.WaterWaveSize,
								WaterWaveSpeed = terrain.WaterWaveSpeed,
								WaterReflectance = terrain.WaterReflectance,
							}
						end
						terrain.Decoration = false
						terrain.WaterWaveSize = 0
						terrain.WaterWaveSpeed = 0
						terrain.WaterReflectance = 0
					elseif originalTerrainSettings then
						terrain.Decoration = originalTerrainSettings.Decoration
						terrain.WaterWaveSize = originalTerrainSettings.WaterWaveSize
						terrain.WaterWaveSpeed = originalTerrainSettings.WaterWaveSpeed
						terrain.WaterReflectance = originalTerrainSettings.WaterReflectance
					end
				end)

				setStatus(enabled and "Soft Graphics nyala." or "Soft Graphics dimatiin.")
			end,
		})
	end

	------------------------------------------------------------
	-- Auto Buy Trail Shop
	------------------------------------------------------------
	do
		local section = MiscTab:AddSection("Auto Buy Trail Shop")

		local trailStatusPara = section:AddParagraph({
			Title = "Status Auto Buy Trail",
			Content = "-",
		})

		local function setTrailStatus(msg)
			pcall(function()
				trailStatusPara:SetContent(tostring(msg))
			end)
		end

		local autoBuyTrailRunning = false
		section:AddToggle("StealAnEgg_AutoBuyTrail", {
			Title = "Auto Buy Trail Shop",
			Default = false,
			Callback = function(enabled)
				autoBuyTrailRunning = enabled
				if not enabled then
					return
				end
				task.spawn(function()
					local Save = require(ReplicatedStorage.Shared.Save)
					local Remotes = require(ReplicatedStorage.Shared.Remotes)
					local Trails = require(ReplicatedStorage.Data.Trails)
					local Simple = require(ReplicatedStorage.Packages.FormatNumber.Simple)

					Save.ProfileReady:Wait()

					local function fmtPrice(price)
						return "$" .. Simple.FormatCompact(price, ".#")
					end

					local sortedKeys = {}
					for key, cfg in pairs(Trails.Directory) do
						if cfg.DisplayInShop and cfg.Price then
							table.insert(sortedKeys, key)
						end
					end
					table.sort(sortedKeys, function(a, b)
						return Trails.Directory[a].Price < Trails.Directory[b].Price
					end)

					while autoBuyTrailRunning and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
						local data = Save.Get()
						local boughtThisPass = false
						for _, key in ipairs(sortedKeys) do
							if not autoBuyTrailRunning then
								break
							end
							local cfg = Trails.Directory[key]
							if not data.TrailInventory[key] and data.Money >= cfg.Price then
								local invokeOk, purchaseOk, err = pcall(function() return Remotes.Trailwear.AskPurchase:InvokeServer(key) end)
								if invokeOk and purchaseOk then
									setTrailStatus("Beli " .. cfg.DisplayName .. " (" .. fmtPrice(cfg.Price) .. ")")
									boughtThisPass = true
									data = Save.Get()
								else
									setTrailStatus(
										"Gagal beli " .. cfg.DisplayName .. ": " .. tostring(invokeOk and err or purchaseOk)
									)
								end
								task.wait(0.5)
							end
						end
						if not boughtThisPass then
							local nextKey
							for _, key in ipairs(sortedKeys) do
								if not data.TrailInventory[key] then
									nextKey = key
									break
								end
							end
							if nextKey then
								local cfg = Trails.Directory[nextKey]
								setTrailStatus("Nunggu uang buat " .. cfg.DisplayName .. " (" .. fmtPrice(cfg.Price) .. ")")
							else
								setTrailStatus("Semua trail di toko (cash) udah kebeli.")
							end
						end
						task.wait(3)
					end
				end)
			end,
		})

		section:AddParagraph({
			Title = "Catatan",
			Content = "Otomatis beli trail dari TrailShop (harga cash, bukan yang Robux-only) mulai dari yang "
				.. "termurah, tiap kali Money cukup. Dicek tiap 3 detik, ga otomatis equip -- equip manual sendiri "
				.. "dari TrailShop kalau mau ganti-ganti trail yang udah kebeli.",
		})
	end

	------------------------------------------------------------
	-- Auto Close Event Popup
	--
	-- Roblox Experience Events popup ("Join Event" title + "Notify Me" button,
	-- e.g. "SAMMY IS COMING") sits in CoreGui and interrupts farming. This
	-- watches PlayerGui + CoreGui for it and hides it immediately.
	--
	-- Matches STRICTLY on the popup's own texts so we never touch other GUIs:
	--   - a TextButton whose text is exactly "Notify Me"
	--   - or a TextLabel whose text is exactly "Join Event"
	------------------------------------------------------------
	do
		local section = MiscTab:AddSection("Auto Close Event Popup")

		local statusPara = section:AddParagraph({
			Title = "Status",
			Content = "-",
		})

		local function setStatus(msg)
			pcall(function() statusPara:SetContent(tostring(msg)) end)
		end

		local enabled = false
		local closedCount = 0

		local function isTriggerText(obj)
			if obj:IsA("TextButton") then
				local t = tostring(obj.Text or "")
				if t == "Notify Me" then return true end
			elseif obj:IsA("TextLabel") then
				local t = tostring(obj.Text or "")
				if t == "Join Event" then return true end
			end
			return false
		end

		-- Walk upward from the trigger element to find the outermost container
		-- that still belongs to the same popup, then hide/destroy that.
		local function killPopupFor(node)
			local top = node
			while top and top.Parent do
				local parent = top.Parent
				-- Stop if the parent is a service root (CoreGui, PlayerGui) --
				-- the current `top` is the popup's ScreenGui/Folder itself.
				if parent == game or parent.ClassName == "CoreGui" or parent.ClassName == "PlayerGui"
					or parent.Name == "CoreGui" or parent.Name == "PlayerGui" then
					break
				end
				top = parent
			end
			if not top then return false end
			-- Safety: never touch our own NaruUI window
			local n = top.Name:lower()
			if n:find("naru") or n:find("fluent") or n == "cutsceneui" then return false end
			local ok = pcall(function()
				if top:IsA("ScreenGui") or top:IsA("GuiObject") then
					if top:IsA("ScreenGui") then top.Enabled = false end
					if top:IsA("GuiObject") then top.Visible = false end
				end
				-- Also nuke it so it can't be re-shown by the same instance
				top:Destroy()
			end)
			return ok
		end

		local function scanAndClose(root)
			if not root then return 0 end
			local hits = 0
			local killed = {}
			local ok, descs = pcall(function() return root:GetDescendants() end)
			if not ok or type(descs) ~= "table" then return 0 end
			for _, d in ipairs(descs) do
				-- Skip anything already unparented by an earlier kill this pass
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
						if killPopupFor(d) then
							hits = hits + 1
						end
					end
				end
			end
			return hits
		end

		local watcherConnections = {}
		local function disconnectAll()
			for _, c in ipairs(watcherConnections) do
				pcall(function() c:Disconnect() end)
			end
			table.clear(watcherConnections)
		end

		local function attachWatcher(root)
			if not root then return end
			-- React the moment any matching descendant is added.
			local ok, conn = pcall(function()
				return root.DescendantAdded:Connect(function(d)
					if not enabled then return end
					if isTriggerText(d) then
						task.wait() -- let the popup finish parenting itself
						if killPopupFor(d) then
							closedCount = closedCount + 1
							setStatus("Popup ditutup (total: " .. closedCount .. ")")
						end
					end
				end)
			end)
			if ok and conn then table.insert(watcherConnections, conn) end
		end

		section:AddToggle("StealAnEgg_AutoCloseEventPopup", {
			Title = "Auto Close Event Popup",
			Default = true,
			Callback = function(val)
				enabled = val
				disconnectAll()
				if not enabled then
					setStatus("Nonaktif.")
					return
				end
				setStatus("Aktif -- ngintip popup Join Event / Notify Me.")

				local pg = LocalPlayer:FindFirstChildOfClass("PlayerGui")
				local cg
				pcall(function() cg = game:GetService("CoreGui") end)

				-- Instant sweep for anything already open
				local n = 0
				n = n + scanAndClose(pg)
				n = n + (cg and scanAndClose(cg) or 0)
				if n > 0 then
					closedCount = closedCount + n
					setStatus("Popup ditutup (total: " .. closedCount .. ")")
				end

				-- Reactive watchers
				attachWatcher(pg)
				attachWatcher(cg)

				-- Safety-net periodic sweep in case DescendantAdded is missed
				task.spawn(function()
					while enabled and not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
						local m = scanAndClose(pg) + (cg and scanAndClose(cg) or 0)
						if m > 0 then
							closedCount = closedCount + m
							setStatus("Popup ditutup (total: " .. closedCount .. ")")
						end
						task.wait(2)
					end
				end)
			end,
		})

		section:AddParagraph({
			Title = "Catatan",
			Content = "Nutup popup Experience Events (contoh: 'Join Event -- SAMMY IS COMING' dengan tombol "
				.. "'Notify Me') secara instan pas muncul, biar farming ga ke-interrupt. Cuma nutup popup yang "
				.. "punya text 'Join Event' atau tombol 'Notify Me' -- popup game lain ga disentuh.",
		})
	end
end
