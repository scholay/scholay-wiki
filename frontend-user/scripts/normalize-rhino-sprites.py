#!/usr/bin/env python3
"""Normalize rhino mascot PNGs to a fixed 256×256 canvas.

- Upright clips: opaque content height → 162px, feet on a 46px bottom pad
- Pose-compressed (sleep-e): keep character scale (do not inflate lying poses)
- Center horizontally

Run from repo:
  python3 frontend-user/scripts/normalize-rhino-sprites.py
Requires: Pillow
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'mascot' / 'rhino'
CANVAS = 256
TARGET_H = 162
FOOT = 46
TOP_MIN = 8
SIDE_MAX_W = CANVAS - 24
POSE_COMPRESSED = {'sleep-e'}


def clip_key(path: Path) -> str:
    rel = path.relative_to(ROOT)
    parts = rel.parts
    if parts[0] == 'face':
        return f'face/{path.stem}'
    if len(parts) >= 2 and parts[0] in ('loco', 'run', 'idle'):
        return f'{parts[0]}/{parts[1]}'
    return parts[0]


def normalize(im: Image.Image, key: str) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.split()[-1].getbbox()
    if not bbox:
        return Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    crop = im.crop(bbox)
    cw, ch = crop.size
    root = key.split('/')[0]
    ref_h = TARGET_H if (key in POSE_COMPRESSED or root in POSE_COMPRESSED) else ch
    scale = TARGET_H / ref_h
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    if nw > SIDE_MAX_W:
        scale *= SIDE_MAX_W / nw
        nw = max(1, int(round(cw * scale)))
        nh = max(1, int(round(ch * scale)))
    max_h = CANVAS - FOOT - TOP_MIN
    if nh > max_h:
        scale *= max_h / nh
        nw = max(1, int(round(cw * scale)))
        nh = max(1, int(round(ch * scale)))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - nw) // 2
    y = CANVAS - FOOT - nh
    out.paste(crop, (x, y), crop)
    return out


def main() -> None:
    if not ROOT.is_dir():
        raise SystemExit(f'missing {ROOT}')
    n = 0
    for path in sorted(ROOT.rglob('*.png')):
        key = clip_key(path)
        normalize(Image.open(path), key).save(path, optimize=True)
        n += 1
    print(f'normalized {n} pngs under {ROOT}')
    print(f'canvas={CANVAS} targetContentH={TARGET_H} footPad={FOOT}')


if __name__ == '__main__':
    main()
