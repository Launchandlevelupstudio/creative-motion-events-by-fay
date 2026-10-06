#!/usr/bin/env python3
"""Check that every <img src> and CSS url() in the site resolves to a file in the repo."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {".git", "node_modules"}
IMG_SRC = re.compile(r"<img\b[^>]*?\bsrc=[\"']([^\"']+)[\"']", re.I)
CSS_URL = re.compile(r"url\(\s*[\"']?([^\"')]+)[\"']?\s*\)", re.I)

missing = []
checked = 0

def consider(path: Path, ref: str):
    global checked
    ref = ref.strip()
    if not ref or ref.startswith(("data:", "http:", "https:", "//", "#")):
        return
    ref = ref.split("?")[0].split("#")[0]
    checked += 1
    candidates = [
        (path.parent / ref).resolve(),
        (ROOT / ref).resolve(),
    ]
    if not any(c.is_file() for c in candidates):
        missing.append(f"{path.relative_to(ROOT)}: {ref}")

for path in ROOT.rglob("*"):
    if not path.is_file():
        continue
    if SKIP_DIRS.intersection(path.parts):
        continue
    if path.suffix.lower() not in {".html", ".css"}:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    for ref in IMG_SRC.findall(text):
        consider(path, ref)
    for ref in CSS_URL.findall(text):
        consider(path, ref)

print(f"checked {checked} image references in HTML/CSS")
if missing:
    print(f"{len(missing)} missing:")
    print("\n".join(missing))
    sys.exit(1)
print("every img src and CSS url() resolves to a file")
