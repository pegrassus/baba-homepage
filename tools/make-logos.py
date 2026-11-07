"""Erzeugt die Logo-Varianten für CH und AT (SVG + PNG) im gemeinsamen Raster-Motiv.

Aufruf:  python -I tools/make-logos.py
DE verwendet die Logos unter assets/img/logo/ (siehe README).
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TILES = [(93, 97, 271, 274, 49), (378, 97, 268, 274, 47), (659, 97, 273, 274, 49), (92, 386, 272, 272, 47),
         (658, 386, 274, 272, 47), (93, 671, 271, 273, 49), (378, 671, 268, 273, 47), (659, 671, 273, 273, 49)]
CX, CY = 516.5, 514.5

VARIANTS = {
    "ch": {
        "prefix": "bba", "tile": "#2B2F33", "accent": "#B5121B", "shape": "diamond", "text": "#2B2F33",
        "title": "Bundesamt für besondere Angelegenheiten (BBA)",
        "lines": ["Bundesamt für besondere", "Angelegenheiten"],
        "short": "BBA",
    },
    "at": {
        "prefix": "bbsa", "tile": "#2E2723", "accent": "#E3B21A", "shape": "circle", "text": "#2E2723",
        "title": "Bundesamt für besondere und sonstige Angelegenheiten (BBSA)",
        "lines": ["Bundesamt für besondere", "und sonstige Angelegenheiten"],
        "short": "BBSA · gegr. 1873",
    },
}


def special(shape, color):
    if shape == "diamond":  # Quadrat auf der Spitze, exakt zentriert
        return f'<rect x="{CX - 88}" y="{CY - 88}" width="176" height="176" rx="18" fill="{color}" transform="rotate(45 {CX} {CY})"/>'
    return f'<circle cx="{CX}" cy="{CY}" r="118" fill="{color}"/>'


def mark(v, tile):
    rects = "".join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"/>' for x, y, w, h, r in TILES)
    return f'<g fill="{tile}">{rects}</g>{special(v["shape"], v["accent"])}'


def png(v, out, size):
    f = 2
    img = Image.new("RGBA", (904 * f, 904 * f), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    o = 60
    for x, y, w, h, r in TILES:
        d.rounded_rectangle([(x - o) * f, (y - o) * f, (x - o + w) * f, (y - o + h) * f], radius=r * f, fill=v["tile"])
    cx, cy = (CX - o) * f, (CY - o) * f
    if v["shape"] == "circle":
        d.ellipse([cx - 118 * f, cy - 118 * f, cx + 118 * f, cy + 118 * f], fill=v["accent"])
    else:
        t = Image.new("RGBA", (176 * f, 176 * f), (0, 0, 0, 0))
        ImageDraw.Draw(t).rounded_rectangle([0, 0, 176 * f - 1, 176 * f - 1], radius=18 * f, fill=v["accent"])
        t = t.rotate(45, expand=True, resample=Image.BICUBIC)
        img.alpha_composite(t, (int(cx - t.width / 2), int(cy - t.height / 2)))
    img.resize((size, size), Image.LANCZOS).save(out)


for key, v in VARIANTS.items():
    d = ROOT / "assets" / "img" / key / "logo"
    d.mkdir(parents=True, exist_ok=True)
    p = v["prefix"]
    (d / f"{p}-logo.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 60 904 904" width="512" height="512"><title>{v["title"]} – Bildmarke</title>{mark(v, v["tile"])}</svg>\n', encoding="utf-8")
    (d / f"{p}-logo-negativ.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 60 904 904" width="512" height="512"><title>{v["title"]} – Bildmarke negativ</title>{mark(v, "#FFFFFF")}</svg>\n', encoding="utf-8")
    n = len(v["lines"])
    big = n <= 2
    fs = 200 if big else 118
    step = 240 if big else 150
    width = 3300 if big else 3000
    y0 = 400 if big else 250
    texts = "".join(f'<text x="1090" y="{y0 + i * step}" font-size="{fs}" font-weight="{600 if (big or i == 0) else 400}">{t}</text>' for i, t in enumerate(v["lines"]))
    word = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 904" width="{width // 2}" height="452"><title>{v["title"]} – Wort-Bildmarke</title>'
            f'<g transform="translate(-60 -60)">{mark(v, v["tile"])}</g><rect x="1010" y="80" width="10" height="744" fill="{v["accent"]}"/>'
            f'<g font-family="\'Source Serif 4\', Georgia, serif" fill="{v["text"]}">{texts}</g>'
            f'<text x="1094" y="830" font-family="\'Source Sans 3\', Arial, sans-serif" font-size="96" letter-spacing="14" fill="{v["accent"] if key == "ch" else v["text"]}" font-weight="600">{v["short"]}</text></svg>\n')
    (d / f"{p}-wortbildmarke.svg").write_text(word, encoding="utf-8")
    png(v, d / f"{p}-logo.png", 1024)
    png(v, d / f"{p}-touch.png", 180)
    print("ok", key)
