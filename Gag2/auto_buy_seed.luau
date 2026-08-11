-- Auto Buy Seed | Grow a Garden
-- Reads live stock from SeedShop UI and triggers the game's own buy handler.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer
local PlayerGui = LocalPlayer:WaitForChild("PlayerGui")

-- Pembelian sebenarnya lewat packet ini (bukan tombol UI).
-- Tombol per-item di shop cuma SELECT, bukan beli.
local PurchaseSeed
do
	local ok, net = pcall(function()
		return require(ReplicatedStorage.SharedModules.Networking)
	end)
	if ok and net and net.SeedShop then
		PurchaseSeed = net.SeedShop.PurchaseSeed
	end
end

-- Executor jalan di thread identity 8; server menolak purchase dari identity itu.
-- Identity 2 (level game script) lolos. TAPI identity 2 kehilangan kapabilitas akses
-- Instance, jadi identity hanya diturunkan sesaat saat Fire lalu dikembalikan ke 8.
local setIdentity = setthreadidentity or set_thread_identity or setidentity or setthreadcontext
local getIdentity = getthreadidentity or get_thread_identity or getidentity

local function getSheckles(): number?
	local ls = LocalPlayer:FindFirstChild("leaderstats")
	local s = ls and ls:FindFirstChild("Sheckles")
	return s and s.Value or nil
end

local CONFIG = {
	Interval = 0.35,
	BuyDelay = 0.12,
}

local State = {
	Enabled = false,
	BuyAll = true,
	Selected = {},
	LastStatus = "Siap",
	BoughtSession = 0,
}

local Gui: ScreenGui
local StatusLabel: TextLabel
local ToggleButton: TextButton
local BuyAllToggle: TextButton
local SeedList: ScrollingFrame
local SeedButtons: { [string]: TextButton } = {}

local function getSeedShop()
	return PlayerGui:FindFirstChild("SeedShop")
end

local function getNormalShop()
	local shop = getSeedShop()
	if not shop then
		return nil
	end
	local frame = shop:FindFirstChild("Frame")
	if not frame then
		return nil
	end
	return frame:FindFirstChild("NormalShop")
end

local function parseStock(text: string?): number
	if not text then
		return 0
	end
	local amount = text:match("x(%d+)")
	return tonumber(amount) or 0
end

local function parseCost(text: string?): number?
	if not text then
		return nil
	end
	local num, suffix = text:match("([%d%.]+)%s*([KkMmBb]?)")
	local value = num and tonumber(num)
	if not value then
		return nil
	end
	suffix = suffix:upper()
	if suffix == "K" then
		value *= 1e3
	elseif suffix == "M" then
		value *= 1e6
	elseif suffix == "B" then
		value *= 1e9
	end
	return value
end

local function canAfford(costText: string?): boolean
	if not costText then
		return false
	end
	return costText ~= "NO STOCK" and costText ~= "OWNED"
end

local function collectSeedEntries()
	local normalShop = getNormalShop()
	if not normalShop then
		return {}
	end

	local entries = {}
	for _, item in normalShop:GetChildren() do
		if item.Name == "ItemTemplate" or item.Name == "Sheckles_Shelf" or item.Name == "Robux_Shelf" then
			continue
		end

		local mainFrame = item:FindFirstChild("Main_Frame")
		if not mainFrame then
			continue
		end

		local stockLabel = mainFrame:FindFirstChild("Stock_Text")
		local costLabel = mainFrame:FindFirstChild("Cost_Text")
		local seedLabel = mainFrame:FindFirstChild("Seed_Text")
		local buyButton = mainFrame:FindFirstChild("TextButton")

		if not stockLabel or not costLabel or not buyButton then
			continue
		end

		local stockText = stockLabel.Text
		local costText = costLabel.Text
		local stock = parseStock(stockText)

		table.insert(entries, {
			Key = item.Name,
			Display = (seedLabel and seedLabel.Text ~= "" and seedLabel.Text) or item.Name,
			Stock = stock,
			Cost = costText,
			Price = parseCost(costText),
			Available = stock > 0 and canAfford(costText),
			BuyButton = buyButton,
		})
	end

	table.sort(entries, function(a, b)
		return a.Display < b.Display
	end)

	return entries
