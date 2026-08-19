"""
StealAnEgg poster renderer.

Runs a tiny local HTTP server. The Roblox script POSTs account data (JSON) to
http://127.0.0.1:8765/generate and this renders a "jual akun" poster PNG
(matching the reference layout: top picks, all-speed grid, active pets list,
total value box) and pushes it straight to a Discord webhook.

Run: python poster_server.py
"""

import io
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PORT = int(os.environ.get("PORT", 8765))
ASSETS_DIR = Path(__file__).parent / "assets"
NORMAL_DIR = ASSETS_DIR / "Normal"
MUTATION_DIR = ASSETS_DIR / "Mutation"
COMBO_DIR = ASSETS_DIR / "MutationCombo"

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


def fmt_weight(kg: float) -> str:
    return f"{kg:,.0f} Kg" if kg >= 1 else f"{kg:.2f} Kg"


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
    run_speed = data.get("runSpeed")
    total_money_per_second = data.get("totalMoneyPerSecond")
    # Total $/s murni dari pet aktif -- pakai nilai eksplisit dari Lua kalau
    # ada (udah dihitung otomatis dari sum tiap pet aktif), fallback ke
    # ngejumlahin activePets sendiri kalau field-nya ngga dikirim.
    active_total_rate = data.get("activeTotalRate")
    if active_total_rate is None:
        active_total_rate = sum(p.get("rate", 0) for p in active_pets)

    all_pets_sorted = sorted(all_pets, key=lambda p: p.get("rate", 0), reverse=True)
    active_pets_sorted = sorted(active_pets, key=lambda p: p.get("rate", 0), reverse=True)

    # Kandidat 3 Card Utama + Paling Gacor: pet yang lagi AKTIF diutamakan,
    # baru jatuh balik ke isi tas kalau aktifnya kurang dari 3.
    pool, seen = [], set()
    for p in active_pets_sorted + all_pets_sorted:
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

    # ---- Auto-detected stats: run speed + account income/s + total pet aktif ----
    if run_speed is not None or total_money_per_second is not None or active_total_rate:
        stat_y = 108
        stat_x0 = left_x0 + 210
        stats = []
        if run_speed is not None:
            stats.append(("SPEED", f"{run_speed:,.0f}" if isinstance(run_speed, (int, float)) else str(run_speed)))
        if total_money_per_second is not None:
            stats.append(("INCOME", fmt_money(total_money_per_second)))
        if active_total_rate:
            stats.append(("TOTAL AKTIF", fmt_money(active_total_rate)))
        gap = 10
        sw = min(190, (left_x1 - stat_x0 - gap * (len(stats) - 1)) / max(len(stats), 1))
        stat_x = stat_x0
        for label, val in stats:
            rounded_card(draw, (stat_x, stat_y, stat_x + sw, stat_y + 44), radius=20, fill=(236, 253, 245), outline=GREEN, width=2)
            draw.text((stat_x + 14, stat_y + 8), label, font=font(10, bold=True), fill=DIM)
            draw.text((stat_x + 14, stat_y + 20), val, font=font(15, bold=True), fill=GREEN)
            stat_x += sw + gap

    y = 178

    # ---- Top 3 pick cards ----
    card_w = (left_x1 - left_x0 - 2 * 14) / 3
    card_h = 300
    for i, pet in enumerate(top_picks):
        cx0 = left_x0 + i * (card_w + 14)
        cx1 = cx0 + card_w
        rounded_card(draw, (cx0, y, cx1, y + card_h))
        if pet.get("weight"):
            draw_text_centered(draw, (cx0 + card_w / 2, y + 22), fmt_weight(pet["weight"]),
                                font(15), DIM)
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

    # ---- Detail checklist ----
    if checklist:
        chk_h = 34 + len(checklist) * 26
        rounded_card(draw, (left_x0, y, left_x1, y + chk_h))
        draw.text((left_x0 + 16, y + 12), "DETAIL ACC", font=font(16, bold=True), fill=NAVY)
        cy = y + 40
        for item in checklist:
            draw.ellipse([left_x0 + 18, cy + 3, left_x0 + 32, cy + 17], outline=GREEN, width=2)
            draw.line([left_x0 + 21, cy + 10, left_x0 + 24, cy + 14], fill=GREEN, width=2)
            draw.line([left_x0 + 24, cy + 14, left_x0 + 30, cy + 6], fill=GREEN, width=2)
            draw.text((left_x0 + 40, cy), item, font=font(15), fill=NAVY)
            cy += 26
        y += chk_h + 18

    # ================= RIGHT COLUMN =================
    ry = 40
    header_h = 76
    rounded_card(draw, (right_x0, ry, right_x1, ry + header_h), radius=16, fill=CARD_BG)
    draw.ellipse([right_x0 + 16, ry + 15, right_x0 + 34, ry + 33], fill=NAVY)
    draw.text((right_x0 + 46, ry + 14), f"{len(active_pets_sorted)}/{active_limit} ACTIVE", font=font(17, bold=True), fill=NAVY)
    equip_best_w, equip_best_h = 140, 32
    ebx0 = right_x1 - equip_best_w - 16
    eby0 = ry + 12
    rounded_card(draw, (ebx0, eby0, ebx0 + equip_best_w, eby0 + equip_best_h), radius=8, fill=GREEN, outline=None)
    draw_text_centered(draw, (ebx0 + equip_best_w / 2, eby0 + equip_best_h / 2), "EQUIP BEST", font(13, bold=True), (255, 255, 255))
    total_active_rate = sum(p.get("rate", 0) for p in active_pets_sorted)
    draw.text((right_x0 + 16, ry + 46), f"Total Aktif: {fmt_money(total_active_rate)}", font=font(14, bold=True), fill=GREEN)
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
    tv_h = 220
    rounded_card(draw, (right_x0, ry, right_x1, ry + tv_h), fill=CARD_BG)
    draw.text((right_x0 + 20, ry + 20), "PRICE ACC", font=font(22, bold=True), fill=NAVY)
    if price:
        draw_text_centered(draw, ((right_x0 + right_x1) / 2, ry + tv_h / 2 + 10), str(price), font(30, bold=True), GREEN)
    else:
        draw.rounded_rectangle((right_x0 + 20, ry + 60, right_x1 - 20, ry + tv_h - 40), radius=12, outline=BORDER, width=2)

    bottom = max(y + 40, ry + tv_h + 40)
    canvas = canvas.crop((0, 0, W, int(min(bottom, H))))

    owner = data.get("ownerFacebook")
    if owner:
        canvas = add_watermark(canvas, owner)

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


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/generate":
            self._send_json(404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw.decode("utf-8"))

            img = render_poster(data)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)

            webhook_url = data.get("webhookUrl")
            if webhook_url:
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
                    self._send_json(502, {"ok": False, "error": f"discord {resp.status_code}: {resp.text[:300]}"})
                    return

            # Simpan salinan lokal buat debugging -- opsional, jangan sampai
            # gagal-total kalau disk-nya read-only/ephemeral (misal di Render).
            saved_to = None
            try:
                out_path = Path(__file__).parent / "last_poster.png"
                out_path.write_bytes(buf.getvalue())
                saved_to = str(out_path)
            except OSError:
                pass
            self._send_json(200, {"ok": True, "saved": saved_to})
        except Exception as e:  # noqa: BLE001
            self._send_json(500, {"ok": False, "error": str(e)})

    def do_GET(self):
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
