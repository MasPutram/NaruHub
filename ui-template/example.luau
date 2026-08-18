--!nocheck
-- Contoh minimal pakai NaruUI. Jalanin via live-reload buat coba-coba.

local NaruUI = loadstring(readfile("ui-template/NaruUI.luau"))()
-- ganti path di atas sesuai lokasi file NaruUI.luau kamu, atau kalau
-- di-loadstring dari GitHub raw, ganti jadi:
-- local NaruUI = loadstring(game:HttpGet("https://raw.githubusercontent.com/<user>/<repo>/main/NaruUI.luau"))()

local Fluent = NaruUI.New({
	BrandColor = Color3.fromRGB(255, 214, 10), -- ganti sesuai tema game baru
	ConfigPrefix = "MyScript", -- ganti biar file config-nya ga tabrakan sama script lain
})

local Window = Fluent:CreateWindow({
	Title = "MyScript",
	Badge = "BETA", -- opsional, kosongin field ini kalau ga mau ada badge
	LogoImage = "rbxassetid://0", -- opsional, ganti asset id logo kamu (atau lihat README buat logo custom embed)
	TabWidth = 150,
	Size = UDim2.fromOffset(650, 420),
})

local MainTab = Window:AddTab({ Title = "Main" })
local SettingsTab = Window:AddTab({ Title = "Settings" })

local section = MainTab:AddSection("Fitur Utama")

section:AddToggle("MyScript_AutoFarm", {
	Title = "Auto Farm",
	Default = false,
	Callback = function(enabled)
		print("Auto Farm:", enabled)
	end,
})

section:AddSlider("MyScript_Delay", {
	Title = "Delay (detik)",
	Min = 0.1,
	Max = 2,
	Default = 0.5,
	Rounding = 2,
	Callback = function(v)
		print("Delay:", v)
	end,
})

section:AddDropdown("MyScript_Target", {
	Title = "Target",
	Values = { "Pilihan A", "Pilihan B", "Pilihan C" },
	Multi = true,
	Default = {},
}):OnChanged(function(selected)
	print("Target dipilih:", selected)
end)

local statusPara = section:AddParagraph({ Title = "Status", Content = "Idle" })
section:AddButton({
	Title = "Test Notify",
	Callback = function()
		statusPara:SetDesc("Diklik pada " .. os.date("%H:%M:%S"))
		Fluent:Notify({ Title = "MyScript", Content = "Halo dari NaruUI!", Duration = 3 })
	end,
})

local settingsSection = SettingsTab:AddSection("Info")
settingsSection:AddParagraph({
	Title = "MyScript",
	Content = "Semua toggle/slider/dropdown di atas otomatis tersimpan per-HWID dan ke-load lagi tiap dijalankan ulang di device yang sama.",
})

Window:SelectTab(1)
