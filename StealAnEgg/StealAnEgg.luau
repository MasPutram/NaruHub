--!nocheck
-- StealAnEgg -- Bag Scanner / Egg Monitor / Hatch Forecast
-- Game: "Steal An Egg" (placeId 107778070777162, universeId 10563114921)
--
-- Fitur (read-only, tidak menaruh/menetaskan/mencuri telur apapun):
--   1. Scan Isi Tas   -- baca Backpack (Tool) pemain, grup per kategori + mutasi.
--   2. Monitor Telur  -- baca telur yang sedang tumbuh di kandang (plot pemain),
--      termasuk sisa waktu sampai siap.
--   3. Prediksi Hatch -- karena spesies (AssetCategory) & mutasi telur sudah di-roll
--      server sejak ditaruh (cuma disembunyikan visualnya sampai animasi hatch),
--      kita bisa tampilkan telur mana yang paling cepat menetas & jadi apa.
--
-- Sumber data dibaca langsung dari module client resmi game (EggCmds, EggItemUtil)
-- lewat require(ReplicatedStorage...), bukan nebak-nebak nama remote.

------------------------------------------------------------
-- Cleanup dari run sebelumnya (biar re-execute/re-inject ga numpuk GUI dobel)
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
			if child.Name == "StealAnEggGUI" or child.Name == "StealAnEggDropdown" then
				child:Destroy()
			end
		end
	end
end

