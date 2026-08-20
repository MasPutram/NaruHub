"""
Generator poster "Jasa Joki Steal An Egg" -- gaya vibrant/promosi (referensi
dari poster joki lain: glow, badge warna-warni, karakter besar), 16:9.

Assets (icon telur & pet) di-extract langsung dari game (AssetService:
CreateEditableImageAsync + ReadPixelsBuffer), bukan gambar AI/stock.
Edit config.json buat ganti judul/paket/harga/kontak/estimasi, lalu:

    python poster.py

Hasilnya joki_poster.png di folder yang sama.
"""

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = Path(__file__).parent

W, H = 1920, 1080  # 16:9

# ---- Palet vibrant -- oranye/merah menyala di tengah, gelap di tepi. ----
BG_INNER = (255, 160, 40)
BG_OUTER = (30, 8, 8)
WHITE = (255, 255, 255)
CREAM = (255, 244, 224)
GOLD = (255, 205, 60)
GREEN = (39, 189, 99)
BLUE = (43, 133, 227)
RED = (196, 32, 32)
DARK_RED = (110, 14, 14)
INK = (30, 20, 14)
DIM = (255, 224, 190)

EGG_DIR = HERE / "assets" / "Eggs"
PET_DIR = HERE / "assets" / "Pets"
EGG_NAMES = sorted(p.stem[len("Egg_"):] for p in EGG_DIR.glob("Egg_*.png"))
PET_FILES = {p.stem.split(" [")[0]: p for p in PET_DIR.glob("*.png")}

HEADER_EGGS = [n for n in ["Eternal Lunar Dragon", "Unicorn", "Ascended Vermilion Phoenix"] if n in EGG_NAMES]
TOP_PETS = ["Archdemon Dragon", "Unicorn", "Ascended Vermilion Phoenix"]
COSMIC_PET_NAMES = [n for n in [
    "Bronto", "Basilisk", "Whale Shark", "Colossal Mammoth",
    "Hellhound", "Triceratops", "Irihorus", "Alabaster Whale",
] if n in PET_FILES]

# ---- Palet space/neon buat poster "Jasa Joki Ambil Egg" (referensi biru-ungu). ----
SPACE_INNER = (70, 45, 150)
SPACE_OUTER = (6, 5, 20)
NEON_PURPLE = (150, 80, 235)
NEON_CYAN = (70, 210, 235)
NEON_PINK = (230, 70, 175)

RARITY_COLORS = {
    "COSMIC": (130, 90, 230),
    "SECRET": (214, 48, 48),
    "ETERNAL": (56, 178, 214),
    "DIVINE": (255, 205, 60),
}


def load_fonts():
    sans_bold = HERE / "fonts" / "DejaVuSans-Bold.ttf"
    sans_reg = HERE / "fonts" / "DejaVuSans.ttf"
    return {"bold": str(sans_bold), "reg": str(sans_reg)}


FONT_PATHS = load_fonts()
_font_cache = {}


def font(family, size):
    key = (family, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONT_PATHS[family], size)
    return _font_cache[key]


def text_centered(draw, xy, text, f, fill, stroke_width=0, stroke_fill=None, anchor="mm"):
    draw.text(xy, text, font=f, fill=fill, anchor=anchor,
               stroke_width=stroke_width, stroke_fill=stroke_fill)


_egg_cache = {}


def load_egg(name, size):
    key = (name, size)
    if key in _egg_cache:
        return _egg_cache[key]
    img = Image.open(EGG_DIR / f"Egg_{name}.png").convert("RGBA")
    img = img.resize((size, size), Image.LANCZOS)
    _egg_cache[key] = img
    return img


_pet_cache = {}


def load_pet(name, size):
    key = (name, size)
    if key in _pet_cache:
        return _pet_cache[key]
    path = PET_FILES[name]
    img = Image.open(path).convert("RGBA")
    # crop transparent padding biar pet-nya keliatan lebih gede/nempel
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    scale = size / max(w, h)
    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    _pet_cache[key] = img
    return img


def paste_rgba(canvas, img, x, y):
    canvas.paste(img, (int(x), int(y)), img)


def radial_gradient(w, h, inner, outer, center=(0.42, 0.38), radius_scale=1.15):
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = w * center[0], h * center[1]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    maxd = math.hypot(max(cx, w - cx), max(cy, h - cy)) * radius_scale
    t = np.clip(d / maxd, 0, 1)
    gray = ((1 - t) * 255).astype(np.uint8)
    gray_img = Image.fromarray(gray, mode="L")
    return ImageOps.colorize(gray_img, black=outer, white=inner).convert("RGB")


def glow_layer(w, h, box, color, blur=40, alpha=200):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(box, fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def rounded_glow_rect(w, h, box, color, radius=28, blur=22, alpha=190):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=radius, fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def checklist_icon(draw, cx, cy, size=26):
    """Icon mini kertas misi ala referensi -- kotak putih + garis-garis."""
    x0, y0 = cx - size / 2, cy - size / 2
    x1, y1 = cx + size / 2, cy + size / 2
    draw.rounded_rectangle((x0, y0, x1, y1), radius=4, fill=WHITE, outline=(200, 190, 170), width=1)
    for i in range(3):
        ly = y0 + size * 0.28 + i * size * 0.24
        draw.line([(x0 + size * 0.2, ly), (x1 - size * 0.2, ly)], fill=(150, 140, 120), width=2)


def check_badge(draw, cx, cy, r=16, color=BLUE):
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color, outline=WHITE, width=2)
    draw.line([(cx - r * 0.45, cy), (cx - r * 0.1, cy + r * 0.4), (cx + r * 0.5, cy - r * 0.4)],
               fill=WHITE, width=3, joint="curve")


def rarity_pill_row(draw, x0, y, rarities, font_size=15, pill_h=32, gap=10):
    """Baris pill kecil per tier rarity (COSMIC/SECRET/ETERNAL/DIVINE dst),
    warna beda tiap tier. Return x setelah pill terakhir."""
    f = font("bold", font_size)
    mx = x0
    for r in rarities:
        color = RARITY_COLORS.get(r.upper(), GOLD)
        w = draw.textlength(r.upper(), font=f) + 28
        box = (mx, y, mx + w, y + pill_h)
        draw.rounded_rectangle(box, radius=pill_h / 2, fill=color, outline=WHITE, width=2)
        text_centered(draw, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), r.upper(), f, (18, 12, 8))
        mx += w + gap
    return mx


def perks_line(draw, x0, y, perks, font_size=16, color=CREAM):
    f = font("bold", font_size)
    mx = x0
    for p in perks:
        txt = "✓ " + p
        draw.text((mx, y), txt, font=f, fill=color)
        mx += draw.textlength(txt, font=f) + 34


