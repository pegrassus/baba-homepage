"""Erzeugt die Logos aller drei Länderversionen (SVG, PNG, Lade-Anzeige).

Aufruf:  python -I tools/make-logos.py
Benötigt: Windows-Schriften (Bahnschrift, Arial, Georgia) für die Schrift-als-Pfad-Umwandlung,
          Google Chrome oder Microsoft Edge für die PNG-Ausgabe, Pillow zum Verkleinern.

Alle SVGs: Schrift als Pfade, keine externen Verweise, keine Skripte. Jedes Element, das sich
animieren lässt, hat eine sprechende id (siehe ELEMENTE); daraus entsteht auch api/logo.json.
"""
import json, math, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from glyphs import Font, text_path, text_width, glyph_path, fmt

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
F = {k: Font(str(FONTS / v)) for k, v in {"din": "bahnschrift.ttf", "arial": "arial.ttf", "arialbd": "arialbd.ttf", "georgia": "georgia.ttf", "georgiab": "georgiab.ttf"}.items()}

HINWEIS = "Fiktive Behörde – Demonstrationsinhalt. Kein Hoheitszeichen."


def svg(w, h, vb, title, desc, body, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{vb}" role="img" aria-labelledby="t d"{extra}>'
            f'<title id="t">{title}</title><desc id="d">{desc}</desc>{body}</svg>\n')


# ---------------------------------------------------------------- Deutschland
def de_mark(c):
    """c: Farben schild, linie, feld, sonder, rand (optional)."""
    cells = []
    x0, y0, s, g = 161, 155, 54, 14
    n = 0
    for r in range(3):
        for k in range(3):
            if r == 1 and k == 1:
                continue
            n += 1
            cells.append(f'<rect id="feld-{n}" x="{x0 + k * (s + g)}" y="{y0 + r * (s + g)}" width="{s}" height="{s}" rx="7"/>')
    rand = f' stroke="{c["rand"]}" stroke-width="10" stroke-linejoin="round"' if c.get("rand") else ""
    return (f'<path id="schild" d="M88 56H424V248C424 362 348 430 256 468C164 430 88 362 88 248Z" fill="{c["schild"]}"{rand}/>'
            f'<path id="schild-linie" d="M110 78H402V248C402 348 336 408 256 442C176 408 110 348 110 248Z" fill="none" stroke="{c["linie"]}" stroke-width="6"/>'
            f'<g id="raster" fill="{c["feld"]}">{"".join(cells)}</g>'
            f'<g id="sonderfeld"><rect x="228" y="222" width="56" height="56" rx="8" fill="{c["sonder"]}" transform="rotate(15 256 250)"/></g>')


# ---------------------------------------------------------------- Schweiz
def ch_mark(c):
    dots = []
    for i in range(26):
        a = 2 * math.pi * i / 26
        dots.append(f'<circle id="kanton-{i + 1:02d}" cx="{fmt(256 + 168 * math.sin(a))}" cy="{fmt(256 - 168 * math.cos(a))}" r="12"/>')
    return (f'<rect id="feld" x="32" y="32" width="448" height="448" rx="36" fill="{c["feld"]}"/>'
            f'<g id="kantone" fill="{c["punkte"]}">{"".join(dots)}</g>'
            f'<path id="raute" d="M256 138L374 256L256 374L138 256Z" fill="{c["raute"]}"/>'
            f'<path id="raute-kern" d="M256 212L300 256L256 300L212 256Z" fill="{c["kern"]}"/>')


# ---------------------------------------------------------------- Österreich
def ring_text(font, text, cx, cy, r_mid, size, start_deg, span_deg, top=True, tracking=0.08):
    """Text auf einem Kreisbogen; top=True: im Uhrzeigersinn, Grundlinie innen; sonst unten aufrecht."""
    cap = font.cap * size / font.upm
    widths = []
    for ch in text:
        _, adv = glyph_path(font, ch, size, lambda x, y: (x, y))
        widths.append(adv + tracking * size)
    total = sum(widths) - tracking * size
    r = r_mid - cap / 2 if top else r_mid + cap / 2
    if span_deg is not None:  # Laufweite so anpassen, dass der Text den Bogen füllt
        extra = (math.radians(span_deg) * r - total) / max(len(text) - 1, 1)
        widths = [w + extra for w in widths]
        total = math.radians(span_deg) * r
    out = []
    s = -total / 2
    for ch, w in zip(text, widths):
        _, adv = glyph_path(font, ch, size, lambda x, y: (x, y))
        mid = s + adv / 2
        a = mid / r + math.radians(start_deg)
        if top:
            px, py, rot = cx + r * math.sin(a), cy - r * math.cos(a), a
        else:
            px, py, rot = cx + r * math.sin(a), cy + r * math.cos(a), -a
        ca, sa = math.cos(rot), math.sin(rot)
        def tf(x, y, px=px, py=py, ca=ca, sa=sa, adv=adv):
            x -= adv / 2
            return (px + x * ca - y * sa, py + x * sa + y * ca)
        d, _ = glyph_path(font, ch, size, tf)
        out.append(d)
        s += w
    return "".join(out)