end

local function invokeBuy(seedKey: string): boolean
	if not PurchaseSeed then
		return false
	end
	local prev = (getIdentity and getIdentity()) or 8
	if setIdentity then
		pcall(setIdentity, 2)
	end
	local ok = pcall(function()
		PurchaseSeed:Fire(seedKey)
	end)
	if setIdentity then
		pcall(setIdentity, prev)
	end
	return ok
end

local function setStatus(text: string)
	State.LastStatus = text
	if StatusLabel then
		StatusLabel.Text = text
	end
end

local function isSelected(key: string): boolean
	if State.BuyAll then
		return true
	end
	return State.Selected[key] == true
end

local function buyEntry(entry, maxCount: number?)
	local limit = maxCount or entry.Stock
	if limit <= 0 then
		return 0
	end

	local bought = 0
	for _ = 1, limit do
		if not State.Enabled or not STATE.alive() then
			break
		end

		local fresh = collectSeedEntries()
		local current
		for _, item in fresh do
			if item.Key == entry.Key then
				current = item
				break
			end
		end

		if not current or not current.Available then
			break
		end

		local balBefore = getSheckles()
		-- Berhenti kalau tidak mampu bayar (hindari spam packet yang pasti ditolak).
		if balBefore and current.Price and balBefore < current.Price then
			break
		end

		if not invokeBuy(current.Key) then
			break
		end

		if balBefore then
			-- Saldo bisa turun beberapa ratus ms setelah fire; poll sebentar.
			local success = false
			for _ = 1, 6 do
				task.wait(CONFIG.BuyDelay)
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
				-- Tidak tercatat (habis / limit restock / ditolak) -> stop.
				break
			end
		else
			-- Tanpa data saldo, anggap sukses sekali lalu andalkan cek stok.
			task.wait(CONFIG.BuyDelay)
			bought += 1
			State.BoughtSession += 1
		end
	end

	return bought
end

local function autoBuyTick()
	if not State.Enabled then
		return
	end

	if not PurchaseSeed then
		setStatus("Networking.SeedShop.PurchaseSeed tidak ditemukan")
		return
	end

	local entries = collectSeedEntries()
	if #entries == 0 then
		setStatus("SeedShop tidak ditemukan")
		return
	end

	local balance = getSheckles()
	local targets = {}
	local blockedByFunds = false
	for _, entry in entries do
		if entry.Available and isSelected(entry.Key) then
			if balance and entry.Price and balance < entry.Price then
				blockedByFunds = true
			else
				table.insert(targets, entry)
			end
		end
	end

	if #targets == 0 then
		if blockedByFunds then
			setStatus(("Saldo kurang (%s) - menunggu..."):format(tostring(balance)))
		else
			setStatus("Menunggu restock...")
		end
		return
	end

	for _, entry in targets do
		if not State.Enabled or not STATE.alive() then
			break
		end

		setStatus(("Membeli %s (x%d)..."):format(entry.Display, entry.Stock))
		local bought = buyEntry(entry)
		if bought > 0 then
			setStatus(("Beli %s x%d | Total: %d"):format(entry.Display, bought, State.BoughtSession))
		end
	end
end

local function makeButton(parent: Instance, text: string, size: UDim2, pos: UDim2, color: Color3): TextButton
	local button = Instance.new("TextButton")
	button.Size = size
	button.Position = pos
	button.BackgroundColor3 = color
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamBold
	button.TextSize = 14
	button.TextColor3 = Color3.fromRGB(240, 240, 240)
	button.Text = text
	button.AutoButtonColor = true
	button.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = button

	return button