def render_poster(cfg: dict, w: int = W, h: int = H) -> Image.Image:
    """Layout landscape dua kolom. Dituning buat 1920x1080 (16:9); untuk
    kanvas lain yang tingginya tetap 1080 tapi lebih sempit (mis. 4:3 =
    1440x1080), semua koordinat X di-scale proporsional (hs) sementara
    Y/font/ukuran tetap -- teks yang berpotensi kepanjangan sudah ada
    logic shrink/ellipsis-nya sendiri jadi tetap aman lebih sempit."""
    hs = w / W

    def X(v):
        return v * hs

    canvas = radial_gradient(w, h, BG_INNER, BG_OUTER).convert("RGBA")

    # ---- Bintik telur dekoratif di background, opacity rendah -- ditaruh
    # cuma di area yang beneran kosong (bukan numpuk di atas panel/kartu). ----
    deco_specs = [
        (EGG_NAMES[3 % len(EGG_NAMES)], 70, X(1420), 40, 18),
        (EGG_NAMES[7 % len(EGG_NAMES)], 60, X(1560), 150, -25),
        (EGG_NAMES[11 % len(EGG_NAMES)], 55, X(260), 900, -15),
        (EGG_NAMES[15 % len(EGG_NAMES)], 50, X(700), 940, 20),
        (EGG_NAMES[19 % len(EGG_NAMES)], 55, X(900), 890, -10),
    ]
    for name, size, x, y, angle in deco_specs:
        egg = load_egg(name, size)
        egg = egg.rotate(angle, expand=True, resample=Image.BICUBIC)
        r, g, b, a = egg.split()
        a = a.point(lambda v: int(v * 0.28))
        egg.putalpha(a)
        paste_rgba(canvas, egg, x, y)

    draw = ImageDraw.Draw(canvas)

    # ================= HEADER: badge bulat + ribbon judul =================
    badge_cx, badge_cy, badge_r = X(130), 110, 78
    glow = glow_layer(w, h, (badge_cx - badge_r - 14, badge_cy - badge_r - 14,
                              badge_cx + badge_r + 14, badge_cy + badge_r + 14), GOLD, blur=18, alpha=180)
    canvas = Image.alpha_composite(canvas, glow)
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r),
                 fill=(20, 10, 8), outline=GOLD, width=5)
    badge_egg = load_egg(HEADER_EGGS[0] if HEADER_EGGS else EGG_NAMES[0], int(badge_r * 1.5))
    paste_rgba(canvas, badge_egg, badge_cx - badge_egg.width / 2, badge_cy - badge_egg.height / 2)

    ribbon_box = (X(250), 44, X(1330), 176)
    rglow = rounded_glow_rect(w, h, ribbon_box, RED, radius=30, blur=30, alpha=170)
    canvas = Image.alpha_composite(canvas, rglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(ribbon_box, radius=26, fill=DARK_RED, outline=GOLD, width=4)
    title = cfg.get("title", "JOKI STEAL AN EGG")
    title_f = font("bold", 58)
    while draw.textlength(title, font=title_f) > (ribbon_box[2] - ribbon_box[0]) - 30 and title_f.size > 26:
        title_f = font("bold", title_f.size - 2)
    text_centered(draw, ((ribbon_box[0] + ribbon_box[2]) / 2, (ribbon_box[1] + ribbon_box[3]) / 2),
                  title, title_f, WHITE, stroke_width=6, stroke_fill=(70, 6, 6))

    # ================= Tagline + rarity pills + perks =================
    info_x = X(250)
    tagline = cfg.get("tagline", "")
    if tagline:
        draw.text((info_x, 190), tagline, font=font("bold", 20), fill=CREAM)
        tw = draw.textlength(tagline, font=font("bold", 20))
        rarity_pill_row(draw, info_x + tw + 16, 184, cfg.get("rarities", []))
    perks = cfg.get("perks", [])
    if perks:
        perks_line(draw, info_x, 226, perks)

    # ================= TELUR COSMIC KE ATAS: mini item cards =================
    card_y = 262
    card_w, card_h = X(240), 150
    card_gap = X(20)
    card_x0 = X(250)
    label_font = font("bold", 15)
    tag_font = font("bold", 12)
    for i, egg_name in enumerate(HEADER_EGGS):
        cx0 = card_x0 + i * (card_w + card_gap)
        box = (cx0, card_y, cx0 + card_w, card_y + card_h)
        draw.rounded_rectangle(box, radius=16, fill=(18, 10, 8, 235), outline=GOLD, width=2)
        egg = load_egg(egg_name, 88)
        paste_rgba(canvas, egg, cx0 + 14, card_y + 18)
        tag_box = (cx0 + card_w - 88, card_y + 14, cx0 + card_w - 14, card_y + 36)
        draw.rounded_rectangle(tag_box, radius=10, fill=GOLD)
        text_centered(draw, ((tag_box[0] + tag_box[2]) / 2, (tag_box[1] + tag_box[3]) / 2),
                      "COSMIC+", tag_font, (40, 24, 4))
        name_lines = []
        words = egg_name.split(" ")
        cur = ""
        name_font = font("bold", 17)
        for w_ in words:
            trial = (cur + " " + w_).strip()
            if draw.textlength(trial, font=name_font) > card_w - 20 and cur:
                name_lines.append(cur)
                cur = w_
            else:
                cur = trial
        if cur:
            name_lines.append(cur)
        name_lines = name_lines[:2]
        two_lines = len(name_lines) > 1
        name_font = font("bold", 15) if two_lines else name_font
        ny = card_y + card_h - 50 if two_lines else card_y + card_h - 34
        line_step = 18 if two_lines else 20
        for line in name_lines:
            text_centered(draw, (cx0 + card_w / 2, ny), line, name_font, WHITE, anchor="mm")
            ny += line_step
        text_centered(draw, (cx0 + card_w / 2, card_y + card_h - 12), "TELUR", label_font, DIM, anchor="mm")
    draw = ImageDraw.Draw(canvas)

    # ================= PET RARITY TERTINGGI: showcase besar =================
    show_y0, show_y1 = 452, 880
    show_x0, show_x1 = X(40), X(1000)
    draw.rounded_rectangle((show_x0, show_y0, show_x1, show_y1), radius=22, fill=(15, 8, 6, 160))
    text_centered(draw, ((show_x0 + show_x1) / 2, show_y0 + 34), "PET RARITY TERTINGGI DI GAME",
                  font("bold", 24), GOLD, stroke_width=2, stroke_fill=(40, 10, 4))

    pet_slot_w = (show_x1 - show_x0) / 3
    pet_size = min(260, int(pet_slot_w - 20))
    for i, pet_name in enumerate(TOP_PETS):
        if pet_name not in PET_FILES:
            continue
        slot_cx = show_x0 + pet_slot_w * i + pet_slot_w / 2
        slot_cy = show_y0 + 250
        g = glow_layer(w, h, (slot_cx - 150, slot_cy - 130, slot_cx + 150, slot_cy + 170), GOLD, blur=45, alpha=110)
        canvas = Image.alpha_composite(canvas, g)
        pet_img = load_pet(pet_name, pet_size)
        paste_rgba(canvas, pet_img, slot_cx - pet_img.width / 2, slot_cy - pet_img.height / 2 + 10)
        draw = ImageDraw.Draw(canvas)
        rank_box = (slot_cx - 26, show_y0 + 60, slot_cx + 26, show_y0 + 60 + 40)
        draw.ellipse(rank_box, fill=RED, outline=WHITE, width=3)
        text_centered(draw, ((rank_box[0] + rank_box[2]) / 2, (rank_box[1] + rank_box[3]) / 2),
                      f"#{i + 1}", font("bold", 20), WHITE)
        text_centered(draw, (slot_cx, show_y0 + 380), pet_name, font("bold", 19), WHITE, anchor="mm")
        text_centered(draw, (slot_cx, show_y0 + 404), "RARITY TERTINGGI", font("bold", 13), DIM, anchor="mm")

    note = cfg.get("note", "")
    if note:
        draw.text((show_x0 + 8, show_y1 + 24), note, font=font("reg", 15), fill=(255, 224, 190))

    # ================= PANEL KANAN: paket harga (pill) =================
    panel_x0, panel_x1 = X(1060), X(1880)
    py = 220
    pill_colors = [GREEN, GOLD, BLUE, (150, 60, 220), RED]
    packages = cfg.get("packages", [])
    pill_h = 92
    for i, pkg in enumerate(packages):
        color = pill_colors[i % len(pill_colors)]
        box = (panel_x0, py, panel_x1, py + pill_h)
        draw.rounded_rectangle(box, radius=22, fill=color, outline=WHITE, width=3)
        checklist_icon(draw, panel_x0 + 40, py + pill_h / 2, size=34)
        name = pkg.get("name", "")
        price = pkg.get("price", "")
        text_x = panel_x0 + 76
        name_f = font("bold", 20)
        max_name_w = panel_x1 - text_x - 140
        while draw.textlength(name.upper(), font=name_f) > max_name_w and len(name) > 4:
            name = name[:-2] + "…"
        draw.text((text_x, py + pill_h / 2 - 12), name.upper(), font=name_f, fill=(20, 16, 10))
        text_centered(draw, (panel_x1 - 40, py + pill_h / 2 + 2), price, font("bold", 34), (20, 16, 10), anchor="rm")
        py += pill_h + 14

    # ---- Estimasi badge ----
    py += 6
    est = cfg.get("estimasi", "")
    if est:
        est_box = (panel_x0, py, panel_x1, py + 70)
        draw.rounded_rectangle(est_box, radius=20, fill=BLUE, outline=WHITE, width=3)
        check_badge(draw, panel_x0 + 46, py + 35, r=18, color=GREEN)
        draw.text((panel_x0 + 84, py + 18), est.upper(), font=font("bold", 28), fill=WHITE)
        py += 70 + 22

    # ---- Metode pembayaran ----
    methods = cfg.get("payment_methods", [])
    if methods:
        text_ = "METODE PEMBAYARAN"
        draw.text((panel_x0, py), text_, font=font("bold", 14), fill=DIM)
        py += 26
        mx = panel_x0
        for m in methods:
            mw = draw.textlength(m, font=font("bold", 16)) + 32
            draw.rounded_rectangle((mx, py, mx + mw, py + 36), radius=10, fill=WHITE)
            text_centered(draw, (mx + mw / 2, py + 18), m, font("bold", 16), (20, 16, 10))
            mx += mw + 12
        py += 36 + 22

    # ---- Kontak (icon chat bubble, isi ditentukan belakangan) ----
    contact = cfg.get("contact", "Order: -")
    box = (panel_x0, py, panel_x1, py + 70)
    draw.rounded_rectangle(box, radius=20, fill=(20, 10, 8, 220), outline=GOLD, width=3)
    bub_cx, bub_cy = panel_x0 + 40, py + 35
    draw.rounded_rectangle((bub_cx - 20, bub_cy - 16, bub_cx + 20, bub_cy + 12), radius=10, fill=GOLD)
    draw.polygon([(bub_cx - 8, bub_cy + 12), (bub_cx + 2, bub_cy + 12), (bub_cx - 10, bub_cy + 24)], fill=GOLD)
    for dx in (-9, 0, 9):
        draw.ellipse((bub_cx + dx - 3, bub_cy - 8, bub_cx + dx + 3, bub_cy - 2), fill=(20, 10, 8))
    draw.text((panel_x0 + 84, py + 22), contact, font=font("bold", 22), fill=WHITE)

    return canvas.convert("RGB")


def render_portrait(cfg: dict, w: int, h: int, s: float) -> Image.Image:
    """Layout satu kolom (badge+judul di atas, lalu ditumpuk ke bawah) --
    dipakai buat 9:16 dan 3:4, beda cuma skala (s) spacing/ukuran icon biar
    pas sama tinggi kanvas masing-masing (9:16 lebih lega, 3:4 lebih rapat)."""
    canvas = radial_gradient(w, h, BG_INNER, BG_OUTER, center=(0.5, 0.22)).convert("RGBA")

    def sz(v):
        return int(v * s)

    margin = sz(56)
    x0, x1 = margin, w - margin

    deco = [
        (EGG_NAMES[2 % len(EGG_NAMES)], sz(70), w - sz(120), sz(20), 15),
        (EGG_NAMES[9 % len(EGG_NAMES)], sz(55), sz(20), sz(140), -20),
        (EGG_NAMES[17 % len(EGG_NAMES)], sz(60), w - sz(90), h - sz(160), 25),
    ]
    for name, size, x, y, angle in deco:
        egg = load_egg(name, max(1, size))
        egg = egg.rotate(angle, expand=True, resample=Image.BICUBIC)
        r, g, b, a = egg.split()
        a = a.point(lambda v: int(v * 0.25))
        egg.putalpha(a)
        paste_rgba(canvas, egg, x, y)

    draw = ImageDraw.Draw(canvas)
    y = sz(50)

    # ---- Badge + judul (ditumpuk: badge kecil di atas, ribbon full width) ----
    badge_r = sz(56)
    badge_cx, badge_cy = w / 2, y + badge_r
    glow = glow_layer(w, h, (badge_cx - badge_r - 12, badge_cy - badge_r - 12,
                              badge_cx + badge_r + 12, badge_cy + badge_r + 12), GOLD, blur=sz(16), alpha=180)
    canvas = Image.alpha_composite(canvas, glow)
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r),
                 fill=(20, 10, 8), outline=GOLD, width=max(3, sz(5)))
    badge_egg = load_egg(HEADER_EGGS[0] if HEADER_EGGS else EGG_NAMES[0], int(badge_r * 1.5))
    paste_rgba(canvas, badge_egg, badge_cx - badge_egg.width / 2, badge_cy - badge_egg.height / 2)
    y = badge_cy + badge_r + sz(18)

    ribbon_h = sz(96)
    ribbon_box = (x0, y, x1, y + ribbon_h)
    rglow = rounded_glow_rect(w, h, ribbon_box, RED, radius=sz(24), blur=sz(24), alpha=170)
    canvas = Image.alpha_composite(canvas, rglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(ribbon_box, radius=sz(20), fill=DARK_RED, outline=GOLD, width=max(3, sz(4)))
    title = cfg.get("title", "JOKI STEAL AN EGG")
    title_f = font("bold", sz(46))
    while draw.textlength(title, font=title_f) > (x1 - x0) - sz(30) and title_f.size > sz(24):
        title_f = font("bold", title_f.size - 2)
    text_centered(draw, ((x0 + x1) / 2, y + ribbon_h / 2), title, title_f, WHITE,
                  stroke_width=max(3, sz(5)), stroke_fill=(70, 6, 6))
    y += ribbon_h + sz(22)

    # ---- Tagline + rarity pills (wrap ke baris baru kalau kepanjangan) ----
    tagline = cfg.get("tagline", "")
    tag_f = font("bold", sz(20))
    if tagline:
        draw.text((x0, y), tagline, font=tag_f, fill=CREAM)
        y += sz(30)
    rarities = cfg.get("rarities", [])
    if rarities:
        rarity_pill_row(draw, x0, y, rarities, font_size=sz(15), pill_h=sz(32), gap=sz(10))
        y += sz(32) + sz(14)
    perks = cfg.get("perks", [])
    if perks:
        perks_line(draw, x0, y, perks, font_size=sz(16))
        y += sz(30) + sz(10)

    # ---- 3 kartu telur cosmic+ ----
    card_gap = sz(16)
    card_w = ((x1 - x0) - 2 * card_gap) / 3
    card_h = sz(190)
    name_font_base = sz(16)
    tag_font = font("bold", sz(12))
    label_font = font("bold", sz(14))
    for i, egg_name in enumerate(HEADER_EGGS):
        cx0 = x0 + i * (card_w + card_gap)
        box = (cx0, y, cx0 + card_w, y + card_h)
        draw.rounded_rectangle(box, radius=sz(14), fill=(18, 10, 8, 235), outline=GOLD, width=2)
        egg_size = sz(96)
        egg = load_egg(egg_name, egg_size)
        paste_rgba(canvas, egg, cx0 + (card_w - egg_size) / 2, y + sz(16))
        tag_w = sz(70)
        tag_box = (cx0 + card_w - tag_w - sz(10), y + sz(10), cx0 + card_w - sz(10), y + sz(32))
        draw.rounded_rectangle(tag_box, radius=sz(8), fill=GOLD)
        text_centered(draw, ((tag_box[0] + tag_box[2]) / 2, (tag_box[1] + tag_box[3]) / 2),
                      "COSMIC+", tag_font, (40, 24, 4))
        name_font = font("bold", name_font_base)
        words = egg_name.split(" ")
        lines, cur = [], ""
        for w_ in words:
            trial = (cur + " " + w_).strip()
            if draw.textlength(trial, font=name_font) > card_w - sz(16) and cur:
                lines.append(cur)
                cur = w_
            else:
                cur = trial
        if cur:
            lines.append(cur)
        lines = lines[:2]
        ny = y + card_h - (sz(46) if len(lines) > 1 else sz(32))
        for line in lines:
            text_centered(draw, (cx0 + card_w / 2, ny), line, name_font, WHITE)
            ny += sz(18)
        text_centered(draw, (cx0 + card_w / 2, y + card_h - sz(12)), "TELUR", label_font, DIM)
    draw = ImageDraw.Draw(canvas)
    y += card_h + sz(24)

    # ---- Pet rarity tertinggi ----
    show_h = sz(360)
    show_box = (x0, y, x1, y + show_h)
    draw.rounded_rectangle(show_box, radius=sz(18), fill=(15, 8, 6, 160))
    text_centered(draw, ((x0 + x1) / 2, y + sz(28)), "PET RARITY TERTINGGI DI GAME",
                  font("bold", sz(22)), GOLD, stroke_width=2, stroke_fill=(40, 10, 4))
    pet_slot_w = (x1 - x0) / 3
    pet_size = sz(150)
    for i, pet_name in enumerate(TOP_PETS):
        if pet_name not in PET_FILES:
            continue
        slot_cx = x0 + pet_slot_w * i + pet_slot_w / 2
        slot_cy = y + sz(58) + pet_size / 2
        g = glow_layer(w, h, (slot_cx - pet_size * 0.7, slot_cy - pet_size * 0.6,
                               slot_cx + pet_size * 0.7, slot_cy + pet_size * 0.75), GOLD, blur=sz(30), alpha=110)
        canvas = Image.alpha_composite(canvas, g)
        pet_img = load_pet(pet_name, pet_size)
        paste_rgba(canvas, pet_img, slot_cx - pet_img.width / 2, slot_cy - pet_img.height / 2)
        draw = ImageDraw.Draw(canvas)
        rank_r = sz(18)
        rank_cy = y + sz(48)
        draw.ellipse((slot_cx - rank_r, rank_cy - rank_r, slot_cx + rank_r, rank_cy + rank_r),
                     fill=RED, outline=WHITE, width=2)
        text_centered(draw, (slot_cx, rank_cy), f"#{i + 1}", font("bold", sz(15)), WHITE)
        name_f = font("bold", sz(14))
        pname = pet_name if draw.textlength(pet_name, font=name_f) <= pet_slot_w - sz(8) else pet_name.split(" ")[0]
        text_centered(draw, (slot_cx, y + show_h - sz(34)), pname, name_f, WHITE)
        text_centered(draw, (slot_cx, y + show_h - sz(14)), "RARITY TERTINGGI", font("bold", sz(11)), DIM)
    y += show_h + sz(22)

    # ---- Paket harga ----
    packages = cfg.get("packages", [])
    pill_colors = [GREEN, GOLD, BLUE, (150, 60, 220), RED]
    pill_h = sz(78)
    for i, pkg in enumerate(packages):
        color = pill_colors[i % len(pill_colors)]
        box = (x0, y, x1, y + pill_h)
        draw.rounded_rectangle(box, radius=sz(18), fill=color, outline=WHITE, width=max(2, sz(3)))
        checklist_icon(draw, x0 + sz(32), y + pill_h / 2, size=sz(28))
        name = pkg.get("name", "")
        price = pkg.get("price", "")
        name_f = font("bold", sz(17))
        text_x = x0 + sz(62)
        max_name_w = (x1 - text_x) - sz(110)
        while draw.textlength(name.upper(), font=name_f) > max_name_w and len(name) > 4:
            name = name[:-2] + "…"
        draw.text((text_x, y + pill_h / 2 - sz(10)), name.upper(), font=name_f, fill=(20, 16, 10))
        text_centered(draw, (x1 - sz(28), y + pill_h / 2 + sz(2)), price, font("bold", sz(28)), (20, 16, 10), anchor="rm")
        y += pill_h + sz(12)

    # ---- Estimasi ----
    est = cfg.get("estimasi", "")
    if est:
        y += sz(6)
        est_h = sz(60)
        box = (x0, y, x1, y + est_h)
        draw.rounded_rectangle(box, radius=sz(16), fill=BLUE, outline=WHITE, width=max(2, sz(3)))
        check_badge(draw, x0 + sz(34), y + est_h / 2, r=sz(15), color=GREEN)
        draw.text((x0 + sz(62), y + est_h / 2 - sz(12)), est.upper(), font=font("bold", sz(22)), fill=WHITE)
        y += est_h + sz(18)

    # ---- Metode pembayaran ----
    methods = cfg.get("payment_methods", [])
    if methods:
        draw.text((x0, y), "METODE PEMBAYARAN", font=font("bold", sz(13)), fill=DIM)
        y += sz(24)
        mx = x0
        mf = font("bold", sz(15))
        mh = sz(32)
        for m in methods:
            mw = draw.textlength(m, font=mf) + sz(28)
            if mx + mw > x1:
                mx = x0
                y += mh + sz(10)
            draw.rounded_rectangle((mx, y, mx + mw, y + mh), radius=sz(8), fill=WHITE)
            text_centered(draw, (mx + mw / 2, y + mh / 2), m, mf, (20, 16, 10))
            mx += mw + sz(10)
        y += mh + sz(20)

    # ---- Kontak ----
    contact = cfg.get("contact", "Order: -")
    box_h = sz(62)
    box = (x0, y, x1, y + box_h)
    draw.rounded_rectangle(box, radius=sz(16), fill=(20, 10, 8, 220), outline=GOLD, width=max(2, sz(3)))
    bub_cx, bub_cy = x0 + sz(34), y + box_h / 2
    bw, bh = sz(18), sz(14)
    draw.rounded_rectangle((bub_cx - bw, bub_cy - bh, bub_cx + bw, bub_cy + bh * 0.85), radius=sz(9), fill=GOLD)
    draw.polygon([(bub_cx - bw * 0.4, bub_cy + bh * 0.8), (bub_cx + bw * 0.1, bub_cy + bh * 0.8),
                  (bub_cx - bw * 0.5, bub_cy + bh * 1.6)], fill=GOLD)
    for dx in (-sz(8), 0, sz(8)):
        rr = sz(3)
        draw.ellipse((bub_cx + dx - rr, bub_cy - rr, bub_cx + dx + rr, bub_cy + rr), fill=(20, 10, 8))
    draw.text((x0 + sz(62), y + box_h / 2 - sz(13)), contact, font=font("bold", sz(19)), fill=WHITE)
    y += box_h + sz(16)

    note = cfg.get("note", "")
    if note:
        note_f = font("reg", sz(13))
        nlines, cur = [], ""
        for w_ in note.split(" "):
            trial = (cur + " " + w_).strip()
            if draw.textlength(trial, font=note_f) > (x1 - x0) and cur:
                nlines.append(cur)
                cur = w_
            else:
                cur = trial
        if cur:
            nlines.append(cur)
        for line in nlines:
            draw.text((x0, y), line, font=note_f, fill=(255, 224, 190))
            y += sz(18)

    return canvas.convert("RGB")


def dashed_box(draw, box, color, dash=10, gap=6, width=2):
    """Border putus-putus -- dipakai buat nandain slot yang masih dummy
    (Nama Store/Logo/Kontak) belum diisi bahan asli dari customer."""
    x0, y0, x1, y1 = box
    x = x0
    while x < x1:
        draw.line([(x, y0), (min(x + dash, x1), y0)], fill=color, width=width)
        draw.line([(x, y1), (min(x + dash, x1), y1)], fill=color, width=width)
        x += dash + gap
    yv = y0
    while yv < y1:
        draw.line([(x0, yv), (x0, min(yv + dash, y1))], fill=color, width=width)
        draw.line([(x1, yv), (x1, min(yv + dash, y1))], fill=color, width=width)
        yv += dash + gap


def dummy_label(draw, box, label, color=(255, 224, 190)):
    dashed_box(draw, box, color)
    text_centered(draw, ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), label, font("bold", 16), color)
    small = font("reg", 12)
    text_centered(draw, ((box[0] + box[2]) / 2, box[3] - 16), "(dummy -- ganti pas bahan sudah ada)", small, color)