AT_TOP = ring_text(F["georgiab"], "BUNDESAMT FÜR BESONDERE UND SONSTIGE ANGELEGENHEITEN", 256, 256, 211, 24, 0, None)
AT_BOTTOM = ring_text(F["georgiab"], "SEIT 1873", 256, 256, 211, 24, 0, None, top=False, tracking=0.16)
AT_STARS = "".join(f'<circle cx="{fmt(256 + 211 * math.sin(math.radians(a)))}" cy="{fmt(256 - 211 * math.cos(math.radians(a)))}" r="5"/>' for a in (153, 207))


def at_mark(c):
    cells = []
    x0, s, g = 166, 52, 12
    n = 0
    for r in range(3):
        for k in range(3):
            if r == 1 and k == 1:
                continue
            n += 1
            cells.append(f'<rect id="feld-{n}" x="{x0 + k * (s + g)}" y="{x0 + r * (s + g)}" width="{s}" height="{s}" rx="8"/>')
    return (f'<circle id="siegel-ring" cx="256" cy="256" r="246" fill="{c["ring"]}"/>'
            f'<circle id="siegel-linie-aussen" cx="256" cy="256" r="236" fill="none" stroke="{c["text"]}" stroke-width="3"/>'
            f'<g id="umschrift" fill="{c["text"]}"><path d="{AT_TOP}{AT_BOTTOM}"/>{AT_STARS}</g>'
            f'<circle id="siegel-feld" cx="256" cy="256" r="182" fill="{c["feld"]}"/>'
            f'<circle id="siegel-linie-innen" cx="256" cy="256" r="170" fill="none" stroke="{c["raster"]}" stroke-width="3"/>'
            f'<g id="raster" fill="{c["raster"]}">{"".join(cells)}</g>'
            f'<circle id="sonstiges" cx="256" cy="256" r="24" fill="{c["sonst"]}" stroke="{c["raster"]}" stroke-width="7"/>')


