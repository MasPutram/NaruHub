"""
Generator poster "Jasa Joki Steal An Egg".

Beda dari StealAnEgg/poster_server.py (yang scan data akun live buat poster
jual akun), ini standalone -- ngga butuh koneksi ke game. Edit config.json
buat ganti judul/paket/harga/kontak, terus jalanin:

    python poster.py

Hasilnya joki_poster.png di folder yang sama.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent

W, H_MAX = 1080, 2000

# ---- Palet warna kertas/editorial -- sengaja BUKAN gradient neon ala poster
# AI generik. Krem hangat + tinta gelap + satu warna aksen ijo tua. ----
PAPER = (250, 246, 238)
INK = (35, 32, 28)
DIM = (120, 113, 102)
RULE = (214, 206, 190)
ACCENT = (58, 94, 66)       # ijo tua buat harga/aksen
ACCENT_SOFT = (223, 231, 219)

MARGIN = 72

# ---- Icon telur asli dari game (di-extract via AssetService:CreateEditableImageAsync
# + ReadPixelsBuffer -- metode sama kayak yang dipakai buat 84 icon pet di
# StealAnEgg/assets/Normal). Dipakai buat header cluster + icon per baris paket. ----
EGG_DIR = HERE / "assets" / "Eggs"
EGG_NAMES = sorted(p.stem[len("Egg_"):] for p in EGG_DIR.glob("Egg_*.png"))
_egg_cache = {}


def load_egg(name, size):
    key = (name, size)
    if key in _egg_cache:
        return _egg_cache[key]
    path = EGG_DIR / f"Egg_{name}.png"
    img = Image.open(path).convert("RGBA")
    img = img.resize((size, size), Image.LANCZOS)
    _egg_cache[key] = img
    return img


def paste_rgba(canvas, img, x, y):
    canvas.paste(img, (int(x), int(y)), img)


def load_fonts():
    """Georgia (serif, buat judul) kalau ada -- fallback DejaVu Sans di
    Linux/hosting mana pun. Body tetap DejaVu Sans biar konsisten & portable."""
    serif_candidates = [
        Path("C:/Windows/Fonts/georgia.ttf"),
        Path("C:/Windows/Fonts/georgiab.ttf"),
        Path("C:/Windows/Fonts/georgiai.ttf"),
    ]
    sans_regular = HERE / "fonts" / "DejaVuSans.ttf"
    sans_bold = HERE / "fonts" / "DejaVuSans-Bold.ttf"

    serif_reg_path = serif_candidates[0] if serif_candidates[0].exists() else sans_regular
    serif_bold_path = serif_candidates[1] if serif_candidates[1].exists() else sans_bold
    serif_italic_path = serif_candidates[2] if serif_candidates[2].exists() else sans_regular

    return {
        "serif": str(serif_reg_path),
        "serif_bold": str(serif_bold_path),
        "serif_italic": str(serif_italic_path),
        "sans": str(sans_regular),
        "sans_bold": str(sans_bold),
    }


FONT_PATHS = load_fonts()
_font_cache = {}


def font(family, size):
    key = (family, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONT_PATHS[family], size)
    return _font_cache[key]


def tracked(text, spaces=1):
    """Simple letter-tracking trick buat teks kapital kecil (eyebrow label)."""
    return (" " * spaces).join(list(text))


def hairline(draw, x0, x1, y):
    draw.line([(x0, y), (x1, y)], fill=RULE, width=1)


def wrap_text(draw, text, f, max_w):
    words = text.split(" ")
    lines, cur = [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=f) > max_w and cur:
            lines.append(cur)
            cur = w_
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def dotted_leader_row(draw, y, left_text, right_text, left_font, right_font,
                       left_color, right_color, x0, x1):
    """Baris ala menu restoran: nama kiri ... titik-titik ... harga kanan."""
    draw.text((x0, y), left_text, font=left_font, fill=left_color)
    right_w = draw.textlength(right_text, font=right_font)
    draw.text((x1 - right_w, y), right_text, font=right_font, fill=right_color)

    left_w = draw.textlength(left_text, font=left_font)
    leader_x0 = x0 + left_w + 12
    leader_x1 = x1 - right_w - 12
    if leader_x1 > leader_x0:
        dot_font = font("sans", 13)
        dot_w = draw.textlength(". ", font=dot_font)
        n = max(0, int((leader_x1 - leader_x0) / dot_w))
        draw.text((leader_x0, y + 6), ". " * n, font=dot_font, fill=RULE)


def render_poster(cfg: dict) -> Image.Image:
    canvas = Image.new("RGB", (W, H_MAX), PAPER)
    draw = ImageDraw.Draw(canvas)

    x0, x1 = MARGIN, W - MARGIN
    y = 64

    # ---- Header egg cluster (kanan atas) -- 3 telur asli, ditumpuk & diputar
    # dikit biar kerasa "ditaruh" bukan di-generate. ----
    header_eggs = [n for n in ["Kraken", "Eternal Lunar Dragon", "Cerberus"] if n in EGG_NAMES] or EGG_NAMES[:3]
    cluster_specs = [
        (header_eggs[0], 118, -14, x1 - 250, 30),
        (header_eggs[1], 96, 10, x1 - 150, 8),
        (header_eggs[2], 104, -6, x1 - 110, 90),
    ]
    for name, size, angle, cx, cy in cluster_specs:
        egg = load_egg(name, size)
        rotated = egg.rotate(angle, expand=True, resample=Image.BICUBIC)
        paste_rgba(canvas, rotated, cx, cy)

    # ---- Eyebrow label ----
    draw.text((x0, y), tracked("LAYANAN GAME  \u2022  STEAL AN EGG", 2),
               font=font("sans", 12), fill=DIM)
    y += 34

    # ---- Judul (serif besar) ----
    title = cfg.get("title", "Joki Steal An Egg")
    title_font = font("serif_bold", 64)
    for line in wrap_text(draw, title, title_font, x1 - x0):
        draw.text((x0, y), line, font=title_font, fill=INK)
        y += 70
    y += 4

    # ---- Tagline (italic) ----
    tagline = cfg.get("tagline", "")
    if tagline:
        draw.text((x0, y), tagline, font=font("serif_italic", 20), fill=DIM)
        y += 36

    y += 20
    hairline(draw, x0, x1, y)
    y += 36

    # ---- Section: Paket Layanan ----
    draw.text((x0, y), tracked("PAKET LAYANAN"), font=font("sans_bold", 14), fill=ACCENT)
    y += 34

    name_font = font("serif", 21)
    price_font = font("sans_bold", 21)
    icon_size = 44
    text_x0 = x0 + icon_size + 14
    for i, pkg in enumerate(cfg.get("packages", [])):
        name = pkg.get("name", "")
        price = pkg.get("price", "")

        egg = load_egg(EGG_NAMES[i % len(EGG_NAMES)], icon_size)
        paste_rgba(canvas, egg, x0, y - 8)

        # wrap nama paket kalau kepanjangan, harga tetap di baris pertama
        name_lines = wrap_text(draw, name, name_font, (x1 - text_x0) - 220)
        dotted_leader_row(draw, y, name_lines[0], price, name_font, price_font,
                           INK, ACCENT, text_x0, x1)
        y += 30
        for extra in name_lines[1:]:
            draw.text((text_x0, y), extra, font=name_font, fill=INK)
            y += 28
        y += 6
        hairline(draw, x0, x1, y)
        y += 22

    y += 14

    # ---- Section: Cara Order ----
    draw.text((x0, y), tracked("CARA ORDER"), font=font("sans_bold", 14), fill=ACCENT)
    y += 34
    step_font = font("sans", 16)
    for i, step in enumerate(cfg.get("steps", []), start=1):
        num_r = 12
        cy = y + 10
        draw.ellipse([x0, cy - num_r, x0 + num_r * 2, cy + num_r], outline=ACCENT, width=2)
        draw_num = str(i)
        nw = draw.textlength(draw_num, font=font("sans_bold", 13))
        draw.text((x0 + num_r - nw / 2, cy - 8), draw_num, font=font("sans_bold", 13), fill=ACCENT)
        text_x = x0 + num_r * 2 + 16
        lines = wrap_text(draw, step, step_font, (x1 - text_x))
        for j, line in enumerate(lines):
            draw.text((text_x, y + j * 22), line, font=step_font, fill=INK)
        y += max(len(lines) * 22, 26) + 14

    # ---- Footer: kontak + catatan, nempel langsung di bawah konten (bukan
    # dipaksa ke bawah kanvas) -- kanvas di-crop ke tinggi konten asli. ----
    fy = y + 24
    hairline(draw, x0, x1, fy)
    fy += 28

    contact = cfg.get("contact", "Order: -")
    rounded_box = (x0, fy, x1, fy + 56)
    draw.rounded_rectangle(rounded_box, radius=10, outline=ACCENT, width=2)
    draw.text((x0 + 20, fy + 16), contact, font=font("sans_bold", 18), fill=ACCENT)
    fy += 56 + 18

    note = cfg.get("note", "")
    if note:
        draw.text((x0, fy), note, font=font("sans", 12), fill=DIM)
        fy += 20

    bottom = min(fy + 48, H_MAX)
    return canvas.crop((0, 0, W, int(bottom)))


def main():
    cfg_path = HERE / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    poster = render_poster(cfg)
    out_path = HERE / "joki_poster.png"
    poster.save(out_path)
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