def render_wireframe_layout(cfg: dict, w: int = 1920, h: int = 1080) -> Image.Image:
    """Landscape sesuai wireframe request customer:
    [Nama Store][Judul]
    [Logo][Price Layanan (+ 2 konten gambar)][Price Paket]
    [Kontak][Support Pay][Operasional]
    [        Payment (lebar)         ]
    Nama Store/Logo/Kontak sengaja dummy -- customer belum kirim bahannya."""
    canvas = radial_gradient(w, h, BG_INNER, BG_OUTER, center=(0.5, 0.3)).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    margin = 50
    col1_x0, col1_x1 = margin, 330
    mid_x0, mid_x1 = 350, 1430
    right_x0, right_x1 = 1450, w - margin

    # ---- Row 1: Nama Store + Judul ----
    row1_y0, row1_y1 = 40, 150
    dummy_label(draw, (col1_x0, row1_y0, col1_x1, row1_y1), cfg.get("store_name", "NAMA STORE"))

    title_box = (mid_x0, row1_y0, right_x1, row1_y1)
    rglow = rounded_glow_rect(w, h, title_box, RED, radius=22, blur=22, alpha=160)
    canvas = Image.alpha_composite(canvas, rglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(title_box, radius=18, fill=DARK_RED, outline=GOLD, width=4)
    title = cfg.get("title", "JASA JOKI STEAL AN EGG")
    title_f = font("bold", 46)
    while draw.textlength(title, font=title_f) > (title_box[2] - title_box[0]) - 40 and title_f.size > 22:
        title_f = font("bold", title_f.size - 2)
    text_centered(draw, ((title_box[0] + title_box[2]) / 2, (title_box[1] + title_box[3]) / 2),
                  title, title_f, WHITE, stroke_width=5, stroke_fill=(70, 6, 6))

    # ---- Row 2: Logo / Price Layanan (+2 konten gambar) / Price Paket ----
    row2_y0, row2_y1 = 170, 725
    logo_h = (row2_y1 - row2_y0 - 15) * 0.5
    logo_box = (col1_x0, row2_y0, col1_x1, row2_y0 + logo_h)
    dashed_box(draw, logo_box, (255, 224, 190))
    logo_badge_r = min(logo_box[2] - logo_box[0], logo_box[3] - logo_box[1]) / 2 - 20
    lcx, lcy = (logo_box[0] + logo_box[2]) / 2, (logo_box[1] + logo_box[3]) / 2 - 8
    draw.ellipse((lcx - logo_badge_r, lcy - logo_badge_r, lcx + logo_badge_r, lcy + logo_badge_r),
                 fill=(20, 10, 8), outline=GOLD, width=4)
    logo_egg = load_egg(HEADER_EGGS[0] if HEADER_EGGS else EGG_NAMES[0], int(logo_badge_r * 1.4))
    paste_rgba(canvas, logo_egg, lcx - logo_egg.width / 2, lcy - logo_egg.height / 2)
    draw.text(((logo_box[0] + logo_box[2]) / 2, logo_box[3] - 14), "LOGO (dummy)", font=font("reg", 12),
               fill=(255, 224, 190), anchor="mm")

    kontak_box = (col1_x0, row2_y0 + logo_h + 15, col1_x1, row2_y1)
    dashed_box(draw, kontak_box, (255, 224, 190))
    contact = cfg.get("contact", "Order: -")
    bub_cx, bub_cy = kontak_box[0] + 40, (kontak_box[1] + kontak_box[3]) / 2 - 10
    draw.rounded_rectangle((bub_cx - 18, bub_cy - 14, bub_cx + 18, bub_cy + 12), radius=9, fill=GOLD)
    draw.polygon([(bub_cx - 7, bub_cy + 12), (bub_cx + 2, bub_cy + 12), (bub_cx - 9, bub_cy + 22)], fill=GOLD)
    for dx in (-8, 0, 8):
        draw.ellipse((bub_cx + dx - 3, bub_cy - 7, bub_cx + dx + 3, bub_cy - 1), fill=(20, 10, 8))
    draw.text((bub_cx + 32, bub_cy - 10), contact, font=font("bold", 18), fill=CREAM)
    text_centered(draw, ((kontak_box[0] + kontak_box[2]) / 2, kontak_box[3] - 16), "(dummy)",
                  font("reg", 12), (255, 224, 190))

    # -- Price Layanan (tengah) --
    pl_box = (mid_x0, row2_y0, mid_x1, row2_y1)
    draw.rounded_rectangle(pl_box, radius=20, fill=(15, 8, 6, 170), outline=GOLD, width=2)
    text_centered(draw, ((pl_box[0] + pl_box[2]) / 2, pl_box[1] + 30), "PRICE LAYANAN",
                  font("bold", 24), GOLD, stroke_width=2, stroke_fill=(40, 10, 4))

    # -- 2 slot "konten gambar" (showcase telur/pet), ngapit judul panel di
    # atas -- ditaruh duluan & list harga mulai DI BAWAH keduanya biar ga
    # numpuk nutupin teks harga. --
    gimg_size = 128
    gimg_y = pl_box[1] + 46
    gimg1_x = pl_box[0] + 20
    g = glow_layer(w, h, (gimg1_x - 16, gimg_y - 16, gimg1_x + gimg_size + 16, gimg_y + gimg_size + 16),
                   GOLD, blur=20, alpha=130)
    canvas = Image.alpha_composite(canvas, g)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((gimg1_x, gimg_y, gimg1_x + gimg_size, gimg_y + gimg_size),
                            radius=14, fill=(18, 10, 8, 240), outline=GOLD, width=3)
    egg1 = load_egg(HEADER_EGGS[1] if len(HEADER_EGGS) > 1 else EGG_NAMES[1], int(gimg_size * 0.72))
    paste_rgba(canvas, egg1, gimg1_x + (gimg_size - egg1.width) / 2, gimg_y + (gimg_size - egg1.height) / 2 - 6)
    text_centered(draw, (gimg1_x + gimg_size / 2, gimg_y + gimg_size - 14), "KONTEN GAMBAR",
                  font("bold", 9), DIM)

    gimg2_x = pl_box[2] - gimg_size - 20
    g2 = glow_layer(w, h, (gimg2_x - 16, gimg_y - 16, gimg2_x + gimg_size + 16, gimg_y + gimg_size + 16),
                     GOLD, blur=20, alpha=130)
    canvas = Image.alpha_composite(canvas, g2)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((gimg2_x, gimg_y, gimg2_x + gimg_size, gimg_y + gimg_size),
                            radius=14, fill=(18, 10, 8, 240), outline=GOLD, width=3)
    pet2_name = TOP_PETS[0] if TOP_PETS[0] in PET_FILES else None
    if pet2_name:
        pet2 = load_pet(pet2_name, int(gimg_size * 0.8))
        paste_rgba(canvas, pet2, gimg2_x + (gimg_size - pet2.width) / 2, gimg_y + (gimg_size - pet2.height) / 2 - 6)
    text_centered(draw, (gimg2_x + gimg_size / 2, gimg_y + gimg_size - 14), "KONTEN GAMBAR",
                  font("bold", 9), DIM)
    draw = ImageDraw.Draw(canvas)

    packages = cfg.get("packages", [])
    pill_colors = [GREEN, GOLD, BLUE, (150, 60, 220), RED]
    py = gimg_y + gimg_size + 18
    pill_h = 64
    pill_gap = 9
    list_x0, list_x1 = pl_box[0] + 24, pl_box[2] - 24
    for i, pkg in enumerate(packages):
        color = pill_colors[i % len(pill_colors)]
        box = (list_x0, py, list_x1, py + pill_h)
        draw.rounded_rectangle(box, radius=14, fill=color, outline=WHITE, width=2)
        checklist_icon(draw, list_x0 + 26, py + pill_h / 2, size=24)
        name = pkg.get("name", "")
        price = pkg.get("price", "")
        name_f = font("bold", 16)
        text_x = list_x0 + 48
        max_name_w = (list_x1 - text_x) - 100
        while draw.textlength(name.upper(), font=name_f) > max_name_w and len(name) > 4:
            name = name[:-2] + "…"
        draw.text((text_x, py + pill_h / 2 - 10), name.upper(), font=name_f, fill=(20, 16, 10))
        text_centered(draw, (list_x1 - 22, py + pill_h / 2 + 1), price, font("bold", 24), (20, 16, 10), anchor="rm")
        py += pill_h + pill_gap

    # -- Price Paket (kanan): satu paket unggulan ditonjolin --
    pp_box = (right_x0, row2_y0, right_x1, row2_y1)
    draw.rounded_rectangle(pp_box, radius=20, fill=(15, 8, 6, 170), outline=GOLD, width=2)
    text_centered(draw, ((pp_box[0] + pp_box[2]) / 2, pp_box[1] + 30), "PRICE PAKET",
                  font("bold", 22), GOLD, stroke_width=2, stroke_fill=(40, 10, 4))
    featured_pkg = packages[-1] if packages else {"name": "Paket Lengkap", "price": "-"}
    fp_cx = (pp_box[0] + pp_box[2]) / 2
    fp_cy = pp_box[1] + 230
    pet_show = TOP_PETS[1] if len(TOP_PETS) > 1 and TOP_PETS[1] in PET_FILES else None
    if pet_show:
        gpp = glow_layer(w, h, (fp_cx - 140, fp_cy - 120, fp_cx + 140, fp_cy + 140), GOLD, blur=40, alpha=120)
        canvas = Image.alpha_composite(canvas, gpp)
        pet_img = load_pet(pet_show, 220)
        paste_rgba(canvas, pet_img, fp_cx - pet_img.width / 2, fp_cy - pet_img.height / 2)
        draw = ImageDraw.Draw(canvas)
    text_centered(draw, (fp_cx, pp_box[3] - 170), featured_pkg.get("name", "").upper(),
                  font("bold", 20), WHITE)
    text_centered(draw, (fp_cx, pp_box[3] - 120), featured_pkg.get("price", "-"),
                  font("bold", 48), GOLD, stroke_width=2, stroke_fill=(60, 30, 4))
    badge_w = 190
    badge_box = (fp_cx - badge_w / 2, pp_box[3] - 60, fp_cx + badge_w / 2, pp_box[3] - 24)
    draw.rounded_rectangle(badge_box, radius=16, fill=GREEN, outline=WHITE, width=2)
    text_centered(draw, ((badge_box[0] + badge_box[2]) / 2, (badge_box[1] + badge_box[3]) / 2),
                  "PALING LARIS", font("bold", 14), (10, 24, 14))

    # ---- Row 3: Support Pay / Operasional (Kontak sudah di kolom kiri) ----
    row3_y0, row3_y1 = 745, 855
    sp_box = (mid_x0, row3_y0, 700, row3_y1)
    draw.rounded_rectangle(sp_box, radius=18, fill=(15, 8, 6, 170), outline=GOLD, width=2)
    draw.text((sp_box[0] + 18, sp_box[1] + 12), "SUPPORT PAY", font=font("bold", 13), fill=DIM)
    methods = cfg.get("payment_methods", [])
    mx = sp_box[0] + 18
    my = sp_box[1] + 38
    mf = font("bold", 15)
    mh = 32
    for m in methods:
        mw = draw.textlength(m, font=mf) + 26
        if mx + mw > sp_box[2] - 12:
            mx = sp_box[0] + 18
            my += mh + 8
        draw.rounded_rectangle((mx, my, mx + mw, my + mh), radius=8, fill=WHITE)
        text_centered(draw, (mx + mw / 2, my + mh / 2), m, mf, (20, 16, 10))
        mx += mw + 10

    op_box = (720, row3_y0 + 10, right_x1, row3_y1 + 20)
    draw.rounded_rectangle(op_box, radius=18, fill=BLUE, outline=WHITE, width=3)
    draw.text((op_box[0] + 20, op_box[1] + 12), "OPERASIONAL", font=font("bold", 13), fill=(230, 240, 255))
    jam = cfg.get("jam_operasional", "-")
    check_badge(draw, op_box[0] + 26, op_box[1] + 58, r=14, color=GREEN)
    draw.text((op_box[0] + 50, op_box[1] + 42), f"Jam Operasional: {jam}", font=font("bold", 18), fill=WHITE)
    est = cfg.get("estimasi", "")
    if est:
        draw.text((op_box[0] + 50, op_box[1] + 68), est.upper(), font=font("bold", 15), fill=(220, 235, 255))

    # ---- Row 4: Payment (lebar, di bawah Price Layanan + Price Paket) ----
    row4_y0, row4_y1 = 875, 985
    pay_box = (mid_x0, row4_y0, right_x1, row4_y1)
    pglow = rounded_glow_rect(w, h, pay_box, GREEN, radius=20, blur=20, alpha=140)
    canvas = Image.alpha_composite(canvas, pglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(pay_box, radius=18, fill=(16, 60, 34), outline=GREEN, width=3)
    check_badge(draw, pay_box[0] + 46, (pay_box[1] + pay_box[3]) / 2, r=22, color=GREEN)
    draw.text((pay_box[0] + 86, (pay_box[1] + pay_box[3]) / 2 - 30), "SIAP ORDER?",
               font=font("bold", 24), fill=WHITE)
    draw.text((pay_box[0] + 86, (pay_box[1] + pay_box[3]) / 2 - 2),
               f"Hubungi {contact} -- bayar setelah pesanan kelar (aman & transparan)",
               font=font("reg", 16), fill=(220, 245, 230))

    note = cfg.get("note", "")
    if note:
        draw.text((col1_x0, h - 40), note, font=font("reg", 13), fill=(255, 224, 190))

    return canvas.convert("RGB")


def starfield(canvas, w, h, n=140, seed=7):
    import random
    rnd = random.Random(seed)
    draw = ImageDraw.Draw(canvas, "RGBA")
    for _ in range(n):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        r = rnd.choice([1, 1, 1, 2])
        a = rnd.randint(60, 200)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, a))