------------------------------------------------------------
-- NaruUI (embedded, self-contained UI lib -- lihat ui-template/NaruUI.luau)
------------------------------------------------------------
local NaruUI = (function()
	local Players = game:GetService("Players")
	local UserInputService = game:GetService("UserInputService")
	local TweenService = game:GetService("TweenService")
	local HttpService = game:GetService("HttpService")
	local LocalPlayer = Players.LocalPlayer

	-- Logo default (tertanam, base64) -- dipakai otomatis di title bar DAN di
	-- badge minimize, kecuali di-override lewat CreateWindow({ LogoImage = ... }).
	local DEFAULT_LOGO_B64 = "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F4BHx7SNknO2HYXPitdYiTD0Z5XBslogIjNlbm7uAeFJ+HLglGFJ6Qjw+Ji2pdi2X8A343WWo6b5f368vsi64MtvhxF4basw36ev8Rl3m3FwTNvm5Jy395WEKxKH/iz+YLy2yLpgw29l8E3gWD/e6rbhEfDcmLbl8PRfFa+3lPD0v75uGrLIugDsEgJwHGPHbX2+b93dibWsvrP39+XuLBw7/2yLsng9kXXDJ9gMm/vAGwe/yznfvQzX3SbgFdWUrYxt1b2cSsDG/sOhx8RriawbwM62AGZQGuK21zZK0EUlYK8c5X1Xw4YSrUkfrz1Q0/n3Y4X7lnVt48aNO9linKJQvC2eA9x7tT3uywW8Id53NYC9y3BjpZqZfyfEz4usK8BdU0plgM5FFYABbgOcFHvQV8ufxmVhPDHec7Xm5+f3Lyu14h7l2P+CtW7iZ0XWFR9KG4bdBt4Szyl5M/uLw1K1SjUVwCnxXmuRc37kqJaA0di/yBZbbHHTTTfd2eLtFQXjTOChwP28f+AuwB1zzrctP7ewsHAAcG5TO/cAHyiv3wRb2luGHy8BL4rni6w7Oeftyk06igIy79F4r08pXQP8DLjY+gKA8yxenxVa4IoySo8/2O2z5eQie/2OYbcqQT2A02PamuCjA5VlxB5/YGQAEpF1A9hqOcNny+UVQNxgwwq/VQr9Qu/n2Dt4WSGcGdPWFGBP4JriXp+J54isW8AHB4VjXKxVEdPVJGCPlNKXfL/B+8Tfi6xbtv2VRQcGDgIOBY4EjrYOQeucA04FPplSsm28z7ddfH3LbIvnb6G6rUm9ptGBlNLZMV0iMqE8Tt9WPopgswnvDzwMeJRtNwY8A3iBLy6ybb5PBN4DfNQ3AP2KVyQ/BS6yZnq8h4jMOM3EExEREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREZFx+H+J2wq6++I1pAAAAABJRU5ErkJggg=="

	local function buildDefaultLogoAsset(): string?
		local dec = base64_decode or base64decode
		if not dec and crypt and crypt.base64 then
			dec = crypt.base64.decode
		end
		if not (dec and writefile and getcustomasset) then
			return nil
		end
		local ok, asset = pcall(function()
			writefile("StealAnEgg_logo.png", dec(DEFAULT_LOGO_B64))
			return getcustomasset("StealAnEgg_logo.png")
		end)
		return ok and asset or nil
	end
	local DEFAULT_LOGO_ASSET = buildDefaultLogoAsset()

	local NaruUI = {}

	function NaruUI.New(cfg)
		cfg = cfg or {}
		local BRAND = cfg.BrandColor or Color3.fromRGB(255, 214, 10)
		local configPrefix = cfg.ConfigPrefix or "NaruUI"

		local onWindowClose = nil

		local ConfigData: { [string]: any } = {}
		local CONFIG_PATH
		do
			local ok, hwid = pcall(function()
				return gethwid and gethwid() or "default"
			end)
			local safeId = (ok and hwid and tostring(hwid):gsub("[^%w]", "")) or "default"
			CONFIG_PATH = configPrefix .. "_Config_" .. safeId .. ".json"
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

		local NaruTween = TweenService

		local UI_FONT = Enum.Font.GothamMedium
		local UI_FONT_BOLD = Enum.Font.GothamBold
		local UI_COL_BG = Color3.fromRGB(8, 8, 9)
		local UI_COL_SIDEBAR = Color3.fromRGB(4, 4, 5)
		local UI_COL_ROW = Color3.fromRGB(17, 17, 18)
		local UI_COL_ROW2 = Color3.fromRGB(24, 24, 26)
		local UI_COL_TEXT = Color3.fromRGB(250, 250, 250)
		local UI_COL_DIM = Color3.fromRGB(145, 145, 148)
		local UI_COL_ACCENT = BRAND
		local UI_COL_ACCENT_DIM = Color3.fromRGB(
			math.floor(BRAND.R * 255 * 0.24), math.floor(BRAND.G * 255 * 0.24), math.floor(BRAND.B * 255 * 0.24))
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
		Fluent.OnWindowClose = nil

		function Fluent:Notify(cfg2)
			if Fluent._notify then
				Fluent._notify(cfg2)
			end
		end

		function Fluent:ToggleTransparency(_state) end

		function Fluent:Destroy()
			if self.GUI then
				pcall(function() self.GUI:Destroy() end)
			end
			self.Unloaded = true
		end

		function Fluent:CreateWindow(wcfg)
			local screenGui = uiNew("ScreenGui", {
				Name = (wcfg.GuiName or configPrefix) .. "GUI",
				ResetOnSpawn = false,
				ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
				DisplayOrder = 100,
			}, (gethui and gethui()) or game:GetService("CoreGui"))
			self.GUI = screenGui

			local size = wcfg.Size or UDim2.fromOffset(720, 480)
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
			local logoImage = wcfg.LogoImage or DEFAULT_LOGO_ASSET
			if logoImage then
				uiNew("ImageLabel", {
					BackgroundTransparency = 1,
					Size = UDim2.fromOffset(28, 28),
					Image = logoImage,
					ScaleType = Enum.ScaleType.Fit,
					LayoutOrder = 0,
				}, titleHolder)
			end
			uiNew("TextLabel", {
				BackgroundTransparency = 1,
				AutomaticSize = Enum.AutomaticSize.X,
				Size = UDim2.new(0, 0, 0, 20),
				Font = UI_FONT_BOLD,
				TextSize = 17,
				TextXAlignment = Enum.TextXAlignment.Left,
				TextColor3 = UI_COL_TEXT,
				Text = wcfg.Title or "Window",
				LayoutOrder = 1,
			}, titleHolder)
			if wcfg.Badge then
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
					Text = wcfg.Badge,
				}, premiumBadge)
			end

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
				Size = UDim2.new(0, wcfg.TabWidth or 150, 1, -46),
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
				Position = UDim2.new(0, wcfg.TabWidth or 150, 0, 46),
				Size = UDim2.new(1, -(wcfg.TabWidth or 150), 1, -46),
				BackgroundTransparency = 1,
			}, main)

			uiNew("Frame", {
				Size = UDim2.new(1, 0, 0, 1),
				Position = UDim2.new(0, 0, 0, 46),
				BackgroundColor3 = Color3.fromRGB(34, 34, 36),
				BorderSizePixel = 0,
				ZIndex = 5,
			}, main)

			uiNew("Frame", {
				Size = UDim2.new(0, 1, 1, -46),
				Position = UDim2.new(0, wcfg.TabWidth or 150, 0, 46),
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
				if Fluent.OnWindowClose then
					pcall(Fluent.OnWindowClose)
				end
				Fluent:Destroy()
			end)

			--==============================================================
			-- Minimize: klik "-" -> window sembunyi, badge logo bulat ngambang
			-- muncul di pojok kiri atas (bisa di-drag, klik logo = restore).
			--==============================================================
			do
				local hui = (gethui and gethui()) or game:GetService("CoreGui")
				for _, o in ipairs(hui:GetChildren()) do
					if o.Name == (configPrefix .. "Launcher") then
						pcall(function() o:Destroy() end)
					end
				end

				local launcher = Instance.new("ScreenGui")
				launcher.Name = configPrefix .. "Launcher"
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
				logoBtn.Image = ""
				logoBtn.Parent = launcher

				local logoCorner = Instance.new("UICorner")
				logoCorner.CornerRadius = UDim.new(1, 0)
				logoCorner.Parent = logoBtn

				local logoStroke = Instance.new("UIStroke")
				logoStroke.Color = BRAND
				logoStroke.Thickness = 1.5
				logoStroke.Parent = logoBtn

				if logoImage then
					local logoImg = Instance.new("ImageLabel")
					logoImg.Name = "Img"
					logoImg.BackgroundTransparency = 1
					logoImg.Size = UDim2.fromScale(0.78, 0.78)
					logoImg.Position = UDim2.fromScale(0.5, 0.5)
					logoImg.AnchorPoint = Vector2.new(0.5, 0.5)
					logoImg.Image = logoImage
					logoImg.ScaleType = Enum.ScaleType.Fit
					logoImg.Parent = logoBtn
				else
					local lbl = Instance.new("TextLabel")
					lbl.BackgroundTransparency = 1
					lbl.Size = UDim2.fromScale(1, 1)
					lbl.Font = Enum.Font.GothamBold
					lbl.TextSize = 30
					lbl.TextColor3 = Color3.fromRGB(255, 255, 255)
					lbl.Text = (wcfg.Title or "?"):sub(1, 1):upper()
					lbl.Parent = logoBtn
				end

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
				Window.Minimize = function()
					setMinimized(true)
				end
				Window.Restore = function()
					setMinimized(false)
				end

				if wcfg.AutoStartMinimized then
					task.defer(function()
						setMinimized(true)
					end)
				end

				-- drag + click (klik logo = restore, drag = pindah posisi badge)
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
				UserInputService.InputChanged:Connect(function(input)
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
				end)
				UserInputService.InputEnded:Connect(function(input)
					if input.UserInputType == Enum.UserInputType.MouseButton1
						or input.UserInputType == Enum.UserInputType.Touch then
						if dragging and not movedFar then
							setMinimized(false)
						end
						dragging = false
					end
				end)
			end

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
						Text = "\226\128\186",
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
						chevron.Text = expanded and "\226\136\168" or "\226\128\186"
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

						local obj = { Value = tostring(icfg.Default or "") }

						local function commit()
							local v = box.Text
							if icfg.Numeric then
								v = tostring(tonumber(v) or icfg.Default or 0)
								box.Text = v
							end
							obj.Value = v
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
						local poolSize = dcfg.PoolSize or 100

						local listGui = uiNew("ScreenGui", { Name = configPrefix .. "Dropdown", ResetOnSpawn = false, DisplayOrder = 200 }, (gethui and gethui()) or game:GetService("CoreGui"))
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

						local optionPool = {}
						local slotName = {}
						for i = 1, poolSize do
							local ob = uiNew("TextButton", {
								Size = UDim2.new(1, 0, 0, 26),
								BackgroundColor3 = UI_COL_ROW2,
								AutoButtonColor = true,
								Font = UI_FONT,
								TextSize = 12,
								TextColor3 = UI_COL_TEXT,
								Text = "",
								TextXAlignment = Enum.TextXAlignment.Left,
								LayoutOrder = i,
								ZIndex = 50,
								Visible = false,
							}, listScroll)
							optionPool[i] = ob
							ob.MouseButton1Click:Connect(function()
								local name = slotName[ob]
								if not name then
									return
								end
								if multi then
									setSelected(name, not selected[name])
								else
									setSelected(name, true)
									closeDropdown()
								end
								fireChange()
							end)
						end

						local function rebuildOptionsOnce()
							optionBtns = {}
							local n = math.min(#values, poolSize)
							for i = 1, n do
								local name = values[i]
								local ob = optionPool[i]
								slotName[ob] = name
								ob.Text = "  " .. name
								ob.BackgroundColor3 = selected[name] and UI_COL_ACCENT_DIM or UI_COL_ROW2
								ob.Visible = true
								optionBtns[name] = ob
							end
							for i = n + 1, poolSize do
								local ob = optionPool[i]
								slotName[ob] = nil
								ob.Visible = false
							end
							if searchBox and searchBox.Text ~= "" then
								local q = searchBox.Text:lower()
								for name, ob in pairs(optionBtns) do
									ob.Visible = name:lower():find(q, 1, true) ~= nil
								end
							end
						end
						local function rebuildOptions()
							for attempt = 1, 5 do
								local ok = pcall(rebuildOptionsOnce)
								if ok then
									return true
								end
								task.wait(0.1)
							end
							return false
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

		return Fluent
	end

	return NaruUI
end)()

------------------------------------------------------------
-- Game data access (read-only)
------------------------------------------------------------
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local LocalPlayer = Players.LocalPlayer

local EggCmds = require(ReplicatedStorage.Library.Client.EggCmds)
local EggItemUtil = require(ReplicatedStorage.Library.Util.EggItemUtil)

local function formatSeconds(s)
	s = math.max(0, math.floor(s + 0.5))
	local m = math.floor(s / 60)
	local sec = s % 60
	return string.format("%02d:%02d", m, sec)
end

local function mutationLabel(mutations)
	if type(mutations) ~= "table" or #mutations == 0 then
		return nil
	end
	local parts = {}
	for _, m in ipairs(mutations) do
		if type(m) == "string" then
			table.insert(parts, m)
		elseif type(m) == "table" and m.Name then
			table.insert(parts, tostring(m.Name))
		end
	end
	if #parts == 0 then
		return nil
	end
	return table.concat(parts, ", ")
end

-- Sisa waktu tumbuh + status ready untuk satu record telur, meniru persis
-- EggCmds.IsLocalEggReady (termasuk bonus night-growth credit).
local function getGrowthInfo(rec)
	local now = Workspace:GetServerTimeNow()
	local speed = rec.GrowthSpeedMultiplier or 1
	local nightCredit = EggItemUtil.GetCurrentNightGrowthCreditSeconds(rec, now, speed)
	local remaining = EggItemUtil.GetRemainingGrowthSeconds(rec, now, speed, nightCredit, LocalPlayer)
	local ready = EggItemUtil.IsGrowthReady(rec, now, speed, nightCredit, LocalPlayer)
	return remaining, ready
end

------------------------------------------------------------
-- UI
------------------------------------------------------------
local Fluent = NaruUI.New({
	BrandColor = Color3.fromRGB(255, 214, 10),
	ConfigPrefix = "StealAnEgg",
})

local Window = Fluent:CreateWindow({
	Title = "Steal An Egg -- Naru Scanner",
	Badge = "BETA",
	TabWidth = 150,
	Size = UDim2.fromOffset(680, 460),
})

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

	-- Auto Equip & Auto Un-equip -- 2 toggle independen (bukan 1 "equip
	-- terbaik" yang otomatis nge-swap). Equip cuma ngisi slot aktif yang
	-- masih kosong; Un-equip cuma ngelepas pet aktif yang $/s-nya paling
	-- kecil. Nyalain keduanya bareng efeknya jadi "upgrade otomatis": Un-equip
	-- ngosongin slot punya pet lemah, Equip langsung isi lagi pakai yang lebih
	-- bagus dari tas di tick berikutnya.
	local AssetGenerationUtil = require(ReplicatedStorage.Library.Util.AssetGenerationUtil)
	local AssetCmds = require(ReplicatedStorage.Library.Client.AssetCmds)
	local MutationsModule = require(ReplicatedStorage.Library.Modules.Mutations)

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
			limit = AssetCmds.RequestEquipLimit()
		end)
		if limit <= 0 then
			return
		end

		local activeRecords = AssetCmds.GetOwnerRuntimeRecords(LocalPlayer.UserId)
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
						rate = AssetGenerationUtil.GetBaseRateMutationOnly({
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
			if AssetCmds.RequestEquipAsset(candidates[ci].uid) then
				activeCount += 1
			end
			ci += 1
		end
	end

	local function autoUnequipAll()
		local activeRecords = AssetCmds.GetOwnerRuntimeRecords(LocalPlayer.UserId)
		local uids = {}
		for uid in pairs(activeRecords) do
			table.insert(uids, uid)
		end
		-- Firing semua RequestUnequipAsset dalam 1 frame bikin karakter
		-- gonta-ganti pegang pet/tongkat (tabrakan animasi equip). Kasih
		-- jeda kecil antar unequip biar rapi.
		for i, uid in ipairs(uids) do
			AssetCmds.RequestUnequipAsset(uid)
			if i < #uids then
				task.wait(0.2)
			end
		end
	end

	local autoEquipRunning = false
	section:AddToggle("StealAnEgg_AutoEquip", {
		Title = "Auto Equip (isi slot kosong, tiap 5 detik)",
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
		Title = "Auto Un-equip All (lepas semua pet aktif, tiap 2 detik)",
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

	-- Total $/s dari pet aktif -- ditampilin langsung di GUI (bukan cuma di
	-- poster), biar kelihatan realtime abis di-equip.
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
		local activeRecords = AssetCmds.GetOwnerRuntimeRecords(LocalPlayer.UserId)
		local total, count = 0, 0
		for _, rec in pairs(activeRecords) do
			total += rec.MoneyPerSecond or 0
			count += 1
		end
		local limit = 0
		pcall(function()
			limit = AssetCmds.RequestEquipLimit()
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
		pcall(function()
			EggCmds.RequestRuntimeSnapshot()
		end)

		local records = EggCmds.GetOwnerRuntimeRecords(LocalPlayer.UserId)
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
-- 3.5. Auto Upgrade Kandang & Treadmill (sampai level target, ga upgrade
-- terus-terusan)
------------------------------------------------------------
do
	local BaseUpgradeClient = require(ReplicatedStorage.Library.Client.BaseUpgradeClient)
	local TreadmillClient = require(LocalPlayer.PlayerScripts.GUI.TreadmillUpgrade.Client)
	local SaveModule = require(ReplicatedStorage.Library.Client.Save)

	local section = Tab:AddSection("Auto Upgrade Kandang & Treadmill")

	local kandangTargetInput = section:AddInput("StealAnEgg_KandangTarget", {
		Title = "Target Level Kandang (kosongin = MAX)",
		Placeholder = "cth: 15",
		Default = "",
		Finished = true,
	})
	local treadmillTargetInput = section:AddInput("StealAnEgg_TreadmillTarget", {
		Title = "Target Level Treadmill (kosongin = MAX)",
		Placeholder = "cth: 12",
		Default = "",
		Finished = true,
	})

	local function parseTarget(input)
		local n = tonumber(input.Value)
		if n and n > 0 then
			return math.floor(n)
		end
		return math.huge -- kosong = ga dibatasin, upgrade sampai MAX beneran
	end

	local upgradeStatusPara = section:AddParagraph({
		Title = "Status Upgrade",
		Content = "-",
	})

	local function tryUpgradeKandang()
		local stats = SaveModule.Get(LocalPlayer)
		local target = parseTarget(kandangTargetInput)
		if stats.BaseUpgradeLevel >= target then
			return "Kandang: udah di target (Lv." .. stats.BaseUpgradeLevel .. ")"
		end
		local nextLevel, config = BaseUpgradeClient.GetNextConfig(stats)
		if not nextLevel or not config then
			return "Kandang: udah MAX level (Lv." .. stats.BaseUpgradeLevel .. ")"
		end
		if nextLevel > target then
			return "Kandang: nyampe target di Lv." .. stats.BaseUpgradeLevel
		end
		if not BaseUpgradeClient.CanAffordNext(stats) then
			return "Kandang: uang kurang buat Lv." .. nextLevel .. " (butuh $" .. tostring(config.Cost) .. ")"
		end
		BaseUpgradeClient.RequestCashUpgrade()
		return "Kandang: upgrade ke Lv." .. nextLevel .. " diminta"
	end

	local function tryUpgradeTreadmill()
		local stats = SaveModule.Get(LocalPlayer)
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
		Title = "Auto Upgrade (cek tiap 5 detik, berhenti sendiri di level target)",
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
		Content = "Target dibaca dari input di atas tiap kali cek (ganti kapan aja, ga perlu "
			.. "matiin toggle dulu). Kosongin field = upgrade terus sampai level MAX beneran. "
			.. "Loop otomatis berhenti minta upgrade begitu level sekarang udah >= target atau "
			.. "udah MAX, tapi toggle-nya sendiri tetap nyala (buat terus mantau kalau kamu naikin target).",
	})
end

------------------------------------------------------------
-- 4. Auto Generate Poster "Jual Akun" -> kirim ke Discord webhook
------------------------------------------------------------
-- Render gambar (font/gradient/composit) ga bisa dilakuin di Luau, jadi bagian
-- itu dilempar ke local render server (poster_server.py, jalan di
-- 127.0.0.1:8765) lewat request() bawaan executor. Script cuma ngumpulin data
-- akun (isi tas + pet aktif + $/s tiap item) dan kirim sebagai JSON.
do
	local AssetGenerationUtil = require(ReplicatedStorage.Library.Util.AssetGenerationUtil)
	local AssetItemUtil = require(ReplicatedStorage.Library.Util.AssetItemUtil)
	local AssetCmds = require(ReplicatedStorage.Library.Client.AssetCmds)
	local MutationsModule = require(ReplicatedStorage.Library.Modules.Mutations)
	local EggCmds = require(ReplicatedStorage.Library.Client.EggCmds)
	local EggItemUtil = require(ReplicatedStorage.Library.Util.EggItemUtil)
	local HttpService = game:GetService("HttpService")

	local POSTER_SERVER_URL = "https://lecture-ownership-out-clinics.trycloudflare.com/generate"

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
					rate = AssetGenerationUtil.GetBaseRateMutationOnly({
						Category = category,
						Scale = scale,
						Mutations = mutations,
					})
				end)
				-- Weight attribute mentah != berat yang ditampilin game (itu cuma
				-- basis lama, ga dipakai lagi). Berat asli = ModelWeight * Scale^3,
				-- sama kayak yang dipanggil AssetHoverDataDisplay/BackpackController.
				local weight = 0
				pcall(function()
					weight = AssetItemUtil.GetVisualWeightKg({
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
				})
			end
		end
		return pets
	end

	local function collectActivePets()
		local pets = {}
		local records = AssetCmds.GetOwnerRuntimeRecords(LocalPlayer.UserId)
		for _, rec in pairs(records) do
			local item = rec.ItemData
			if item then
				local weight = 0
				pcall(function()
					weight = AssetItemUtil.GetVisualWeightKg(item)
				end)
				table.insert(pets, {
					uid = rec.UID,
					name = item.Category,
					category = item.Category,
					mutations = item.Mutations or {},
					rate = rec.MoneyPerSecond or 0,
					weight = weight,
				})
			end
		end
		table.sort(pets, function(a, b)
			return (a.rate or 0) > (b.rate or 0)
		end)
		return pets
	end

	-- Telur yang lagi tumbuh di kandang -- spesies & mutasi udah di-roll
	-- server sejak ditaruh (EggItemUtil sama persis kayak yang dipakai di
	-- "Monitor Telur & Kandang"), cuma disembunyikan visualnya sampai hatch.
	local function collectGrowingEggs()
		pcall(function()
			EggCmds.RequestRuntimeSnapshot()
		end)
		local records = EggCmds.GetOwnerRuntimeRecords(LocalPlayer.UserId)
		local now = Workspace:GetServerTimeNow()
		local eggs = {}
		for uid, rec in pairs(records) do
			if rec.Placement ~= nil then
				local speed = rec.GrowthSpeedMultiplier or 1
				local nightCredit = 0
				pcall(function()
					nightCredit = EggItemUtil.GetCurrentNightGrowthCreditSeconds(rec, now, speed)
				end)
				local remaining, ready = 0, false
				pcall(function()
					remaining = EggItemUtil.GetRemainingGrowthSeconds(rec, now, speed, nightCredit, LocalPlayer)
				end)
				pcall(function()
					ready = EggItemUtil.IsGrowthReady(rec, now, speed, nightCredit, LocalPlayer)
				end)
				local weight = 0
				pcall(function()
					weight = AssetItemUtil.GetVisualWeightKg({
						Category = rec.AssetCategory,
						Scale = rec.AssetScale or 1,
						Mutations = rec.Mutations or {},
					})
				end)
				local rate = 0
				pcall(function()
					rate = AssetGenerationUtil.GetBaseRateMutationOnly({
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

	local SaveModule = require(ReplicatedStorage.Library.Client.Save)

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

		local kandangLevel, treadmillLevel
		pcall(function()
			local stats = SaveModule.Get(LocalPlayer)
			if stats then
				kandangLevel = stats.BaseUpgradeLevel
				treadmillLevel = stats.TreadmillUpgradeLevel
			end
		end)

		return runSpeed, moneyPerSecond, kandangLevel, treadmillLevel
	end

	local section = Tab:AddSection("Jual Akun (Auto Poster)")

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
		Placeholder = "Rp 150.000",
		Default = "",
		Finished = true,
	})
	local ownerInput = section:AddInput("StealAnEgg_PosterOwner", {
		Title = "Nama FB (Hak Milik, watermark)",
		Default = "Putra Ramadhan",
		Finished = true,
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

	local function generateAndSend()
		statusPara:SetContent("Mengumpulkan data akun...")

		local allPets = collectBackpackPets()
		local activePets = collectActivePets()
		local growingEggs = collectGrowingEggs()
		local activeLimit = 0
		pcall(function()
			activeLimit = AssetCmds.RequestEquipLimit()
		end)
		local runSpeed, moneyPerSecond, kandangLevel, treadmillLevel = collectAccountStats()

		local payload = {
			title = titleInput.Value ~= "" and titleInput.Value or "Jual Akun GACOR",
			badge = badgeInput.Value,
			checklist = splitComma(checklistInput.Value or ""),
			price = priceInput.Value,
			webhookUrl = webhookInput.Value,
			allPets = allPets,
			activePets = activePets,
			activeLimit = activeLimit,
			growingEggs = growingEggs,
			runSpeed = runSpeed,
			totalMoneyPerSecond = moneyPerSecond,
			kandangLevel = kandangLevel,
			treadmillLevel = treadmillLevel,
			ownerFacebook = ownerInput.Value,
			sourceAccount = LocalPlayer.Name,
		}

		local body = HttpService:JSONEncode(payload)
		local serverUrl = posterServerInput.Value ~= "" and posterServerInput.Value or POSTER_SERVER_URL
		-- User cuma paste domain tunnel-nya doang (tanpa /generate) tiap kali
		-- URL ganti -- normalize di sini biar ngga 404 gara-gara lupa path.
		serverUrl = serverUrl:gsub("/+$", "")
		if not serverUrl:match("/generate$") then
			serverUrl = serverUrl .. "/generate"
		end

		statusPara:SetContent("Render poster + kirim ke Discord...")

		-- request() ga punya opsi timeout sendiri, jadi kalau koneksi HP<->PC
		-- ke-drop diam-diam (client isolation WiFi, firewall, dst) tombol ini
		-- bisa "ngestuck" tanpa pesan apa-apa. Race manual pakai task.delay
		-- biar user tetap dapet status jelas walau request aslinya belum balik.
		local settled = false
		task.spawn(function()
			local ok, res = pcall(function()
				return request({
					Url = serverUrl,
					Method = "POST",
					Headers = { ["Content-Type"] = "application/json" },
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
		-- 60 detik, bukan 10 -- hosting gratis (Render dst) suka "tidur" kalau
		-- lama ga dipakai, request pertama abis idle bisa 30-60 detik buat
		-- bangun lagi. 10 detik ketat banget, bikin false-positive "timeout".
		task.delay(60, function()
			if settled then
				return
			end
			settled = true
			statusPara:SetContent("Timeout 60 detik, ga ada respon dari '" .. serverUrl .. "'. Cek: server masih nyala? Kalau pakai hosting gratis, coba generate ulang (bisa jadi baru \"bangun\" dari sleep). Kalau local: HP & PC di WiFi yang sama? Ada firewall yang blokir?")
		end)
	end

	section:AddButton({ Title = "Generate & Kirim ke Discord", Callback = generateAndSend })

	section:AddParagraph({
		Title = "Cara pakai",
		Content = "1) Jalankan `python poster_server.py` di folder StealAnEgg (sekali aja, biarin jalan di background). "
			.. "2) Isi Discord Webhook URL. 3) Klik Generate. Poster ngambil data dari isi tas + pet yang lagi aktif, "
			.. "dihitung pakai rumus $/s asli game (AssetGenerationUtil), bukan tebakan.",
	})
end

Window:SelectTab(1)
