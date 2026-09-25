--!nocheck
-- NaruUI minimal starter template
-- Ganti Title/ConfigPrefix/BrandColor sesuai script lo.

local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

-- Load NaruUI dari GitHub
local httpGet = game.HttpGet or HttpGet
local src = httpGet(
	game,
	"https://raw.githubusercontent.com/MasPutram/NaruHub/main/NaruUI/NaruUI.luau?v=" .. tostring(tick())
)
local NaruUI = loadstring(src)()

-- Window setup
local Fluent = NaruUI.New({
	Title = "MyHub | ExampleGame",
	Badge = "DEMO",
	ConfigPrefix = "MyExampleHub",           -- WAJIB unik per script
	BrandColor = Color3.fromRGB(120, 200, 255),
	Size = UDim2.fromOffset(380, 400),
	AutoStartMinimized = false,
})

-- Optional: callback saat window ditutup
Fluent.OnClose(function()
	print("[Example] Window closed by user")
end)

-- Tab + Section
local Tab = Fluent:AddTab({ Title = "" })
local section = Tab:AddSection(LocalPlayer.Name, { NoCollapse = true })

-- Paragraph (status label — bisa di-update via SetContent)
local statusPara = section:AddParagraph({
	Title = "Status",
	Content = "Idle",
	ContentSize = 14,
	Center = true,
})

-- Toggle (state di-save otomatis via ConfigPrefix)
section:AddToggle("DoAutoX", {
	Title = "Auto X",
	Default = false,
	Callback = function(value)
		statusPara:SetContent(value and "Auto X ON" or "Idle")
	end,
})

-- Slider
section:AddSlider("Speed", {
	Title = "Speed",
	Min = 100,
	Max = 1000,
	Default = 400,
	Callback = function(value)
		print("[Example] Speed:", value)
	end,
})

-- Dropdown
section:AddDropdown("Mode", {
	Title = "Mode",
	Values = { "Safe", "Normal", "Aggressive" },
	Default = "Normal",
	Callback = function(value)
		print("[Example] Mode:", value)
	end,
})

-- Input
section:AddInput("Note", {
	Title = "Note",
	Default = "",
	Placeholder = "Type anything...",
	Callback = function(value)
		print("[Example] Note:", value)
	end,
})

-- Button
section:AddButton({
	Title = "Test Action",
	Description = "Click to run a one-shot action",
	Callback = function()
		statusPara:SetContent("Action fired @ " .. os.date("%H:%M:%S"))
	end,
})

print("[Example] NaruUI template loaded — check the launcher circle on the left")