# ---------------------------------------------------------------- Varianten
V = {
    "de": {
        "dir": "assets/img/logo", "prefix": "baba", "name": "Bundesamt für besondere Angelegenheiten", "kurz": "BAbA",
        "mark": de_mark,
        "farben": {"primaer": "#0F4C5C", "akzent": "#B08D57", "text": "#1F2A30", "hell": "#FFFFFF"},
        "farbig": {"schild": "#0F4C5C", "linie": "#B08D57", "feld": "#FFFFFF", "sonder": "#B08D57"},
        "negativ": {"schild": "#FFFFFF", "linie": "#B08D57", "feld": "#0F4C5C", "sonder": "#B08D57"},
        "mono": {"schild": "#000000", "linie": "#FFFFFF", "feld": "#FFFFFF", "sonder": "#FFFFFF"},
        "font": [("din", 112, "Bundesamt für"), ("din", 112, "besondere Angelegenheiten")],
        "beschreibung": "Wappenschild in Petrol mit messingfarbener Innenlinie; darin acht weisse Felder um ein gedrehtes Messingfeld – der Sonderfall, der nicht ins Raster passt.",
        "elemente": [
            ("schild", "Wappenschild (Grundfläche)", "einblenden, leicht skalieren"),
            ("schild-linie", "Innenlinie in Messing", "Linie zeichnen (stroke-dasharray)"),
            ("raster", "Gruppe der acht Felder feld-1 … feld-8", "Felder nacheinander ein- oder ausblenden"),
            ("sonderfeld", "Gedrehtes Messingfeld in der Mitte", "drehen (Mittelpunkt 256/250) oder pulsieren"),
        ],
    },
    "ch": {
        "dir": "assets/img/ch/logo", "prefix": "bba", "name": "Bundesamt für besondere Angelegenheiten", "kurz": "BBA",
        "mark": ch_mark,
        "farben": {"primaer": "#B5121B", "akzent": "#2B2F33", "text": "#2B2F33", "hell": "#FFFFFF"},
        "farbig": {"feld": "#B5121B", "punkte": "#FFFFFF", "raute": "#FFFFFF", "kern": "#B5121B"},
        "negativ": {"feld": "#FFFFFF", "punkte": "#B5121B", "raute": "#B5121B", "kern": "#FFFFFF"},
        "mono": {"feld": "#000000", "punkte": "#FFFFFF", "raute": "#FFFFFF", "kern": "#000000"},
        "font": [("arial", 100, "Bundesamt für besondere"), ("arial", 100, "Angelegenheiten"), ("arialbd", 100, "BBA")],
        "beschreibung": "Rotes Quadrat mit weisser Raute (der Sonderfall) im Kreis aus 26 Punkten – einer je Kanton.",
        "elemente": [
            ("feld", "Rotes Quadrat (Grundfläche)", "einblenden"),
            ("kantone", "26 Punkte kanton-01 … kanton-26, im Uhrzeigersinn ab oben", "nacheinander aufleuchten lassen (Lauflicht)"),
            ("raute", "Weisse Raute in der Mitte", "drehen oder pulsieren (Mittelpunkt 256/256)"),
            ("raute-kern", "Rote Raute im Zentrum", "pulsieren"),
        ],
    },
    "at": {
        "dir": "assets/img/at/logo", "prefix": "bbsa", "name": "Bundesamt für besondere und sonstige Angelegenheiten", "kurz": "BBSA",
        "mark": at_mark,
        "farben": {"primaer": "#2E2723", "akzent": "#E3B21A", "text": "#2E2723", "hell": "#FFFFFF"},
        "farbig": {"ring": "#2E2723", "text": "#E3B21A", "feld": "#E3B21A", "raster": "#2E2723", "sonst": "#FFFFFF"},
        "negativ": {"ring": "#E3B21A", "text": "#2E2723", "feld": "#2E2723", "raster": "#E3B21A", "sonst": "#FFFFFF"},
        "mono": {"ring": "#000000", "text": "#FFFFFF", "feld": "#FFFFFF", "raster": "#000000", "sonst": "#FFFFFF"},
        "font": [("georgia", 92, "Bundesamt für besondere"), ("georgia", 92, "und sonstige Angelegenheiten")],
        "zusatz": ("georgiab", 46, "BBSA · GEGRÜNDET 1873"),
        "beschreibung": "Rundsiegel in Mokka mit goldener Umschrift; im goldenen Siegelfeld acht Felder um einen weissen Kreis – das Sonstige.",
        "elemente": [
            ("siegel-ring", "Äusserer Siegelring", "einblenden"),
            ("umschrift", "Umschrift (Schrift als Pfade)", "langsam drehen (Mittelpunkt 256/256)"),
            ("siegel-feld", "Goldenes Siegelfeld", "einblenden, skalieren"),
            ("raster", "Gruppe der acht Felder feld-1 … feld-8", "Felder nacheinander ein- oder ausblenden"),
            ("sonstiges", "Weisser Kreis in der Mitte – das Sonstige", "pulsieren"),
        ],
    },
}


def wordmark(key, v, colors, text_color, rule_color, accent_text):
    lines = v["font"]
    x = 600
    body = f'<g id="bildmarke">{v["mark"](colors)}</g><rect id="trennlinie" x="556" y="72" width="6" height="368" fill="{rule_color}"/>'
    if key == "ch":
        (f1, s1, t1), (f2, s2, t2), (f3, s3, t3) = lines
        tw = max(text_width(F[f1], t1, s1), text_width(F[f2], t2, s2), text_width(F[f3], t3, s3))
        body += (f'<g id="wortmarke"><path fill="{text_color}" d="{text_path(F[f1], t1, x, 186, s1)}{text_path(F[f2], t2, x, 300, s2)}"/>'
                 f'<path fill="{accent_text}" d="{text_path(F[f3], t3, x, 428, s3)}"/></g>')
    elif key == "at":
        (f1, s1, t1), (f2, s2, t2) = lines
        f3, s3, t3 = v["zusatz"]
        tw = max(text_width(F[f1], t1, s1), text_width(F[f2], t2, s2), text_width(F[f3], t3, s3, 0.12))
        body += (f'<g id="wortmarke"><path fill="{text_color}" d="{text_path(F[f1], t1, x, 206, s1)}{text_path(F[f2], t2, x, 318, s2)}"/>'
                 f'<path fill="{accent_text}" d="{text_path(F[f3], t3, x, 410, s3, 0.12)}"/></g>')
    else:
        (f1, s1, t1), (f2, s2, t2) = lines
        tw = max(text_width(F[f1], t1, s1), text_width(F[f2], t2, s2))
        body += f'<g id="wortmarke" fill="{text_color}" stroke="{text_color}" stroke-width="2.5" stroke-linejoin="round"><path d="{text_path(F[f1], t1, x, 232, s1)}"/><path d="{text_path(F[f2], t2, x, 362, s2)}"/></g>'
    w = int(x + tw + 40)
    return w, body


