--!nocheck
-- NaruUI -- Self-contained UI library for Roblox executors
-- Loaded via loadstring() from the main script

return (function()
	local Players = game:GetService("Players")
	local UserInputService = game:GetService("UserInputService")
	local TweenService = game:GetService("TweenService")
	local HttpService = game:GetService("HttpService")
	local LocalPlayer = Players.LocalPlayer

	-- Logo: fallback ke huruf pertama Title (tanpa gambar, lebih ringan)
	local DEFAULT_LOGO_ASSET = nil

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
				logoBtn.Position = UDim2.new(0.5, -38, 0, 28)
				logoBtn.AnchorPoint = Vector2.new(0, 0)
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

				function Tab:AddSection(title, secCfg)
					secCfg = secCfg or {}
					local secFrame = uiNew("Frame", {
						BackgroundTransparency = 1,
						AutomaticSize = Enum.AutomaticSize.Y,
						Size = UDim2.new(1, 0, 0, 0),
					}, scroll)
					uiNew("UIListLayout", {
						Padding = UDim.new(0, 8),
						SortOrder = Enum.SortOrder.LayoutOrder,
					}, secFrame)

					local noCollapse = secCfg.NoCollapse == true
					local expanded = noCollapse or (secCfg.DefaultExpanded == true)

					if not noCollapse then
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
							Text = expanded and "\226\136\168" or "\226\128\186",
						}, headerBtn)

						headerBtn.MouseButton1Click:Connect(function()
							expanded = not expanded
							contentHolder.Visible = expanded
							chevron.Text = expanded and "\226\136\168" or "\226\128\186"
						end)
					end

					local contentHolder = uiNew("Frame", {
						BackgroundColor3 = UI_COL_ROW,
						BackgroundTransparency = 0.15,
						BorderSizePixel = 0,
						AutomaticSize = Enum.AutomaticSize.Y,
						Size = UDim2.new(1, 0, 0, 0),
						Visible = expanded,
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
						local titleSize = pcfg.TitleSize or 13
						local contentSize = pcfg.ContentSize or 13
						local align = pcfg.Center and Enum.TextXAlignment.Center or Enum.TextXAlignment.Left
						local r = row(0)
						r.AutomaticSize = Enum.AutomaticSize.Y
						uiNew("TextLabel", {
							BackgroundTransparency = 1,
							Size = UDim2.new(1, 0, 0, titleSize + 6),
							Font = UI_FONT_BOLD,
							TextSize = titleSize,
							TextXAlignment = align,
							TextColor3 = UI_COL_TEXT,
							Text = pcfg.Title or "",
						}, r)
						local contentLbl = uiNew("TextLabel", {
							BackgroundTransparency = 1,
							Position = UDim2.new(0, 0, 0, titleSize + 6),
							Size = UDim2.new(1, 0, 0, contentSize + 4),
							AutomaticSize = Enum.AutomaticSize.Y,
							Font = UI_FONT,
							TextSize = contentSize,
							TextWrapped = true,
							TextXAlignment = align,
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
