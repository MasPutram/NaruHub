"""
StealAnEgg poster renderer.

Runs a tiny local HTTP server. The Roblox script POSTs account data (JSON) to
http://127.0.0.1:8765/generate and this renders a "jual akun" poster PNG
(matching the reference layout: top picks, all-speed grid, active pets list,
total value box).

Delivery to Discord is either:
  - Webhook (existing, unchanged): payload.price is already filled -> posted
    straight to payload.webhookUrl, no interaction needed.
  - Bot + button (new): payload.price is empty AND a bot is configured in
    bot_config.json -> poster (no price yet) is posted by the bot to the
    "draft" channel with an "Isi Harga" button. Clicking it opens a modal;
    submitting re-renders the poster WITH the price and posts the final
    image to a separate "final" channel.

Run: python poster_server.py
"""

import asyncio
import io
import json
import os
import re
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

try:
    import discord
    from discord.ext import commands
    DISCORD_AVAILABLE = True
except ImportError:
    DISCORD_AVAILABLE = False

PORT = int(os.environ.get("PORT", 8765))
ASSETS_DIR = Path(__file__).parent / "assets"
NORMAL_DIR = ASSETS_DIR / "Normal"
MUTATION_DIR = ASSETS_DIR / "Mutation"
COMBO_DIR = ASSETS_DIR / "MutationCombo"

# Dashboard "Monitor Lokal" -- sourceAccount -> {money, speed, income,
# petsCount, stolenCount, topPets, lastSeen}. Di memori aja (ga persist),
# tiap akun lapor sendiri berkala lewat POST /monitor jadi ilang pas
# server restart itu ga masalah -- kembali muncul begitu akun lapor lagi.
ACCOUNTS: dict[str, dict] = {}
ACCOUNTS_LOCK = threading.Lock()
ONLINE_TIMEOUT_S = 45  # ga lapor lebih dari ini dianggap OFFLINE di dashboard

# Antrian command per akun -- dashboard nambahin command (misal
# "restart_script") lewat POST /api/queue-command, terus agent Termux yang
# jalan di instance itu polling GET /api/poll-command dan ngambil (pop)
# command pertama buat dieksekusi. Di memori aja, sama kayak ACCOUNTS.
COMMANDS: dict[str, list] = {}
COMMANDS_LOCK = threading.Lock()

# Font dibundling di repo (fonts/) biar jalan di Linux (Render dst) yang ga
# punya C:\Windows\Fonts. Kalau ternyata jalan lokal di Windows dan folder
# bundled-nya hilang, jatuh balik ke Arial bawaan OS.
_BUNDLED_FONT_DIR = Path(__file__).parent / "fonts"
_WINDOWS_FONT_DIR = Path("C:/Windows/Fonts")
if (_BUNDLED_FONT_DIR / "DejaVuSans-Bold.ttf").exists():
    FONT_BOLD = _BUNDLED_FONT_DIR / "DejaVuSans-Bold.ttf"
    FONT_REGULAR = _BUNDLED_FONT_DIR / "DejaVuSans.ttf"
else:
    FONT_BOLD = _WINDOWS_FONT_DIR / "arialbd.ttf"
    FONT_REGULAR = _WINDOWS_FONT_DIR / "arial.ttf"

# ---- palette (light card look, matching the reference) ----
BG = (223, 231, 240)
CARD_BG = (255, 255, 255)
CARD_BG_SOFT = (241, 245, 249)
NAVY = (30, 41, 59)
DIM = (100, 116, 139)
GREEN = (22, 163, 74)
GOLD = (202, 138, 4)
PURPLE = (147, 51, 234)
BLUE = (37, 99, 235)
BORDER = (203, 213, 225)

_icon_cache: dict[str, Image.Image] = {}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size)


def find_icon(category: str, mutations: list[str]) -> Image.Image | None:
    """Prefer an exact owned mutation-combo render, else species icon, else a
    plain grey placeholder. Cached by resolved filename."""
    mut_key = "+".join(sorted(mutations)) if mutations else ""
    cache_key = f"{category}|{mut_key}"
    if cache_key in _icon_cache:
        return _icon_cache[cache_key]

    img = None
    if COMBO_DIR.exists():
        for f in COMBO_DIR.glob("*.png"):
            if category.lower() in f.stem.lower():
                if mut_key and all(m.lower() in f.stem.lower() for m in mutations):
                    img = Image.open(f)
                    break
    if img is None and NORMAL_DIR.exists():
        for f in NORMAL_DIR.glob("*.png"):
            stem = f.stem
            base = re.sub(r"\s*\[[^\]]+\]\s*$", "", stem).strip()
            if base.lower() == category.lower():
                img = Image.open(f)
                break
    if img is None:
        img = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse([20, 20, 180, 180], fill=(203, 213, 225, 255))

    img = img.convert("RGBA")
    _icon_cache[cache_key] = img
    return img


def fmt_money(v: float) -> str:
    v = float(v)
    for cut, suffix in [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]:
        if abs(v) >= cut:
            return f"${v / cut:.1f}{suffix}/s"
    return f"${v:.0f}/s"


