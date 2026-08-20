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


def render_poster(cfg: dict) -> Image.Image:
    canvas = radial_gradient(W, H, BG_INNER, BG_OUTER).convert("RGBA")

    # ---- Bintik telur dekoratif di background, opacity rendah -- ditaruh
    # cuma di area yang beneran kosong (bukan numpuk di atas panel/kartu). ----
    deco_specs = [
        (EGG_NAMES[3 % len(EGG_NAMES)], 70, 1420, 40, 18),
        (EGG_NAMES[7 % len(EGG_NAMES)], 60, 1560, 150, -25),
        (EGG_NAMES[11 % len(EGG_NAMES)], 55, 260, 900, -15),
        (EGG_NAMES[15 % len(EGG_NAMES)], 50, 700, 940, 20),
        (EGG_NAMES[19 % len(EGG_NAMES)], 55, 900, 890, -10),
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
    badge_cx, badge_cy, badge_r = 130, 110, 78
    glow = glow_layer(W, H, (badge_cx - badge_r - 14, badge_cy - badge_r - 14,
                              badge_cx + badge_r + 14, badge_cy + badge_r + 14), GOLD, blur=18, alpha=180)
    canvas = Image.alpha_composite(canvas, glow)
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r),
                 fill=(20, 10, 8), outline=GOLD, width=5)
    badge_egg = load_egg(HEADER_EGGS[0] if HEADER_EGGS else EGG_NAMES[0], int(badge_r * 1.5))
    paste_rgba(canvas, badge_egg, badge_cx - badge_egg.width / 2, badge_cy - badge_egg.height / 2)

    ribbon_box = (250, 44, 1330, 176)
    rglow = rounded_glow_rect(W, H, ribbon_box, RED, radius=30, blur=30, alpha=170)
    canvas = Image.alpha_composite(canvas, rglow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(ribbon_box, radius=26, fill=DARK_RED, outline=GOLD, width=4)
    title = cfg.get("title", "JOKI STEAL AN EGG")
    text_centered(draw, ((ribbon_box[0] + ribbon_box[2]) / 2, (ribbon_box[1] + ribbon_box[3]) / 2),
                  title, font("bold", 58), WHITE, stroke_width=6, stroke_fill=(70, 6, 6))

    # ================= TELUR COSMIC KE ATAS: mini item cards =================
    card_y = 210
    card_w, card_h = 240, 168
    card_gap = 20
    card_x0 = 250
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
    show_y0, show_y1 = 420, 860
    show_x0, show_x1 = 40, 1000
    draw.rounded_rectangle((show_x0, show_y0, show_x1, show_y1), radius=22, fill=(15, 8, 6, 160))
    text_centered(draw, ((show_x0 + show_x1) / 2, show_y0 + 34), "PET RARITY TERTINGGI DI GAME",
                  font("bold", 24), GOLD, stroke_width=2, stroke_fill=(40, 10, 4))

    pet_slot_w = (show_x1 - show_x0) / 3
    for i, pet_name in enumerate(TOP_PETS):
        if pet_name not in PET_FILES:
            continue
        slot_cx = show_x0 + pet_slot_w * i + pet_slot_w / 2
        slot_cy = show_y0 + 250
        g = glow_layer(W, H, (slot_cx - 150, slot_cy - 130, slot_cx + 150, slot_cy + 170), GOLD, blur=45, alpha=110)
        canvas = Image.alpha_composite(canvas, g)
        pet_img = load_pet(pet_name, 260)
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
    panel_x0, panel_x1 = 1060, 1880
    py = 220
    pill_colors = [GREEN, GOLD, BLUE, RED]
    packages = cfg.get("packages", [])
    pill_h = 108
    for i, pkg in enumerate(packages):
        color = pill_colors[i % len(pill_colors)]
        box = (panel_x0, py, panel_x1, py + pill_h)
        draw.rounded_rectangle(box, radius=24, fill=color, outline=WHITE, width=3)
        checklist_icon(draw, panel_x0 + 44, py + pill_h / 2, size=40)
        name = pkg.get("name", "")
        price = pkg.get("price", "")
        text_x = panel_x0 + 84
        draw.text((text_x, py + 18), name.upper(), font=font("bold", 24), fill=(20, 16, 10))
        text_centered(draw, (panel_x1 - 46, py + pill_h / 2 + 4), price, font("bold", 40), (20, 16, 10), anchor="rm")
        py += pill_h + 18

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


def main():
    cfg_path = HERE / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    poster = render_poster(cfg)
    out_path = HERE / "joki_poster.png"
    poster.save(out_path)
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
