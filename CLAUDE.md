# NaruHub — Panduan untuk Claude

## Aturan Umum

- Jangan buat file baru kecuali diminta secara eksplisit.
- Push langsung ke branch utama (main), tidak pakai PR workflow.
- User berbicara dalam Bahasa Indonesia.

## Versioning (Semantic Versioning)

Version disimpan di `StealAnEgg/StealAnEgg.luau` pada variabel:
```lua
local VERSION = "vX.Y.Z"
```

### Kapan bump version:

**PATCH (Z)** — Bug fix, perbaikan kecil:
- Fix bug yang sudah ada (logic error, typo, wrong remote name)
- Fix UI kecil (alignment, typo label)
- Perbaikan yang tidak mengubah behavior secara signifikan

**MINOR (Y)** — Fitur baru atau perubahan fitur, reset patch ke 0:
- Tambah fitur baru (toggle baru, auto-buy baru, kolom baru)
- Ubah behavior fitur yang sudah ada (logic auto hatch berubah, formula price berubah)
- Tambah/hapus UI element yang signifikan (kolom baru di tabel, input baru di modal)
- Hapus fitur yang sudah tidak dipakai (misal hapus event toggle yang sudah expired)
- Perubahan pada remote/API calls (ganti remote name, tambah remote baru)

**MAJOR (X)** — Breaking change atau rewrite besar, reset minor dan patch ke 0:
- Rewrite total script atau arsitektur
- Migrasi ke library/framework baru
- Perubahan yang bikin config/data lama tidak kompatibel

### Aturan:
1. Setiap commit yang mengubah code (bukan hanya docs/comment), WAJIB bump version.
2. Kalau ada beberapa perubahan dalam satu commit, pakai level tertinggi (misal ada fix + fitur baru = MINOR).
3. Version bump dilakukan di file `StealAnEgg/StealAnEgg.luau` pada baris `local VERSION = "vX.Y.Z"`.
4. Perubahan yang HANYA di monitor (Next.js app) tanpa perubahan di StealAnEgg.luau TIDAK perlu bump version script.
5. Perubahan monitor + script dalam satu commit = bump version script.