def render_ambil_egg(cfg: dict, w: int = 1920, h: int = 1080) -> Image.Image:
    """Poster "Jasa Joki Ambil Egg" -- referensi biru-ungu neon. Harga per
    kuantitas telur (bukan per paket kayak poster utama): tabel Cosmic
    (per 5 egg), rate flat buat Secret & Eternal."""
    canvas = radial_gradient(w, h, SPACE_INNER, SPACE_OUTER, center=(0.5, 0.35)).convert("RGBA")
    starfield(canvas, w, h)
    draw = ImageDraw.Draw(canvas)

    margin = 56
    x0, x1 = margin, w - margin

    # ---- Header: judul + subjudul ----
    title = cfg.get("ambil_egg_title", "JASA JOKI AMBIL EGG")
    title_f = font("bold", 66)
    ty = 60
    text_centered(draw, (w / 2, ty + 40), title, title_f, WHITE,
                  stroke_width=6, stroke_fill=NEON_PURPLE, anchor="mm")
    subtitle = cfg.get("ambil_egg_subtitle", "CEPAT • AMAN • TERPERCAYA")
    text_centered(draw, (w / 2, ty + 92), subtitle, font("bold", 20), NEON_CYAN, anchor="mm")

    body_y0 = 170

    # ---- Kolom kiri: tabel harga Cosmic (per kuantitas) ----
    left_x0, left_x1 = x0, 900
    left_box = (left_x0, body_y0, left_x1, 800)
    lglow = rounded_glow_rect(w, h, left_box, NEON_PURPLE, radius=24, blur=26, alpha=120)
    canvas = Image.alpha_composite(canvas, lglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(left_box, radius=20, fill=(18, 12, 40, 235), outline=NEON_PURPLE, width=3)

    hdr_h = 60
    draw.rounded_rectangle((left_box[0], left_box[1], left_box[2], left_box[1] + hdr_h),
                            radius=20, fill=NEON_PURPLE)
    draw.rectangle((left_box[0], left_box[1] + hdr_h - 20, left_box[2], left_box[1] + hdr_h), fill=NEON_PURPLE)
    text_centered(draw, ((left_box[0] + left_box[2]) / 2, left_box[1] + hdr_h / 2),
                  "HARGA JASA AMBIL EGG (COSMIC)", font("bold", 20), WHITE)

    tiers = cfg.get("cosmic_egg_tiers", [])
    cols = 2
    rows = math.ceil(len(tiers) / cols) if tiers else 0
    grid_x0, grid_y0 = left_box[0] + 24, left_box[1] + hdr_h + 20
    grid_w = (left_box[2] - left_box[0]) - 48
    cell_w = (grid_w - 16) / cols
    cell_h = 62
    for i, tier in enumerate(tiers):
        c, r = i % cols, i // cols
        cx0 = grid_x0 + c * (cell_w + 16)
        cy0 = grid_y0 + r * (cell_h + 14)
        cell_box = (cx0, cy0, cx0 + cell_w, cy0 + cell_h)
        draw.rounded_rectangle(cell_box, radius=14, fill=(40, 26, 80), outline=(90, 60, 160), width=2)
        text_centered(draw, (cx0 + cell_w * 0.32, cy0 + cell_h / 2), f"{tier['eggs']} EGG",
                      font("bold", 18), WHITE)
        divider_x = cx0 + cell_w * 0.58
        draw.line([(divider_x, cy0 + 10), (divider_x, cy0 + cell_h - 10)], fill=(90, 60, 160), width=2)
        text_centered(draw, (cx0 + cell_w * 0.8, cy0 + cell_h / 2), f"{tier['kah']} KAH",
                      font("bold", 20), NEON_CYAN)

    trust_y = grid_y0 + rows * (cell_h + 14) + 24
    badges = cfg.get("trust_badges", [])
    if badges:
        bw = (left_box[2] - left_box[0] - 24 - (len(badges) - 1) * 12) / len(badges)
        bx = left_box[0] + 12
        badge_colors = [NEON_CYAN, GOLD, NEON_PINK, GREEN]
        for i, b in enumerate(badges):
            bcol = badge_colors[i % len(badge_colors)]
            bcy = trust_y + 40
            check_badge(draw, bx + bw / 2, bcy, r=18, color=bcol)
            text_centered(draw, (bx + bw / 2, bcy + 34), b.upper(), font("bold", 12), WHITE)
            bx += bw + 12

    # ---- Kolom kanan atas: grid pet Cosmic ----
    right_x0, right_x1 = 940, x1
    pet_box = (right_x0, body_y0, right_x1, body_y0 + 430)
    pglow = rounded_glow_rect(w, h, pet_box, NEON_CYAN, radius=24, blur=24, alpha=110)
    canvas = Image.alpha_composite(canvas, pglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(pet_box, radius=20, fill=(10, 14, 40, 220), outline=NEON_CYAN, width=3)
    draw.rounded_rectangle((pet_box[0], pet_box[1], pet_box[2], pet_box[1] + 56), radius=20, fill=NEON_CYAN)
    draw.rectangle((pet_box[0], pet_box[1] + 36, pet_box[2], pet_box[1] + 56), fill=NEON_CYAN)
    text_centered(draw, ((pet_box[0] + pet_box[2]) / 2, pet_box[1] + 28), "COSMIC PET", font("bold", 22), (10, 10, 30))

    pcols = 4
    prows = 2
    pcell_w = (pet_box[2] - pet_box[0] - 40) / pcols
    pcell_h = (pet_box[3] - pet_box[1] - 76 - 40) / prows
    for i, pet_name in enumerate(COSMIC_PET_NAMES[: pcols * prows]):
        c, r = i % pcols, i // pcols
        cx0 = pet_box[0] + 20 + c * pcell_w
        cy0 = pet_box[1] + 66 + r * (pcell_h + 8)
        cell = (cx0 + 6, cy0, cx0 + pcell_w - 6, cy0 + pcell_h)
        draw.rounded_rectangle(cell, radius=12, fill=(28, 20, 60), outline=(80, 70, 150), width=1)
        pet_img = load_pet(pet_name, int(min(pcell_w - 24, pcell_h - 8)))
        pcx, pcy = (cell[0] + cell[2]) / 2, (cell[1] + cell[3]) / 2
        paste_rgba(canvas, pet_img, pcx - pet_img.width / 2, pcy - pet_img.height / 2)
        draw = ImageDraw.Draw(canvas)

    text_centered(draw, ((pet_box[0] + pet_box[2]) / 2, pet_box[3] - 14),
                  f"{len(COSMIC_PET_NAMES)} PET COSMIC TERSEDIA", font("bold", 13), DIM)

    # ---- Kolom kanan bawah: 2 kartu rarity (Secret / Eternal) ----
    rarity_y0 = pet_box[3] + 24
    rarity_y1 = 800
    rar_gap = 20
    rar_w = (right_x1 - right_x0 - rar_gap) / 2

    def rarity_card(cx0, label, price, accent):
        box = (cx0, rarity_y0, cx0 + rar_w, rarity_y1)
        g = rounded_glow_rect(w, h, box, accent, radius=22, blur=22, alpha=130)
        return box, g

    secret = cfg.get("secret_egg_price", {"eggs": 1, "kah": 5})
    eternal = cfg.get("eternal_egg_price", {"eggs": 1, "kah": 10})

    box_s, g_s = rarity_card(right_x0, "SECRET", secret, NEON_PINK)
    canvas = Image.alpha_composite(canvas, g_s)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box_s, radius=20, fill=(35, 12, 30, 230), outline=NEON_PINK, width=3)
    text_centered(draw, ((box_s[0] + box_s[2]) / 2, box_s[1] + 30), "SECRET RARITY", font("bold", 20), NEON_PINK)
    text_centered(draw, ((box_s[0] + box_s[2]) / 2, (box_s[1] + box_s[3]) / 2 + 14),
                  f"{secret.get('kah')} KAH", font("bold", 42), WHITE, stroke_width=2, stroke_fill=(70, 10, 50))
    text_centered(draw, ((box_s[0] + box_s[2]) / 2, box_s[3] - 22),
                  f"per {secret.get('eggs')} egg", font("reg", 14), DIM)

    box_e, g_e = rarity_card(right_x0 + rar_w + rar_gap, "ETERNAL", eternal, NEON_CYAN)
    canvas = Image.alpha_composite(canvas, g_e)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box_e, radius=20, fill=(10, 30, 38, 230), outline=NEON_CYAN, width=3)
    text_centered(draw, ((box_e[0] + box_e[2]) / 2, box_e[1] + 30), "ETERNAL RARITY", font("bold", 20), NEON_CYAN)
    text_centered(draw, ((box_e[0] + box_e[2]) / 2, (box_e[1] + box_e[3]) / 2 + 14),
                  f"{eternal.get('kah')} KAH", font("bold", 42), WHITE, stroke_width=2, stroke_fill=(6, 40, 46))
    text_centered(draw, ((box_e[0] + box_e[2]) / 2, box_e[3] - 22),
                  f"per {eternal.get('eggs')} egg", font("reg", 14), DIM)

    # ---- CTA kontak, ngisi ruang kosong di bawah panel harga & rarity ----
    contact = cfg.get("contact", "Order: -")
    cta_y0, cta_y1 = 824, 896
    cta_box = (x0, cta_y0, x1, cta_y1)
    cta_glow = rounded_glow_rect(w, h, cta_box, NEON_CYAN, radius=20, blur=22, alpha=130)
    canvas = Image.alpha_composite(canvas, cta_glow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(cta_box, radius=18, fill=(14, 16, 46, 235), outline=NEON_CYAN, width=3)
    check_badge(draw, cta_box[0] + 44, (cta_box[1] + cta_box[3]) / 2, r=20, color=GREEN)
    draw.text((cta_box[0] + 84, (cta_box[1] + cta_box[3]) / 2 - 26), "SIAP JOKI SEKARANG?",
               font=font("bold", 22), fill=WHITE)
    draw.text((cta_box[0] + 84, (cta_box[1] + cta_box[3]) / 2 + 2),
               f"Hubungi {contact} -- bayar kah setelah egg sudah di tangan kamu",
               font=font("reg", 15), fill=(210, 225, 255))

    note = cfg.get("note", "")
    if note:
        draw.text((x0, h - 34), note, font=font("reg", 13), fill=(180, 175, 210))

    return canvas.convert("RGB")


def main():
    cfg_path = HERE / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    render_portrait(cfg, 1080, 1920, s=1.08).save(HERE / "joki_poster_9x16.png")
    print(f"Saved: {HERE / 'joki_poster_9x16.png'}")

    render_poster(cfg, 1440, 1080).save(HERE / "joki_poster_4x3.png")
    print(f"Saved: {HERE / 'joki_poster_4x3.png'}")

    render_wireframe_layout(cfg, 1920, 1080).save(HERE / "joki_poster_landscape.png")
    print(f"Saved: {HERE / 'joki_poster_landscape.png'}")

    render_ambil_egg(cfg, 1920, 1080).save(HERE / "joki_poster_ambil_egg.png")
    print(f"Saved: {HERE / 'joki_poster_ambil_egg.png'}")


if __name__ == "__main__":
    main()