def lade(key, v):
    """Lade-Anzeige 128×128, SMIL, auf hellem und dunklem Grund erkennbar."""
    if key == "de":
        c = dict(v["farbig"], rand="#FFFFFF")
        m = de_mark(c)
        order = [1, 2, 3, 5, 8, 7, 6, 4]  # im Uhrzeigersinn
        parts = m.split("<rect id=\"feld-")
        out = parts[0]
        for p in parts[1:]:
            n = int(p.split('"')[0])
            i = order.index(n)
            end = p.index("/>")
            out += '<rect id="feld-' + p[:end] + f'><animate attributeName="opacity" values="1;0.25;1" keyTimes="0;0.5;1" dur="1.6s" begin="{i * 0.2:.1f}s" repeatCount="indefinite"/></rect>' + p[end + 2:]
        out = out.replace('transform="rotate(15 256 250)"/></g>', 'transform="rotate(15 256 250)"><animateTransform attributeName="transform" type="rotate" values="15 256 250;105 256 250;105 256 250;15 256 250" keyTimes="0;0.35;0.5;1" dur="1.6s" repeatCount="indefinite"/></rect></g>')
        return out
    if key == "ch":
        m = ch_mark(v["farbig"]).replace('<rect id="feld" x="32" y="32" width="448" height="448" rx="36" fill="#B5121B"/>',
                                          '<rect id="feld" x="32" y="32" width="448" height="448" rx="36" fill="#B5121B" stroke="#FFFFFF" stroke-width="10"/>')
        parts = m.split('<circle id="kanton-')
        out = parts[0]
        for p in parts[1:]:
            n = int(p[:2])
            end = p.index("/>")
            out += '<circle id="kanton-' + p[:end] + f' opacity="0.3"><animate attributeName="opacity" values="1;0.3;0.3" keyTimes="0;0.3;1" dur="1.3s" begin="{(n - 1) * 1.3 / 26:.2f}s" repeatCount="indefinite"/></circle>' + p[end + 2:]
        out = out.replace('<path id="raute" ', '<g><animateTransform attributeName="transform" type="rotate" values="0 256 256;0 256 256;90 256 256" keyTimes="0;0.7;1" dur="2.6s" repeatCount="indefinite"/><path id="raute" ').replace(
            '<path id="raute-kern" d="M256 212L300 256L256 300L212 256Z" fill="#B5121B"/>', '<path id="raute-kern" d="M256 212L300 256L256 300L212 256Z" fill="#B5121B"/></g>')
        return out
    m = at_mark(v["farbig"]).replace('<circle id="siegel-ring" cx="256" cy="256" r="246" fill="#2E2723"/>',
                                      '<circle id="siegel-ring" cx="256" cy="256" r="246" fill="#2E2723" stroke="#FFFFFF" stroke-width="8"/>')
    m = m.replace('<g id="umschrift" fill="#E3B21A">', '<g id="umschrift" fill="#E3B21A"><animateTransform attributeName="transform" type="rotate" from="0 256 256" to="360 256 256" dur="12s" repeatCount="indefinite"/>')
    order = [1, 2, 3, 5, 8, 7, 6, 4]
    parts = m.split('<rect id="feld-')
    out = parts[0]
    for p in parts[1:]:
        n = int(p.split('"')[0])
        end = p.index("/>")
        out += '<rect id="feld-' + p[:end] + f'><animate attributeName="opacity" values="1;0.3;1" keyTimes="0;0.5;1" dur="1.6s" begin="{order.index(n) * 0.2:.1f}s" repeatCount="indefinite"/></rect>' + p[end + 2:]
    out = out.replace('stroke-width="7"/>', 'stroke-width="7"><animate attributeName="r" values="24;32;24" dur="1.6s" repeatCount="indefinite"/></circle>', 1)
    return out


def find_browser():
    for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]:
        if os.path.exists(p):
            return p
    raise SystemExit("Chrome oder Edge nicht gefunden")