def fmt_currency(v: float) -> str:
    """Sama kayak fmt_money tapi buat SALDO (bukan rate) -- ga ada '/s'."""
    v = float(v)
    for cut, suffix in [(1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")]:
        if abs(v) >= cut:
            return f"${v / cut:.1f}{suffix}"
    return f"${v:.0f}"


def fmt_weight(kg: float) -> str:
    return f"{kg:,.0f} Kg" if kg >= 1 else f"{kg:.2f} Kg"


def fmt_duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m}m"
    if m:
        return f"{m}m {s}s"
    return f"{s}s"


def rounded_card(draw: ImageDraw.ImageDraw, box, radius=18, fill=CARD_BG, outline=BORDER, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def paste_icon(canvas: Image.Image, icon: Image.Image, box):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    thumb = icon.copy()
    thumb.thumbnail((w, h), Image.LANCZOS)
    px = x0 + (w - thumb.width) // 2
    py = y0 + (h - thumb.height) // 2
    canvas.paste(thumb, (px, py), thumb)


def mutation_tag_color(name: str):
    n = name.lower()
    if "rainbow" in n:
        return PURPLE
    if "golden" in n:
        return GOLD
    if "silver" in n:
        return (100, 116, 139)
    return BLUE


def draw_text_centered(draw, xy, text, fnt, fill, anchor="mm"):
    draw.text(xy, text, font=fnt, fill=fill, anchor=anchor)


def group_by_mutation(pets: list[dict]) -> list[tuple[str, list[dict]]]:
    """Cuma pet yang punya mutasi -- 'Tanpa Mutasi' ngga usah ditampilin."""
    groups: dict[str, list[dict]] = {}
    for p in pets:
        muts = p.get("mutations") or []
        if not muts:
            continue
        key = " + ".join(sorted(m.upper() for m in muts))
        groups.setdefault(key, []).append(p)

    def top_rate(item):
        return max((p.get("rate", 0) for p in item[1]), default=0)

    return sorted(groups.items(), key=top_rate, reverse=True)


def pet_key(p: dict):
    if p.get("uid"):
        return p["uid"]
    return (p.get("category"), tuple(sorted(p.get("mutations") or [])), p.get("rate"))


def account_initials(name: str) -> str:
    """Singkatan buat label kecil di poster -- "BlekokGong20" -> "BG20"
    (huruf kapital di nama + angka di belakangnya)."""
    if not name:
        return ""
    m = re.search(r"(\d+)$", name)
    digits = m.group(1) if m else ""
    letters_part = name[: len(name) - len(digits)] if digits else name
    caps = "".join(ch for ch in letters_part if ch.isupper())
    if not caps:
        caps = letters_part[:2].upper()
    return caps + digits


def render_poster(data: dict) -> Image.Image:
    W, H = 1080, 2000
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    title = data.get("title") or "Jual Akun GACOR"
    badge = data.get("badge") or ""
    checklist = data.get("checklist") or []
    price = data.get("price") or ""
    all_pets = data.get("allPets") or []
    active_pets = data.get("activePets") or []
    active_limit = data.get("activeLimit", len(active_pets))
    growing_eggs = data.get("growingEggs") or []
    backpack_eggs = data.get("backpackEggs") or []
    run_speed = data.get("runSpeed")
    total_money_per_second = data.get("totalMoneyPerSecond")
    current_money = data.get("currentMoney")
    kandang_level = data.get("kandangLevel")
    treadmill_level = data.get("treadmillLevel")

    all_pets_sorted = sorted(all_pets, key=lambda p: p.get("rate", 0), reverse=True)

    # "Aktif" di sini artinya 17 pet RATE TERTINGGI dari SEMUA pet yang
    # dimiliki (aktif + isi tas) -- 17 = max slot equip pet di game ini --
    # BUKAN cuma yang secara harfiah lagi keequip sekarang. Jadi kartu di
    # panel "ACTIVE" bisa nampilin pet isi tas yang belum di-equip juga,
    # asal dia termasuk top 17 rate tertinggi.
    MAX_EQUIP_PETS = 17
    pet_pool_sorted = sorted(active_pets + all_pets, key=lambda p: p.get("rate", 0), reverse=True)
    active_pets_sorted = pet_pool_sorted[:MAX_EQUIP_PETS]
    growing_eggs_sorted = sorted(growing_eggs, key=lambda p: p.get("rate", 0), reverse=True)
    backpack_eggs_sorted = sorted(backpack_eggs, key=lambda p: p.get("rate", 0), reverse=True)
    egg_keys = {pet_key(e) for e in growing_eggs_sorted + backpack_eggs_sorted}

    # Kandidat 3 Card Utama + Paling Gacor: pet AKTIF + isi tas + telur (baik
    # yang lagi tumbuh maupun yang masih di tas) semua ikut bersaing -- kalau
    # ada telur yang $/s prediksinya lebih gacor dari pet manapun, dia yang
    # nongol di atas, bukan pet apa adanya.
    pool, seen = [], set()
    for p in active_pets_sorted + all_pets_sorted + growing_eggs_sorted + backpack_eggs_sorted:
        k = pet_key(p)
        if k not in seen:
            seen.add(k)
            pool.append(p)
    pool_sorted = sorted(pool, key=lambda p: p.get("rate", 0), reverse=True)
    top_picks = pool_sorted[:3]

    # "Paling Gacor": pet mutasi dengan $/s > 500M kalau ada; kalau ngga ada
    # mutasi yang segacor itu, jatuh balik ke $/s tertinggi apa adanya.
    MUTATED_FEATURED_THRESHOLD = 500_000_000
    mutated_candidates = [
        p for p in pool_sorted
        if p.get("mutations") and p.get("rate", 0) > MUTATED_FEATURED_THRESHOLD
    ]
    featured = mutated_candidates[0] if mutated_candidates else (pool_sorted[0] if pool_sorted else None)

    # Sisanya buat panel kanan: pet aktif dulu, ditambah isi tas > 300M kalau
    # aktifnya kosong/dikit -- keduanya ngga termasuk yang udah dipajang di atas.
    NOTABLE_THRESHOLD = 300_000_000
    featured_keys = {pet_key(p) for p in top_picks}
    if featured:
        featured_keys.add(pet_key(featured))
    right_panel_pets, right_seen = [], set()
    for p in active_pets_sorted:
        k = pet_key(p)
        if k not in featured_keys and k not in right_seen:
            right_seen.add(k)
            right_panel_pets.append(p)
    for p in all_pets_sorted:
        if p.get("rate", 0) <= NOTABLE_THRESHOLD:
            continue
        k = pet_key(p)
        if k not in featured_keys and k not in right_seen:
            right_seen.add(k)
            right_panel_pets.append(p)
    right_panel_pets.sort(key=lambda p: p.get("rate", 0), reverse=True)

    # Telur yang udah kepromosi ke 3 card utama / Paling Gacor ga usah
    # dobel muncul lagi di section "sedang tumbuh" / "di tas" di bawah.
    growing_eggs_remaining = [e for e in growing_eggs_sorted if pet_key(e) not in featured_keys]
    backpack_eggs_remaining = [e for e in backpack_eggs_sorted if pet_key(e) not in featured_keys]

    left_x0, left_x1 = 32, 640
    right_x0, right_x1 = 656, W - 32

    # ---- Title ----
    draw_text_centered(draw, (left_x0, 46), title.split("\n")[0] if "\n" in title else title,
                        font(46, bold=True), NAVY, anchor="lm")
    if badge:
        bw, bh = 190, 44
        by = 108
        rounded_card(draw, (left_x0, by, left_x0 + bw, by + bh), radius=20, fill=(226, 232, 240), outline=BLUE, width=2)
        draw_text_centered(draw, (left_x0 + bw / 2, by + bh / 2), badge, font(18, bold=True), BLUE)

    # ---- Stat grid: 6 label penting, gede & jelas kebaca (bukan pill kecil
    # yang dipepetin) -- Speed, Cash, Income Potensi Aktif, Income Aktif,
    # Total Pet >= 1B/s, Kandang Level, Treadmill Level. ----
    growing_egg_rate = sum(e.get("rate", 0) for e in growing_eggs)
    backpack_egg_rate = sum(e.get("rate", 0) for e in backpack_eggs)
    egg_potential_rate = growing_egg_rate + backpack_egg_rate

    # Income Potensi Aktif = total_money_per_second APA ADANYA (rate real
    # dari game, udah termasuk speed boost dkk yang ga kebaca dari rate per
    # pet) + potensi income telur. INI YANG ASLI/TIDAK DIUBAH.
    active_base_rate = total_money_per_second if total_money_per_second is not None else sum(p.get("rate", 0) for p in active_pets)

    # Income Aktif = 17 pet RATE TERTINGGI (pool yang sama kayak
    # active_pets_sorted di atas) -- dihitung TERLEPAS lagi keequip apa
    # ngga, sesuai definisi "aktif" yang baru.
    potential_active_rate = sum(p.get("rate", 0) for p in active_pets_sorted)

    # Total gabungan pet yang masing-masing rate-nya >= 1B/s -- ganti slot
    # Income Egg Backpack/Sedang Tumbuh, biar yang dipajang itu kekuatan
    # dari pet-pet gacor-nya, bukan telur.
    HIGH_VALUE_THRESHOLD = 1_000_000_000
    high_value_pet_total = sum(p.get("rate", 0) for p in pet_pool_sorted if p.get("rate", 0) >= HIGH_VALUE_THRESHOLD)

    stat_items = []
    if run_speed is not None:
        stat_items.append(("SPEED", f"{run_speed:,.0f}" if isinstance(run_speed, (int, float)) else str(run_speed)))
    if current_money is not None:
        stat_items.append(("CASH", fmt_currency(current_money)))
    if total_money_per_second is not None:
        stat_items.append(("INCOME POTENSI AKTIF", fmt_money(active_base_rate + egg_potential_rate)))
    stat_items.append(("INCOME AKTIF", fmt_money(potential_active_rate)))
    stat_items.append(("TOTAL PET >= 1B/S", fmt_money(high_value_pet_total)))
    if kandang_level is not None:
        stat_items.append(("KANDANG LEVEL", f"Lv. {kandang_level}"))
    if treadmill_level is not None:
        stat_items.append(("TREADMILL LEVEL", f"Lv. {treadmill_level}"))

    grid_y0 = 156 if badge else 108
    cols = 2
    gcell_gap = 12
    gcell_w = (left_x1 - left_x0 - gcell_gap) / cols
    gcell_h = 78
    for i, (label, val) in enumerate(stat_items):
        c, r = i % cols, i // cols
        cx0 = left_x0 + c * (gcell_w + gcell_gap)
        cy0 = grid_y0 + r * (gcell_h + 10)
        rounded_card(draw, (cx0, cy0, cx0 + gcell_w, cy0 + gcell_h), radius=16, fill=(236, 253, 245), outline=GREEN, width=2)
        label_f = font(13, bold=True)
        while draw.textlength(label, font=label_f) > gcell_w - 24 and label_f.size > 9:
            label_f = font(label_f.size - 1, bold=True)
        draw.text((cx0 + 14, cy0 + 10), label, font=label_f, fill=DIM)
        val_f = font(28, bold=True)
        while draw.textlength(val, font=val_f) > gcell_w - 24 and val_f.size > 16:
            val_f = font(val_f.size - 1, bold=True)
        draw.text((cx0 + 14, cy0 + 34), val, font=val_f, fill=GREEN)

    rows_used = -(-len(stat_items) // cols)
    y = grid_y0 + rows_used * (gcell_h + 10) + 10

    # ---- Top 3 pick cards ----
    card_w = (left_x1 - left_x0 - 2 * 14) / 3
    card_h = 300
    for i, pet in enumerate(top_picks):
        cx0 = left_x0 + i * (card_w + 14)
        cx1 = cx0 + card_w
        rounded_card(draw, (cx0, y, cx1, y + card_h))
        is_egg_pick = pet_key(pet) in egg_keys
        if is_egg_pick:
            rounded_card(draw, (cx0 + 10, y + 10, cx0 + 84, y + 32), radius=10, fill=(255, 244, 214), outline=GOLD, width=1)
            draw_text_centered(draw, (cx0 + 47, y + 21), "TELUR", font(11, bold=True), GOLD)
        if pet.get("weight"):
            weight_x = cx0 + 94 + (card_w - 94) / 2 if is_egg_pick else cx0 + card_w / 2
            draw_text_centered(draw, (weight_x, y + 22), fmt_weight(pet["weight"]), font(15), DIM)
        icon = find_icon(pet.get("category", ""), pet.get("mutations", []))
        paste_icon(canvas, icon, (int(cx0 + 14), int(y + 42), int(cx1 - 14), int(y + 42 + 130)))
        name = pet.get("name", pet.get("category", "?"))
        # wrap name onto up to 2 lines
        words = name.split(" ")
        lines, cur = [], ""
        for w_ in words:
            trial = (cur + " " + w_).strip()
            if draw.textlength(trial, font=font(20, bold=True)) > card_w - 16:
                lines.append(cur)
                cur = w_
            else:
                cur = trial
        if cur:
            lines.append(cur)
        ty = y + 182
        for line in lines[:2]:
            draw_text_centered(draw, (cx0 + card_w / 2, ty), line, font(20, bold=True), NAVY)
            ty += 24
        draw_text_centered(draw, (cx0 + card_w / 2, ty + 8), fmt_money(pet.get("rate", 0)), font(18, bold=True), GREEN)
        muts = pet.get("mutations", [])
        if muts:
            tag_txt = "MUTASI : " + " + ".join(m.upper() for m in muts)
            draw_text_centered(draw, (cx0 + card_w / 2, y + card_h - 18), tag_txt, font(12, bold=True), mutation_tag_color(muts[0]))

    y += card_h + 18

    # ---- Featured "Paling Gacor" -- mutasi >500M/s kalau ada, else $/s terbesar ----
    if featured:
        best = featured
        feat_h = 200
        rounded_card(draw, (left_x0, y, left_x1, y + feat_h), fill=CARD_BG, outline=GOLD, width=3)
        ribbon_w, ribbon_h = 170, 34
        rounded_card(draw, (left_x0 - 4, y - 14, left_x0 - 4 + ribbon_w, y - 14 + ribbon_h), radius=10, fill=GOLD, outline=None)
        draw_text_centered(draw, (left_x0 - 4 + ribbon_w / 2, y - 14 + ribbon_h / 2), "PALING GACOR!", font(14, bold=True), (255, 255, 255))
        muts = best.get("mutations", [])
        mut_label = " + ".join(m.upper() for m in muts) if muts else ""
        if mut_label:
            draw.text((left_x0 + 20, y + 30), mut_label, font=font(16, bold=True), fill=mutation_tag_color(muts[0] if muts else ""))
        if pet_key(best) in egg_keys:
            egg_badge_w = 78
            rounded_card(draw, (left_x0 + ribbon_w + 16, y - 14, left_x0 + ribbon_w + 16 + egg_badge_w, y - 14 + ribbon_h), radius=10, fill=(255, 244, 214), outline=GOLD, width=1)
            draw_text_centered(draw, (left_x0 + ribbon_w + 16 + egg_badge_w / 2, y - 14 + ribbon_h / 2), "TELUR", font(12, bold=True), GOLD)
        name_upper = best.get("name", best.get("category", "?")).upper()
        draw.text((left_x0 + 20, y + 56), name_upper, font=font(24, bold=True), fill=NAVY)
        draw.text((left_x0 + 20, y + feat_h - 60), fmt_money(best.get("rate", 0)), font=font(32, bold=True), fill=GREEN)
        if best.get("weight"):
            draw.text((left_x0 + 20, y + feat_h - 24), fmt_weight(best["weight"]), font=font(16), fill=DIM)
        icon = find_icon(best.get("category", ""), muts)
        paste_icon(canvas, icon, (int(left_x1 - 260), int(y + 16), int(left_x1 - 20), int(y + feat_h - 16)))
    y += 200 + 24

    # ---- Dikelompokkan per mutasi ----
    rounded_card(draw, (left_x0, y, left_x1, y + 40), radius=20, fill=(226, 232, 240))
    draw_text_centered(draw, ((left_x0 + left_x1) / 2, y + 20), "DIKELOMPOKKAN PER MUTASI", font(18, bold=True), NAVY)
    y += 52

    cols = 3
    gcard_w = (left_x1 - left_x0 - (cols - 1) * 10) / cols
    gcard_h = 86
    groups = group_by_mutation(all_pets_sorted)
    for group_name, items in groups[:6]:
        items_sorted = sorted(items, key=lambda p: p.get("rate", 0), reverse=True)[:6]
        color = mutation_tag_color(group_name.split(" + ")[0])
        draw.text((left_x0 + 2, y), f"{group_name} ({len(items)})", font=font(14, bold=True), fill=color)
        y += 24
        rows_needed = -(-len(items_sorted) // cols)
        for idx, pet in enumerate(items_sorted):
            r, c = divmod(idx, cols)
            gx0 = left_x0 + c * (gcard_w + 10)
            gy0 = y + r * (gcard_h + 8)
            icon = find_icon(pet.get("category", ""), pet.get("mutations", []))
            paste_icon(canvas, icon, (int(gx0), int(gy0), int(gx0 + gcard_h), int(gy0 + gcard_h)))
            tx = gx0 + gcard_h + 8
            draw.text((tx, gy0 + 8), fmt_money(pet.get("rate", 0)), font=font(16, bold=True), fill=GREEN)
            name = pet.get("name", pet.get("category", "?"))
            if len(name) > 20:
                name = name[:19] + "…"
            draw.text((tx, gy0 + 33), name, font=font(12), fill=DIM)
            if pet.get("weight"):
                draw.text((tx, gy0 + 53), fmt_weight(pet["weight"]), font=font(11), fill=DIM)
        y += rows_needed * (gcard_h + 8) + 16

    # ---- Telur yang sedang tumbuh di kandang -- spesies/mutasi udah
    # ke-deteksi meski belum netas (sama kayak fitur "Prediksi Hatch"). ----
    if growing_eggs_remaining:
        rounded_card(draw, (left_x0, y, left_x1, y + 40), radius=20, fill=(226, 232, 240))
        draw_text_centered(draw, ((left_x0 + left_x1) / 2, y + 20), "TELUR YANG SEDANG TUMBUH", font(18, bold=True), NAVY)
        y += 52

        egg_cols = 3
        egg_card_w = (left_x1 - left_x0 - (egg_cols - 1) * 10) / egg_cols
        egg_card_h = 86
        eggs_shown = growing_eggs_remaining[:9]
        rows_needed = -(-len(eggs_shown) // egg_cols)
        for idx, egg in enumerate(eggs_shown):
            r, c = divmod(idx, egg_cols)
            gx0 = left_x0 + c * (egg_card_w + 10)
            gy0 = y + r * (egg_card_h + 8)
            muts = egg.get("mutations") or []
            icon = find_icon(egg.get("category", ""), muts)
            paste_icon(canvas, icon, (int(gx0), int(gy0), int(gx0 + egg_card_h), int(gy0 + egg_card_h)))
            tx = gx0 + egg_card_h + 8
            name = egg.get("category", "?")
            if muts:
                name = f"{' + '.join(m.upper() for m in muts)} {name}"
            if len(name) > 22:
                name = name[:21] + "…"
            draw.text((tx, gy0 + 4), name, font=font(12, bold=True), fill=NAVY)
            if egg.get("ready"):
                draw.text((tx, gy0 + 22), "SIAP MENETAS!", font=font(13, bold=True), fill=GREEN)
            else:
                draw.text((tx, gy0 + 22), fmt_duration(egg.get("remainingSeconds", 0)), font=font(14, bold=True), fill=BLUE)
            if egg.get("rate"):
                draw.text((tx, gy0 + 42), fmt_money(egg["rate"]), font=font(13, bold=True), fill=GREEN)
            if egg.get("weight"):
                draw.text((tx, gy0 + 62), fmt_weight(egg["weight"]), font=font(11), fill=DIM)
        y += rows_needed * (egg_card_h + 8) + 16

    # ---- Telur yang masih di tas, belum ditaruh (v2: metode curi-tanpa-place
    # biar auto script ga tabrakan) -- spesies/mutasi tetap kebaca dari record
    # yang sama, cuma ga ada countdown karena belum jalan pertumbuhannya. ----
    if backpack_eggs_remaining:
        rounded_card(draw, (left_x0, y, left_x1, y + 40), radius=20, fill=(226, 232, 240))
        draw_text_centered(draw, ((left_x0 + left_x1) / 2, y + 20), "TELUR DI TAS (BELUM DITARUH)", font(18, bold=True), NAVY)
        y += 52

        bp_cols = 3
        bp_card_w = (left_x1 - left_x0 - (bp_cols - 1) * 10) / bp_cols
        bp_card_h = 86
        bp_shown = backpack_eggs_remaining[:9]
        bp_rows_needed = -(-len(bp_shown) // bp_cols)
        for idx, egg in enumerate(bp_shown):
            r, c = divmod(idx, bp_cols)
            gx0 = left_x0 + c * (bp_card_w + 10)
            gy0 = y + r * (bp_card_h + 8)
            muts = egg.get("mutations") or []
            icon = find_icon(egg.get("category", ""), muts)
            paste_icon(canvas, icon, (int(gx0), int(gy0), int(gx0 + bp_card_h), int(gy0 + bp_card_h)))
            tx = gx0 + bp_card_h + 8
            name = egg.get("category", "?")
            if muts:
                name = f"{' + '.join(m.upper() for m in muts)} {name}"
            if len(name) > 22:
                name = name[:21] + "…"
            draw.text((tx, gy0 + 8), name, font=font(12, bold=True), fill=NAVY)
            if egg.get("rate"):
                draw.text((tx, gy0 + 28), fmt_money(egg["rate"]), font=font(14, bold=True), fill=GREEN)
            if egg.get("weight"):
                draw.text((tx, gy0 + 50), fmt_weight(egg["weight"]), font=font(11), fill=DIM)
        y += bp_rows_needed * (bp_card_h + 8) + 16

    # Item checklist buat "DETAIL ACC" -- dipindah ke panel kanan (di bawah
    # PRICE ACC) biar poster ga makin manjang ke bawah. Cuma checklist dari
    # user aja di sini; Speed/Income/Level udah gede-gede di grid atas jadi
    # ga perlu diulang lagi (dulu sempet double, sekarang engga).
    full_checklist = list(checklist)

    # Pet isi tas yang ga kepajang di mana pun di poster (bukan di kartu
    # utama, bukan di grup mutasi, bukan di list panel kanan) -- ditampilin
    # sebagai counter "+N" biar pembeli tau masih ada bonus pet lain.
    group_shown_keys = set()
    for _, items in groups[:6]:
        for p in sorted(items, key=lambda p: p.get("rate", 0), reverse=True)[:6]:
            group_shown_keys.add(pet_key(p))
    shown_pet_keys = featured_keys | group_shown_keys | {pet_key(p) for p in right_panel_pets[:8]}
    inactive_unlisted = [p for p in all_pets_sorted if pet_key(p) not in shown_pet_keys]

    # ================= RIGHT COLUMN =================
    ry = 40
    header_h = 48
    rounded_card(draw, (right_x0, ry, right_x1, ry + header_h), radius=16, fill=CARD_BG)
    draw.ellipse([right_x0 + 16, ry + 15, right_x0 + 34, ry + 33], fill=NAVY)
    draw.text((right_x0 + 46, ry + 14), f"{len(active_pets_sorted)}/{active_limit} ACTIVE", font=font(17, bold=True), fill=NAVY)
    equip_best_w, equip_best_h = 140, 32
    ebx0 = right_x1 - equip_best_w - 16
    eby0 = ry + 8
    rounded_card(draw, (ebx0, eby0, ebx0 + equip_best_w, eby0 + equip_best_h), radius=8, fill=GREEN, outline=None)
    draw_text_centered(draw, (ebx0 + equip_best_w / 2, eby0 + equip_best_h / 2), "EQUIP BEST", font(13, bold=True), (255, 255, 255))
    ry += header_h + 12

    list_h = min(len(right_panel_pets), 8) * 84 + 20
    rounded_card(draw, (right_x0, ry, right_x1, ry + max(list_h, 100)), fill=CARD_BG)
    if not right_panel_pets:
        draw_text_centered(draw, ((right_x0 + right_x1) / 2, ry + 50), "Tidak ada pet aktif / menonjol", font(16), DIM)
    for i, pet in enumerate(right_panel_pets[:8]):
        iy = ry + 10 + i * 84
        icon = find_icon(pet.get("category", ""), pet.get("mutations", []))
        paste_icon(canvas, icon, (right_x0 + 16, iy, right_x0 + 76, iy + 60))
        muts = pet.get("mutations") or []
        mut_tag = " + ".join(m.upper() for m in muts) if muts else None
        reserved_w = 0
        if mut_tag:
            reserved_w = draw.textlength(mut_tag, font=font(10, bold=True)) + 44
        name = pet.get("name", pet.get("category", "?"))
        name_font = font(17, bold=True)
        max_name_w = right_x1 - (right_x0 + 92) - reserved_w
        while draw.textlength(name, font=name_font) > max_name_w and len(name) > 3:
            name = name[:-2] + "…"
        draw.text((right_x0 + 92, iy + 6), name, font=name_font, fill=NAVY)
        draw.text((right_x0 + 92, iy + 32), fmt_money(pet.get("rate", 0)), font=font(15, bold=True), fill=GREEN)
        if pet.get("weight"):
            draw.text((right_x0 + 92, iy + 54), fmt_weight(pet["weight"]), font=font(11), fill=DIM)
        if mut_tag:
            color = mutation_tag_color(muts[0])
            tw = draw.textlength(mut_tag, font=font(10, bold=True))
            tag_x0 = right_x1 - tw - 28
            rounded_card(draw, (tag_x0, iy + 14, right_x1 - 12, iy + 40), radius=10, fill=(255, 255, 255), outline=color, width=1)
            draw_text_centered(draw, ((tag_x0 + right_x1 - 12) / 2, iy + 27), mut_tag, font(10, bold=True), color)
        if i < min(len(right_panel_pets), 8) - 1:
            draw.line([right_x0 + 16, iy + 76, right_x1 - 16, iy + 76], fill=BORDER, width=1)

    ry += max(list_h, 100) + 24

    if inactive_unlisted:
        inv_h = 80
        inactive_total_rate = sum(p.get("rate", 0) for p in inactive_unlisted)
        rounded_card(draw, (right_x0, ry, right_x1, ry + inv_h), fill=CARD_BG)
        draw.text((right_x0 + 20, ry + 14), "PET INVENTORY (TIDAK AKTIF)", font=font(14, bold=True), fill=DIM)
        draw.text((right_x0 + 20, ry + 34), f"+{len(inactive_unlisted)}", font=font(30, bold=True), fill=NAVY)
        if inactive_total_rate:
            count_w = draw.textlength(f"+{len(inactive_unlisted)}", font=font(30, bold=True))
            draw.text((right_x0 + 30 + count_w, ry + 46), f"total {fmt_money(inactive_total_rate)}", font=font(13, bold=True), fill=GREEN)
        ry += inv_h + 24

    tv_h = 220
    rounded_card(draw, (right_x0, ry, right_x1, ry + tv_h), fill=CARD_BG)
    draw.text((right_x0 + 20, ry + 20), "PRICE ACC", font=font(22, bold=True), fill=NAVY)
    if price:
        draw_text_centered(draw, ((right_x0 + right_x1) / 2, ry + tv_h / 2 + 10), str(price), font(30, bold=True), GREEN)
    else:
        draw.rounded_rectangle((right_x0 + 20, ry + 60, right_x1 - 20, ry + tv_h - 40), radius=12, outline=BORDER, width=2)
    ry += tv_h + 20

    # (Rincian Income Egg Backpack / Sedang Tumbuh sekarang udah gede & jelas
    # di stat grid atas -- ga perlu diulang lagi di sini biar ga dobel.)

    # ---- Detail Acc (checklist manual dari user) -- ditaruh di sini, di
    # bawah Price Acc, biar poster ga makin manjang ke bawah kolom kiri. ----
    if full_checklist:
        detail_cols = 1
        rows_needed = -(-len(full_checklist) // detail_cols)
        chk_h = 34 + rows_needed * 26
        rounded_card(draw, (right_x0, ry, right_x1, ry + chk_h))
        draw.text((right_x0 + 16, ry + 12), "DETAIL ACC", font=font(16, bold=True), fill=NAVY)
        for idx, item in enumerate(full_checklist):
            cy = ry + 40 + idx * 26
            draw.ellipse([right_x0 + 18, cy + 3, right_x0 + 32, cy + 17], outline=GREEN, width=2)
            draw.line([right_x0 + 21, cy + 10, right_x0 + 24, cy + 14], fill=GREEN, width=2)
            draw.line([right_x0 + 24, cy + 14, right_x0 + 30, cy + 6], fill=GREEN, width=2)
            draw.text((right_x0 + 40, cy), item, font=font(15), fill=NAVY)
        ry += chk_h + 18

    bottom = max(y + 40, ry)
    canvas = canvas.crop((0, 0, W, int(min(bottom, H))))

    owner = data.get("ownerFacebook")
    if owner:
        canvas = add_watermark(canvas, owner)

    # Label kecil di pojok kanan bawah -- inisial akun (misal "BG20") biar
    # kelihatan poster ini diambil dari akun mana, kebaca meski gambarnya
    # dishare lepas dari caption Discord-nya.
    initials = account_initials(data.get("sourceAccount"))
    if initials:
        draw_label = ImageDraw.Draw(canvas)
        label_font = font(20, bold=True)
        bbox = draw_label.textbbox((0, 0), initials, font=label_font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        margin = 16
        lx = canvas.width - margin - tw
        ly = canvas.height - margin - th
        draw_label.text((lx, ly), initials, font=label_font, fill=DIM)

    return canvas


def add_watermark(canvas: Image.Image, text: str) -> Image.Image:
    """Big, low-opacity, diagonal watermark across the whole poster so the
    ownership name can't be cropped out without wrecking the image."""
    canvas = canvas.convert("RGBA")
    w, h = canvas.size
    diag = int((w ** 2 + h ** 2) ** 0.5)
    layer = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    wm_font = font(max(min(w, h) // 7, 28), bold=True)
    ld.text((diag / 2, diag / 2), text, font=wm_font, fill=(30, 41, 59, 40), anchor="mm")
    ld.text((diag / 2, diag / 2 + wm_font.size * 1.4), "FACEBOOK", font=font(max(wm_font.size // 3, 14), bold=True), fill=(30, 41, 59, 30), anchor="mm")
    layer = layer.rotate(-30, resample=Image.BICUBIC, expand=False)
    paste_x = (w - diag) // 2
    paste_y = (h - diag) // 2
    canvas.alpha_composite(layer, (paste_x, paste_y))
    return canvas.convert("RGB")


# ============================================================
# Discord bot: interactive "isi harga" flow (tombol + modal), alternatif
# dari webhook langsung. Butuh bot_config.json (lihat bot_config.example.json)
# -- token JANGAN pernah di-commit ke git (udah di-gitignore).
# ============================================================
BOT_CONFIG_PATH = Path(__file__).parent / "bot_config.json"


def load_bot_config() -> dict:
    cfg = {}
    if BOT_CONFIG_PATH.exists():
        try:
            cfg = json.loads(BOT_CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cfg = {}
    return {
        "token": os.environ.get("DISCORD_BOT_TOKEN") or cfg.get("token"),
        "draft_channel_id": os.environ.get("DISCORD_DRAFT_CHANNEL_ID") or cfg.get("draft_channel_id"),
        "final_channel_id": os.environ.get("DISCORD_FINAL_CHANNEL_ID") or cfg.get("final_channel_id"),
        "index_channel_id": os.environ.get("DISCORD_INDEX_CHANNEL_ID") or cfg.get("index_channel_id"),
        # Key gate: satu shared key buat SEMUA user, dicek ke server tiap
        # kali script di-execute DAN tiap kali /monitor atau /generate
        # dipanggil. Key ini SENGAJA ga pernah nempel di StealAnEgg.luau --
        # cuma dititip lewat _G.NaruHub_Key sebelum loadstring. Kalau kosong,
        # key gate nonaktif
        # (siapa aja lolos, sama kayak sebelum fitur ini ada).
        "access_key": os.environ.get("POSTER_ACCESS_KEY") or cfg.get("access_key"),
    }


def parse_price_idr(text: str):
    """'Rp 30.000' / '500rb' / '20K' / '1.5jt' / '30000' -> int rupiah, atau
    None kalau ga bisa diparse (biar filter harga ga salah include harga
    yang bentuknya aneh)."""
    if not text:
        return None
    t = text.strip().lower().replace("rp", "").strip()
    m = re.match(r"^([\d.,]+)\s*(rb|ribu|k|jt|juta|m|b)?$", t)
    if not m:
        return None
    num_str, suffix = m.group(1), m.group(2)
    # Kalau ada suffix (rb/jt/dst), titik/koma di angka itu desimal (1.5jt).
    # Kalau ga ada suffix, titik itu pemisah ribuan gaya Indonesia (30.000).
    if suffix:
        num_str = num_str.replace(",", ".")
    else:
        num_str = num_str.replace(".", "").replace(",", "")
    try:
        num = float(num_str)
    except ValueError:
        return None
    mult = {"rb": 1_000, "ribu": 1_000, "k": 1_000, "jt": 1_000_000, "juta": 1_000_000,
            "m": 1_000_000, "b": 1_000_000_000}.get(suffix, 1)
    return int(num * mult)


def format_price_shorthand(raw: str) -> str:
    """Input harga di modal Discord -- kalau user cuma ngetik angka polos
    (boleh desimal), dianggap satuan RIBUAN biar ga usah ngetik nol-nol:
    '4' -> 'Rp 4.000', '21' -> 'Rp 21.000', '0.5' -> 'Rp 500'. Kalau udah
    ada format sendiri ('500rb', 'Rp 20.000'), dipakai apa adanya."""
    raw = raw.strip()
    if re.fullmatch(r"\d+([.,]\d+)?", raw):
        value = int(round(float(raw.replace(",", ".")) * 1000))
        return "Rp " + f"{value:,}".replace(",", ".")
    return raw


BOT_CFG = load_bot_config()

ACCESS_KEY = BOT_CFG.get("access_key") or ""


def check_key_header(handler) -> bool:
    """/monitor & /generate dipanggil LANGSUNG dari StealAnEgg.luau -- ini
    endpoint yang paling rawan disalahgunain kalau URL tunnel bocor (bisa
    dipakai ngirim data /monitor palsu ngaku-ngaku jadi akun manapun, atau
    nge-generate poster asal). Sekarang dijaga pakai key yang sama kayak
    key gate (bukan HWID lagi -- satu mekanisme buat semuanya). Kalau
    ACCESS_KEY belum di-setup, SENGAJA ga di-block dulu -- daripada
    langsung ngunci diri sendiri gara-gara lupa isi bot_config.json."""
    if not ACCESS_KEY:
        return True
    key = handler.headers.get("X-Access-Key") or ""
    return key == ACCESS_KEY


def check_access(key: str) -> tuple[bool, str]:
    """Dipanggil dari StealAnEgg.luau tiap kali script di-execute, SEBELUM
    GUI kebuka -- ini yang jadi gerbang key system-nya. Loadstring publik
    (tanpa _G.NaruHub_Key) wajib masukin key, device/HWID apapun, ga ada
    pengecualian. Kalau ACCESS_KEY belum di-setup di bot_config.json,
    gerbangnya dianggap nonaktif -- semua device lolos (biar ga langsung
    ngunci semua user begitu fitur ini kepasang sebelum key-nya sempet
    di-generate/di-isi)."""
    if not ACCESS_KEY:
        return True, "key gate nonaktif"
    if key and key == ACCESS_KEY:
        return True, "key"
    return False, "Key salah atau belum diisi."


# poster_id -> {"data": payload dict, "last_price", "final_message"} --
# disimpan ke disk (STATE_PATH) tiap kali berubah, jadi tetap ada meskipun
# poster_server di-restart -- harga bisa diedit kapan aja tanpa perlu buka
# game lagi buat generate ulang.
PENDING: dict[str, dict] = {}
# poster_id -> {"name", "price_text", "price_value", "income_text",
# "speed_text", "jump_url", "index_message"} -- katalog ringkas buat channel
# index + filter harga. Ikut disimpan ke disk juga.
CATALOG: dict[str, dict] = {}

STATE_PATH = Path(__file__).parent / "bot_state.json"


def load_state():
    global PENDING, CATALOG
    if STATE_PATH.exists():
        try:
            saved = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            PENDING = saved.get("pending", {})
            CATALOG = saved.get("catalog", {})
            print(f"[discord_bot] loaded state: {len(PENDING)} pending, {len(CATALOG)} catalog entr(y/ies)")
        except (OSError, json.JSONDecodeError) as e:
            print(f"[discord_bot] failed to load {STATE_PATH.name}: {e}")


def save_state():
    try:
        STATE_PATH.write_text(
            json.dumps({"pending": PENDING, "catalog": CATALOG}, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as e:
        print(f"[discord_bot] failed to save {STATE_PATH.name}: {e}")


load_state()

bot = None
bot_loop = None
BOT_READY = threading.Event()
BOT_ENABLED = DISCORD_AVAILABLE and bool(BOT_CFG["token"]) and bool(BOT_CFG["draft_channel_id"])

if BOT_ENABLED:
    intents = discord.Intents.default()
    bot = commands.Bot(command_prefix="!", intents=intents)

    class PriceModal(discord.ui.Modal, title="Edit Poster"):
        """Satu form buat judul + harga sekaligus -- harga boleh dikosongin
        kalau cuma mau ganti judul (ga maksa finalize/pindah channel)."""
        def __init__(self, poster_id: str, current_title: str, suggested: str):
            super().__init__(timeout=None)
            self.poster_id = poster_id
            self.title_input = discord.ui.TextInput(
                label="Judul",
                placeholder="cth: Jual Akun GACOR",
                default=current_title or "Jual Akun GACOR",
                required=True,
                max_length=60,
            )
            self.price_input = discord.ui.TextInput(
                label="Harga Langsung (opsional)",
                placeholder="cth: 4 (= Rp 4.000), atau Rp 150.000 / 500rb",
                default=str(suggested) if suggested else None,
                required=False,
                max_length=40,
            )
            self.rate_input = discord.ui.TextInput(
                label="Atau: Rate per 1B/s (ribuan)",
                placeholder="cth: 5 (= Rp 5.000 per 1B/s income aktif+potensi)",
                required=False,
                max_length=20,
            )
            self.add_item(self.title_input)
            self.add_item(self.price_input)
            self.add_item(self.rate_input)

        async def on_submit(self, interaction: discord.Interaction):
            # Render + upload gambar gampang lebih dari 3 detik (limit Discord
            # buat acknowledge interaksi) -- defer dulu biar ga "Something
            # went wrong", baru jawab pakai followup di akhir.
            await interaction.response.defer(ephemeral=True, thinking=True)

            entry = PENDING.get(self.poster_id)
            if not entry:
                await interaction.followup.send(
                    "Data poster ini udah ga ada (server di-restart?). Generate ulang dari game ya.",
                    ephemeral=True,
                )
                return

            base_data = entry["data"]
            new_title = self.title_input.value.strip() or "Jual Akun GACOR"

            raw_price = (self.price_input.value or "").strip()
            raw_rate = (self.rate_input.value or "").strip()
            price_changed = False
            price_text = base_data.get("price", "")
            if raw_rate:
                # Sama persis formula "Harga per 1B/s" di GUI script: rate x
                # (income aktif + potensi telur netas), rate dalam ribuan.
                try:
                    rate_per_b = float(raw_rate.replace(",", ".")) * 1000
                except ValueError:
                    await interaction.followup.send(
                        f"Rate '{raw_rate}' ga valid, harus angka. Coba lagi.", ephemeral=True,
                    )
                    return
                active_total = sum(p.get("rate", 0) for p in (base_data.get("activePets") or []))
                egg_total = sum(e.get("rate", 0) for e in (base_data.get("growingEggs") or []))
                egg_total += sum(e.get("rate", 0) for e in (base_data.get("backpackEggs") or []))
                income_b = (active_total + egg_total) / 1e9
                price_value = int(round(income_b * rate_per_b))
                price_text = "Rp " + f"{price_value:,}".replace(",", ".")
                price_changed = True
            elif raw_price:
                # Angka polos = satuan ribuan ("4" -> "Rp 4.000"), biar ga
                # usah ngetik nol-nol tiap kali isi harga.
                price_text = format_price_shorthand(raw_price)
                price_changed = True

            data = dict(base_data)
            data["title"] = new_title
            data["price"] = price_text
            entry["data"] = data  # inget judul & harga terakhir buat jadi default lain kali diedit
            if price_changed:
                entry["last_price"] = price_text
            save_state()

            img = render_poster(data)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            file = discord.File(io.BytesIO(buf.getvalue()), filename="poster.png")

            if not price_changed:
                # Cuma judul yang ganti -- edit langsung pesan yang tombolnya
                # diklik (draft ATAU final, dua-duanya valid), ga usah pindah
                # channel / upsert katalog kayak alur finalize harga.
                try:
                    await interaction.message.edit(attachments=[file])
                except discord.HTTPException as e:
                    await interaction.followup.send(f"Gagal update gambar: {e}", ephemeral=True)
                    return
                await interaction.followup.send(f"Judul diupdate jadi **{new_title}**.", ephemeral=True)
                return

            source_account = data.get("sourceAccount")
            content = f"Diambil dari akun: **{source_account}**" if source_account else None

            # Poster final ini boleh diedit berkali-kali lewat tombol yang sama
            # tanpa perlu generate ulang dari game -- kalau udah pernah
            # diposting, edit pesan yang sama; kalau belum, post baru.
            final_ref = entry.get("final_message")
            if final_ref:
                try:
                    channel = bot.get_channel(final_ref["channel_id"]) or await bot.fetch_channel(final_ref["channel_id"])
                    msg = await channel.fetch_message(final_ref["message_id"])
                    await msg.edit(content=content, attachments=[file])
                    await upsert_catalog_entry(self.poster_id, data, price_text, msg.jump_url)
                    await interaction.followup.send(
                        f"Harga diupdate jadi **{price_text}**, judul **{new_title}** (poster final diedit di tempat).",
                        ephemeral=True,
                    )
                    return
                except (discord.NotFound, discord.Forbidden):
                    final_ref = None  # pesan lama ilang -- fallback post baru di bawah

            final_channel_id = BOT_CFG["final_channel_id"] or BOT_CFG["draft_channel_id"]
            channel = bot.get_channel(int(final_channel_id))
            if channel is None:
                await interaction.followup.send(
                    f"Channel final (ID {final_channel_id}) ga ketemu -- cek lagi bot_config.json.",
                    ephemeral=True,
                )
                return
            sent = await channel.send(content=content, file=file, view=PriceView(self.poster_id, price_text))
            entry["final_message"] = {"channel_id": sent.channel.id, "message_id": sent.id}
            save_state()
            await upsert_catalog_entry(self.poster_id, data, price_text, sent.jump_url)
            await interaction.followup.send(
                f"Harga **{price_text}** & judul **{new_title}** disimpan. Poster final diposting di {channel.mention} -- "
                "bisa diedit lagi kapan aja lewat tombol di pesan itu, ga perlu generate ulang dari game.",
                ephemeral=True,
            )

    FILL_PRICE_PREFIX = "steal_an_egg_fill_price:"

    class PriceView(discord.ui.View):
        """poster_id di-encode LANGSUNG ke custom_id (bukan cuma disimpan
        sebagai atribut Python di instance View) -- biar tombol tetap
        kepanggil walau poster_server di-restart dan instance View lama ini
        udah ga ada lagi di memori. Dispatch aktualnya ditangani on_interaction
        di bawah, bukan callback bawaan View, karena itu satu-satunya cara
        yang beneran restart-proof di discord.py."""
        def __init__(self, poster_id: str, suggested: str = ""):
            super().__init__(timeout=None)
            button = discord.ui.Button(
                label="Edit Poster",
                style=discord.ButtonStyle.success,
                custom_id=f"{FILL_PRICE_PREFIX}{poster_id}",
            )
            self.add_item(button)

    @bot.event
    async def on_interaction(interaction: discord.Interaction):
        try:
            if interaction.type != discord.InteractionType.component:
                return
            custom_id = interaction.data.get("custom_id", "")
            if not custom_id.startswith(FILL_PRICE_PREFIX):
                return
            poster_id = custom_id[len(FILL_PRICE_PREFIX):]
            entry = PENDING.get(poster_id)
            if not entry:
                # Data-nya udah ga ada (poster dari sebelum bot_state.json ada,
                # atau kekorupsi) -- tombolnya bakal terus gagal kalau diklik
                # lagi, jadi hapus aja dari pesan ini biar ga ada tombol mati
                # yang nggantung.
                try:
                    await interaction.message.edit(view=None)
                except discord.HTTPException:
                    pass
                await interaction.response.send_message(
                    "Data poster ini udah ga ada. Generate ulang dari game ya. Tombolnya udah dihapus dari pesan ini.",
                    ephemeral=True,
                )
                return
            suggested = entry.get("last_price") or entry.get("suggested_price") or ""
            current_title = entry["data"].get("title") or "Jual Akun GACOR"
            await interaction.response.send_modal(PriceModal(poster_id, current_title, suggested))
        except Exception as e:  # noqa: BLE001
            import traceback
            print(f"[discord_bot] on_interaction error: {e}")
            traceback.print_exc()

    async def upsert_catalog_entry(poster_id: str, data: dict, price_text: str, jump_url: str):
        """Post/update satu baris ringkas di channel katalog: nama akun,
        income + speed, harga, link ke poster final -- biar ga perlu buka
        satu-satu poster buat bandingin harga."""
        index_channel_id = BOT_CFG.get("index_channel_id")
        if not index_channel_id:
            return
        channel = bot.get_channel(int(index_channel_id))
        if channel is None:
            print(f"[discord_bot] index channel not found: {index_channel_id}")
            return

        name = data.get("sourceAccount") or "?"
        # Total income aktif + potensi telur (backpack + lagi tumbuh) --
        # bukan leaderstat Money/s mentah, yang bisa kebaca 0 kalau lagi ga
        # ada pet ke-equip padahal potensi telurnya gede.
        active_total = sum(p.get("rate", 0) for p in (data.get("activePets") or []))
        egg_total = sum(e.get("rate", 0) for e in (data.get("growingEggs") or []))
        egg_total += sum(e.get("rate", 0) for e in (data.get("backpackEggs") or []))
        income = fmt_money(active_total + egg_total)
        speed = data.get("runSpeed")
        speed_text = f"{speed:,.0f}" if isinstance(speed, (int, float)) else str(speed or "-")
        price_value = parse_price_idr(price_text)
        line = f"**{name}** (Income {income}, Speed {speed_text}) - **{price_text}** → [Lihat Poster]({jump_url})"

        entry = CATALOG.get(poster_id, {})
        entry.update({
            "name": name, "price_text": price_text, "price_value": price_value,
            "income_text": income, "speed_text": speed_text, "jump_url": jump_url,
        })
        CATALOG[poster_id] = entry

        idx_ref = entry.get("index_message")
        if idx_ref:
            try:
                idx_channel = bot.get_channel(idx_ref["channel_id"]) or await bot.fetch_channel(idx_ref["channel_id"])
                idx_msg = await idx_channel.fetch_message(idx_ref["message_id"])
                await idx_msg.edit(content=line)
                save_state()
                return
            except (discord.NotFound, discord.Forbidden):
                pass  # pesan lama ilang -- post baru di bawah
        sent = await channel.send(content=line)
        entry["index_message"] = {"channel_id": sent.channel.id, "message_id": sent.id}
        save_state()

    @bot.tree.command(name="harga", description="Filter akun di katalog berdasarkan range harga (satuan RIBUAN)")
    @discord.app_commands.describe(min="Harga minimum dalam ribuan -- isi 4 = Rp 4.000 (kosongin = ga ada batas bawah)",
                                    max="Harga maksimum dalam ribuan -- isi 30 = Rp 30.000 (kosongin = ga ada batas atas)")
    async def harga_command(interaction: discord.Interaction, min: int = None, max: int = None):
        # Defer duluan sebelum ngapa-ngapain -- kalau ada apa aja yang bikin
        # event loop sempet sibuk (rate limit backoff, dst), window 3 detik
        # awal Discord gampang kelewat dan hasilnya "The application did not
        # respond" walau command-nya sendiri ga error. Defer ngasih waktu
        # sampe 15 menit buat followup.
        try:
            await interaction.response.defer(ephemeral=True, thinking=True)

            # Konsisten sama input harga di tempat lain: angka polos = satuan
            # ribuan ("4" -> Rp 4.000), biar ga ketuker kayak sebelumnya.
            min_rp = min * 1000 if min is not None else None
            max_rp = max * 1000 if max is not None else None

            matches = []
            for entry in CATALOG.values():
                pv = entry.get("price_value")
                if pv is None:
                    continue
                if min_rp is not None and pv < min_rp:
                    continue
                if max_rp is not None and pv > max_rp:
                    continue
                matches.append(entry)
            matches.sort(key=lambda e: e["price_value"])

            if not matches:
                await interaction.followup.send("Ga ada akun yang cocok sama range harga itu.", ephemeral=True)
                return

            lines = [
                f"**{e['name']}** (Income {e['income_text']}, Speed {e['speed_text']}) - **{e['price_text']}** → [Lihat Poster]({e['jump_url']})"
                for e in matches
            ]
            header = f"Ketemu **{len(matches)}** akun"
            if min_rp is not None or max_rp is not None:
                header += f" (harga Rp {min_rp or 0:,} - {f'Rp {max_rp:,}' if max_rp is not None else 'tak terbatas'})".replace(",", ".")

            # Discord batesin 1 pesan max 2000 karakter -- kalau match-nya
            # banyak, gabungin semua jadi 1 pesan bisa kena limit itu dan
            # gagal total. Pecah jadi beberapa pesan follow-up alih-alih
            # motong daftarnya diam-diam.
            DISCORD_MSG_LIMIT = 1900
            chunks = []
            current = header + ":\n"
            for line in lines:
                candidate = current + line + "\n"
                if len(candidate) > DISCORD_MSG_LIMIT and current.strip():
                    chunks.append(current.rstrip())
                    current = line + "\n"
                else:
                    current = candidate
            if current.strip():
                chunks.append(current.rstrip())

            for chunk in chunks:
                await interaction.followup.send(chunk, ephemeral=True)
        except Exception as e:  # noqa: BLE001
            print(f"[discord_bot] /harga error: {e}")
            traceback.print_exc()
            try:
                await interaction.followup.send(f"Error waktu jalanin /harga: {e}", ephemeral=True)
            except discord.HTTPException:
                pass

    @bot.tree.command(name="hapusallchat", description="Reset total: hapus semua pesan poster + semua data harga/katalog")
    @discord.app_commands.default_permissions(manage_messages=True)
    async def hapusallchat_command(interaction: discord.Interaction):
        # Full reset -- bukan cuma bersihin pesan Discord, tapi juga data
        # PENDING/CATALOG sendiri (yang persist di bot_state.json). Tanpa ini,
        # data lama numpuk terus di belakang layar walau chat-nya udah keliatan
        # bersih, dan /downloadposter account:all jadi nyeret akun-akun basi.
        # Setelah direset, /generate berikutnya bikin entri fresh dari nol.
        try:
            await interaction.response.defer(ephemeral=True, thinking=True)

            channel_ids = {interaction.channel.id}
            for key in ("draft_channel_id", "final_channel_id", "index_channel_id"):
                cid = BOT_CFG.get(key)
                if cid:
                    channel_ids.add(int(cid))

            deleted_total = 0
            failed_channels = []
            for cid in channel_ids:
                try:
                    channel = bot.get_channel(cid) or await bot.fetch_channel(cid)
                    if channel is None:
                        continue
                    while True:
                        deleted = await channel.purge(limit=100)
                        deleted_total += len(deleted)
                        if len(deleted) < 100:
                            break
                except discord.Forbidden:
                    failed_channels.append(str(cid))
                except discord.HTTPException as e:
                    print(f"[discord_bot] /hapusallchat gagal purge channel {cid}: {e}")

            PENDING.clear()
            CATALOG.clear()
            save_state()

            msg = f"Selesai -- {deleted_total} pesan dihapus & semua data harga/katalog direset."
            if failed_channels:
                msg += f" (Ga punya izin di: {', '.join(failed_channels)})"
            await interaction.followup.send(msg, ephemeral=True)
        except Exception as e:  # noqa: BLE001
            print(f"[discord_bot] /hapusallchat error: {e}")
            traceback.print_exc()
            try:
                await interaction.followup.send(f"Error waktu jalanin /hapusallchat: {e}", ephemeral=True)
            except discord.HTTPException:
                pass

    DOWNLOAD_ALL_DIR = Path(r"D:\FACEBOOK\JB")

    @bot.tree.command(name="downloadposter", description="Download poster satu akun (Discord) atau semua akun sekaligus (disimpan ke disk)")
    @discord.app_commands.describe(account="Nama akun persis kayak di dashboard, atau 'all' buat semua akun sekaligus")
    async def downloadposter_command(interaction: discord.Interaction, account: str):
        try:
            await interaction.response.defer(ephemeral=True, thinking=True)

            if account.strip().lower() == "all":
                names = known_poster_accounts()
                if not names:
                    await interaction.followup.send("Belum ada data poster akun apapun.", ephemeral=True)
                    return
                DOWNLOAD_ALL_DIR.mkdir(parents=True, exist_ok=True)
                saved, failed = [], []
                for name in names:
                    full_data = lookup_full_data(name)
                    try:
                        img = render_poster(full_data)
                        img.save(DOWNLOAD_ALL_DIR / f"{name}_poster.png", format="PNG")
                        saved.append(name)
                    except Exception as e:  # noqa: BLE001
                        print(f"[discord_bot] /downloadposter all -- gagal render {name}: {e}")
                        failed.append(name)
                msg = f"Tersimpan **{len(saved)}** poster ke `{DOWNLOAD_ALL_DIR}`."
                if failed:
                    msg += f" Gagal ({len(failed)}): {', '.join(failed)}."
                await interaction.followup.send(msg, ephemeral=True)
                return

            full_data = lookup_full_data(account)
            if not full_data:
                await interaction.followup.send(
                    f"Ga ketemu data poster buat akun '{account}'. Pastikan nama-nya persis sama kayak di "
                    "dashboard, dan akunnya udah pernah generate/report minimal sekali.",
                    ephemeral=True,
                )
                return

            img = render_poster(full_data)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            await interaction.followup.send(
                content=f"Poster akun **{account}**:",
                file=discord.File(buf, filename=f"{account}_poster.png"),
                ephemeral=True,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[discord_bot] /downloadposter error: {e}")
            traceback.print_exc()
            try:
                await interaction.followup.send(f"Error waktu jalanin /downloadposter: {e}", ephemeral=True)
            except discord.HTTPException:
                pass

    @bot.tree.error
    async def on_app_command_error(interaction: discord.Interaction, error: discord.app_commands.AppCommandError):
        """Safety net buat semua slash command -- tanpa ini, error yang
        kelewat sebelum command sempet kirim response cuma nongol di log
        internal discord.py (ga keliatan di console kita), dan Discord cuma
        nunjukkin 'The application did not respond' tanpa alasan jelas."""
        print(f"[discord_bot] app command error di /{interaction.command.name if interaction.command else '?'}: {error}")
        traceback.print_exc()
        try:
            if interaction.response.is_done():
                await interaction.followup.send(f"Error: {error}", ephemeral=True)
            else:
                await interaction.response.send_message(f"Error: {error}", ephemeral=True)
        except discord.HTTPException:
            pass

    @bot.event
    async def on_ready():
        print(f"[discord_bot] logged in as {bot.user}")
        for guild in bot.guilds:
            try:
                # Command didaftar global (bot.tree.command tanpa guild=),
                # tapi guild-sync cuma pick up command yang di-scope ke guild
                # itu -- copy_global_to biar langsung kepake instan, ga usah
                # nunggu propagasi global (bisa sampe 1 jam).
                bot.tree.copy_global_to(guild=guild)
                synced = await bot.tree.sync(guild=guild)
                print(f"[discord_bot] synced {len(synced)} slash command(s) to {guild.name}: {[c.name for c in synced]}")
            except discord.HTTPException as e:
                print(f"[discord_bot] slash command sync failed for {guild.name}: {e}")
        BOT_READY.set()

    def start_bot_thread():
        def runner():
            global bot_loop
            bot_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(bot_loop)
            try:
                bot_loop.run_until_complete(bot.start(BOT_CFG["token"]))
            except Exception as e:  # noqa: BLE001
                print(f"[discord_bot] failed to start: {e}")

        threading.Thread(target=runner, daemon=True, name="discord-bot").start()

    def schedule_post_draft(poster_id: str, png_bytes: bytes, data: dict, suggested: str, existing_draft_ref: dict = None):
        async def _post():
            await bot.wait_until_ready()
            file = discord.File(io.BytesIO(png_bytes), filename="poster.png")
            source_account = data.get("sourceAccount")
            content = (
                f"Diambil dari akun: **{source_account}** -- klik tombol di bawah buat isi harga."
                if source_account else "Klik tombol di bawah buat isi harga."
            )
            view = PriceView(poster_id, suggested)

            if existing_draft_ref:
                # SENGAJA dihapus terus di-post ULANG (bukan edit in-place)
                # -- edit in-place bikin draft lama yang udah ke-scroll ke
                # atas ke-update diem-diem tanpa Discord notify/highlight,
                # jadi user ngerasa tombol "Generate Poster" di web ga ada
                # efeknya padahal sukses. Post baru di bawah = keliatan.
                try:
                    channel = bot.get_channel(existing_draft_ref["channel_id"]) or await bot.fetch_channel(existing_draft_ref["channel_id"])
                    msg = await channel.fetch_message(existing_draft_ref["message_id"])
                    await msg.delete()
                except (discord.NotFound, discord.Forbidden, discord.HTTPException):
                    pass  # pesan lama ilang/ga bisa dihapus -- lanjut post baru aja

            channel = bot.get_channel(int(BOT_CFG["draft_channel_id"]))
            if channel is None:
                print(f"[discord_bot] draft channel not found: {BOT_CFG['draft_channel_id']}")
                return
            sent = await channel.send(content=content, file=file, view=view)
            entry = PENDING.get(poster_id)
            if entry is not None:
                entry["draft_message"] = {"channel_id": sent.channel.id, "message_id": sent.id}
                save_state()

        if bot_loop is not None:
            asyncio.run_coroutine_threadsafe(_post(), bot_loop)
else:
    def start_bot_thread():
        if DISCORD_AVAILABLE:
            print("[discord_bot] bot_config.json belum diisi (token/draft_channel_id) -- fitur isi harga interaktif nonaktif.")
        else:
            print("[discord_bot] discord.py belum keinstall -- fitur isi harga interaktif nonaktif.")

    def schedule_post_draft(*_args, **_kwargs):
        pass


DASHBOARD_HTML = r"""<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Steal An Egg -- Monitor Lokal</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --bg: #0b0b12; --card: #14141f; --card-border: #262636;
    --ink: #e8e8f0; --dim: #8b8ba3; --accent: #a78bfa; --accent2: #22d3ee;
    --green: #34d399; --gold: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    padding: 28px;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .eyebrow { color: var(--accent2); font-size: 12px; font-weight: 700; letter-spacing: 1px; }
  .sortbar { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; }
  .sortbar label { color: var(--dim); font-size: 12px; font-weight: 700; }
  .sortbar select {
    background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
    border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .sortbar select:focus { outline: none; border-color: var(--accent); }
  .sortbar input#deviceFilter {
    background: var(--card); color: var(--ink); border: 1px solid var(--card-border);
    border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 700;
    width: 190px;
  }
  .sortbar input#deviceFilter:focus { outline: none; border-color: var(--accent); }
  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 20px 0 26px; }
  .sumcard { background: var(--card); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px 16px; }
  .sumcard .label { color: var(--dim); font-size: 11px; font-weight: 700; letter-spacing: .5px; }
  .sumcard .value { font-size: 24px; font-weight: 800; margin-top: 6px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .card { background: var(--card); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px; cursor: pointer; }
  .card:hover { border-color: var(--accent); }
  .card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
  .dot.online { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .name { font-weight: 800; font-size: 15px; }
  .devicetag { color: var(--accent2); font-size: 10px; font-weight: 700; background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 6px; padding: 2px 6px; }
  .status { color: var(--dim); font-size: 11px; margin-left: auto; }
  .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
  .stat .label { color: var(--dim); font-size: 10px; font-weight: 700; }
  .stat .value { font-size: 15px; font-weight: 700; }
  .stat.money .value { color: var(--gold); }
  .stat.speed .value { color: var(--accent); }
  .toppets { display: flex; gap: 6px; }
  .pet { background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px; padding: 4px 6px; text-align: center; width: 64px; }
  .pet img { width: 36px; height: 36px; object-fit: contain; }
  .pet .pname { font-size: 9px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pet .prate { font-size: 9px; color: var(--gold); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .genbtn { margin-top: 12px; width: 100%; background: var(--accent); color: #1a1030; border: none; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .genbtn:hover { filter: brightness(1.1); }
  .genbtn:disabled { opacity: .6; cursor: default; }
  .restartbtn { margin-top: 6px; width: 100%; background: #262636; color: var(--ink); border: 1px solid var(--card-border); border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
  .restartbtn:hover { border-color: var(--accent2); }
  .restartbtn:disabled { opacity: .6; cursor: default; }
  .genmsg { font-size: 11px; color: var(--dim); margin-top: 6px; min-height: 14px; }
  .empty { color: var(--dim); text-align: center; padding: 60px 0; }

  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 50; }
  .overlay.hidden { display: none; }
  .modal { background: var(--card); border: 1px solid var(--card-border); border-radius: 16px; padding: 24px; width: 100%; max-width: 720px; }
  .modal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .modal-head .name { font-size: 20px; }
  .modal-close { margin-left: auto; background: none; border: none; color: var(--dim); font-size: 22px; cursor: pointer; line-height: 1; }
  .modal-close:hover { color: var(--ink); }
  .modal-sub { color: var(--dim); font-size: 12px; margin-bottom: 18px; }
  .section-title { color: var(--accent2); font-size: 12px; font-weight: 800; letter-spacing: .5px; margin: 18px 0 8px; }
  .detail-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
  .dpet { background: #1c1c2b; border: 1px solid var(--card-border); border-radius: 8px; padding: 6px 8px; display: flex; align-items: center; gap: 8px; }
  .dpet img { width: 32px; height: 32px; object-fit: contain; flex-shrink: 0; }
  .dpet .dinfo { min-width: 0; }
  .dpet .dname { font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dpet .drate { font-size: 11px; color: var(--gold); font-weight: 700; }
  .detail-empty { color: var(--dim); font-size: 12px; }
</style>
</head>
<body>
  <div class="eyebrow">STEAL AN EGG</div>
  <h1>Monitor Lokal -- Akun & Pet</h1>
  <div class="sortbar">
    <label for="sortSelect">Urutkan:</label>
    <select id="sortSelect">
      <option value="name_asc">Nama Akun (Nomor)</option>
      <option value="speed_desc">Speed (Tertinggi)</option>
      <option value="income_aktif_desc">Income Aktif (Tertinggi)</option>
      <option value="income_pasif_desc">Income Pasif (Tertinggi)</option>
      <option value="egg_desc">Egg Terbanyak</option>
    </select>
    <label for="deviceFilter">Device:</label>
    <input type="text" id="deviceFilter" placeholder="mis: SAE 21 (isi 21-30)">
  </div>
  <div class="summary" id="summary"></div>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none">Belum ada akun yang lapor. Nyalain "Auto Report ke Dashboard" di GUI game.</div>

  <div class="overlay hidden" id="overlay">
    <div class="modal" id="modal"></div>
  </div>

<script>
function fmtMoney(v) {
  if (v === null || v === undefined) return "-";
  v = Number(v);
  const abs = Math.abs(v);
  if (abs >= 1e12) return "$" + (v/1e12).toFixed(1) + "T";
  if (abs >= 1e9) return "$" + (v/1e9).toFixed(1) + "B";
  if (abs >= 1e6) return "$" + (v/1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (v/1e3).toFixed(1) + "K";
  return "$" + v.toFixed(0);
}
function fmtNum(v) {
  if (v === null || v === undefined) return "-";
  return Number(v).toLocaleString("en-US");
}
function fmtRate(v) {
  if (v === null || v === undefined) return "-";
  return fmtMoney(v) + "/s";
}
function fmtLevel(v) {
  if (v === null || v === undefined) return "-";
  return "Lv. " + v;
}
function iconUrl(pet) {
  const muts = (pet.mutations || []).join(",");
  return "/api/icon?category=" + encodeURIComponent(pet.category || "") + "&mutations=" + encodeURIComponent(muts);
}
let lastAccounts = [];
function accountNumber(name) {
  const m = (name || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
// Device dibagi per blok 10 nomor: SAE 21 isinya akun nomor 21-30, SAE 101
// isinya nomor 101-110, dst -- blok dimulai dari (n-1)/10*10 + 1.
function deviceBlockStart(num) {
  if (num === null || isNaN(num)) return null;
  return Math.floor((num - 1) / 10) * 10 + 1;
}
function deviceLabel(name) {
  const start = deviceBlockStart(accountNumber(name));
  return start === null ? null : "SAE " + start;
}
function filterByDevice(list) {
  const raw = document.getElementById("deviceFilter").value.trim();
  if (!raw) return list;
  const queryNum = accountNumber(raw);
  if (queryNum === null) return list;
  const wantBlock = deviceBlockStart(queryNum);
  return list.filter(a => deviceBlockStart(accountNumber(a.sourceAccount)) === wantBlock);
}
function sortAccounts(list) {
  const mode = document.getElementById("sortSelect").value;
  const sorted = list.slice();
  switch (mode) {
    case "speed_desc":
      sorted.sort((a, b) => (Number(b.speed) || 0) - (Number(a.speed) || 0));
      break;
    case "income_aktif_desc":
      sorted.sort((a, b) =>
        ((Number(b.incomeAktif) || 0) + (Number(b.incomePotensiAktif) || 0)) -
        ((Number(a.incomeAktif) || 0) + (Number(a.incomePotensiAktif) || 0)));
      break;
    case "income_pasif_desc":
      sorted.sort((a, b) =>
        ((Number(b.incomeEggBackpack) || 0) + (Number(b.incomeEggSedangTumbuh) || 0)) -
        ((Number(a.incomeEggBackpack) || 0) + (Number(a.incomeEggSedangTumbuh) || 0)));
      break;
    case "egg_desc":
      sorted.sort((a, b) => (Number(b.stolenCount) || 0) - (Number(a.stolenCount) || 0));
      break;
    case "name_asc":
    default:
      sorted.sort((a, b) => {
        const na = parseInt((a.sourceAccount || "").match(/\d+/)?.[0], 10);
        const nb = parseInt((b.sourceAccount || "").match(/\d+/)?.[0], 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return (a.sourceAccount || "").localeCompare(b.sourceAccount || "");
      });
      break;
  }
  return sorted;
}
function renderGrid() {
  const accounts = sortAccounts(filterByDevice(lastAccounts));
  const emptyEl = document.getElementById("empty");
  if (accounts.length) {
    emptyEl.style.display = "none";
  } else {
    emptyEl.style.display = "block";
    emptyEl.textContent = lastAccounts.length
      ? "Ga ada akun yang cocok sama filter device itu."
      : "Belum ada akun yang lapor. Nyalain \"Auto Report ke Dashboard\" di GUI game.";
  }
  document.getElementById("grid").innerHTML = accounts.map(a => `
    <div class="card" data-account="${a.sourceAccount.replace(/"/g, "&quot;")}">
      <div class="card-head">
        <span class="dot ${a.online ? 'online' : ''}"></span>
        <span class="name">${a.sourceAccount}</span>
        <span class="devicetag">${deviceLabel(a.sourceAccount) || ""}</span>
        <span class="status">${a.online ? "Active" : "Offline"}</span>
      </div>
      <div class="stats">
        <div class="stat speed"><div class="label">SPEED</div><div class="value">${fmtNum(a.speed)}</div></div>
        <div class="stat money"><div class="label">CASH</div><div class="value">${fmtMoney(a.money)}</div></div>
        <div class="stat"><div class="label">INCOME POTENSI AKTIF</div><div class="value">${fmtRate(a.incomePotensiAktif)}</div></div>
        <div class="stat"><div class="label">INCOME AKTIF</div><div class="value">${fmtRate(a.incomeAktif)}</div></div>
        <div class="stat"><div class="label">TOTAL PET >= 1B/S</div><div class="value">${fmtRate(a.highValuePetTotal)}</div></div>
        <div class="stat"><div class="label">KANDANG LEVEL</div><div class="value">${fmtLevel(a.kandangLevel)}</div></div>
        <div class="stat"><div class="label">TREADMILL LEVEL</div><div class="value">${fmtLevel(a.treadmillLevel)}</div></div>
        <div class="stat"><div class="label">PETS</div><div class="value">${fmtNum(a.petsCount)} pets</div></div>
        <div class="stat"><div class="label">STOLEN</div><div class="value">${fmtNum(a.stolenCount)} eggs</div></div>
      </div>
      <div class="toppets">
        ${(a.topPets || []).map(p => `
          <div class="pet">
            <img src="${iconUrl(p)}" loading="lazy">
            <div class="pname">${p.name || p.category}</div>
            <div class="prate">${fmtRate(p.rate)}</div>
          </div>
        `).join("")}
      </div>
      <button class="genbtn" data-account="${a.sourceAccount.replace(/"/g, "&quot;")}">Generate Poster</button>
      <button class="restartbtn" data-account="${a.sourceAccount.replace(/"/g, "&quot;")}">Restart Script</button>
      <div class="genmsg"></div>
    </div>
  `).join("");
}
async function refresh() {
  const res = await fetch("/api/accounts");
  const data = await res.json();
  // Cuma tampilin yang online -- akun offline itu paling sering cache basi
  // dari sesi tunnel/server yang beda (tunnel URL ganti-ganti tiap direfresh),
  // bukan akun yang beneran lagi kamu pantau sekarang.
  const accounts = (data.accounts || []).filter(a => a.online);

  const totalMoney = accounts.reduce((s, a) => s + (Number(a.money) || 0), 0);
  const totalSpeed = accounts.reduce((s, a) => s + (Number(a.speed) || 0), 0);
  const totalPets = accounts.reduce((s, a) => s + (Number(a.petsCount) || 0), 0);
  const totalStolen = accounts.reduce((s, a) => s + (Number(a.stolenCount) || 0), 0);

  document.getElementById("summary").innerHTML = `
    <div class="sumcard"><div class="label">ACTIVE ACCOUNTS</div><div class="value">${accounts.length}</div></div>
    <div class="sumcard"><div class="label">TOTAL MONEY</div><div class="value">${fmtMoney(totalMoney)}</div></div>
    <div class="sumcard"><div class="label">TOTAL SPEED</div><div class="value">${fmtNum(totalSpeed)}</div></div>
    <div class="sumcard"><div class="label">TOTAL PETS</div><div class="value">${fmtNum(totalPets)}</div></div>
    <div class="sumcard"><div class="label">TOTAL EGGS STOLEN</div><div class="value">${fmtNum(totalStolen)}</div></div>
  `;

  lastAccounts = accounts;
  renderGrid();
}
document.getElementById("sortSelect").addEventListener("change", renderGrid);
document.getElementById("deviceFilter").addEventListener("input", renderGrid);
document.getElementById("grid").addEventListener("click", (ev) => {
  const genBtn = ev.target.closest(".genbtn");
  if (genBtn) {
    generatePoster(genBtn.dataset.account, genBtn);
    return;
  }
  const restartBtn = ev.target.closest(".restartbtn");
  if (restartBtn) {
    queueCommand(restartBtn.dataset.account, "restart_script", restartBtn, "Restart terkirim. Nunggu agent di instance ambil perintahnya.");
    return;
  }
  const card = ev.target.closest(".card");
  if (card) openDetail(card.dataset.account);
});
async function queueCommand(account, action, btn, successMsg) {
  const msgEl = btn.nextElementSibling.classList.contains("genmsg") ? btn.nextElementSibling : btn.parentElement.querySelector(".genmsg");
  btn.disabled = true;
  if (msgEl) { msgEl.textContent = "Mengirim..."; msgEl.style.color = "var(--dim)"; }
  try {
    const res = await fetch("/api/queue-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account, action }),
    });
    const body = await res.json();
    if (msgEl) {
      if (res.ok && body.ok) {
        msgEl.textContent = successMsg;
        msgEl.style.color = "var(--green)";
      } else {
        msgEl.textContent = "Gagal: " + (body.error || "unknown error");
        msgEl.style.color = "#f87171";
      }
    }
  } catch (e) {
    if (msgEl) { msgEl.textContent = "Gagal: " + e; msgEl.style.color = "#f87171"; }
  } finally {
    btn.disabled = false;
  }
}

function petTile(p) {
  return `
    <div class="dpet">
      <img src="${iconUrl(p)}" loading="lazy">
      <div class="dinfo">
        <div class="dname">${p.name || p.category}${(p.mutations||[]).length ? " (" + p.mutations.join(", ") + ")" : ""}</div>
        <div class="drate">${fmtRate(p.rate)}</div>
      </div>
    </div>
  `;
}
function petSection(title, list) {
  const sorted = (list || []).slice().sort((x, y) => (y.rate || 0) - (x.rate || 0));
  return `
    <div class="section-title">${title} (${sorted.length})</div>
    ${sorted.length
      ? `<div class="detail-grid">${sorted.map(petTile).join("")}</div>`
      : `<div class="detail-empty">Kosong.</div>`}
  `;
}
async function openDetail(account) {
  const overlay = document.getElementById("overlay");
  const modal = document.getElementById("modal");
  modal.innerHTML = `<div class="modal-head"><span class="name">${account}</span><button class="modal-close" id="modalClose">&times;</button></div><div class="modal-sub">Memuat...</div>`;
  overlay.classList.remove("hidden");
  document.getElementById("modalClose").onclick = closeDetail;
  try {
    const res = await fetch("/api/account-detail?account=" + encodeURIComponent(account));
    const body = await res.json();
    if (!res.ok || !body.ok) {
      modal.innerHTML = `<div class="modal-head"><span class="name">${account}</span><button class="modal-close" id="modalClose">&times;</button></div><div class="modal-sub">${body.error || "Gagal memuat detail."}</div>`;
      document.getElementById("modalClose").onclick = closeDetail;
      return;
    }
    modal.innerHTML = `
      <div class="modal-head"><span class="name">${account}</span><button class="modal-close" id="modalClose">&times;</button></div>
      <div class="modal-sub">Active Limit: ${body.activeLimit ?? "-"}</div>
      ${petSection("Pet Aktif", body.activePets)}
      ${petSection("Isi Tas (Semua Pet)", body.allPets)}
      ${petSection("Telur Sedang Tumbuh", body.growingEggs)}
      ${petSection("Telur di Tas", body.backpackEggs)}
    `;
    document.getElementById("modalClose").onclick = closeDetail;
  } catch (e) {
    modal.innerHTML = `<div class="modal-head"><span class="name">${account}</span><button class="modal-close" id="modalClose">&times;</button></div><div class="modal-sub">Gagal memuat: ${e}</div>`;
    document.getElementById("modalClose").onclick = closeDetail;
  }
}
function closeDetail() {
  document.getElementById("overlay").classList.add("hidden");
}
document.getElementById("overlay").addEventListener("click", (ev) => {
  if (ev.target.id === "overlay") closeDetail();
});
async function generatePoster(account, btn) {
  const msgEl = btn.nextElementSibling;
  btn.disabled = true;
  msgEl.textContent = "Mengirim...";
  msgEl.style.color = "var(--dim)";
  try {
    const res = await fetch("/api/generate-poster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account }),
    });
    const body = await res.json();
    if (res.ok && body.ok) {
      msgEl.textContent = body.mode === "discord-price-flow"
        ? "Draft terkirim ke Discord (isi harga di sana)."
        : "Poster terkirim ke Discord.";
      msgEl.style.color = "var(--green)";
    } else {
      msgEl.textContent = "Gagal: " + (body.error || "unknown error");
      msgEl.style.color = "#f87171";
    }
  } catch (e) {
    msgEl.textContent = "Gagal: " + e;
    msgEl.style.color = "#f87171";
  } finally {
    btn.disabled = false;
  }
}
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
"""


def lookup_full_data(account: str) -> dict:
    """Cari snapshot poster-shaped data buat 1 akun: pertama dari fullData
    laporan /monitor terakhir (ACCOUNTS), fallback ke draft yang masih
    ngantri di PENDING kalau akunnya lagi ga ngereport.

    Laporan /monitor SENGAJA selalu ngirim price kosong (biar alur "isi
    harga di Discord" tetap jalan tiap kali tombol Generate Poster
    dipencet) -- begitu harga (atau judul) diedit lewat modal "Edit
    Poster", itu cuma keupdate di PENDING punya bot, bukan ikut kebawa
    balik ke laporan game berikutnya (laporan itu selalu bawa titleInput
    default dari script). Jadi buat /downloadposter (yang mestinya
    nunjukkin harga & judul TERAKHIR yang beneran diedit, bukan mulai
    draft baru), harga & judul dari PENDING itu yang ditimpakan ke atas
    snapshot fullData yang paling baru."""
    with ACCOUNTS_LOCK:
        acc = ACCOUNTS.get(account)
        full_data = acc.get("fullData") if acc else None

    filled_price = None
    edited_title = None
    for entry in PENDING.values():
        d = entry.get("data") or {}
        if d.get("sourceAccount") != account:
            continue
        if (d.get("price") or "").strip():
            filled_price = d.get("price")  # entri terakhir yang match menang
        if (d.get("title") or "").strip():
            edited_title = d.get("title")

    if full_data:
        if filled_price and not (full_data.get("price") or "").strip():
            full_data = dict(full_data)
            full_data["price"] = filled_price
        if edited_title and edited_title != full_data.get("title"):
            full_data = dict(full_data)
            full_data["title"] = edited_title
        return full_data

    for entry in PENDING.values():
        if entry.get("data", {}).get("sourceAccount") == account:
            return entry["data"]
    return None


def known_poster_accounts() -> list:
    """Akun yang BENERAN udah pernah di-generate (punya entri di PENDING --
    baik masih draft nunggu harga, maupun udah final), dipakai buat
    /downloadposter account:all.

    Sengaja BUKAN dari ACCOUNTS (semua akun yang lagi ngereport lewat
    /monitor) -- itu jalan otomatis tiap 15 detik buat akun manapun yang
    toggle-nya nyala, terlepas dari udah pernah di-generate apa belum.
    Kalau dipakai, download-all bakal narik akun yang cuma lagi
    dimonitor tapi belum pernah kamu generate sama sekali."""
    names = set()
    for entry in PENDING.values():
        sa = entry.get("data", {}).get("sourceAccount")
        if sa:
            names.add(sa)
    return sorted(names)


def generate_and_deliver(data: dict) -> tuple[int, dict]:
    """Render poster dari `data` dan kirim ke Discord -- dipakai bareng sama
    /generate (dari game) dan /api/generate-poster (tombol di dashboard)."""
    # Harga kosong + bot udah dikonfigurasi -> jangan langsung post ke
    # webhook. Post draft (tanpa harga) ke channel "isi harga" via bot,
    # dengan tombol; harga baru dipasang setelah user isi lewat modal, terus
    # poster final diposting ke channel satunya.
    if not (data.get("price") or "").strip() and BOT_ENABLED:
        draft_img = render_poster(data)
        draft_buf = io.BytesIO()
        draft_img.save(draft_buf, format="PNG")

        # Kalau akun ini udah punya draft yang belum dikasih harga (belum
        # final), edit pesan itu di tempat alih-alih posting draft baru --
        # tanpa ini, tiap kali /generate ke-panggil ulang buat akun yang sama
        # (double click, restart, dashboard + in-game bareng, dst) bakal numpuk
        # pesan duplikat di channel "isi harga" (ini yang bikin "spam" tadi).
        source_account = data.get("sourceAccount")
        existing_id = None
        if source_account:
            for pid, entry in PENDING.items():
                if entry.get("data", {}).get("sourceAccount") == source_account and not entry.get("final_message"):
                    existing_id = pid
                    break

        poster_id = existing_id or uuid.uuid4().hex[:12]
        suggested = data.get("suggestedPrice") or ""
        prev_entry = PENDING.get(poster_id, {})
        PENDING[poster_id] = {**prev_entry, "data": data, "suggested_price": suggested}
        save_state()
        schedule_post_draft(poster_id, draft_buf.getvalue(), data, suggested, existing_draft_ref=prev_entry.get("draft_message"))
        return 200, {"ok": True, "posterId": poster_id, "mode": "discord-price-flow", "updated": bool(existing_id)}

    webhook_url = data.get("webhookUrl")
    if not webhook_url:
        # Sebelumnya di-skip diam-diam di bawah (abis render) -- balikin
        # ok:True padahal ga pernah ngirim apa-apa ke Discord (ketauan pas
        # user lapor "generate ngga masuk Discord" tapi response-nya
        # sukses). Sekarang ini dianggap error jelas, bukan no-op senyap --
        # dicek SEBELUM render biar ga buang kerjaan pas emang bakal gagal.
        return 400, {
            "ok": False,
            "error": "Ga ada tujuan Discord -- nyalain toggle \"Isi Harga di Discord\" ATAU isi field \"Webhook URL\".",
        }

    img = render_poster(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    content_lines = []
    source_account = data.get("sourceAccount")
    if source_account:
        content_lines.append(f"Diambil dari akun: **{source_account}**")
    if data.get("message"):
        content_lines.append(data["message"])
    resp = requests.post(
        webhook_url,
        data={"content": "\n".join(content_lines)},
        files={"file": ("poster.png", buf.getvalue(), "image/png")},
        timeout=20,
    )
    if resp.status_code not in (200, 204):
        return 502, {"ok": False, "error": f"discord {resp.status_code}: {resp.text[:300]}"}

    # Simpan salinan lokal buat debugging -- opsional, jangan sampai
    # gagal-total kalau disk-nya read-only/ephemeral (misal di Render).
    saved_to = None
    try:
        out_path = Path(__file__).parent / "last_poster.png"
        out_path.write_bytes(buf.getvalue())
        saved_to = str(out_path)
    except OSError:
        pass
    return 200, {"ok": True, "saved": saved_to}


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/check-access":
            self._handle_check_access()
            return
        if self.path in ("/monitor", "/generate") and not check_key_header(self):
            print(f"[poster_server] BLOCKED {self.path} -- key salah/kosong (X-Access-Key)")
            self._send_json(401, {"ok": False, "error": "invalid key"})
            return
        if self.path == "/monitor":
            self._handle_monitor()
            return
        if self.path == "/api/generate-poster":
            self._handle_generate_for_account()
            return
        if self.path == "/api/queue-command":
            self._handle_queue_command()
            return
        if self.path != "/generate":
            self._send_json(404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))
            status, body = generate_and_deliver(data)
            self._send_json(status, body)
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"ok": False, "error": str(e)})

    def _handle_check_access(self):
        """Key gate -- dipanggil StealAnEgg.luau SEBELUM GUI kebuka. SENGAJA
        dibiarkan bisa diakses siapa aja tanpa auth apa pun (endpoint ini
        JUSTRU buat orang yang belum "masuk" sama sekali) -- lihat
        check_access() buat logic key-cocok-nya."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8")) if raw else {}
            key = (data.get("key") or "").strip()
            ok, reason = check_access(key)
            self._send_json(200 if ok else 401, {"ok": ok, "error": None if ok else reason})
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"ok": False, "error": str(e)})

    def _handle_queue_command(self):
        """Dashboard minta instance jalanin command tertentu (misal
        restart_script) -- command masuk antrian per akun, nanti diambil
        sendiri sama agent Termux yang polling di instance itu lewat
        GET /api/poll-command."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            req = json.loads(raw.decode("utf-8"))
            name = req.get("account") or ""
            action = req.get("action") or ""
            if not name or not action:
                self._send_json(400, {"ok": False, "error": "account & action wajib diisi"})
                return
            with COMMANDS_LOCK:
                COMMANDS.setdefault(name, []).append({"action": action, "queuedAt": time.time()})
            self._send_json(200, {"ok": True})
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"ok": False, "error": str(e)})

    def _handle_generate_for_account(self):
        """Dipanggil dari tombol 'Generate Poster' di dashboard -- pakai
        snapshot data lengkap yang udah kesimpen dari laporan /monitor
        terakhir akun itu, jadi ga perlu game ngirim ulang apa-apa."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            req = json.loads(raw.decode("utf-8"))
            name = req.get("account") or ""
            with ACCOUNTS_LOCK:
                acc = ACCOUNTS.get(name)
                full_data = acc.get("fullData") if acc else None
            if not full_data:
                self._send_json(404, {
                    "ok": False,
                    "error": "Belum ada data lengkap buat akun ini. Pastikan Auto Report ke Dashboard nyala & udah lapor minimal sekali.",
                })
                return
            # SENGAJA paksa price kosong di sini -- tombol "Generate Poster"
            # di dashboard harus SELALU lewat jalur bot (draft + Edit
            # Poster), ga peduli toggle "Isi Harga di Discord" nyala/mati
            # atau field Webhook URL diisi/kosong di device yang lapor.
            # full_data itu snapshot /monitor apa adanya (bisa bawa price
            # non-empty kalau toggle di device itu off) -- copy dulu biar
            # ga ngubah data asli yang kesimpen di ACCOUNTS.
            full_data = {**full_data, "price": ""}
            status, body = generate_and_deliver(full_data)
            self._send_json(status, body)
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"ok": False, "error": str(e)})

    def _handle_monitor(self):
        """Satu akun lapor stat ringan (Money/Speed/Pets/Stolen/Top Pets)
        buat dashboard 'Monitor Lokal' -- dipanggil berkala dari game, bukan
        sekali generate manual kayak /generate."""
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))
            name = data.get("sourceAccount") or "?"
            with ACCOUNTS_LOCK:
                ACCOUNTS[name] = {
                    "money": data.get("money"),
                    "speed": data.get("speed"),
                    "income": data.get("income"),
                    # Sama persis label yang dipajang di poster.
                    "incomeAktif": data.get("incomeAktif"),
                    "incomePotensiAktif": data.get("incomePotensiAktif"),
                    "incomeEggBackpack": data.get("incomeEggBackpack"),
                    "incomeEggSedangTumbuh": data.get("incomeEggSedangTumbuh"),
                    "highValuePetTotal": data.get("highValuePetTotal"),
                    "kandangLevel": data.get("kandangLevel"),
                    "treadmillLevel": data.get("treadmillLevel"),
                    "petsCount": data.get("petsCount", 0),
                    "stolenCount": data.get("stolenCount", 0),
                    "topPets": data.get("topPets") or [],
                    "fullData": data.get("fullData"),
                    "lastSeen": time.time(),
                }
            self._send_json(200, {"ok": True})
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"ok": False, "error": str(e)})

    def _serve_accounts_json(self):
        now = time.time()
        with ACCOUNTS_LOCK:
            rows = []
            for name, acc in ACCOUNTS.items():
                row = {k: v for k, v in acc.items() if k != "fullData"}
                row["sourceAccount"] = name
                row["online"] = (now - acc.get("lastSeen", 0)) <= ONLINE_TIMEOUT_S
                rows.append(row)
        body = json.dumps({"accounts": rows}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_account_detail(self, query: str):
        from urllib.parse import parse_qs, unquote
        q = parse_qs(query)
        name = unquote((q.get("account") or [""])[0])
        with ACCOUNTS_LOCK:
            acc = ACCOUNTS.get(name)
            full_data = acc.get("fullData") if acc else None
        if not full_data:
            self._send_json(404, {"ok": False, "error": "Belum ada data lengkap buat akun ini."})
            return
        self._send_json(200, {
            "ok": True,
            "sourceAccount": name,
            "activePets": full_data.get("activePets") or [],
            "activeLimit": full_data.get("activeLimit"),
            "allPets": full_data.get("allPets") or [],
            "growingEggs": full_data.get("growingEggs") or [],
            "backpackEggs": full_data.get("backpackEggs") or [],
        })

    def _serve_poll_command(self, query: str):
        """Dipanggil sama agent Termux di tiap instance -- ambil (pop)
        command pertama yang lagi ngantri buat akun ini, kalau ada."""
        from urllib.parse import parse_qs, unquote
        q = parse_qs(query)
        name = unquote((q.get("account") or [""])[0])
        with COMMANDS_LOCK:
            queue = COMMANDS.get(name) or []
            cmd = queue.pop(0) if queue else None
        self._send_json(200, {"action": cmd["action"] if cmd else None})

    def _serve_icon(self, query: str):
        from urllib.parse import parse_qs, unquote
        q = parse_qs(query)
        category = unquote((q.get("category") or [""])[0])
        mutations = [unquote(m) for m in (q.get("mutations") or [""])[0].split(",") if m]
        img = find_icon(category, mutations) or Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        buf = io.BytesIO()
        img.convert("RGBA").save(buf, format="PNG")
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        if path == "/dashboard":
            body = DASHBOARD_HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/accounts":
            self._serve_accounts_json()
            return
        if path == "/api/icon":
            self._serve_icon(query)
            return
        if path == "/api/account-detail":
            self._serve_account_detail(query)
            return
        if path == "/api/poll-command":
            self._serve_poll_command(query)
            return
        # Health check buat platform hosting (Render dst) + biar buka URL-nya
        # di browser ga cuma dapet 501.
        self._send_json(200, {"ok": True, "service": "poster_server", "hint": "POST JSON to /generate"})

    def log_message(self, fmt, *args):
        print("[poster_server]", fmt % args)


def get_lan_ip() -> str:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    start_bot_thread()
    if BOT_ENABLED:
        print("[discord_bot] starting -- fitur 'Isi Harga di Discord' aktif")

    # 0.0.0.0 biar bisa diakses dari device lain (HP dll) di WiFi yang sama,
    # ga cuma dari PC ini sendiri (127.0.0.1).
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"poster_server listening on http://0.0.0.0:{PORT}")
    if os.environ.get("PORT"):
        # PORT di-set dari luar -> lagi jalan di hosting (Render dst), bukan
        # PC lokal. LAN IP ga relevan di sini.
        print("  -> hosted; pakai URL publik dari platform hosting kamu + /generate")
    else:
        lan_ip = get_lan_ip()
        print(f"  -> from this PC:        http://127.0.0.1:{PORT}/generate")
        print(f"  -> from other devices:  http://{lan_ip}:{PORT}/generate")
        print("     (pastikan device itu di WiFi yang sama, dan Windows Firewall ngizinin port ini)")
    server.serve_forever()


if __name__ == "__main__":
    main()
