--!nocheck
-- NaruHub | AnimeDice Sell Catalog v2.0.1
-- Sends enriched inventory data to dashboard catalog for marketplace listings.
-- Self-contained GUI (no external NaruUI fetch).

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
-- Services
------------------------------------------------------------
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local LocalPlayer = Players.LocalPlayer

------------------------------------------------------------
-- NaruUI (inline — no external fetch)
------------------------------------------------------------
local NaruUI = (function()
	local DEFAULT_LOGO_ASSET = nil

	local _NaruUI = {}

	function _NaruUI.New(cfg)
		cfg = cfg or {}
		local BRAND = cfg.BrandColor or Color3.fromRGB(255, 214, 10)
		local configPrefix = cfg.ConfigPrefix or "NaruUI"

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
			if not writefile then return end
			pcall(function()
				writefile(CONFIG_PATH, HttpService:JSONEncode(ConfigData))
			end)
		end

		do
			local ok = pcall(function()
				if isfile and isfile(CONFIG_PATH) then
					local decoded = HttpService:JSONDecode(readfile(CONFIG_PATH))
					if type(decoded) == "table" then ConfigData = decoded end
				end
			end)
			if not ok then ConfigData = {} end
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
			math.floor(BRAND.R * 255 * 0.36), math.floor(BRAND.G * 255 * 0.36), math.floor(BRAND.B * 255 * 0.36))
		local UI_COL_OFF = Color3.fromRGB(48, 48, 50)

		local function uiNew(class, props, parent)
			local o = Instance.new(class)
			for k, v in pairs(props) do o[k] = v end
			if parent then o.Parent = parent end
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
			if Fluent._notify then Fluent._notify(cfg2) end
		end
		function Fluent:ToggleTransparency(_state) end
		function Fluent:Destroy()
			if self.GUI then pcall(function() self.GUI:Destroy() end) end
			self.Unloaded = true
		end

		function Fluent:CreateWindow(wcfg)
			local guiParent
			pcall(function() guiParent = gethui and gethui() end)
			guiParent = guiParent or game:GetService("CoreGui")

			local screenGui = uiNew("ScreenGui", {
				Name = (wcfg.GuiName or configPrefix) .. "GUI",
				ResetOnSpawn = false,
				ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
				DisplayOrder = 100,
			}, guiParent)
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
					AutomaticSize = Enum.AutomaticSize.X,
					Size = UDim2.fromOffset(0, 18),
					LayoutOrder = 2,
				}, titleHolder)
				uiCorner(4, premiumBadge)
				uiNew("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, premiumBadge)
				uiNew("TextLabel", {
					BackgroundTransparency = 1,
					AutomaticSize = Enum.AutomaticSize.X,
					Size = UDim2.new(0, 0, 1, 0),
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
			uiNew("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, sideList)

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
						dragging = true; dragStart = input.Position; startPos = main.Position
					end
				end)
				UserInputService.InputChanged:Connect(function(input)
					if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
						local delta = input.Position - dragStart
						main.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
					end
				end)
				UserInputService.InputEnded:Connect(function(input)
					if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then dragging = false end
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
				MinButton = { SetCallback = function(_self, fn) minBtn.MouseButton1Click:Connect(fn) end },
				MaxButton = { Frame = maxBtnFrame, SetCallback = function() end },
				CloseButton = { SetCallback = function(_self, fn) closeBtn.MouseButton1Click:Connect(fn) end },
			}
			closeBtn.MouseButton1Click:Connect(function()
				if Fluent.OnWindowClose then pcall(Fluent.OnWindowClose) end
				Fluent:Destroy()
			end)

			-- Launcher circle
			do
				local coreGui
				pcall(function() coreGui = game:GetService("CoreGui") end)
				local altHui
				pcall(function() altHui = gethui and gethui() end)
				local hui = altHui or coreGui

				pcall(function()
					if hui then
						for _, o in ipairs(hui:GetChildren()) do
							if o.Name == (configPrefix .. "Launcher") then pcall(function() o:Destroy() end) end
						end
					end
					if altHui and coreGui and altHui ~= coreGui then
						for _, o in ipairs(coreGui:GetChildren()) do
							if o.Name == (configPrefix .. "Launcher") then pcall(function() o:Destroy() end) end
						end
					end
				end)

				local launcher = Instance.new("ScreenGui")
				launcher.Name = configPrefix .. "Launcher"
				launcher.ResetOnSpawn = false
				launcher.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
				launcher.IgnoreGuiInset = true
				launcher.DisplayOrder = 2_000_000_000
				launcher.Enabled = true
				pcall(function() launcher.Parent = hui end)
				if not launcher.Parent then pcall(function() launcher.Parent = coreGui end) end
				if not launcher.Parent then launcher.Parent = game.Players.LocalPlayer:WaitForChild("PlayerGui") end

				local logoBtn = Instance.new("ImageButton")
				logoBtn.Name = "Logo"
				logoBtn.Size = UDim2.fromOffset(42, 42)
				logoBtn.Position = UDim2.fromOffset(4, 100)
				logoBtn.BackgroundColor3 = Color3.fromRGB(6, 6, 7)
				logoBtn.BackgroundTransparency = 0.02
				logoBtn.AutoButtonColor = false
				logoBtn.Image = ""
				logoBtn.Parent = launcher

				Instance.new("UICorner", logoBtn).CornerRadius = UDim.new(1, 0)
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
					pcall(function() Fluent.GUI.Enabled = not state end)
				end

				pcall(function()
					Window.TitleBar.MinButton:SetCallback(function() setMinimized(true) end)
				end)
				Window.Minimize = function() setMinimized(true) end
				Window.Restore = function() setMinimized(false) end

				if wcfg.AutoStartMinimized then
					task.defer(function() setMinimized(true) end)
				end

				local dragging, dragStart, startPos, movedFar = false, nil, nil, false
				logoBtn.InputBegan:Connect(function(input)
					if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
						dragging = true; movedFar = false; dragStart = input.Position; startPos = logoBtn.Position
					end
				end)
				UserInputService.InputChanged:Connect(function(input)
					if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
						local delta = input.Position - dragStart
						if delta.Magnitude > 4 then movedFar = true end
						logoBtn.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
					end
				end)
				UserInputService.InputEnded:Connect(function(input)
					if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
						if dragging and not movedFar then
							local visible = Fluent.GUI and Fluent.GUI.Enabled
							setMinimized(visible)
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
					PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14),
					PaddingTop = UDim.new(0, 10), PaddingBottom = UDim.new(0, 14),
				}, scroll)
				uiNew("UIListLayout", { Padding = UDim.new(0, 14), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

				local Tab = { ScrollFrame = scroll, Index = idx }
				btn.MouseButton1Click:Connect(function() Window:SelectTab(idx) end)

				function Tab:AddSection(title, secCfg)
					secCfg = secCfg or {}
					local secFrame = uiNew("Frame", {
						BackgroundTransparency = 1,
						AutomaticSize = Enum.AutomaticSize.Y,
						Size = UDim2.new(1, 0, 0, 0),
					}, scroll)
					uiNew("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, secFrame)

					local noCollapse = secCfg.NoCollapse == true
					local expanded = noCollapse or (secCfg.DefaultExpanded == true)

					if not noCollapse then
						local headerBtn = uiNew("TextButton", {
							BackgroundColor3 = UI_COL_ROW, BackgroundTransparency = 0.1,
							AutoButtonColor = false, BorderSizePixel = 0,
							Size = UDim2.new(1, 0, 0, 38), Text = "", LayoutOrder = 0,
						}, secFrame)
						uiCorner(8, headerBtn)
						uiNew("Frame", {
							BackgroundColor3 = UI_COL_ACCENT, Size = UDim2.new(0, 3, 0, 16),
							Position = UDim2.new(0, 12, 0.5, 0), AnchorPoint = Vector2.new(0, 0.5), BorderSizePixel = 0,
						}, headerBtn)
						uiNew("TextLabel", {
							BackgroundTransparency = 1, Position = UDim2.new(0, 24, 0, 0),
							Size = UDim2.new(1, -50, 1, 0), Font = UI_FONT_BOLD, TextSize = 15,
							TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = UI_COL_TEXT, Text = title,
						}, headerBtn)
						local chevron = uiNew("TextLabel", {
							BackgroundTransparency = 1, Position = UDim2.new(1, -30, 0, 0),
							Size = UDim2.new(0, 20, 1, 0), Font = UI_FONT_BOLD, TextSize = 14,
							TextColor3 = UI_COL_ACCENT, Text = expanded and "\226\136\168" or "\226\128\186",
						}, headerBtn)
						headerBtn.MouseButton1Click:Connect(function()
							expanded = not expanded
							contentHolder.Visible = expanded
							chevron.Text = expanded and "\226\136\168" or "\226\128\186"
						end)
					end

					local contentHolder = uiNew("Frame", {
						BackgroundColor3 = UI_COL_ROW, BackgroundTransparency = 0.15,
						BorderSizePixel = 0, AutomaticSize = Enum.AutomaticSize.Y,
						Size = UDim2.new(1, 0, 0, 0), Visible = expanded, LayoutOrder = 1,
					}, secFrame)
					uiCorner(8, contentHolder)
					uiNew("UIPadding", {
						PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14),
						PaddingTop = UDim.new(0, 13), PaddingBottom = UDim.new(0, 13),
					}, contentHolder)
					uiNew("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, contentHolder)

					local Section = { Frame = contentHolder, _order = 0 }
					local function nextOrder() Section._order += 1; return Section._order end
					local function srow(height)
						return uiNew("Frame", {
							BackgroundTransparency = 1,
							Size = UDim2.new(1, 0, 0, height or 36),
							LayoutOrder = nextOrder(),
						}, contentHolder)
					end

					function Section:AddParagraph(pcfg2)
						local titleSize = pcfg2.TitleSize or 13
						local contentSize = pcfg2.ContentSize or 13
						local align = pcfg2.Center and Enum.TextXAlignment.Center or Enum.TextXAlignment.Left
						local r = srow(0)
						r.AutomaticSize = Enum.AutomaticSize.Y
						uiNew("TextLabel", {
							BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, titleSize + 6),
							Font = UI_FONT_BOLD, TextSize = titleSize, TextXAlignment = align,
							TextColor3 = UI_COL_TEXT, Text = pcfg2.Title or "",
						}, r)
						local contentLbl = uiNew("TextLabel", {
							BackgroundTransparency = 1, Position = UDim2.new(0, 0, 0, titleSize + 6),
							Size = UDim2.new(1, 0, 0, contentSize + 4),
							AutomaticSize = Enum.AutomaticSize.Y, Font = UI_FONT,
							TextSize = contentSize, TextWrapped = true, TextXAlignment = align,
							TextYAlignment = Enum.TextYAlignment.Top, TextColor3 = UI_COL_DIM,
							Text = pcfg2.Content or "",
						}, r)
						uiNew("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder }, r)
						local obj = {}
						function obj:SetDesc(t) contentLbl.Text = t end
						function obj:SetContent(t) contentLbl.Text = t end
						return obj
					end

					function Section:AddButton(bcfg)
						local r = srow(32)
						local btn2 = uiNew("TextButton", {
							Size = UDim2.fromScale(1, 1), BackgroundColor3 = UI_COL_ROW2,
							AutoButtonColor = true, Font = UI_FONT, TextSize = 13,
							TextColor3 = UI_COL_TEXT, Text = bcfg.Title or "Button",
						}, r)
						uiCorner(6, btn2)
						if bcfg.Callback then btn2.MouseButton1Click:Connect(bcfg.Callback) end
						return {}
					end

					function Section:AddToggle(id, tcfg2)
						local r = srow(30)
						uiNew("TextLabel", {
							BackgroundTransparency = 1, Position = UDim2.new(0, 48, 0, 0),
							Size = UDim2.new(1, -56, 1, 0), Font = UI_FONT, TextSize = 14,
							TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = UI_COL_TEXT,
							Text = tcfg2.Title or id,
						}, r)
						local pill = uiNew("Frame", {
							Size = UDim2.fromOffset(40, 22), Position = UDim2.new(0, 0, 0.5, 0),
							AnchorPoint = Vector2.new(0, 0.5),
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
							state = v; obj.Value = v
							pill.BackgroundColor3 = v and UI_COL_ACCENT or UI_COL_OFF
							NaruTween:Create(knob, TweenInfo.new(0.12), {
								Position = v and UDim2.new(1, -2, 0.5, 0) or UDim2.new(0, 2, 0.5, 0),
								AnchorPoint = v and Vector2.new(1, 0.5) or Vector2.new(0, 0.5),
							}):Play()
							if fire then
								ConfigData[id] = v; saveConfig()
								if tcfg2.Callback then tcfg2.Callback(v) end
							end
						end
						click.MouseButton1Click:Connect(function() apply(not state, true) end)
						function obj:SetValue(v) apply(v, true) end
						obj.Value = state
						Fluent.Options[id] = obj
						if ConfigData[id] ~= nil then
							task.defer(function() apply(ConfigData[id] and true or false, true) end)
						elseif tcfg2.Default then
							task.defer(function() if tcfg2.Callback then tcfg2.Callback(true) end end)
						end
						return obj
					end

					function Section:AddInput(id, icfg)
						local r = srow(36)
						uiNew("TextLabel", {
							BackgroundTransparency = 1, Size = UDim2.new(0.55, 0, 1, 0),
							Font = UI_FONT, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left,
							TextColor3 = UI_COL_TEXT, Text = icfg.Title or id,
						}, r)
						local box = uiNew("TextBox", {
							Size = UDim2.new(0.42, 0, 0, 26),
							Position = UDim2.new(1, 0, 0.5, 0), AnchorPoint = Vector2.new(1, 0.5),
							BackgroundColor3 = UI_COL_ROW2, Font = UI_FONT, TextSize = 13,
							TextColor3 = UI_COL_TEXT, PlaceholderText = icfg.Placeholder or "",
							Text = tostring(icfg.Default or ""), ClearTextOnFocus = false,
						}, r)
						uiCorner(6, box)
						uiNew("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, box)

						local obj = { Value = tostring(icfg.Default or "") }
						local function commit()
							local v = box.Text
							if icfg.Numeric then v = tostring(tonumber(v) or icfg.Default or 0); box.Text = v end
							obj.Value = v; ConfigData[id] = v; saveConfig()
							if icfg.Callback then icfg.Callback(v) end
						end
						if icfg.Finished then box.FocusLost:Connect(commit)
						else box:GetPropertyChangedSignal("Text"):Connect(commit) end
						function obj:SetValue(v) box.Text = tostring(v); commit() end
						Fluent.Options[id] = obj
						if ConfigData[id] ~= nil then task.defer(function() obj:SetValue(ConfigData[id]) end) end
						return obj
					end

					function Section:AddDropdown(id, dcfg)
						local r = srow(36)
						uiNew("TextLabel", {
							BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 16),
							Font = UI_FONT, TextSize = 13, TextXAlignment = Enum.TextXAlignment.Left,
							TextColor3 = UI_COL_TEXT, Text = dcfg.Title or id,
						}, r)
						local head = uiNew("TextButton", {
							Position = UDim2.new(0, 0, 0, 20), Size = UDim2.new(1, 0, 0, 26),
							BackgroundColor3 = UI_COL_ROW2, AutoButtonColor = true,
							Font = UI_FONT, TextSize = 13, TextColor3 = UI_COL_TEXT,
							TextXAlignment = Enum.TextXAlignment.Left, Text = "  --",
						}, r)
						uiCorner(6, head)

						local values = dcfg.Values or {}
						local multi = dcfg.Multi or false
						local selected = {}
						local poolSize = dcfg.PoolSize or 100

						local ddParent
						pcall(function() ddParent = gethui and gethui() end)
						if not ddParent then pcall(function() ddParent = game:GetService("CoreGui") end) end
						local listGui = uiNew("ScreenGui", { Name = configPrefix .. "Dropdown", ResetOnSpawn = false, DisplayOrder = 200 }, ddParent)
						local backdrop = uiNew("TextButton", {
							Visible = false, Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1,
							AutoButtonColor = false, Text = "", ZIndex = 49,
						}, listGui)
						local listFrame = uiNew("Frame", {
							Visible = false, BackgroundColor3 = UI_COL_ROW2, BorderSizePixel = 0, ZIndex = 50,
						}, listGui)
						uiCorner(6, listFrame)
						uiStroke(BRAND, 1, listFrame)

						local searchBox = uiNew("TextBox", {
							Position = UDim2.new(0, 4, 0, 4), Size = UDim2.new(1, -8, 0, 24),
							BackgroundColor3 = UI_COL_ROW, Font = UI_FONT, TextSize = 12,
							TextColor3 = UI_COL_TEXT, PlaceholderText = "Cari...",
							ClearTextOnFocus = false, ZIndex = 51,
						}, listFrame)
						uiCorner(5, searchBox)
						uiNew("UIPadding", { PaddingLeft = UDim.new(0, 8), PaddingRight = UDim.new(0, 8) }, searchBox)
						local listTop = 30

						local listScroll = uiNew("ScrollingFrame", {
							Position = UDim2.new(0, 0, 0, listTop), Size = UDim2.new(1, 0, 1, -listTop),
							BackgroundTransparency = 1, BorderSizePixel = 0, ScrollBarThickness = 3,
							CanvasSize = UDim2.new(0, 0, 0, 0), AutomaticCanvasSize = Enum.AutomaticSize.Y, ZIndex = 50,
						}, listFrame)
						uiNew("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder }, listScroll)

						local function headerText()
							local names = {}
							for name in pairs(selected) do table.insert(names, name) end
							table.sort(names)
							if #names == 0 then return "  --" end
							return "  " .. table.concat(names, ", ")
						end

						local optionBtns = {}

						local function fireChange()
							ConfigData[id] = multi and selected or (next(selected))
							saveConfig()
							if dcfg._onChanged then
								if multi then dcfg._onChanged(selected) else dcfg._onChanged((next(selected))) end
							end
						end

						local function setSelected(name, on)
							if not multi then selected = {} end
							selected[name] = on or nil
							head.Text = headerText()
							for n, b in pairs(optionBtns) do
								b.BackgroundColor3 = selected[n] and UI_COL_ACCENT_DIM or UI_COL_ROW2
							end
						end

						local function closeDropdown() listFrame.Visible = false; backdrop.Visible = false end

						local optionPool = {}
						local slotName = {}
						for i = 1, poolSize do
							local ob = uiNew("TextButton", {
								Size = UDim2.new(1, 0, 0, 26), BackgroundColor3 = UI_COL_ROW2,
								AutoButtonColor = true, Font = UI_FONT, TextSize = 12,
								TextColor3 = UI_COL_TEXT, Text = "", TextXAlignment = Enum.TextXAlignment.Left,
								LayoutOrder = i, ZIndex = 50, Visible = false,
							}, listScroll)
							optionPool[i] = ob
							ob.MouseButton1Click:Connect(function()
								local name = slotName[ob]
								if not name then return end
								if multi then setSelected(name, not selected[name])
								else setSelected(name, true); closeDropdown() end
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
								if ok then return true end
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
								for _, name in ipairs(dcfg.Default) do selected[name] = true end
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
							listFrame.Visible = opening; backdrop.Visible = opening
							if opening then
								local mainAbs, mainSize = main.AbsolutePosition, main.AbsoluteSize
								local listW = math.min(240, mainSize.X - 20)
								local x = mainAbs.X + mainSize.X - listW
								listFrame.Position = UDim2.fromOffset(x, mainAbs.Y)
								listFrame.Size = UDim2.fromOffset(listW, mainSize.Y)
								searchBox.Text = ""
								for _, ob in pairs(optionBtns) do ob.Visible = true end
							end
						end)

						local obj = {}
						function obj:OnChanged(fn) dcfg._onChanged = fn end
						function obj:SetValue(v)
							if type(v) == "table" then
								selected = {}
								for name, on in pairs(v) do if on then selected[name] = true end end
							else selected = { [v] = true } end
							head.Text = headerText()
							for n, b in pairs(optionBtns) do
								b.BackgroundColor3 = selected[n] and UI_COL_ACCENT_DIM or UI_COL_ROW2
							end
							fireChange()
						end
						function obj:SetValues(newValues) values = newValues; rebuildOptions() end
						Fluent.Options[id] = obj
						if ConfigData[id] ~= nil then task.defer(function() obj:SetValue(ConfigData[id]) end)
						elseif dcfg._onChanged and dcfg.Default then task.defer(fireChange) end
						return obj
					end

					return Section
				end

				tabs[idx] = Tab
				return Tab
			end

			function Window:SelectTab(idx2)
				if type(idx2) == "table" then idx2 = idx2.Index end
				for i, t in ipairs(tabs) do
					local active = (i == idx2)
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

	return _NaruUI
end)()

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
	Title = "NaruHub | AD Catalog v2.0.1",
	Badge = "SELL",
	TabWidth = 90,
	Size = UDim2.fromOffset(540, 460),
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
	local TradeTab = Window:AddTab({ Title = "Trade" })
	local tradeSection = TradeTab:AddSection("Smart Trade", { NoCollapse = true })

	local tradeStatusPara = tradeSection:AddParagraph({
		Title = "Status",
		Content = "Connecting...",
		ContentSize = 13,
		Center = true,
	})

	local RequestTrade, ChangeOffer, AdvanceTrade, CancelTrade, TradeEvent
	local tradeReady = false
	local tradeEventHandler -- set after offerAllItems is defined
	local tradeInitError = nil
	task.spawn(function()
		local ok, err = pcall(function()
			local ClientComm = require(ReplicatedStorage.Packages.Network).ClientComm
			local TradeComm = ClientComm.new(ReplicatedStorage.Network, false, "TradeService")
			RequestTrade = TradeComm:GetSignal("RequestTrade")
			ChangeOffer = TradeComm:GetSignal("ChangeOffer")
			AdvanceTrade = TradeComm:GetSignal("AdvanceTrade")
			CancelTrade = TradeComm:GetSignal("CancelTrade")
			TradeEvent = TradeComm:GetSignal("TradeEvent")
		end)
		if not ok then
			tradeInitError = tostring(err)
			return
		end
		tradeReady = true
	end)

	-- Update status + connect TradeEvent from a clean (untainted) thread
	task.spawn(function()
		while not tradeReady and not tradeInitError do task.wait(0.1) end
		if tradeInitError then
			tradeStatusPara:SetContent("Trade error: " .. tradeInitError)
			return
		end
		tradeStatusPara:SetContent("Idle")
		while not tradeEventHandler do task.wait(0.1) end
		TradeEvent:Connect(tradeEventHandler)
	end)

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

	local tradeActive = false
	local currentTradeState = nil
	local offeredEntries = {} -- track { [entryId] = amount } for remove

	tradeSection:AddButton({
		Title = "Send Request",
		Callback = function()
			if not tradeReady then tradeStatusPara:SetContent("ERROR: Trade not ready"); return end
			if not targetPlayer or not targetPlayer.Parent then tradeStatusPara:SetContent("ERROR: Select target"); return end
			tradeActive = true
			tradeStatusPara:SetContent("Requesting trade with " .. targetPlayer.Name .. "...")
			pcall(function() RequestTrade:Fire(targetPlayer) end)
		end,
	})

	tradeSection:AddButton({
		Title = "Cancel Trade",
		Callback = function()
			if not tradeReady then return end
			tradeActive = false
			offeredEntries = {}
			pcall(function() CancelTrade:Fire() end)
			tradeStatusPara:SetContent("Trade cancelled")
		end,
	})

	-- Helper: find inventory entryId by name
	local function findEntryId(itemName)
		local inv = DataController.___X.Inventory or {}
		for entryId, entry in pairs(inv) do
			if type(entry) == "table" and entry.name == itemName then
				return entryId, entry
			end
		end
		return nil, nil
	end

	-- Items to offer (each with Offer + Remove buttons)
	local itemSection = TradeTab:AddSection("Items to Offer", { NoCollapse = true })

	local itemInputs = {}
	local TRADE_ITEMS = { "Gem", "Trait Reroll Token", "Lucky Spin Token", "Jackpot Token" }
	for _, itemName in ipairs(TRADE_ITEMS) do
		itemInputs[itemName] = itemSection:AddInput("Trade_" .. itemName, {
			Title = itemName,
			Placeholder = "0",
			Default = "0",
			Numeric = true,
			Finished = false,
		})

		itemSection:AddButton({
			Title = "Offer " .. itemName,
			Callback = function()
				if not tradeReady or not currentTradeState then
					tradeStatusPara:SetContent("ERROR: No active trade")
					return
				end
				local qty = tonumber(itemInputs[itemName].Value) or 0
				if qty <= 0 then tradeStatusPara:SetContent("Set " .. itemName .. " amount first"); return end

				local entryId, entry = findEntryId(itemName)
				if not entryId then
					tradeStatusPara:SetContent("ERROR: " .. itemName .. " not found in inventory")
					return
				end
				local sendAmt = math.min(qty, entry.amount or 0)
				if sendAmt <= 0 then tradeStatusPara:SetContent(itemName .. " amount is 0"); return end

				local ok, err = pcall(function() ChangeOffer:Fire(entryId, sendAmt) end)
				if ok then
					offeredEntries[entryId] = (offeredEntries[entryId] or 0) + sendAmt
					tradeStatusPara:SetContent("Offered " .. sendAmt .. "x " .. itemName)
				else
					tradeStatusPara:SetContent("Error: " .. tostring(err))
				end
			end,
		})

		itemSection:AddButton({
			Title = "Remove " .. itemName,
			Callback = function()
				if not tradeReady or not currentTradeState then
					tradeStatusPara:SetContent("ERROR: No active trade")
					return
				end
				local entryId = findEntryId(itemName)
				if not entryId then tradeStatusPara:SetContent(itemName .. " not found"); return end

				local offered = offeredEntries[entryId] or 0
				if offered <= 0 then tradeStatusPara:SetContent(itemName .. " not offered"); return end

				local ok, err = pcall(function() ChangeOffer:Fire(entryId, -offered) end)
				if ok then
					offeredEntries[entryId] = nil
					tradeStatusPara:SetContent("Removed " .. itemName .. " from offer")
				else
					tradeStatusPara:SetContent("Error: " .. tostring(err))
				end
			end,
		})
	end

	-- Units to offer
	local unitSection = TradeTab:AddSection("Units to Offer", { NoCollapse = true })

	local chanceFilterInput = unitSection:AddInput("TradeChanceFilter", {
		Title = "Min Chance (sx)",
		Placeholder = "e.g. 21",
		Default = "1",
		Numeric = true,
		Finished = false,
	})

	local unitCountInput = unitSection:AddInput("TradeUnitCount", {
		Title = "Max Units",
		Placeholder = "0 = all",
		Default = "0",
		Numeric = true,
		Finished = false,
	})

	local unitPreviewPara = unitSection:AddParagraph({
		Title = "Preview",
		Content = "Set filter then Preview",
		ContentSize = 11,
	})

	local function parseChanceSx()
		local v = tonumber(chanceFilterInput.Value) or 1
		return v * 1e21
	end

	local function buildUnitQueue()
		local units, _ = collectCatalog()
		local minChance = parseChanceSx()
		local maxCount = tonumber(unitCountInput.Value) or 0

		local unitQueue = {}
		for _, u in ipairs(units) do
			if u.chance and u.chance >= minChance and not u.placed and not u.locked then
				table.insert(unitQueue, u)
			end
		end
		table.sort(unitQueue, function(a, b) return (a.chance or 0) > (b.chance or 0) end)
		if maxCount > 0 and #unitQueue > maxCount then
			local trimmed = {}
			for i = 1, maxCount do trimmed[i] = unitQueue[i] end
			unitQueue = trimmed
		end
		return unitQueue
	end

	local function previewUnits()
		local filtered = buildUnitQueue()

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

	unitSection:AddButton({
		Title = "Offer Units",
		Callback = function()
			if not tradeReady or not currentTradeState then
				tradeStatusPara:SetContent("ERROR: No active trade")
				return
			end
			task.spawn(function()
				local unitQueue = buildUnitQueue()
				if #unitQueue == 0 then tradeStatusPara:SetContent("No units match filter"); return end

				local offered = 0
				tradeStatusPara:SetContent("Offering " .. #unitQueue .. " units...")
				for _, u in ipairs(unitQueue) do
					if u.id and not offeredEntries[u.id] then
						local ok, err = pcall(function() ChangeOffer:Fire(u.id, 1) end)
						if ok then
							offeredEntries[u.id] = 1
							offered += 1
						else
							tradeStatusPara:SetContent("Unit error: " .. tostring(err))
							return
						end
						task.wait(0.15)
					end
				end
				tradeStatusPara:SetContent("Offered " .. offered .. " units")

				if autoReady then
					task.wait(0.5)
					pcall(function() AdvanceTrade:Fire() end)
					tradeStatusPara:SetContent("Offered " .. offered .. " units + Ready sent")
				end
			end)
		end,
	})

	unitSection:AddButton({
		Title = "Remove All Units",
		Callback = function()
			if not tradeReady or not currentTradeState then
				tradeStatusPara:SetContent("ERROR: No active trade")
				return
			end
			task.spawn(function()
				local removed = 0
				for entryId, amt in pairs(offeredEntries) do
					if amt == 1 then
						local ok = pcall(function() ChangeOffer:Fire(entryId, -1) end)
						if ok then
							offeredEntries[entryId] = nil
							removed += 1
						end
						task.wait(0.1)
					end
				end
				tradeStatusPara:SetContent("Removed " .. removed .. " units from offer")
			end)
		end,
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

	-- Trade event handler
	tradeEventHandler = function(event, data)
		if event == "Started" then
			currentTradeState = { ownOffer = {}, otherOffer = {}, phase = "Offer" }
			offeredEntries = {}
			tradeStatusPara:SetContent("Trade started with " .. (data.partner and data.partner.Name or "?"))

		elseif event == "Updated" then
			currentTradeState = data
			if tradeActive and data.phase == "Confirm" and autoAccept and not data.ownAccepted then
				task.wait(0.3)
				pcall(function() AdvanceTrade:Fire() end)
				tradeStatusPara:SetContent("Auto-accepted!")
			end

		elseif event == "Ended" then
			local reason = data.reason or "?"
			currentTradeState = nil
			tradeActive = false
			offeredEntries = {}
			tradeStatusPara:SetContent("Trade ended: " .. reason)
		end
	end

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
