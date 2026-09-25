# NaruUI

Self-contained Luau UI library untuk Roblox executor scripts. Design mirip Fluent
tapi lebih ringan, dengan launcher circle bawaan (klik = minimize/restore, drag =
pindah posisi).

## Load

```lua
local httpGet = game.HttpGet or HttpGet
local src = httpGet(game, "https://raw.githubusercontent.com/MasPutram/NaruHub/main/NaruUI/NaruUI.luau?v=" .. tostring(tick()))
local NaruUI = loadstring(src)()
```

Cache-busting `?v=` biar GitHub CDN ga return versi lama.

## Basic usage

```lua
local Fluent = NaruUI.New({
    Title         = "MyHub | Game X",
    Badge         = "PREMIUM",              -- optional label kanan title
    ConfigPrefix  = "MyHub",                -- ← WAJIB unik per script biar config ga bentrok
    BrandColor    = Color3.fromRGB(255, 214, 10),
    Size          = UDim2.fromOffset(380, 400),
    AutoStartMinimized = false,
})

local Tab = Fluent:AddTab({ Title = "" })
local section = Tab:AddSection("Status", { NoCollapse = true })

section:AddParagraph({
    Title = "Username",
    Content = game.Players.LocalPlayer.Name,
    ContentSize = 14,
    Center = true,
})

section:AddToggle("AutoX", {
    Title = "Auto Something",
    Default = false,
    Callback = function(v) print("toggle:", v) end,
})

section:AddButton({
    Title = "Do It",
    Description = "Fires an action once",
    Callback = function() print("clicked") end,
})
```

## API

### `NaruUI.New(cfg)` → Window
Config:
- `Title` (string) — window title
- `Badge` (string, optional) — label kanan title
- `ConfigPrefix` (string) — prefix untuk file config (`<prefix>_Config_<hwid>.json`). **Wajib unik per script.**
- `BrandColor` (Color3) — warna aksen (stroke, accent)
- `Size` (UDim2) — ukuran window default
- `AutoStartMinimized` (bool) — start minimized?

### `Window:AddTab({ Title, Icon })` → Tab
### `Tab:AddSection(title, { NoCollapse })` → Section
### `Section:AddParagraph({ Title, Content, ContentSize, Center })`
Returns object with `:SetContent(text)` method.

### `Section:AddToggle(id, { Title, Default, Callback })`
Returns object with `:SetValue(bool)`. `id` di-save ke config.

### `Section:AddButton({ Title, Description, Callback })`

### `Section:AddSlider(id, { Title, Min, Max, Default, Callback })`

### `Section:AddDropdown(id, { Title, Values, Default, Callback })`
Returns object with `:SetValue(v)`.

### `Section:AddInput(id, { Title, Default, Placeholder, Callback })`

### `Window.Minimize()` / `Window.Restore()`
Manual toggle.

### `Window.OnClose(fn)`
Callback saat user close window.

## Launcher Circle

Bulat kecil di kiri layar (default position `(4, 100)`). **Klik pendek** = toggle
minimize/restore. **Drag** (> 4 pixel movement) = pindah posisi.

Anti-strip: parent di `CoreGui` dengan `DisplayOrder = 2_000_000_000` biar executor
cleaner (Arceus X, dll) ga bisa nyingkirin.

## Config isolation

Config setiap script disimpan di `<ConfigPrefix>_Config_<hwid>.json`. Contoh:
- NaruHub → `NaruUI_Config_ABC123.json`
- AnimeDice → `AnimeDiceHub_Config_ABC123.json`

Pisah = safe. State toggle/slider/dropdown/input di-restore otomatis on reload.

## Files

- `NaruUI.luau` — library (single file, ~1180 lines, no dependencies)
- `example.luau` — minimal template starter