end

local function refreshSeedList()
	for _, child in SeedList:GetChildren() do
		if child:IsA("GuiObject") and child.Name ~= "UIListLayout" and child.Name ~= "UIPadding" then
			child:Destroy()
		end
	end
	table.clear(SeedButtons)

	local entries = collectSeedEntries()
	for index, entry in entries do
		local row = Instance.new("TextButton")
		row.Name = entry.Key
		row.Size = UDim2.new(1, -8, 0, 34)
		row.BackgroundColor3 = Color3.fromRGB(35, 38, 48)
		row.BorderSizePixel = 0
		row.Font = Enum.Font.Gotham
		row.TextSize = 13
		row.TextXAlignment = Enum.TextXAlignment.Left
		row.TextColor3 = Color3.fromRGB(230, 230, 230)
		row.AutoButtonColor = false
		row.LayoutOrder = index
		row.Parent = SeedList

		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, 6)
		corner.Parent = row

		local function paint()
			local picked = State.BuyAll or State.Selected[entry.Key] == true
			local prefix = if picked then "[✓] " else "[ ] "
			local stockText = if entry.Available then ("x%d"):format(entry.Stock) else "habis"
			row.Text = ("  %s%s  |  %s  |  %s"):format(prefix, entry.Display, stockText, entry.Cost)
			row.BackgroundColor3 = if picked
				then Color3.fromRGB(42, 78, 54)
				else Color3.fromRGB(35, 38, 48)
		end

		paint()

		row.MouseButton1Click:Connect(function()
			if State.BuyAll then
				return
			end
			State.Selected[entry.Key] = not State.Selected[entry.Key]
			paint()
		end)

		SeedButtons[entry.Key] = row
	end
end

