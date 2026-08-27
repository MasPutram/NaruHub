--!nocheck
return function(ctx)
	local Fluent = ctx.Fluent
	local Window = ctx.Window
	local ReplicatedStorage = ctx.ReplicatedStorage
	local Workspace = ctx.Workspace
	local LocalPlayer = ctx.LocalPlayer

	local FarmTab = Window:AddTab({ Title = "Farming" })

	local RunService = game:GetService("RunService")
	local Assets = require(ReplicatedStorage.Data.Assets)
	local EggState = require(ReplicatedStorage.Client.EggState)
	local AreaEggSlotIdentity = require(ReplicatedStorage.Shared.Util.AreaEggSlotIdentity)
	local AreaEggResetWall = require(ReplicatedStorage.Client.AreaEggResetWall)
	local PlotState = require(ReplicatedStorage.Client.PlotState)
	local AssetEarnings = require(ReplicatedStorage.Shared.Util.AssetEarnings)

	local __OBJECTS = Workspace:WaitForChild("__OBJECTS")
	local Areas = __OBJECTS:WaitForChild("Areas")
	local SeparationLine = Areas:WaitForChild("SeparationLine")
	local GuardAreas = Areas:WaitForChild("GuardAreas")

	local RARITY_LIST = { "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Divine", "Cosmic", "Eternal", "Secret" }
	local allCategories = {}
	for cat in pairs(Assets.Directory) do
		table.insert(allCategories, cat)
	end
	table.sort(allCategories)

	local allAreaIds = {}
	for _, child in ipairs(GuardAreas:GetChildren()) do
		table.insert(allAreaIds, child.Name)
	end
	table.sort(allAreaIds)

	local section = FarmTab:AddSection("Auto Steal Egg")

	local selectedCategories, selectedRarities, selectedAreas = {}, {}, {}

	local categoryDropdown = section:AddDropdown("StealAnEgg_StealCategories", {
		Title = "Kategori Pet (kosong = semua)",
		Values = allCategories,
		Multi = true,
		Default = {},
	})
	categoryDropdown:OnChanged(function(sel)
		selectedCategories = sel or {}
	end)

	local rarityDropdown = section:AddDropdown("StealAnEgg_StealRarities", {
		Title = "Rarity (kosong = semua)",
		Values = RARITY_LIST,
		Multi = true,
		Default = {},
	})
	rarityDropdown:OnChanged(function(sel)
		selectedRarities = sel or {}
	end)

	local areaDropdown = section:AddDropdown("StealAnEgg_StealAreas", {
		Title = "Area (kosong = semua)",
		Values = allAreaIds,
		Multi = true,
		Default = {},
	})
	areaDropdown:OnChanged(function(sel)
		selectedAreas = sel or {}
	end)

	local thresholdInput = section:AddInput("StealAnEgg_StealThreshold", {
		Title = "Threshold Minimum ($/s, 0 = tanpa batas)",
		Placeholder = "0",
		Default = "0",
		Finished = true,
	})

	local MAX_SAFE_TWEEN_SPEED = 60

	local tweenSpeedInput = section:AddInput("StealAnEgg_TweenSpeed", {
		Title = "Tween Speed (studs/detik, MAX 60 tanpa fly -- bebas kalau Noclip+Fly nyala)",
		Placeholder = "60",
		Default = "60",
		Finished = true,
	})

	local noclipFlyEnabled = false
	local noclipConn = nil

	local function startNoclip()
		if noclipConn then return end
		noclipConn = RunService.Stepped:Connect(function()
			if not noclipFlyEnabled then return end
			local char = LocalPlayer.Character
			if not char then return end
			for _, part in ipairs(char:GetDescendants()) do
				if part:IsA("BasePart") then
					part.CanCollide = false
				end
			end
		end)
	end

	local function stopNoclip()
		if noclipConn then
			noclipConn:Disconnect()
			noclipConn = nil
		end
		local char = LocalPlayer.Character
		if char then
			for _, part in ipairs(char:GetDescendants()) do
				if part:IsA("BasePart") and part.Name ~= "HumanoidRootPart" then
					part.CanCollide = true
				end
			end
		end
	end

	section:AddToggle("StealAnEgg_NoclipFly", {
		Title = "Noclip + Fly (eksperimental, buat Auto Steal)",
		Default = false,
		Callback = function(enabled)
			noclipFlyEnabled = enabled
			if enabled then
				startNoclip()
			else
				stopNoclip()
			end
		end,
	})

	local FLY_ALTITUDE = 3

	local flyAltInput = section:AddInput("StealAnEgg_FlyAlt", {
		Title = "Fly Altitude (studs di atas tanah target)",
		Placeholder = "3",
		Default = "3",
		Finished = true,
	})

	local function getFlyAlt()
		return tonumber(flyAltInput.Value) or FLY_ALTITUDE
	end

	local function getTweenSpeed()
		local v = tonumber(tweenSpeedInput.Value) or MAX_SAFE_TWEEN_SPEED
		if noclipFlyEnabled then
			return math.max(v, 10)
		end
		return math.clamp(v, 10, MAX_SAFE_TWEEN_SPEED)
	end

	local statusPara = section:AddParagraph({ Title = "Status Auto Steal", Content = "-" })

	local function setStatus(msg)
		pcall(function()
			statusPara:SetContent(tostring(msg))
		end)
	end

	local function getHRP()
		local char = LocalPlayer.Character
		return char and char:FindFirstChild("HumanoidRootPart")
	end

	local function getHumanoid()
		local char = LocalPlayer.Character
		return char and char:FindFirstChildOfClass("Humanoid")
	end

	local function isTrapped()
		local char = LocalPlayer.Character
		return char and char:GetAttribute("IsTrapped") == true
	end

	local function waitUntilNotTrapped(shouldContinue)
		if not isTrapped() then
			return true
		end
		setStatus("Kena trap! Nunggu lepas...")
		while isTrapped() do
			if shouldContinue and not shouldContinue() then
				return false
			end
			task.wait(0.25)
		end
		setStatus("Udah lepas dari trap, lanjut...")
		return true
	end

	local function findGroundY(x, z, fromY, targetY)
		local char = LocalPlayer.Character
		if not char then
			return targetY
		end
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { char }
		local origin = Vector3.new(x, fromY + 50, z)
		local result = Workspace:Raycast(origin, Vector3.new(0, -1000, 0), params)
		if result then
			return result.Position.Y
		end
		local highOrigin = Vector3.new(x, fromY + 500, z)
		local highResult = Workspace:Raycast(highOrigin, Vector3.new(0, -1500, 0), params)
		if highResult then
			return highResult.Position.Y
		end
		return targetY
	end

	-- Freeze karakter selama fly: anchor HRP + stop animasi biar karakter
	-- keliatan diam (ga ada jalan/lari) sementara CFrame-nya dipindahin.
	-- CFrame tetep bisa di-set di part yang anchored.
	local function freezeCharacter()
		local hrp = getHRP()
		if hrp then
			hrp.Anchored = true
		end
		local hum = getHumanoid()
		if hum then
			local animator = hum:FindFirstChildOfClass("Animator")
			if animator then
				pcall(function()
					for _, track in ipairs(animator:GetPlayingAnimationTracks()) do
						track:Stop(0)
					end
				end)
			end
		end
	end

	local function unfreezeCharacter()
		local hrp = getHRP()
		if hrp then
			hrp.Anchored = false
			hrp.AssemblyLinearVelocity = Vector3.zero
		end
	end

	local function moveTo(targetPosition, speed, shouldContinue)
		speed = speed or getTweenSpeed()
		if not noclipFlyEnabled then
			speed = math.clamp(speed, 10, MAX_SAFE_TWEEN_SPEED)
		else
			speed = math.max(speed, 10)
		end

		local flyAlt = getFlyAlt()
		local lastGroundY = targetPosition.Y
		local frozen = false

		while true do
			if shouldContinue and not shouldContinue() then
				if frozen then unfreezeCharacter() end
				return false
			end
			local hrp = getHRP()
			if not hrp then
				if frozen then unfreezeCharacter() end
				return false
			end
			local hum = getHumanoid()
			local standOffset = (hum and hum.HipHeight or 2) + hrp.Size.Y / 2

			local current = hrp.Position

			if noclipFlyEnabled then
				if not frozen then
					freezeCharacter()
					frozen = true
				end

				local flyTarget = Vector3.new(targetPosition.X, targetPosition.Y + flyAlt, targetPosition.Z)
				local delta3d = flyTarget - current
				local dist3d = delta3d.Magnitude
				if dist3d < 5 then
					unfreezeCharacter()
					return true
				end
				local dt = RunService.Heartbeat:Wait()
				local step = math.min(speed * dt, dist3d)
				local dir3d = delta3d.Unit
				local newPos = current + dir3d * step
				hrp.CFrame = CFrame.new(newPos, newPos + dir3d)
			else
				local flat = Vector3.new(targetPosition.X - current.X, 0, targetPosition.Z - current.Z)
				local dist = flat.Magnitude
				if dist < 3 then
					hrp.AssemblyLinearVelocity = Vector3.zero
					return true
				end
				local dt = RunService.Heartbeat:Wait()
				local step = math.min(speed * dt, dist)
				local direction = flat.Unit
				local newPos = current + direction * step

				local groundY = findGroundY(newPos.X, newPos.Z, current.Y, lastGroundY)
				if groundY then
					lastGroundY = groundY
				end
				local newY = (groundY or lastGroundY) + standOffset
				newPos = Vector3.new(newPos.X, newY, newPos.Z)
				hrp.CFrame = CFrame.new(newPos, newPos + direction)
				hrp.AssemblyLinearVelocity = Vector3.new(direction.X * speed, 0, direction.Z * speed)
			end
		end
	end

	local autoStealRunning = false
	local isCarrying, carryingUid = false, nil

	EggState.CarryChanged:Connect(function(state)
		isCarrying = state.IsCarrying
		carryingUid = state.IsCarrying and state.Uid or nil
	end)

	local function computeRate(record)
		local ok, rate = pcall(function()
			return AssetEarnings.RatePerSecond({
				Category = record.AssetCategory,
				Scale = record.AssetScale,
				Mutations = record.Mutations or {},
			})
		end)
		return ok and rate or 0
	end

	local function matchesFilter(record)
		if record.State ~= "Slot" and record.State ~= "Dropped" then
			return false
		end
		if record.CarrierUserId ~= nil then
			return false
		end
		if next(selectedCategories) and not selectedCategories[record.AssetCategory] then
			return false
		end
		if next(selectedAreas) and not selectedAreas[record.AreaId] then
			return false
		end
		if next(selectedRarities) then
			local cfg = Assets.Directory[record.AssetCategory]
			local rarityName = cfg and cfg.Rarity and cfg.Rarity.DisplayName
			if not (rarityName and selectedRarities[rarityName]) then
				return false
			end
		end
		local threshold = tonumber(thresholdInput.Value) or 0
		if computeRate(record) < threshold then
			return false
		end
		return true
	end

	local function pickBestTarget()
		local ok, snapshot = pcall(function()
			return EggState.SyncFieldEggs()
		end)
		if not ok or not snapshot then
			return nil
		end
		local best, bestRate = nil, -1
		for _, record in ipairs(snapshot.Records) do
			if matchesFilter(record) then
				local rate = computeRate(record)
				if rate > bestRate then
					best, bestRate = record, rate
				end
			end
		end
		return best
	end

	local stagingPos = nil

	local function captureStagingPos()
		local hrp = getHRP()
		if hrp then
			stagingPos = hrp.Position
			setStatus("Titik parkir di-set ke posisi sekarang: " .. tostring(stagingPos))
		end
	end

	local function waitForWallOpen()
		if not stagingPos then
			captureStagingPos()
		end
		if not stagingPos then
			return false
		end
		setStatus("Parkir di titik tunggu...")
		moveTo(stagingPos, getTweenSpeed(), function()
			return autoStealRunning
		end)
		local lastReported = nil
		while autoStealRunning do
			local closed = true
			pcall(function()
				closed = AreaEggResetWall.IsClosed()
			end)
			if lastReported ~= closed then
				lastReported = closed
				setStatus(closed and "Nunggu tembok kebuka..." or "Tembok kebuka! Jalan...")
			end
			if not closed then
				task.wait(0.4)
				return true
			end
			task.wait(0.2)
		end
		return false
	end

	local function carryEggHome(uid)
		local staging = stagingPos or SeparationLine.Position
		local ticks = 0
		while autoStealRunning do
			ticks += 1
			if ticks > 600 then
				return false
			end

			if not (isCarrying and carryingUid == uid) then
				if not waitUntilNotTrapped(function() return autoStealRunning end) then
					return false
				end
				local rec
				pcall(function()
					rec = EggState.FetchEggRecord(uid)
				end)
				if rec == nil then
					return true
				elseif rec.State == "Dropped" then
					setStatus("Kena gigit/trap! Ambil lagi telurnya...")
					if moveTo(rec.BottomCFrame.Position, getTweenSpeed(), function()
						return autoStealRunning
					end) then
						waitUntilNotTrapped(function() return autoStealRunning end)
						EggState.CarryFieldEgg(uid, nil)
					end
				else
					return false
				end
			end

			if isCarrying and carryingUid == uid then
				local hrp = getHRP()
				if hrp and (Vector3.new(hrp.Position.X, 0, hrp.Position.Z) - Vector3.new(staging.X, 0, staging.Z)).Magnitude < 4 then
					return true
				end
				moveTo(staging, getTweenSpeed(), function()
					return autoStealRunning and isCarrying and carryingUid == uid
				end)
			end
			task.wait(0.1)
		end
		return false
	end

	local function autoStealCycle()
		if not waitUntilNotTrapped(function() return autoStealRunning end) then
			return
		end
		if not waitForWallOpen() then
			return
		end
		local target = pickBestTarget()
		if not target then
			setStatus("Ga ada egg yang cocok filter saat ini.")
			task.wait(1)
			return
		end

		local hum = getHumanoid()
		if hum then
			pcall(function()
				hum.Jump = true
			end)
			task.wait(0.15)
		end

		setStatus("Menuju egg: " .. tostring(target.AssetCategory))
		if not moveTo(target.BottomCFrame.Position, getTweenSpeed(), function()
			return autoStealRunning
		end) then
			return
		end

		-- Kalau fly, turun ke posisi egg beneran buat ambil (server butuh
		-- proximity ke egg, ga bisa ambil dari ketinggian fly).
		if noclipFlyEnabled then
			setStatus("Turun ke egg...")
			local eggPos = target.BottomCFrame.Position
			local hrp = getHRP()
			if hrp then
				-- Unfreeze dulu biar server bisa baca posisi (anchored part
				-- mungkin ga ke-replicate proximity-nya).
				unfreezeCharacter()

				local descSpeed = math.min(getTweenSpeed(), 200)
				local hum2 = getHumanoid()
				local standOff = (hum2 and hum2.HipHeight or 2) + (hrp.Size.Y / 2)
				local landTarget = Vector3.new(eggPos.X, eggPos.Y + standOff, eggPos.Z)
				while autoStealRunning do
					hrp = getHRP()
					if not hrp then break end
					local delta = landTarget - hrp.Position
					if delta.Magnitude < 3 then break end
					local dt = RunService.Heartbeat:Wait()
					local step = math.min(descSpeed * dt, delta.Magnitude)
					local newPos = hrp.Position + delta.Unit * step
					hrp.CFrame = CFrame.new(newPos)
					hrp.AssemblyLinearVelocity = delta.Unit * descSpeed
					if hum2 then
						pcall(function() hum2:ChangeState(Enum.HumanoidStateType.Physics) end)
					end
					for _, part in ipairs(LocalPlayer.Character:GetDescendants()) do
						if part:IsA("BasePart") then part.CanCollide = false end
					end
				end
			end
		end

		if not waitUntilNotTrapped(function() return autoStealRunning end) then
			return
		end

		local slotKey = nil
		if AreaEggSlotIdentity.IsFirstAreaUid(target.Uid) then
			slotKey = AreaEggSlotIdentity.BuildSlotKey(target.AreaId, target.NestId)
		end
		local ok, err = EggState.CarryFieldEgg(target.Uid, slotKey)
		if not ok then
			setStatus("Gagal curi " .. tostring(target.AssetCategory) .. ": " .. tostring(err))
			return
		end

		setStatus("Berhasil ambil " .. tostring(target.AssetCategory) .. ", balik ke rumah...")
		local success = carryEggHome(target.Uid)
		if not success then
			setStatus("Gagal bawa pulang " .. tostring(target.AssetCategory) .. " (direbut/ilang).")
			return
		end

		-- Kalau fly, turun ke tanah dulu sebelum taruh egg.
		if noclipFlyEnabled then
			setStatus("Landing...")
			unfreezeCharacter()
			local hrp = getHRP()
			if hrp then
				local gY = findGroundY(hrp.Position.X, hrp.Position.Z, hrp.Position.Y, 0)
				local hum2 = getHumanoid()
				local standOff = (hum2 and hum2.HipHeight or 2) + (hrp.Size.Y / 2)
				local landY = (gY or 0) + standOff
				while autoStealRunning do
					hrp = getHRP()
					if not hrp then break end
					if math.abs(hrp.Position.Y - landY) < 3 then break end
					local dt = RunService.Heartbeat:Wait()
					local cur = hrp.Position
					local newY = cur.Y + (landY - cur.Y) * math.min(1, 10 * dt)
					hrp.CFrame = CFrame.new(Vector3.new(cur.X, newY, cur.Z))
					hrp.AssemblyLinearVelocity = Vector3.new(0, (landY - cur.Y) * 5, 0)
				end
			end
		end

		setStatus("Sampai rumah bawa " .. tostring(target.AssetCategory) .. " -- taruh di treadmill...")
		pcall(function()
			local plotData = PlotState.ResolvePlot()
			if plotData and plotData.CenterPoint then
				local localCFrame = plotData.CenterPoint.CFrame:ToObjectSpace(CFrame.new(plotData.CenterPoint.Position))
				local placeOk, placeErr = EggState.PlantEgg(target.Uid, localCFrame)
				setStatus(placeOk and ("Egg " .. tostring(target.AssetCategory) .. " ditaruh di treadmill.")
					or ("Diklaim tapi gagal ditaruh: " .. tostring(placeErr)))
			end
		end)
	end

	section:AddButton({
		Title = "Set Titik Parkir (pakai posisi sekarang)",
		Callback = captureStagingPos,
	})

	section:AddToggle("StealAnEgg_AutoSteal", {
		Title = "Auto Steal (loop utama)",
		Default = false,
		Callback = function(enabled)
			autoStealRunning = enabled
			if enabled then
				task.spawn(function()
					pcall(captureStagingPos)
					while autoStealRunning do
						local ok, err = pcall(autoStealCycle)
						if not ok then
							setStatus("Error: " .. tostring(err))
						end
						task.wait(0.5)
					end
					setStatus("Auto Steal dimatikan.")
				end)
			end
		end,
	})

	------------------------------------------------------------
	-- Auto Place Egg
	------------------------------------------------------------
	do
		local section = FarmTab:AddSection("Auto Place Egg")

		local placeThresholdInput = section:AddInput("StealAnEgg_PlaceEggThreshold", {
			Title = "Threshold Maksimum ($/s, telur DI BAWAH ini di-taro otomatis; 0 = semua telur di tas)",
			Placeholder = "1000000000",
			Default = "1000000000",
			Finished = true,
		})

		local placeStatusPara = section:AddParagraph({ Title = "Status Auto Place Egg", Content = "-" })

		local function setPlaceStatus(msg)
			pcall(function()
				placeStatusPara:SetContent(tostring(msg))
			end)
		end

		local function getPlaceThreshold()
			local n = tonumber(placeThresholdInput.Value)
			if n == nil then
				return 1000000000
			end
			if n <= 0 then
				return math.huge
			end
			return n
		end

		local autoPlaceEggRunning = false

		local function getMyOwnedEggs()
			local ownedData = EggState.SyncOwnedEggs()
			for _, entry in ipairs(ownedData) do
				if entry.OwnerUserId == LocalPlayer.UserId then
					return entry.Records
				end
			end
			return {}
		end

		local function collectUnplacedBelowThreshold(threshold)
			local records = getMyOwnedEggs()
			local candidates = {}
			for uid, rec in pairs(records) do
				if rec.Placement == nil then
					local rate = computeRate(rec)
					if rate < threshold then
						table.insert(candidates, { uid = uid, category = rec.AssetCategory, rate = rate })
					end
				end
			end
			table.sort(candidates, function(a, b)
				return a.rate > b.rate
			end)
			return candidates
		end

		local function tryPlaceAt(uid, petArea, centerPoint)
			local size = petArea.Size
			local halfX, halfZ = size.X / 2 * 0.9, size.Z / 2 * 0.9
			local lastErr
			for attempt = 1, 10 do
				if not autoPlaceEggRunning then
					return false, lastErr
				end
				local hrp = getHRP()
				if not hrp then
					return false, lastErr
				end
				local radius = 6 + attempt * 2
				local localHRP = petArea.CFrame:PointToObjectSpace(hrp.Position)
				local x = math.clamp(localHRP.X + (math.random() * 2 - 1) * radius, -halfX, halfX)
				local z = math.clamp(localHRP.Z + (math.random() * 2 - 1) * radius, -halfZ, halfZ)
				local worldPos = (petArea.CFrame * CFrame.new(x, size.Y / 2, z)).Position
				local placeCFrame = centerPoint.CFrame:ToObjectSpace(CFrame.new(worldPos))
				local ok, err = EggState.PlantEgg(uid, placeCFrame)
				if ok then
					return true
				end
				lastErr = err
				task.wait(0.25)
			end
			return false, lastErr
		end

		local function autoPlaceEggCycle()
			local threshold = getPlaceThreshold()
			local candidates = collectUnplacedBelowThreshold(threshold)
			if #candidates == 0 then
				setPlaceStatus("Ga ada telur di tas yang di bawah threshold.")
				return
			end

			local plotData = PlotState.ResolvePlot()
			local petArea = plotData and plotData.PetArea
			local centerPoint = plotData and plotData.CenterPoint
			if not petArea or not centerPoint then
				setPlaceStatus("Ga nemu kandang sendiri (plot belum kerender?).")
				return
			end

			local function ensureNearPetArea()
				local hrp = getHRP()
				if not hrp then
					return false
				end
				if (hrp.Position - petArea.Position).Magnitude <= 15 then
					return true
				end
				setPlaceStatus("Jalan ke kandang sendiri buat naro telur...")
				return moveTo(petArea.Position, getTweenSpeed(), function()
					return autoPlaceEggRunning
				end)
			end

			local placedCount = 0
			local lastFailErr
			for _, c in ipairs(candidates) do
				if not autoPlaceEggRunning then
					break
				end
				if ensureNearPetArea() then
					local placed, err = tryPlaceAt(c.uid, petArea, centerPoint)
					if placed then
						placedCount = placedCount + 1
						setPlaceStatus(
							"Naro " .. c.category .. " ($" .. tostring(math.floor(c.rate)) .. "/s) -- total " .. placedCount .. " telur dipasang."
						)
					else
						lastFailErr = err
					end
				end
				task.wait(0.4)
			end
			if placedCount == 0 then
				setPlaceStatus(
					"Ga ada telur yang berhasil ditaro"
						.. (lastFailErr and (" (" .. tostring(lastFailErr) .. ")") or " (kandang penuh / posisi ga valid).")
				)
			end
		end

		section:AddToggle("StealAnEgg_AutoPlaceEgg", {
			Title = "Auto Place Egg",
			Default = false,
			Callback = function(enabled)
				autoPlaceEggRunning = enabled
				if enabled then
					task.spawn(function()
						while autoPlaceEggRunning do
							local ok, err = pcall(autoPlaceEggCycle)
							if not ok then
								setPlaceStatus("Error: " .. tostring(err))
							end
							task.wait(3)
						end
						setPlaceStatus("Auto Place Egg dimatikan.")
					end)
				end
			end,
		})

		section:AddParagraph({
			Title = "Catatan",
			Content = "Cuma naro telur yang masih di TAS (belum ke-place), rate di bawah threshold, mulai dari yang "
				.. "PALING TINGGI rate-nya (yang masih di bawah threshold). Kalau karakter jauh dari kandang sendiri, jalan dulu otomatis (speed dicap sama kayak "
				.. "Auto Steal, bukan teleport). Telur di atas threshold sengaja dibiarin di tas. JANGAN nyalain "
				.. "bareng Auto Treadmill/Auto Steal -- sama-sama gerakin karakter, jadi bisa rebutan posisi & "
				.. "placement-nya gagal terus (dites langsung: kejadian).",
		})
	end
end
