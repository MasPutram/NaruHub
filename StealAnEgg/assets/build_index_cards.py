"""
Composite tiap icon di Normal/ jadi kartu ala "Index" in-game: card gelap +
glow warna rarity di belakang icon + border warna rarity -- persis gaya
RarityGlow.BackgroundColor3 / UIStroke.Color yang dipakai
Players.PlayerScripts.GUI.Index (dicek langsung dari game, bukan tebakan).

Jalankan: python build_index_cards.py
Hasil: IndexCards/<nama> [<rarity>].png
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
SRC_DIR = HERE / "Normal"
OUT_DIR = HERE / "IndexCards"
OUT_DIR.mkdir(exist_ok=True)

# Warna asli tiap rarity, di-sample langsung dari Assets.Directory[x].Rarity.Color
# di game (RGB 0-255).
RARITY_COLORS = {
    "Common": (151, 151, 151),
    "Uncommon": (0, 255, 0),
    "Rare": (25, 144, 255),
    "Epic": (196, 2, 255),
    "Legendary": (255, 133, 34),
    "Mythic": (255, 43, 100),
    "Cosmic": (65, 0, 170),
    "Secret": (46, 46, 46),
    "Eternal": (255, 30, 240),
    "Divine": (251, 255, 0),
}

CARD = 480
ICON_MAX = 340
CARD_BG = (18, 16, 22)


def rarity_from_filename(name: str) -> str:
    if "[" in name and "]" in name:
        return name.split("[")[1].split("]")[0]
    return "Common"


def build_card(icon_path: Path) -> Image.Image:
    rarity = rarity_from_filename(icon_path.stem)
    color = RARITY_COLORS.get(rarity, (200, 200, 200))

    icon = Image.open(icon_path).convert("RGBA")
    bbox = icon.getbbox()
    if bbox:
        icon = icon.crop(bbox)
    w, h = icon.size
    scale = ICON_MAX / max(w, h)
    icon = icon.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    card = Image.new("RGBA", (CARD, CARD), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((0, 0, CARD, CARD), radius=36, fill=CARD_BG + (255,))

    # Glow lingkaran warna rarity di belakang icon (RarityGlow.BackgroundColor3).
    glow = Image.new("RGBA", (CARD, CARD), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr = CARD * 0.36
    gd.ellipse((CARD / 2 - gr, CARD / 2 - gr, CARD / 2 + gr, CARD / 2 + gr), fill=color + (140,))
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    card = Image.alpha_composite(card, glow)

    card.alpha_composite(icon, ((CARD - icon.width) // 2, (CARD - icon.height) // 2 - 6))

    # Border warna rarity (UIStroke.Color).
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((3, 3, CARD - 3, CARD - 3), radius=34, outline=color, width=6)

    return card


def main():
    files = sorted(SRC_DIR.glob("*.png"))
    for f in files:
        card = build_card(f)
        card.save(OUT_DIR / f.name)
    print(f"Built {len(files)} index cards -> {OUT_DIR}")


if __name__ == "__main__":
    main()