BROWSER = find_browser()


def render(svg_text, out, w, h, size=None, bg=None, pad=0):
    """SVG über einen Headless-Browser als PNG rendern (Hintergrund durchsichtig oder bg)."""
    tmp = Path(tempfile.mkdtemp())
    html = tmp / "r.html"
    s = svg_text.replace(">", f' style="display:block">', 1) if False else svg_text
    html.write_text(f'<!doctype html><html><body style="margin:0;background:{bg or "transparent"}"><div style="width:{w}px;height:{h}px;padding:{pad}px;box-sizing:border-box">'
                    f'<img src="data:image/svg+xml;base64,{__import__("base64").b64encode(s.encode()).decode()}" style="width:100%;height:100%;display:block"></div></body></html>', encoding="utf-8")
    shot = tmp / "s.png"
    subprocess.run([BROWSER, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--default-background-color=00000000", f"--window-size={w},{h}", f"--screenshot={shot}", html.as_uri()],
                   check=True, capture_output=True, timeout=60)
    im = Image.open(shot).convert("RGBA").crop((0, 0, w, h))
    if size:
        im = im.resize(size, Image.LANCZOS)
    im.save(out)
    shutil.rmtree(tmp, ignore_errors=True)


manifest = {}
for key, v in V.items():
    d = ROOT / v["dir"]
    d.mkdir(parents=True, exist_ok=True)
    p, name, kurz = v["prefix"], v["name"], v["kurz"]
    files = {}

    def put(fn, text):
        (d / fn).write_text(text, encoding="utf-8", newline="\n")
        files[fn] = text

    desc = f'{v["beschreibung"]} {HINWEIS}'
    put(f"{p}-logo.svg", svg(512, 512, "0 0 512 512", f"{name} ({kurz}) – Bildmarke", desc, v["mark"](v["farbig"])))
    put(f"{p}-logo-negativ.svg", svg(512, 512, "0 0 512 512", f"{name} ({kurz}) – Bildmarke negativ (für dunklen Grund)", desc, v["mark"](v["negativ"])))
    put(f"{p}-logo-mono.svg", svg(512, 512, "0 0 512 512", f"{name} ({kurz}) – Bildmarke einfarbig schwarz", desc, v["mark"](v["mono"])))
    acc_text = {"de": "#1F2A30", "ch": "#B5121B", "at": "#8A6A0C"}[key]
    w, body = wordmark(key, v, v["farbig"], v["farben"]["text"], v["farben"]["akzent"] if key != "ch" else "#2B2F33", acc_text)
    put(f"{p}-wortbildmarke.svg", svg(w // 2, 256, f"0 0 {w} 512", f"{name} ({kurz}) – Wort-Bildmarke", desc, body))
    w2, body2 = wordmark(key, v, v["negativ"], "#FFFFFF", v["farben"]["akzent"] if key != "ch" else "#FFFFFF", "#FFFFFF" if key != "at" else "#E3B21A")
    put(f"{p}-wortbildmarke-negativ.svg", svg(w2 // 2, 256, f"0 0 {w2} 512", f"{name} ({kurz}) – Wort-Bildmarke negativ", desc, body2))
    put(f"{p}-lade-anzeige.svg", svg(128, 128, "-8 -8 528 528", f"{name} ({kurz}) – Lade-Anzeige", f"Animierte Bildmarke (SMIL, endlos). {HINWEIS}", lade(key, v)))

    render(files[f"{p}-logo.svg"], d / f"{p}-logo.png", 1024, 1024)
    render(files[f"{p}-logo.svg"], d / f"{p}-favicon.png", 1024, 1024, size=(256, 256))
    render(files[f"{p}-logo.svg"], d / f"{p}-touch.png", 1024, 1024, size=(180, 180), bg="#FFFFFF", pad=96)
    render(files[f"{p}-wortbildmarke.svg"], d / f"{p}-wortbildmarke.png", w, 512)
    if key == "de":
        shutil.copy(d / f"{p}-logo.svg", ROOT / "favicon.svg")
        shutil.copy(d / f"{p}-touch.png", ROOT / "apple-touch-icon.png")
    manifest[key] = {
        "beschreibung": v["beschreibung"], "farben": v["farben"],
        "elemente": [{"id": i, "beschreibung": b, "animationsvorschlag": a} for i, b, a in v["elemente"]],
        "wortbildmarkeBreite": w,
    }
    print("ok", key, w)

(ROOT / "tools" / "logo-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
