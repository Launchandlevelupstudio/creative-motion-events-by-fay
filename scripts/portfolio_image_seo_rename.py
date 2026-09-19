#!/usr/bin/env python3
"""Rename portfolio album/work images for SEO and rewrite index.html paths + alts."""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "images"
INDEX = ROOT / "index.html"

ALBUMS = {
    "able-health-grand-opening": {
        "prefix": "able-health-services-grand-opening-hanover-md-",
        "cover_alt": "Able Health Services grand opening entrance with ribbon and branded balloon décor in Hanover, Maryland by Creative Motion Events",
        "detail_words": [
            "lobby styling",
            "ribbon décor",
            "branded balloon installation",
            "reception area",
            "lounge seating",
            "branding detail",
            "guest arrival moment",
            "event design detail",
            "celebration space",
            "entry floral accent",
        ],
        "gallery_alt_fmt": "Able Health Services grand opening {w} in Hanover, Maryland — Creative Motion Events",
    },
    "pnc-grand-opening": {
        "prefix": "pnc-bank-grand-opening-maryland-",
        "cover_alt": "PNC Bank grand opening exterior and entry event design in Maryland by Creative Motion Events",
        "detail_words": [
            "corporate décor",
            "branding display",
            "lobby styling",
            "reception detail",
            "entry design",
            "celebration branding",
            "guest lounge",
            "event design detail",
            "branch opening décor",
            "brand moment",
        ],
        "gallery_alt_fmt": "PNC Bank grand opening {w} in Maryland by Creative Motion Events",
    },
    "jazmine-jaleesa-engagement": {
        "prefix": "jazmine-jaleesa-engagement-dinner-maryland-",
        "cover_alt": "Elegant engagement dinner tablescape designed by Creative Motion Events in Maryland",
        "detail_words": [
            "tablescape with florals",
            "place setting detail",
            "banquet table design",
            "candlelit reception décor",
            "floral centerpiece",
            "lounge seating vignette",
            "dinner party ambiance",
            "elegant place cards",
            "reception styling",
            "intimate celebration décor",
        ],
        "gallery_alt_fmt": "Jazmine and Jaleesa engagement dinner {w} in Maryland — Creative Motion Events",
    },
    "titi-bridal-shower": {
        "prefix": "titi-bridal-shower-maryland-",
        "cover_alt": "Luxury bridal shower tablescape and floral event design by Creative Motion Events in Maryland",
        "detail_words": [
            "tablescape and florals",
            "Miss to Mrs backdrop",
            "place setting detail",
            "lounge seating",
            "balloon and floral accent",
            "guest table styling",
            "celebration décor",
            "bridal shower reception",
            "centerpiece detail",
            "party ambiance",
        ],
        "gallery_alt_fmt": "Luxury bridal shower {w} by Creative Motion Events in Maryland",
    },
}

WORK_RENAMES = {
    "corporate-cover.jpg": (
        "corporate-events-maryland-able-health-grand-opening-entry.jpg",
        "Corporate events design — Able Health Services grand opening entry in Maryland by Creative Motion Events",
    ),
    "work-cover.jpg": (
        "creative-motion-events-work-portfolio-maryland.jpg",
        "Creative Motion Events portfolio work covering corporate and private celebrations in Maryland",
    ),
    "private-cover.jpg": (
        "private-celebrations-maryland-engagement-dinner-tablescape.jpg",
        "Private celebrations — elegant engagement dinner tablescape in Maryland by Creative Motion Events",
    ),
    "grand-openings-cover.jpg": (
        "grand-openings-brand-moments-maryland-able-health-entry.jpg",
        "Grand openings and brand moments — Able Health Services entry design in Maryland by Creative Motion Events",
    ),
    "galas-cover.jpg": (
        "galas-awards-nights-maryland-event-design.jpg",
        "Galas and awards nights event design in Maryland by Creative Motion Events",
    ),
    "engagements-cover.jpg": (
        "engagements-intimate-celebrations-maryland-tablescape.jpg",
        "Engagements and intimate celebrations — dinner tablescape in Maryland by Creative Motion Events",
    ),
    "bridal-cover.jpg": (
        "bridal-showers-maryland-luxury-tablescape.jpg",
        "Bridal showers — luxury tablescape and floral design in Maryland by Creative Motion Events",
    ),
}


def is_numbered(name: str):
    return re.fullmatch(r"(\d+)\.jpg", name, re.I)


def plan_album_renames(album: str, cfg: dict):
    folder = IMAGES / "albums" / album
    prefix = cfg["prefix"]
    words = cfg["detail_words"]
    out = []
    if not folder.is_dir():
        print(f"WARN: missing album dir {folder}", file=sys.stderr)
        return out

    for path in sorted(folder.iterdir()):
        if not path.is_file() or path.suffix.lower() != ".jpg":
            continue
        name = path.name
        if "-prev" in name:
            continue
        if name.startswith(prefix):
            continue

        if name.lower() == "cover.jpg":
            new_name = f"{prefix}cover.jpg"
            alt = cfg["cover_alt"]
        else:
            m = is_numbered(name)
            if not m:
                print(f"SKIP unexpected file: {path.relative_to(ROOT)}", file=sys.stderr)
                continue
            num = m.group(1)
            new_name = f"{prefix}gallery-{num}.jpg"
            idx = int(num)
            w = words[(idx - 1) % len(words)]
            alt = cfg["gallery_alt_fmt"].format(w=w)

        new_path = path.with_name(new_name)
        out.append((path, new_path, alt))
    return out