local function buildUi()
	local existing = gethui():FindFirstChild("AutoBuySeedUI")
	if existing then
		existing:Destroy()
	end

	Gui = Instance.new("ScreenGui")
	Gui.Name = "AutoBuySeedUI"
	Gui.ResetOnSpawn = false
	Gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	Gui.Parent = gethui()

	local panel = Instance.new("Frame")
	panel.Name = "Panel"
	panel.Size = UDim2.fromOffset(340, 420)
	panel.Position = UDim2.new(0, 24, 0.5, -210)
	panel.BackgroundColor3 = Color3.fromRGB(22, 24, 30)
	panel.BorderSizePixel = 0
	panel.Parent = Gui

	local panelCorner = Instance.new("UICorner")
	panelCorner.CornerRadius = UDim.new(0, 12)
	panelCorner.Parent = panel

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(66, 135, 84)
	stroke.Thickness = 1.5
	stroke.Parent = panel

	local title = Instance.new("TextLabel")
	title.BackgroundTransparency = 1
	title.Position = UDim2.fromOffset(16, 12)
	title.Size = UDim2.new(1, -32, 0, 24)
	title.Font = Enum.Font.GothamBold
	title.TextSize = 18
	title.TextXAlignment = Enum.TextXAlignment.Left
	title.TextColor3 = Color3.fromRGB(120, 220, 140)
	title.Text = "Auto Buy Seed"
	title.Parent = panel

	ToggleButton = makeButton(
		panel,
		"Auto Buy: OFF",
		UDim2.new(1, -32, 0, 36),
		UDim2.fromOffset(16, 44),
		Color3.fromRGB(120, 50, 50)
	)

	BuyAllToggle = makeButton(
		panel,
		"Mode: Semua Stok",
		UDim2.new(1, -32, 0, 32),
		UDim2.fromOffset(16, 88),
		Color3.fromRGB(45, 70, 110)
	)

	local refreshButton = makeButton(
		panel,
		"Refresh Daftar",
		UDim2.new(0.48, -8, 0, 30),
		UDim2.fromOffset(16, 128),
		Color3.fromRGB(55, 55, 65)
	)

	local closeButton = makeButton(
		panel,
		"Tutup UI",
		UDim2.new(0.48, -8, 0, 30),
		UDim2.fromOffset(178, 128),
		Color3.fromRGB(55, 55, 65)
	)

	StatusLabel = Instance.new("TextLabel")
	StatusLabel.BackgroundTransparency = 1
	StatusLabel.Position = UDim2.fromOffset(16, 166)
	StatusLabel.Size = UDim2.new(1, -32, 0, 36)
	StatusLabel.Font = Enum.Font.Gotham
	StatusLabel.TextSize = 12
	StatusLabel.TextWrapped = true
	StatusLabel.TextXAlignment = Enum.TextXAlignment.Left
	StatusLabel.TextYAlignment = Enum.TextYAlignment.Top
	StatusLabel.TextColor3 = Color3.fromRGB(180, 180, 180)
	StatusLabel.Text = State.LastStatus
	StatusLabel.Parent = panel

	SeedList = Instance.new("ScrollingFrame")
	SeedList.Name = "SeedList"
	SeedList.BackgroundColor3 = Color3.fromRGB(16, 18, 22)
	SeedList.BorderSizePixel = 0
	SeedList.Position = UDim2.fromOffset(16, 208)
	SeedList.Size = UDim2.new(1, -32, 1, -224)
	SeedList.ScrollBarThickness = 5
	SeedList.CanvasSize = UDim2.new()
	SeedList.AutomaticCanvasSize = Enum.AutomaticSize.Y
	SeedList.Parent = panel

	local listCorner = Instance.new("UICorner")
	listCorner.CornerRadius = UDim.new(0, 8)
	listCorner.Parent = SeedList

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 4)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = SeedList

	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, 4)
	padding.PaddingBottom = UDim.new(0, 4)
	padding.PaddingLeft = UDim.new(0, 4)
	padding.PaddingRight = UDim.new(0, 4)
	padding.Parent = SeedList

	ToggleButton.MouseButton1Click:Connect(function()
		State.Enabled = not State.Enabled
		if State.Enabled then
			ToggleButton.Text = "Auto Buy: ON"
			ToggleButton.BackgroundColor3 = Color3.fromRGB(46, 125, 70)
			setStatus("Auto buy aktif...")
		else
			ToggleButton.Text = "Auto Buy: OFF"
			ToggleButton.BackgroundColor3 = Color3.fromRGB(120, 50, 50)
			setStatus("Auto buy dimatikan")
		end
	end)

	BuyAllToggle.MouseButton1Click:Connect(function()
		State.BuyAll = not State.BuyAll
		if State.BuyAll then
			BuyAllToggle.Text = "Mode: Semua Stok"
			setStatus("Mode: beli semua seed yang ada stok")
		else
			BuyAllToggle.Text = "Mode: Pilihan Manual"
			setStatus("Pilih seed dari daftar di bawah")
		end
		refreshSeedList()
	end)

	refreshButton.MouseButton1Click:Connect(function()
		refreshSeedList()
		setStatus("Daftar seed diperbarui")
	end)

	closeButton.MouseButton1Click:Connect(function()
		State.Enabled = false
		Gui:Destroy()
	end)

	refreshSeedList()
end

buildUi()

STATE.onCleanup(function()
	if Gui then
		Gui:Destroy()
	end
end)

task.spawn(function()
	local acc = 0
	local refreshAcc = 0
	while STATE.alive() do
		task.wait(0.1)
		if not State.Enabled then
			continue
		end
		acc += 0.1
		refreshAcc += 0.1
		if acc >= CONFIG.Interval then
			acc = 0
			autoBuyTick()
		end
		if refreshAcc >= 2 then
			refreshAcc = 0
			refreshSeedList()
		end
	end
end)

print("[AutoBuySeed] UI loaded. Buka SeedShop di game untuk melihat stok live.")
