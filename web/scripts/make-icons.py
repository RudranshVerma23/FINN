"""Render FINN's PNG app icons from the same geometry as public/icon.svg (FR-26).

iOS ignores SVG for home-screen icons, and Android wants a maskable icon with a safe zone.
Run from web/:  python scripts/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK, PAPER, PEOPLE = "#17171a", "#f5f3ee", "#e3a06a"
GLYPH = [(168, 136), (352, 136), (352, 180), (218, 180), (218, 242), (334, 242), (334, 286), (218, 286), (218, 376), (168, 376)]
DOT = (356, 364, 26)
OUT = Path(__file__).resolve().parents[1] / "public"


def render(size: int, rounded: bool, scale: float = 1.0) -> Image.Image:
    s = 4  # supersample, then downscale for smooth edges
    big = 512 * s
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=112 * s, fill=INK)
    else:
        d.rectangle([0, 0, big, big], fill=INK)  # maskable: the OS applies its own mask

    def t(x: float, y: float) -> tuple[float, float]:
        c = 256
        return ((c + (x - c) * scale) * s, (c + (y - c) * scale) * s)

    d.polygon([t(x, y) for x, y in GLYPH], fill=PAPER)
    cx, cy = t(DOT[0], DOT[1])
    r = DOT[2] * scale * s
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PEOPLE)
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    render(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")  # iOS rounds it itself
    render(192, rounded=True).save(OUT / "icon-192.png")
    render(512, rounded=True).save(OUT / "icon-512.png")
    render(512, rounded=False, scale=0.78).save(OUT / "icon-maskable-512.png")
    print("wrote", ", ".join(p.name for p in sorted(OUT.glob("*.png"))))