def plan_work_renames():
    work = IMAGES / "work"
    out = []
    for old_name, (new_name, alt) in WORK_RENAMES.items():
        old = work / old_name
        if not old.is_file():
            if (work / new_name).is_file():
                continue
            print(f"WARN: missing work file {old}", file=sys.stderr)
            continue
        out.append((old, work / new_name, alt))
    return out


def apply_renames(pairs):
    mapping = {}
    for old, new, alt in pairs:
        if new.exists() and new.resolve() != old.resolve():
            raise SystemExit(f"Target exists: {new}")
        old.rename(new)
        old_rel = str(old.relative_to(ROOT)).replace("\\", "/")
        new_rel = str(new.relative_to(ROOT)).replace("\\", "/")
        mapping[old_rel] = (new_rel, alt)
    return mapping


def esc_attr(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def rewrite_html(mapping):
    text = INDEX.read_text(encoding="utf-8")
    path_hits = 0
    alt_hits = 0

    for old_rel, (new_rel, alt) in sorted(mapping.items(), key=lambda x: -len(x[0])):
        if old_rel in text:
            c = text.count(old_rel)
            text = text.replace(old_rel, new_rel)
            path_hits += c

    new_to_alt = {new: alt for new, alt in mapping.values()}

    def fix_img_tag(tag: str) -> str:
        nonlocal alt_hits
        sm = re.search(r'\bsrc="([^"]+)"', tag)
        if not sm:
            return tag
        src = sm.group(1)
        if src not in new_to_alt:
            return tag
        new_alt = esc_attr(new_to_alt[src])
        if re.search(r'\balt="', tag):
            tag2, n = re.subn(r'\balt="[^"]*"', f'alt="{new_alt}"', tag, count=1)
            if n:
                alt_hits += 1
            return tag2
        alt_hits += 1
        if tag.endswith("/>"):
            return tag[:-2] + f' alt="{new_alt}" />'
        if tag.endswith(">"):
            return tag[:-1] + f' alt="{new_alt}">'
        return tag

    text = re.sub(r"<img\b[^>]*>", lambda m: fix_img_tag(m.group(0)), text, flags=re.I)

    def fix_btn(tag: str) -> str:
        dm = re.search(r'\bdata-src="([^"]+)"', tag)
        if not dm:
            return tag
        src = dm.group(1)
        if src not in new_to_alt:
            return tag
        label = esc_attr("View photo: " + new_to_alt[src])
        if re.search(r'\baria-label="', tag):
            return re.sub(r'\baria-label="[^"]*"', f'aria-label="{label}"', tag, count=1)
        return tag[:-1] + f' aria-label="{label}">'

    text = re.sub(
        r"<button\b[^>]*\bclass=\"[^\"]*\blb-open\b[^\"]*\"[^>]*>",
        lambda m: fix_btn(m.group(0)),
        text,
        flags=re.I,
    )

    INDEX.write_text(text, encoding="utf-8")
    return path_hits, alt_hits


def main():
    os.chdir(ROOT)
    all_pairs = []
    counts = {}

    for album, cfg in ALBUMS.items():
        pairs = plan_album_renames(album, cfg)
        counts[album] = len(pairs)
        all_pairs.extend(pairs)

    work_pairs = plan_work_renames()
    counts["work"] = len(work_pairs)
    all_pairs.extend(work_pairs)

    print(f"Planned renames: {sum(counts.values())} {counts}")
    mapping = apply_renames(all_pairs)
    print(f"Renamed on disk: {len(mapping)}")
    path_hits, alt_hits = rewrite_html(mapping)
    print(f"HTML path replacements: {path_hits}")
    print(f"HTML alt updates: {alt_hits}")
    print("COUNTS", counts)

    bare = []
    for album in ALBUMS:
        folder = IMAGES / "albums" / album
        for p in folder.iterdir():
            if "-prev" in p.name:
                continue
            if is_numbered(p.name) or p.name.lower() == "cover.jpg":
                bare.append(str(p.relative_to(ROOT)))
    if bare:
        print(f"FAIL still bare: {len(bare)} e.g. {bare[:5]}", file=sys.stderr)
        sys.exit(1)
    print("QA: no bare numbered/cover.jpg in album dirs")

    # sample alts
    samples = list(mapping.values())[:3]
    for new, alt in samples:
        print(f"SAMPLE {new} | {alt}")
    # one cover per album
    for album, cfg in ALBUMS.items():
        cov = f"images/albums/{album}/{cfg['prefix']}cover.jpg"
        for new, alt in mapping.values():
            if new == cov:
                print(f"COVER_ALT {album}: {alt}")
                break


if __name__ == "__main__":
    main()
