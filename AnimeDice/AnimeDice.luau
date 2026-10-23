--!nocheck
-- NaruHub | Anime Dice v2.6.1
-- Monitoring. Self-contained GUI (inline NaruUI).

------------------------------------------------------------
-- Key Gate
------------------------------------------------------------
local SERVER_BASE_URL = "https://naruhub.my.id"
local function redactKey(value)
	value = tostring(value or "")
	if value == "" then return "" end
	if #value <= 6 then return string.rep("*", #value) end
	return value:sub(1, 3) .. "***" .. value:sub(-2)
end

local function logRequest(_tag, _url, _method, _statusCode, _responseBody, _err, _extra)
end

local DEVICE_ID = "unknown"
pcall(function()
	if gethwid then DEVICE_ID = gethwid() end
end)

local GRANTED_VIA_GLOBAL = true
local ACCESS_KEY_USED = ""

-- Fire a tiny monitor POST with jobId=nil right before leaving a server, so
-- the dashboard immediately drops this account from the current-jobId group
-- instead of waiting up to 30s for the next heartbeat. Non-blocking.
local function sendLeavingPing()
	task.spawn(function()
		pcall(function()
			local Players = game:GetService("Players")
			local HttpService = game:GetService("HttpService")
			local me = Players.LocalPlayer and Players.LocalPlayer.Name or "?"
			local body = HttpService:JSONEncode({
				game = "AnimeDice",
				sourceAccount = me,
				jobId = nil,
				placeId = game.PlaceId,
				leaving = true,
			})
			request({
				Url = SERVER_BASE_URL .. "/api/anime-dice/monitor",
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
end

do
	local HttpService = game:GetService("HttpService")

	local function checkAccess(key)
		local body = HttpService:JSONEncode({ key = key or "" })
		local reqUrl = SERVER_BASE_URL .. "/api/check-access"
		local ok, res = pcall(function()
			return request({
				Url = reqUrl,
				Method = "POST",
				Headers = { ["Content-Type"] = "application/json" },
				Body = body,
			})
		end)
		if not ok or not res then
			logRequest("check-access", reqUrl, "POST", nil, nil, res, "request_failed")
			return false, "Ga bisa hubungin server verifikasi -- coba lagi bentar.", true
		end
		logRequest("check-access", reqUrl, "POST", res.StatusCode, res.Body, nil, "key=" .. redactKey(key))
		if not res.Body then
			return false, "Ga bisa hubungin server verifikasi -- coba lagi bentar.", true
		end
		local decodeOk, parsed = pcall(function()
			return HttpService:JSONDecode(res.Body)
		end)
		if not decodeOk or type(parsed) ~= "table" then
			return false, "Respon server ga valid."
		end
		if parsed.ok then return true end
		return false, parsed.error or "Key salah."
	end

	local globalKey = ""
	pcall(function()
		if type(_G.NaruHub_Key) == "string" then
			globalKey = _G.NaruHub_Key
		end
	end)

	local granted, _errMsg, serverDown = checkAccess(globalKey)
	if not granted and globalKey ~= "" and serverDown then
		granted = true
	end
	GRANTED_VIA_GLOBAL = granted
	ACCESS_KEY_USED = globalKey

	if not granted then
		local container
		pcall(function() container = gethui and gethui() end)
		if not container then pcall(function() container = game:GetService("CoreGui") end) end
		container = container or game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")

		local screenGui = Instance.new("ScreenGui")
		screenGui.Name = "AnimeDiceKeyGate"
		screenGui.ResetOnSpawn = false
		screenGui.DisplayOrder = 9999
		screenGui.IgnoreGuiInset = true
		screenGui.Parent = container

		local frame = Instance.new("Frame")
		frame.Size = UDim2.new(0, 340, 0, 196)
		frame.Position = UDim2.new(0.5, -170, 0.5, -98)
		frame.BackgroundColor3 = Color3.fromRGB(20, 20, 31)
		frame.BorderSizePixel = 0
		frame.Parent = screenGui
		Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)

		local title = Instance.new("TextLabel")
		title.Text = "NaruHub -- Masukin Access Key"
		title.Font = Enum.Font.GothamBold
		title.TextSize = 16
		title.TextColor3 = Color3.fromRGB(232, 232, 240)
		title.BackgroundTransparency = 1
		title.Size = UDim2.new(1, -20, 0, 28)
		title.Position = UDim2.new(0, 10, 0, 12)
		title.TextXAlignment = Enum.TextXAlignment.Left
		title.Parent = frame

		local input = Instance.new("TextBox")
		input.PlaceholderText = "Access key..."
		input.Text = ""
		input.Font = Enum.Font.Gotham
		input.TextSize = 14
		input.TextColor3 = Color3.fromRGB(232, 232, 240)
		input.BackgroundColor3 = Color3.fromRGB(28, 28, 43)
		input.Size = UDim2.new(1, -20, 0, 36)
		input.Position = UDim2.new(0, 10, 0, 52)
		input.ClearTextOnFocus = false
		input.Parent = frame
		Instance.new("UICorner", input).CornerRadius = UDim.new(0, 8)

		local status = Instance.new("TextLabel")
		status.Text = "Device kamu belum di-whitelist. Masukin access key buat lanjut."
		status.Font = Enum.Font.Gotham
		status.TextSize = 12
		status.TextColor3 = Color3.fromRGB(139, 139, 163)
		status.TextWrapped = true
		status.BackgroundTransparency = 1
		status.Size = UDim2.new(1, -20, 0, 54)
		status.Position = UDim2.new(0, 10, 0, 96)
		status.TextXAlignment = Enum.TextXAlignment.Left
		status.TextYAlignment = Enum.TextYAlignment.Top
		status.Parent = frame

		local submit = Instance.new("TextButton")
		submit.Text = "Submit"
		submit.Font = Enum.Font.GothamBold
		submit.TextSize = 14
		submit.TextColor3 = Color3.fromRGB(26, 16, 48)
		submit.BackgroundColor3 = Color3.fromRGB(167, 139, 250)
		submit.Size = UDim2.new(1, -20, 0, 34)
		submit.Position = UDim2.new(0, 10, 0, 154)
		submit.Parent = frame
		Instance.new("UICorner", submit).CornerRadius = UDim.new(0, 8)

		local resultEvent = Instance.new("BindableEvent")
		local submitting = false

		local function trySubmit()
			if submitting then return end
			submitting = true
			status.Text = "Ngecek key..."
			status.TextColor3 = Color3.fromRGB(139, 139, 163)
			local okNow, reason = checkAccess(input.Text)
			if okNow then
				status.Text = "Key valid, lanjut..."
				status.TextColor3 = Color3.fromRGB(52, 211, 153)
				task.wait(0.3)
				resultEvent:Fire()
			else
				status.Text = tostring(reason)
				status.TextColor3 = Color3.fromRGB(248, 113, 113)
				submitting = false
			end
		end

		submit.MouseButton1Click:Connect(trySubmit)
		input.FocusLost:Connect(function(enterPressed)
			if enterPressed then trySubmit() end
		end)

		resultEvent.Event:Wait()
		screenGui:Destroy()
	end
end

if not GRANTED_VIA_GLOBAL then return end

------------------------------------------------------------
-- Services
------------------------------------------------------------
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TeleportService = game:GetService("TeleportService")

------------------------------------------------------------
-- NaruUI (inline)
------------------------------------------------------------
local NaruUI = (function()
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
			math.floor(BRAND.R * 255 * 0.36), math.floor(BRAND.G * 255 * 0.36), math.floor(BRAND.B * 255 * 0.36))
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
				uiNew("UIPadding", {
					PaddingLeft = UDim.new(0, 8),
					PaddingRight = UDim.new(0, 8),
				}, premiumBadge)
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
			-- Minimize: single always-visible circle button. Click toggles
			-- show/hide of the window. Parented to CoreGui directly (NOT
			-- gethui/RobloxGui) so Arceus X can't strip it; DisplayOrder
			-- maxed so nothing covers it; positioned below Roblox topbar
			-- so mobile menu/chat/backpack icons don't steal taps.
			--==============================================================
			do
				local coreGui
				pcall(function() coreGui = game:GetService("CoreGui") end)
				local altHui
				pcall(function() altHui = gethui and gethui() end)
				local hui = altHui or coreGui

				pcall(function()
					if hui then
						for _, o in ipairs(hui:GetChildren()) do
							if o.Name == (configPrefix .. "Launcher") then
								pcall(function() o:Destroy() end)
							end
						end
					end
					if altHui and coreGui and altHui ~= coreGui then
						for _, o in ipairs(coreGui:GetChildren()) do
							if o.Name == (configPrefix .. "Launcher") then
								pcall(function() o:Destroy() end)
							end
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
				if not launcher.Parent then
					pcall(function() launcher.Parent = coreGui end)
				end
				if not launcher.Parent then
					launcher.Parent = game.Players.LocalPlayer:WaitForChild("PlayerGui")
				end

				local logoBtn = Instance.new("ImageButton")
				logoBtn.Name = "Logo"
				logoBtn.Size = UDim2.fromOffset(42, 42)
				logoBtn.Position = UDim2.fromOffset(4, 100)
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
					-- launcher stays visible always so user can restore
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
							-- Toggle: minimize if visible, restore if hidden
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
							Position = UDim2.new(0, 48, 0, 0),
							Size = UDim2.new(1, -56, 1, 0),
							Font = UI_FONT,
							TextSize = 14,
							TextXAlignment = Enum.TextXAlignment.Left,
							TextColor3 = UI_COL_TEXT,
							Text = tcfg2.Title or id,
						}, r)
						local pill = uiNew("Frame", {
							Size = UDim2.fromOffset(40, 22),
							Position = UDim2.new(0, 0, 0.5, 0),
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

						local ddParent
						pcall(function() ddParent = gethui and gethui() end)
						if not ddParent then pcall(function() ddParent = game:GetService("CoreGui") end) end
						local listGui = uiNew("ScreenGui", { Name = configPrefix .. "Dropdown", ResetOnSpawn = false, DisplayOrder = 200 }, ddParent)
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
-- NaruUI Window
------------------------------------------------------------
local Fluent = NaruUI.New({
	ConfigPrefix = "AnimeDice",
	BrandColor = Color3.fromRGB(255, 100, 100),
})

local Window = Fluent:CreateWindow({
	Title = "NaruHub | Anime Dice v2.6.1",
	Badge = "MONITOR",
	TabWidth = 90,
	Size = UDim2.fromOffset(440, 340),
	AutoStartMinimized = false,
})

-- Status Tab
local StatusTab = Window:AddTab({ Title = "Status" })
local section = StatusTab:AddSection(LocalPlayer.Name, { NoCollapse = true })

local userPara = section:AddParagraph({ Title = "Username", Content = LocalPlayer.Name })
local statusPara = section:AddParagraph({ Title = "Status", Content = "Starting..." })

local function setUserContent(text) userPara:SetContent(text) end
local function setStatusContent(text) statusPara:SetContent(text) end

-- Server Hop (sama section)
do
	local PLACE_ID = game.PlaceId

	local jobIdInput = section:AddInput("HopJobId", {
		Title = "Job ID",
		Placeholder = "JobService",
		Default = "",
	})

	local function parseJobId(raw)
		if not raw or raw == "" then return nil end
		local fromLink = raw:match('TeleportToPlaceInstance%s*%(%s*%d+%s*,%s*"([^"]+)"')
		if fromLink then return fromLink end
		local stripped = raw:match("^%s*(.-)%s*$")
		if stripped and stripped ~= "" then return stripped end
		return nil
	end

	section:AddButton({
		Title = "Hop ke Job ID",
		Callback = function()
			local jobId = parseJobId(jobIdInput.Value)
			if not jobId then
				setStatusContent("Masukkan Job ID atau link dulu!")
				return
			end
			setStatusContent("Teleporting ke " .. jobId:sub(1, 12) .. "...")
			sendLeavingPing()
			pcall(function()
				TeleportService:TeleportToPlaceInstance(PLACE_ID, jobId, LocalPlayer)
			end)
		end,
	})

	section:AddButton({
		Title = "Hop ke Server Sepi",
		Callback = function()
			setStatusContent("Mencari server sepi...")
			task.spawn(function()
				local ok, result = pcall(function()
					local cursor = ""
					local bestJobId = nil
					local bestPlayers = math.huge
					local myJobId = game.JobId

					for _ = 1, 5 do
						local url = "https://games.roblox.com/v1/games/" .. PLACE_ID .. "/servers/Public?sortOrder=Asc&limit=100"
						if cursor and cursor ~= "" then
							url = url .. "&cursor=" .. cursor
						end

						local res = request({ Url = url, Method = "GET" })
						if not res or not res.Body then break end

						local data = HttpService:JSONDecode(res.Body)
						if not data or not data.data then break end

						for _, server in ipairs(data.data) do
							if server.playing and server.playing < bestPlayers and server.id ~= myJobId then
								bestPlayers = server.playing
								bestJobId = server.id
							end
						end

						cursor = data.nextPageCursor
						if not cursor or cursor == "" then break end
						task.wait(0.5)
					end

					return bestJobId, bestPlayers
				end)

				if ok and result then
					setStatusContent("Found: " .. result .. " players. Teleporting...")
					sendLeavingPing()
					pcall(function()
						TeleportService:TeleportToPlaceInstance(PLACE_ID, result, LocalPlayer)
					end)
				else
					setStatusContent("Gagal cari server: " .. tostring(result))
				end
			end)
		end,
	})

	section:AddButton({
		Title = "Hop Random Server",
		Callback = function()
			setStatusContent("Teleporting ke random server...")
			sendLeavingPing()
			pcall(function()
				TeleportService:Teleport(PLACE_ID, LocalPlayer)
			end)
		end,
	})
end

------------------------------------------------------------
-- DataController (require sebelum Network taint)
-- Wait sampai Framework ready biar nggak gagal load
------------------------------------------------------------
if not game:IsLoaded() then game.Loaded:Wait() end
ReplicatedStorage:WaitForChild("Framework"):WaitForChild("Features")
ReplicatedStorage:WaitForChild("Packages")
ReplicatedStorage:WaitForChild("Network")

local DataController = require(ReplicatedStorage.Framework.Features.Data.DataController)

------------------------------------------------------------
-- Rebirth Stats Tab
------------------------------------------------------------
do
	local RebirthTab = Window:AddTab({ Title = "Rebirth" })
	local rebirthSection = RebirthTab:AddSection("Auto Rebirth Stats", { NoCollapse = true })

	local AddStatRE = ReplicatedStorage.Network.RebirthService.RE.AddStat

	local statNames = { "Luck", "Money", "Damage", "Health", "Trait Luck", "Grade Luck" }
	local selectedStat = "Trait Luck"

	local statusPara = rebirthSection:AddParagraph({
		Title = "Status",
		Content = "Idle",
	})

	local function getRebirthRemaining()
		local totalPoints = DataController.Rebirth() or 0
		local stats = DataController.RebirthStats() or {}
		local spent = 0
		for _, v in pairs(stats) do spent = spent + v end
		return totalPoints - spent
	end

	local function getStatLevel(statName)
		local stats = DataController.RebirthStats() or {}
		return stats[statName] or 0
	end

	local function updateStatus()
		local remaining = getRebirthRemaining()
		local lv = getStatLevel(selectedStat)
		statusPara:SetContent(selectedStat .. " Lv." .. lv .. " | Sisa: " .. remaining .. " point")
	end

	local statDropdown = rebirthSection:AddDropdown("RebirthStat", {
		Title = "Target Stat",
		Values = statNames,
		Default = "Trait Luck",
	})
	statDropdown:OnChanged(function(val)
		if val then
			selectedStat = val
			updateStatus()
		end
	end)

	rebirthSection:AddButton({
		Title = "Spend 1 Point",
		Callback = function()
			local remaining = getRebirthRemaining()
			if remaining < 1 then
				statusPara:SetContent("Tidak ada point tersisa!")
				return
			end
			pcall(function() AddStatRE:FireServer(selectedStat) end)
			task.wait(0.5)
			updateStatus()
		end,
	})

	rebirthSection:AddButton({
		Title = "Spend All Points",
		Callback = function()
			local remaining = getRebirthRemaining()
			if remaining < 1 then
				statusPara:SetContent("Tidak ada point tersisa!")
				return
			end
			statusPara:SetContent("Spending " .. remaining .. " points ke " .. selectedStat .. "...")
			for _ = 1, remaining do
				pcall(function() AddStatRE:FireServer(selectedStat) end)
				task.wait(0.15)
			end
			updateStatus()
		end,
	})

	local autoRebirthEnabled = false

	rebirthSection:AddToggle("AutoRebirthStats", {
		Title = "Auto Spend",
		Default = false,
		Callback = function(v)
			autoRebirthEnabled = v
		end,
	})

	task.spawn(function()
		while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
			if autoRebirthEnabled then
				local remaining = getRebirthRemaining()
				if remaining > 0 then
					pcall(function() AddStatRE:FireServer(selectedStat) end)
					task.wait(0.3)
					updateStatus()
				end
			end
			task.wait(5)
		end
	end)

	task.defer(updateStatus)
end

------------------------------------------------------------
-- My accounts in this server (same JobId from dashboard API)
------------------------------------------------------------
do
	local myName = LocalPlayer.Name
	local sameServerAccounts = {}

	local function getJobId()
		local jid = game.JobId
		if jid and jid ~= "" then return jid end
		return nil
	end

	local function fetchSameServerAccounts()
		local currentJobId = getJobId()
		if not currentJobId then return end
		local ok, result = pcall(function()
			local res = request({
				Url = SERVER_BASE_URL .. "/api/anime-dice/accounts",
				Method = "GET",
				Headers = { ["Content-Type"] = "application/json" },
			})
			if res and res.Body then
				local parsed = HttpService:JSONDecode(res.Body)
				if parsed and parsed.accounts then
					local set = {}
					for _, acc in ipairs(parsed.accounts) do
						if acc.sourceAccount and acc.jobId == currentJobId then
							set[acc.sourceAccount] = true
						end
					end
					return set
				end
			end
			return {}
		end)
		sameServerAccounts = ok and result or {}
	end

	local function refreshPlayerList()
		local names = {}
		for name in pairs(sameServerAccounts) do
			local tag = name == myName and " ← ini" or ""
			table.insert(names, name .. tag)
		end
		if #names <= 1 then
			setUserContent(myName)
			return
		end
		table.sort(names)
		setUserContent(table.concat(names, "\n"))
	end

	task.spawn(function()
		task.wait(5)
		fetchSameServerAccounts()
		refreshPlayerList()
	end)

	task.spawn(function()
		while not Fluent.Unloaded do
			task.wait(35)
			fetchSameServerAccounts()
			refreshPlayerList()
		end
	end)
end

------------------------------------------------------------
-- Game data access (ReplicatedStorage + DataController sudah di atas)
------------------------------------------------------------
local EntryRegistry = require(ReplicatedStorage.Framework.Features.Inventory.EntryRegistry)
local MutationsConfig = require(ReplicatedStorage.Framework.Features.Inventory.Kinds.Unit.Mutations)
local TraitsConfig = require(ReplicatedStorage.Framework.Features.Traits.Traits)
local GradesConfig = require(ReplicatedStorage.Framework.Features.Grades.Grades)
local BuffController = require(ReplicatedStorage.Framework.Features.Buffs.BuffController)
local WeatherConfig = require(ReplicatedStorage.Framework.Features.Weather.WeatherConfig)
local ActiveWeatherProp = require(ReplicatedStorage.Packages.Network)
	.ClientComm.new(ReplicatedStorage.Network, false, "WeatherService")
	:GetProperty("ActiveWeather")

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
-- Color helpers
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

------------------------------------------------------------
-- Rarity tier map
------------------------------------------------------------
local RARITY_TIER = {
	Common = 1,
	Uncommon = 2,
	Rare = 3,
	Epic = 4,
	Legendary = 5,
	Mythical = 6,
	Divine = 7,
	Exotic = 8,
	["Secret I"] = 9,
	Celestial = 9,
	["Secret II"] = 10,
	Heavenly = 10,
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
-- Data collectors
------------------------------------------------------------
local function collectAccountStats()
	local X = DataController.___X
	return {
		money = X.Money or 0,
		rolls = X.Rolls or 0,
		rebirth = X.Rebirth or 0,
		dice = X.Dice or "Normal",
		autoRoll = X.AutoRoll or false,
		autoSell = X.AutoSell or 0,
		vip = (X.OwnedGamepasses and X.OwnedGamepasses.VIP) or false,
	}
end

local function collectInventory()
	local X = DataController.___X
	local inv = X.Inventory or {}
	local allEntries = EntryRegistry:allEntries()

	local units = {}
	local backpack = {}
	local totalUnitCount = 0
	local totalItemCount = 0

	for id, entry in pairs(inv) do
		if type(entry) == "table" and entry.name then
			local cfg = allEntries[entry.name]
			local rarity = cfg and cfg.rarity or "Unknown"
			local variant = cfg and cfg.variant or nil
			local kind = cfg and cfg.kind or "Unknown"
			local order = cfg and cfg.order or 0

			if kind == "Unit" then
				totalUnitCount += (entry.amount or 1)

				local attrs = entry.attributes or {}
				local income, damage, chance, health
				if cfg then
					pcall(function() income = cfg:income() end)
					pcall(function() damage = cfg:damage() end)
					pcall(function() chance = cfg:chance() end)
					pcall(function() health = cfg:health() end)
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
					colors = cfg and gradientToHexArray(cfg.gradient) or nil,
					modelName = cfg and cfg.baseModel and cfg.baseModel.Name or nil,
					shirtId = cfg and getShirtId(cfg.baseModel) or nil,
				})
			else
				totalItemCount += (entry.amount or 1)
				local slot, tier
				if cfg then
					slot = cfg.slot or cfg.Slot or cfg.gearSlot or cfg.GearSlot or cfg.category or cfg.Category
					tier = cfg.tier or cfg.Tier
				end
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
					slot = slot,
					tier = tier,
					image = image,
				})
			end
		end
	end

	table.sort(units, function(a, b)
		if a.tier ~= b.tier then return a.tier > b.tier end
		return a.order > b.order
	end)

	table.sort(backpack, function(a, b)
		return (a.amount or 0) > (b.amount or 0)
	end)

	return units, totalUnitCount, backpack, totalItemCount
end

local function collectOwnedDice()
	local X = DataController.___X
	local owned = X.OwnedDice or {}
	local list = {}
	for name, val in pairs(owned) do
		if val then table.insert(list, name) end
	end
	table.sort(list)
	return list
end

local function collectUpgradesSummary()
	local X = DataController.___X
	local upgrades = X.Upgrades or {}
	local summary = {}

	for name, unlocked in pairs(upgrades) do
		if unlocked then
			local category, levelStr = name:match("^(.+)%s+([IVXLCDM]+)$")
			if category and levelStr then
				local level = #levelStr
				if levelStr == "IV" then level = 4
				elseif levelStr == "IX" then level = 9
				elseif levelStr == "XIV" then level = 14
				elseif levelStr == "XIII" then level = 13
				elseif levelStr == "XII" then level = 12
				elseif levelStr == "XI" then level = 11
				else
					level = 0
					for c in levelStr:gmatch(".") do
						if c == "I" then level += 1
						elseif c == "V" then level += 5
						elseif c == "X" then level += 10
						elseif c == "L" then level += 50
						elseif c == "C" then level += 100
						end
					end
				end
				if not summary[category] or level > summary[category] then
					summary[category] = level
				end
			end
		end
	end

	return summary
end

local function countDiscovered()
	local X = DataController.___X
	local disc = X.DiscoveredUnits or {}
	local count = 0
	for _ in pairs(disc) do count += 1 end
	return count
end

local function collectGamepasses()
	local X = DataController.___X
	local gp = X.OwnedGamepasses or {}
	local result = {}
	for name, val in pairs(gp) do
		result[name] = val
	end
	return result
end

------------------------------------------------------------
-- Active server event (weather system)
------------------------------------------------------------
local function collectActiveEvent()
	local ok, result = pcall(function()
		local current = ActiveWeatherProp:Get()
		if not current or not current.name then return nil end
		local remaining = current.duration - (workspace:GetServerTimeNow() - current.startedAt)
		if remaining <= 0 then return nil end
		local buffs
		pcall(function()
			local cfg = WeatherConfig.Get(current.name)
			if cfg and cfg.buffs then
				buffs = {}
				for buffName, buffData in pairs(cfg.buffs) do
					buffs[buffName] = { bucket = buffData.bucket, amount = buffData.amount }
				end
			end
		end)
		return {
			name = current.name,
			duration = current.duration,
			startedAt = current.startedAt,
			remaining = remaining,
			buffs = buffs,
		}
	end)
	return ok and result or nil
end

------------------------------------------------------------
-- Report to monitor (dashboard)
------------------------------------------------------------
local function reportToMonitor()
	local ok, err = pcall(function()
		local stats = collectAccountStats()
		local units, totalUnitCount, backpackItems, totalItemCount = collectInventory()
		local ownedDice = collectOwnedDice()
		local upgradesSummary = collectUpgradesSummary()
		local discoveredCount = countDiscovered()
		local gamepasses = collectGamepasses()

		local topUnits = {}
		for i = 1, math.min(5, #units) do
			local u = units[i]
			table.insert(topUnits, {
				name = u.name,
				rarity = u.rarity,
				variant = u.variant,
				mutation = u.mutation,
				level = u.level,
				amount = u.amount,
			})
		end

		local allUnits = {}
		for _, u in ipairs(units) do
			table.insert(allUnits, {
				name = u.name,
				rarity = u.rarity,
				variant = u.variant,
				mutation = u.mutation,
				level = u.level,
				trait = u.trait,
				grade = u.grade,
				locked = u.locked,
				amount = u.amount,
				income = u.income,
				damage = u.damage,
				chance = u.chance,
				health = u.health,
				colors = u.colors,
				modelName = u.modelName,
				shirtId = u.shirtId,
			})
		end

		local globalBuffs = {}
		pcall(function()
			globalBuffs.money = BuffController.GetBuff("Money Multiplier")
			globalBuffs.damage = BuffController.GetBuff("Damage Multiplier")
			globalBuffs.health = BuffController.GetBuff("Health Multiplier")
			globalBuffs.luck = BuffController.GetBuff("Luck")
		end)

		local activeEvent = collectActiveEvent()

		local payload = {
			game = "AnimeDice",
			sourceAccount = LocalPlayer.Name,
			jobId = game.JobId,
			placeId = game.PlaceId,
			activeEvent = activeEvent,
			money = stats.money,
			rolls = stats.rolls,
			rebirth = stats.rebirth,
			dice = stats.dice,
			autoRoll = stats.autoRoll,
			autoSell = stats.autoSell,
			vip = stats.vip,
			unitsCount = totalUnitCount,
			unitTypesCount = #units,
			discoveredCount = discoveredCount,
			ownedDiceCount = #ownedDice,
			ownedDice = ownedDice,
			gamepasses = gamepasses,
			topUnits = topUnits,
			upgrades = upgradesSummary,
			allUnits = allUnits,
			backpack = backpackItems,
			totalItemCount = totalItemCount,
			globalBuffs = globalBuffs,
			serverPlayerCount = #Players:GetPlayers(),
			serverMaxPlayers = Players.MaxPlayers,
		}

		local body = HttpService:JSONEncode(payload)
		local reqUrl = SERVER_BASE_URL .. "/api/anime-dice/monitor"
		local okReq, res = pcall(function()
			return request({
				Url = reqUrl,
				Method = "POST",
				Headers = {
					["Content-Type"] = "application/json",
					["X-Device-Id"] = DEVICE_ID,
					["X-Access-Key"] = ACCESS_KEY_USED,
				},
				Body = body,
			})
		end)
		if okReq and res then
			logRequest("monitor", reqUrl, "POST", res.StatusCode, res.Body, nil, "accessKey=" .. redactKey(ACCESS_KEY_USED))
			pcall(function()
				local resBody = res.Body
				if type(resBody) == "string" and resBody ~= "" then
					local okDec, data = pcall(function()
						return HttpService:JSONDecode(resBody)
					end)
					if okDec and type(data) == "table" and data.forSale == true then
						LocalPlayer:Kick("Siap Jual")
					end
				end
			end)
		else
			logRequest("monitor", reqUrl, "POST", nil, nil, res, "accessKey=" .. redactKey(ACCESS_KEY_USED))
		end
	end)
	return ok, err
end

------------------------------------------------------------
-- Monitoring loop
------------------------------------------------------------
task.spawn(function()
	while not Fluent.Unloaded do
		local ok, err = reportToMonitor()
		local ping = 0
		pcall(function()
			ping = math.floor((LocalPlayer:GetNetworkPing() or 0) * 1000)
		end)
		local pingStr = ping > 0 and (" " .. ping .. "ms") or ""
		if ok then
			setStatusContent("OK" .. pingStr)
		else
			setStatusContent("Gagal" .. pingStr)
		end
		task.wait(30)
	end
end)

------------------------------------------------------------
-- Halloween Tab — Auto Trick-or-Treat
------------------------------------------------------------
do
	print("[Halloween] Starting tab init...")
	local HalloweenTab = Window:AddTab({ Title = "Halloween" })
	print("[Halloween] Tab created")
	local totSection = HalloweenTab:AddSection("Auto Trick-or-Treat", { NoCollapse = true })

	local totEnabled = false
	local totStatus = totSection:AddParagraph({ Title = "Status", Content = "Off" })
	local totCyclePara = totSection:AddParagraph({ Title = "Cycle", Content = "-" })

	local PORTAL1 = {
		Vector3.new(240.7, 5.2, 107.4), Vector3.new(223.1, 5.6, 87.6),
		Vector3.new(212.1, 5.6, 59.8), Vector3.new(209.7, 5.4, 36.8),
		Vector3.new(214.6, 5.4, 12.6), Vector3.new(229.3, 5.7, -5.4),
		Vector3.new(246.9, 5.7, -16.9), Vector3.new(266.3, 6.2, -25),
		Vector3.new(282.1, 4.4, -43.8), Vector3.new(284.4, 4.4, -65.9),
		Vector3.new(283.6, 4.4, -86.6),
	}
	local PORTAL2 = {
		Vector3.new(314.3, 4.4, 121.7), Vector3.new(343, 5.0, 98.4),
		Vector3.new(360.2, 4.9, 70.5), Vector3.new(363.1, 5.2, 36),
		Vector3.new(354.9, 4.8, 2.6), Vector3.new(338.2, 4.9, -17.7),
		Vector3.new(316.4, 5.5, -25.3), Vector3.new(292.2, 4.8, -36.9),
		Vector3.new(286.8, 4.4, -65), Vector3.new(286.7, 4.4, -90.6),
	}
	local PORTAL_ROUTES = {PORTAL1, PORTAL2}

	local DR1 = {
		{t="w", p=Vector3.new(-1926.9, -20, 11287.3)},
		{t="w", p=Vector3.new(-1898.7, -20, 11326.5)},
		{t="d", p=Vector3.new(-1875, -19.2, 11356.2), n="Door 5"},
		{t="d", p=Vector3.new(-1874.3, -18.5, 11323.8), n="Door 2"},
		{t="w", p=Vector3.new(-1856, -19.5, 11336.5)},
		{t="w", p=Vector3.new(-1810.2, -19.7, 11330)},
		{t="d", p=Vector3.new(-1807.6, -19.2, 11325.9), n="Door 3"},
		{t="d", p=Vector3.new(-1800.5, -19.3, 11357.2), n="Door 4"},
		{t="w", p=Vector3.new(-1844.3, -19.5, 11346.9)},
		{t="w", p=Vector3.new(-1888.4, -19.5, 11343.6)},
		{t="w", p=Vector3.new(-1936.4, -19.2, 11347.5)},
		{t="w", p=Vector3.new(-1984.7, -20, 11350.9)},
		{t="d", p=Vector3.new(-1994.1, -19.3, 11357.2), n="Door 6"},
		{t="w", p=Vector3.new(-2012.7, -19.9, 11356.3)},
		{t="w", p=Vector3.new(-2061.1, -19.5, 11353.5)},
		{t="d", p=Vector3.new(-2074.7, -19.4, 11352.5), n="Door 7"},
	}
	local DR2 = {
		{t="d", p=Vector3.new(-1913.2, -18.1, 11266.9), n="Door 1"},
		{t="w", p=Vector3.new(-1928.5, -19.6, 11273.7)},
		{t="w", p=Vector3.new(-1905.8, -20, 11315.3)},
		{t="w", p=Vector3.new(-1876.3, -19.6, 11353.5)},
		{t="d", p=Vector3.new(-1873.3, -18.1, 11367.3), n="Door 5"},
		{t="w", p=Vector3.new(-1872.2, -19.5, 11339.3)},
		{t="d", p=Vector3.new(-1873, -18.1, 11314.4), n="Door 2"},
		{t="w", p=Vector3.new(-1871.3, -19.5, 11334.6)},
		{t="w", p=Vector3.new(-1846.3, -19.5, 11333.5)},
		{t="w", p=Vector3.new(-1806.5, -19.5, 11330.8)},
		{t="d", p=Vector3.new(-1807.9, -18.3, 11320.2), n="Door 3"},
		{t="w", p=Vector3.new(-1801.1, -19.6, 11355.4)},
		{t="d", p=Vector3.new(-1799.5, -18.3, 11363.1), n="Door 4"},
		{t="w", p=Vector3.new(-1800.9, -19.6, 11355.2)},
		{t="w", p=Vector3.new(-1828, -19.5, 11344.8)},
		{t="w", p=Vector3.new(-1876, -19.5, 11346.5)},
		{t="w", p=Vector3.new(-1924.4, -19.2, 11347.7)},
		{t="w", p=Vector3.new(-1972.3, -20, 11350)},
		{t="w", p=Vector3.new(-2020.5, -20, 11353.9)},
		{t="d", p=Vector3.new(-2073.6, -19.6, 11352.8), n="Door 7"},
		{t="w", p=Vector3.new(-2036, -20, 11348.7)},
		{t="w", p=Vector3.new(-1997.6, -20, 11320.1)},
		{t="w", p=Vector3.new(-1958.8, -20, 11291.1)},
		{t="w", p=Vector3.new(-1937, -19.6, 11273.6)},
	}
	local DR3 = {
		{t="w", p=Vector3.new(-1959.6, -20, 11310.3)},
		{t="w", p=Vector3.new(-1987.7, -20, 11349.5)},
		{t="d", p=Vector3.new(-1993.2, -18.6, 11358.6), n="Door 6"},
		{t="w", p=Vector3.new(-1974, -19.6, 11331)},
		{t="w", p=Vector3.new(-1949.1, -19.6, 11298.8)},
		{t="w", p=Vector3.new(-1921.8, -18.7, 11271.4)},
		{t="d", p=Vector3.new(-1913, -18.1, 11267.7), n="Door 1"},
		{t="w", p=Vector3.new(-1934.1, -19.6, 11274.1)},
		{t="w", p=Vector3.new(-1956.1, -20, 11293)},
		{t="w", p=Vector3.new(-1995, -20, 11313.5)},
		{t="w", p=Vector3.new(-2034.6, -20, 11332.7)},
		{t="w", p=Vector3.new(-2070.7, -19.7, 11349.6)},
		{t="d", p=Vector3.new(-2076.7, -18.5, 11353), n="Door 7"},
		{t="w", p=Vector3.new(-2058.9, -19.5, 11350.6)},
		{t="w", p=Vector3.new(-2015.6, -20, 11345.7)},
		{t="w", p=Vector3.new(-1967.6, -19.5, 11344.3)},
		{t="w", p=Vector3.new(-1926.7, -19.2, 11341.9)},
		{t="w", p=Vector3.new(-1878.7, -19.5, 11338.2)},
		{t="d", p=Vector3.new(-1873.2, -18, 11314.1), n="Door 2"},
		{t="w", p=Vector3.new(-1872.8, -19.6, 11330.9)},
		{t="d", p=Vector3.new(-1872.9, -17.9, 11367.6), n="Door 5"},
		{t="w", p=Vector3.new(-1874.3, -19.5, 11346.5)},
		{t="w", p=Vector3.new(-1844.7, -19.5, 11340.4)},
		{t="w", p=Vector3.new(-1809.9, -19.5, 11328)},
		{t="d", p=Vector3.new(-1807.4, -18.3, 11320), n="Door 3"},
		{t="w", p=Vector3.new(-1801.8, -19.5, 11349.1)},
		{t="d", p=Vector3.new(-1801.1, -19, 11357.7), n="Door 4"},
		{t="w", p=Vector3.new(-1817.5, -19.5, 11342.6)},
		{t="w", p=Vector3.new(-1862.8, -19.5, 11340.7)},
		{t="w", p=Vector3.new(-1904.5, -19.5, 11341)},
		{t="w", p=Vector3.new(-1932.2, -19.2, 11334.8)},
	}
	local DR4 = {
		{t="w", p=Vector3.new(-2032.1, -20, 11332.3)},
		{t="d", p=Vector3.new(-2074.6, -19.4, 11351.7), n="Door 7"},
		{t="w", p=Vector3.new(-2064, -20, 11350.1)},
		{t="w", p=Vector3.new(-2019.9, -20, 11346.7)},
		{t="d", p=Vector3.new(-1995.4, -18.3, 11362.7), n="Door 6"},
		{t="w", p=Vector3.new(-1995.9, -19.5, 11343.7)},
		{t="w", p=Vector3.new(-1962.1, -19.2, 11335.6)},
		{t="w", p=Vector3.new(-1925.7, -19.2, 11333.2)},
		{t="w", p=Vector3.new(-1889.9, -19.5, 11335.2)},
		{t="d", p=Vector3.new(-1873.9, -18, 11314.1), n="Door 2"},
		{t="w", p=Vector3.new(-1873.4, -19.5, 11337.6)},
		{t="d", p=Vector3.new(-1873.1, -18.1, 11367.2), n="Door 5"},
		{t="w", p=Vector3.new(-1863.9, -19.5, 11344)},
		{t="w", p=Vector3.new(-1820.3, -19.5, 11333.5)},
		{t="d", p=Vector3.new(-1807.8, -19.5, 11326.1), n="Door 3"},
		{t="w", p=Vector3.new(-1806, -19.5, 11338.8)},
		{t="d", p=Vector3.new(-1799.3, -18.3, 11362.8), n="Door 4"},
		{t="w", p=Vector3.new(-1813.7, -19.5, 11341.2)},
		{t="w", p=Vector3.new(-1858.1, -19.5, 11340.8)},
		{t="w", p=Vector3.new(-1900.4, -19.5, 11340.4)},
		{t="w", p=Vector3.new(-1912.6, -19.9, 11329.3)},
		{t="w", p=Vector3.new(-1922.1, -20, 11300.8)},
		{t="w", p=Vector3.new(-1930.2, -19.6, 11274.4)},
		{t="d", p=Vector3.new(-1912.5, -17.9, 11268.5), n="Door 1"},
	}
	local DOOR_ROUTES = {DR1, DR2, DR3, DR4}
	local TOT_COOLDOWN = 30
	local doorTimers = {}

	local function totWalkTo(hum, root, target, radius)
		radius = radius or 8
		if not totEnabled then return end
		local startTime = os.clock()
		hum:MoveTo(target)
		while (root.Position - target).Magnitude > radius do
			if not totEnabled then return end
			if os.clock() - startTime > 15 then break end
			hum:MoveTo(target)
			task.wait(0.3)
		end
	end

	local function isInHalloween(root)
		return root.Position.Z > 10000
	end

	totSection:AddToggle("AutoTrickOrTreat", {
		Title = "Auto Trick-or-Treat",
		Default = false,
		Callback = function(v)
			totEnabled = v
			if not v then
				totStatus:SetContent("Off")
				totCyclePara:SetContent("-")
				return
			end
			totStatus:SetContent("Starting...")

			task.spawn(function()
				local player = LocalPlayer
				local char = player.Character or player.CharacterAdded:Wait()
				local humanoid = char:WaitForChild("Humanoid")
				local hrp = char:WaitForChild("HumanoidRootPart")

				local function refresh()
					char = player.Character or player.CharacterAdded:Wait()
					humanoid = char:WaitForChild("Humanoid")
					hrp = char:WaitForChild("HumanoidRootPart")
				end

				-- Jump thread
				task.spawn(function()
					task.wait(1)
					while totEnabled do
						pcall(function()
							local c = player.Character
							if c then
								local h = c:FindFirstChildOfClass("Humanoid")
								if h and h.Health > 0 then
									h:ChangeState(Enum.HumanoidStateType.Jumping)
								end
							end
						end)
						task.wait(math.random(3, 12))
					end
				end)

				-- Lobby → Portal (sekali)
				if not isInHalloween(hrp) then
					totStatus:SetContent("Hub → Portal...")
					local pg = player:WaitForChild("PlayerGui")
					local hubBtn = pg:FindFirstChild("Root") and pg.Root:FindFirstChild("HUD") and pg.Root.HUD:FindFirstChild("Top") and pg.Root.HUD.Top:FindFirstChild("Hub")
					if hubBtn then
						pcall(function() firesignal(hubBtn.Activated) end)
						pcall(function() hubBtn.MouseButton1Click:Fire() end)
						task.wait(2)
						refresh()
					end

					local pr = PORTAL_ROUTES[math.random(1, 2)]
					totStatus:SetContent("Walking to portal...")
					for _, wp in ipairs(pr) do
						if not totEnabled then return end
						totWalkTo(humanoid, hrp, wp, 10)
					end

					totStatus:SetContent("Entering portal...")
					local fusePos = Vector3.new(286, 21, -50)
					local attempt = 0
					while not isInHalloween(hrp) do
						if not totEnabled then return end
						attempt = attempt + 1
						humanoid:MoveTo(Vector3.new(286, 21, -140))
						local t = os.clock()
						while os.clock() - t < 4 and not isInHalloween(hrp) do
							humanoid:MoveTo(Vector3.new(286, 21, -140))
							task.wait(0.2)
						end
						if isInHalloween(hrp) then break end
						totWalkTo(humanoid, hrp, fusePos, 5)
						task.wait(1)
					end
					humanoid:MoveTo(hrp.Position)
					task.wait(3)
					refresh()
				end

				totStatus:SetContent("Farming...")
				local cycle = 0

				while totEnabled do
					cycle = cycle + 1
					local rn = math.random(1, #DOOR_ROUTES)
					local route = DOOR_ROUTES[rn]
					totCyclePara:SetContent("Cycle " .. cycle .. " (R" .. rn .. ")")

					for _, pt in ipairs(route) do
						if not totEnabled then break end
						if not humanoid or humanoid.Health <= 0 then
							char = player.CharacterAdded:Wait()
							task.wait(2)
							refresh()
							if not isInHalloween(hrp) then
								totStatus:SetContent("Respawned di lobby — stopped")
								totEnabled = false
								return
							end
						end
						if pt.t == "d" then
							local last = doorTimers[pt.n]
							local now = os.clock()
							if last and (now - last) < TOT_COOLDOWN then
								totStatus:SetContent(pt.n .. " refilling (" .. math.floor(TOT_COOLDOWN - (now - last)) .. "s)")
							else
								totStatus:SetContent(pt.n .. " ready")
							end
							totWalkTo(humanoid, hrp, pt.p, 14)
							if not last or (os.clock() - last) >= TOT_COOLDOWN then
								doorTimers[pt.n] = os.clock()
							end
							task.wait(1)
						else
							totWalkTo(humanoid, hrp, pt.p, 10)
						end
					end
				end

				totStatus:SetContent("Off")
				totCyclePara:SetContent("-")
			end)
		end,
	})
	print("[Halloween] Tab init complete")
end

------------------------------------------------------------
-- Auto Close Event Popup
-- Roblox Experience Events popup ("Join Event" with "Notify Me" button)
-- blocks the game. Destroy it the instant it appears.
------------------------------------------------------------
task.spawn(function()
	local TRIGGER_BUTTONS = { ["Notify Me"] = true, ["Notifikasikan Saya"] = true }
	local TRIGGER_LABELS  = { ["Join Event"] = true, ["Bergabung ke Acara"] = true }

	local function isTriggerText(obj)
		if obj:IsA("TextButton") and TRIGGER_BUTTONS[tostring(obj.Text or "")] then return true end
		if obj:IsA("TextLabel") and TRIGGER_LABELS[tostring(obj.Text or "")] then return true end
		return false
	end

	local function killPopupFor(node)
		local top = node
		while top and top.Parent do
			local parent = top.Parent
			if parent == game or parent.ClassName == "CoreGui" or parent.ClassName == "PlayerGui"
				or parent.Name == "CoreGui" or parent.Name == "PlayerGui" then
				break
			end
			top = parent
		end
		if not top or not top.Parent then return false end
		local n = top.Name:lower()
		if n:find("naru") or n:find("hiphub") then return false end
		return (pcall(function() top:Destroy() end))
	end

	local function scanAndClose(root)
		if not root then return end
		local killed = {}
		local ok, descs = pcall(function() return root:GetDescendants() end)
		if not ok or type(descs) ~= "table" then return end
		for _, d in ipairs(descs) do
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
					killPopupFor(d)
				end
			end
		end
	end

	local pg = LocalPlayer:FindFirstChildOfClass("PlayerGui") or LocalPlayer:WaitForChild("PlayerGui")
	local cg
	pcall(function() cg = game:GetService("CoreGui") end)

	local function attachWatcher(root)
		if not root then return end
		pcall(function()
			root.DescendantAdded:Connect(function(d)
				if isTriggerText(d) then
					task.wait()
					killPopupFor(d)
				end
			end)
		end)
	end
	attachWatcher(pg)
	attachWatcher(cg)

	scanAndClose(pg)
	scanAndClose(cg)

	while not Fluent.Unloaded and Fluent.GUI and Fluent.GUI.Parent do
		scanAndClose(pg)
		scanAndClose(cg)
		task.wait(2)
	end
end)

