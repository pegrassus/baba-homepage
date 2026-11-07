"""Lädt die Higgsfield-Bilder aus assets-manifest.json und speichert sie als JPG/SVG.

Aufruf (im Projektordner):  python -I tools/fetch-assets.py
Bereits vorhandene Zieldateien werden übersprungen (--force überschreibt).
"""
import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "tools" / "assets-manifest.json").read_text(encoding="utf-8"))
force = "--force" in sys.argv

for src, target in manifest["items"]:
    path, _, width = target.partition("|")
    out = ROOT / path
    if out.exists() and not force:
        continue
    out.parent.mkdir(parents=True, exist_ok=True)
    data = urllib.request.urlopen(manifest["base"] + src, timeout=60).read()
    if path.endswith(".svg"):
        out.write_bytes(data)
    else:
        img = Image.open(io.BytesIO(data)).convert("RGB")
        if width and img.width > int(width):
            w = int(width)
            img = img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        img.save(out, "JPEG", quality=84, optimize=True, progressive=True)
    print(f"{path}  ({out.stat().st_size // 1024} KB)")
