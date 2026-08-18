# NaruUI Template

Library UI custom (dipakai di NaruHub) yang diekstrak jadi berdiri sendiri,
biar bisa langsung dipakai lagi buat script/game lain tanpa nulis ulang dari nol.

## Isi folder

- `NaruUI.luau` — library-nya sendiri. Self-contained, tinggal `loadstring`/`require`.
- `example.luau` — contoh pemakaian minimal (window + tab + section + toggle/slider/dropdown/button).
- `README.md` — file ini.

## Cara pakai di sesi/game baru

1. Copy `NaruUI.luau` ke project script yang baru (atau host di GitHub raw kayak `NaruHub.lua`).
2. Load dia duluan sebelum bikin UI:

```lua
local NaruUI = loadstring(game:HttpGet("https://raw.githubusercontent.com/<user>/<repo>/main/NaruUI.luau"))()

local Fluent = NaruUI.New({
	BrandColor = Color3.fromRGB(0, 200, 255), -- ganti sesuai tema game baru
	ConfigPrefix = "GameBaru", -- WAJIB diganti biar file config auto-save ga tabrakan
})

local Window = Fluent:CreateWindow({
	Title = "NamaScript",
	Size = UDim2.fromOffset(720, 480),
})
```

3. Lanjut pakai API-nya (persis kayak Fluent asli, jadi kode fitur lama gampang dipindah):
   `Window:AddTab({Title=...})` → `Tab:AddSection(title)` → `Section:AddToggle/AddSlider/AddInput/AddDropdown/AddButton/AddParagraph(...)`.

Lihat `example.luau` buat contoh lengkap yang bisa langsung dijalanin.

## Yang WAJIB disesuaikan per-game baru

- **BrandColor** — warna aksen tema (dropdown border, toggle aktif, tab terpilih, dst).
  **Default-nya udah kuning `(255,214,10)`** — warna khas kita, gak usah diganti kecuali
  memang mau tema lain buat game itu.
- **ConfigPrefix** — prefix nama file auto-save config (`writefile`). Kalau dua script beda
  pakai prefix sama, config-nya bisa saling tabrakan/ketimpa.
- **PoolSize** di `AddDropdown` kalau ada dropdown yang isinya bisa sangat panjang (500+ item,
  misal daftar pet per-instance) — default 100 cukup buat kebanyakan kasus.
- **LogoImage** (opsional) — logo di title bar, di kiri judul. Isi dengan:
  - `"rbxassetid://<id>"` kalau logonya udah di-upload ke Roblox, ATAU
  - hasil `getcustomasset()` kalau mau embed gambar sendiri tanpa upload ke Roblox (lihat
    contoh di bawah, pola yang sama dipakai NaruHub buat logo-nya).

```lua
-- Contoh embed logo sendiri (base64) tanpa upload ke Roblox:
local LOGO_B64 = "..." -- base64 dari file PNG/gambar logo kamu
local LOGO_ASSET
pcall(function()
	local dec = (function()
		if crypto and crypto.base64decode then return crypto.base64decode end
		if base64_decode then return base64_decode end
		return nil
	end)()
	if dec and writefile and getcustomasset then
		writefile("MyScript_logo.png", dec(LOGO_B64))
		LOGO_ASSET = getcustomasset("MyScript_logo.png")
	end
end)

local Window = Fluent:CreateWindow({
	Title = "MyScript",
	LogoImage = LOGO_ASSET, -- nil kalau gagal decode, title bar tetap tampil normal tanpa logo
})
```

## Yang TIDAK perlu disentuh (generic, sudah reusable)

- Auto save/load config per-HWID (pakai `gethwid`/`writefile`/`readfile`/`isfile` — otomatis
  nonaktif kalau executor-nya ga support, ga bakal error).
- Section collapsible (accordion), dropdown search + overlay-in-window, drag title bar.
- **Logo NaruHub udah ke-embed langsung (base64) di dalam `NaruUI.luau`** — otomatis kepakai
  di title bar dan di badge minimize kalau `LogoImage` ga diisi. Executor yang ga support
  base64-decode/writefile/getcustomasset bakal fallback ke tanpa logo (huruf pertama judul
  window aja di badge minimize), ga error.
- **Minimize bawaan lengkap**: klik "-" → window sembunyi, muncul badge logo bulat ngambang
  di pojok kiri atas (bisa di-drag, klik = restore). `Window:Minimize()` / `Window:Restore()`
  bisa dipanggil manual, dan `CreateWindow({ AutoStartMinimized = true })` buat langsung
  minimize pas pertama kali dibuka.
- Fix "lacking capability Plugin" pada dropdown refresh (pool tombol + retry) — ini bug
  executor yang ditemukan pas develop NaruHub, tapi generic, bisa kejadian di game manapun.

## Yang TIDAK ikut ke-bawa (spesifik NaruHub, harus dibangun ulang per-game)

- Badge "PREMIUM" spesifik itu cuma teks (`Badge = "PREMIUM"` di `CreateWindow`), tinggal
  ganti teksnya atau kosongin field-nya.
- Semua logic game-specific (Networking remote bindings, identity-switch pattern buat fire
  remote, dll) — itu HARUS diriset ulang tiap game beda (lihat cara riset di NaruHub: pakai
  MCP `real` buat script-grep/dump remote, jangan nebak-nebak nama remote).

## Catatan penting dari pengalaman develop NaruHub

- **Luau punya limit 200 local per chunk (fungsi).** Kalau script utama udah gede, nambah
  banyak `local` baru di top-level bisa langsung compile error "Out of local registers".
  Bungkus fitur baru dalam `do...end` block, atau taruh state di dalam table yang udah ada,
  bukan bikin `local` baru terus-terusan.
- **`firesignal` ga selalu reliable buat simulasi klik tombol** di beberapa executor —
  kadang jalan, kadang nge-throw "lacking capability Plugin" secara flaky/random walau cuma
  ubah properti instance yang udah ada (bukan `Instance.new`). Solusinya: retry beberapa kali
  dengan jeda singkat (`rebuildOptions` di `NaruUI.luau` udah nerapin pola ini), dan buat
  testing beneran pakai `send-input` (real OS click) bukan `firesignal` kalau mau yakin.
