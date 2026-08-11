-- UI Explorer ringan untuk melihat struktur PlayerGui.
-- Jalankan saat Seed Shop terbuka, lalu klik Refresh.

local Players = game:GetService("Players")

local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")

local old = gethui():FindFirstChild("SeedShopUiExplorer")
if old then
	old:Destroy()
end

local gui = Instance.new("ScreenGui")
gui.Name = "SeedShopUiExplorer"
gui.ResetOnSpawn = false
gui.Parent = gethui()

local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(460, 500)
panel.Position = UDim2.new(1, -480, 0.5, -250)
panel.BackgroundColor3 = Color3.fromRGB(25, 27, 34)
panel.BorderSizePixel = 0
panel.Parent = gui

Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 10)

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -120, 0, 38)
title.Position = UDim2.fromOffset(14, 0)
title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamBold
title.TextSize = 16
title.TextXAlignment = Enum.TextXAlignment.Left
title.TextColor3 = Color3.fromRGB(130, 220, 150)
title.Text = "PlayerGui Explorer"
title.Parent = panel

local function button(text, position, width)
	local result = Instance.new("TextButton")
	result.Size = UDim2.fromOffset(width, 28)
	result.Position = position
	result.BackgroundColor3 = Color3.fromRGB(55, 80, 110)
	result.BorderSizePixel = 0
	result.Font = Enum.Font.GothamBold
	result.TextSize = 12
	result.TextColor3 = Color3.fromRGB(240, 240, 240)
	result.Text = text
	result.Parent = panel
	Instance.new("UICorner", result).CornerRadius = UDim.new(0, 6)
	return result
end

local refresh = button("Refresh", UDim2.new(1, -202, 0, 5), 88)
local close = button("Tutup", UDim2.new(1, -106, 0, 5), 88)

local list = Instance.new("ScrollingFrame")
list.Size = UDim2.new(1, -28, 1, -56)
list.Position = UDim2.fromOffset(14, 44)
list.BackgroundColor3 = Color3.fromRGB(16, 18, 23)
list.BorderSizePixel = 0
list.ScrollBarThickness = 5
list.AutomaticCanvasSize = Enum.AutomaticSize.Y
list.CanvasSize = UDim2.new()
list.Parent = panel
Instance.new("UICorner", list).CornerRadius = UDim.new(0, 6)

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 2)
layout.Parent = list

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 5)
padding.PaddingBottom = UDim.new(0, 5)
padding.PaddingLeft = UDim.new(0, 7)
padding.PaddingRight = UDim.new(0, 7)
padding.Parent = list

local function addRow(text, depth, color)
	local row = Instance.new("TextLabel")
	row.Size = UDim2.new(1, 0, 0, 19)
	row.BackgroundTransparency = 1
	row.Font = Enum.Font.Code
	row.TextSize = 12
	row.TextXAlignment = Enum.TextXAlignment.Left
	row.TextColor3 = color
	row.Text = string.rep("  ", depth) .. text
	row.Parent = list
end

local function drawTree(instance, depth)
	local color = instance:IsA("GuiObject") and Color3.fromRGB(230, 230, 230) or Color3.fromRGB(150, 160, 175)
	addRow(("%s  [%s]"):format(instance.Name, instance.ClassName), depth, color)
	for _, child in instance:GetChildren() do
		drawTree(child, depth + 1)
	end
end

local function redraw()
	for _, child in list:GetChildren() do
		if child:IsA("TextLabel") then
			child:Destroy()
		end
	end
	drawTree(playerGui, 0)
end

refresh.MouseButton1Click:Connect(redraw)
close.MouseButton1Click:Connect(function()
	gui:Destroy()
end)

redraw()
print("[UI Explorer] Dibuka. Buka Seed Shop lalu klik Refresh untuk melihat hirarki UI.")
