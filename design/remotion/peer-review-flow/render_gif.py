from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out" / "peer-review-flow.gif"
LOGO = ROOT / "public" / "scholay-logo.png"

W, H = 960, 540
S = 2
FPS = 20
FRAMES = 5 * FPS

COLORS = {
    "background": "#F6F4EE",
    "surface1": "#EFEDE5",
    "surface2": "#E8E5DC",
    "border": "#DCDAD6",
    "borderStrong": "#C7C5C1",
    "text": "#1F1F23",
    "subtle": "#505059",
    "muted": "#686873",
    "faint": "#6E6E78",
    "red": "#882828",
    "green": "#2F4D29",
    "amber": "#E5A800",
    "amberSoft": "#E5DFCE",
    "dangerSoft": "#F3EAEA",
    "greenSoft": "#EAEDEA",
}

FONT_CANDIDATES = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/SFNS.ttf",
]


def font_path() -> str | None:
    for item in FONT_CANDIDATES:
        if Path(item).exists():
            return item
    return None


FONT_PATH = font_path()
_LOGO_CACHE: Image.Image | None = None


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if FONT_PATH:
        return ImageFont.truetype(FONT_PATH, size * S)
    return ImageFont.load_default()


def rgb(color: str, alpha: int = 255):
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def sc(v: float) -> int:
    return round(v * S)


def box(x: float, y: float, w: float, h: float):
    return (sc(x), sc(y), sc(x + w), sc(y + h))


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def smooth(t: float) -> float:
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out(t: float) -> float:
    t = clamp(t)
    return 1 - (1 - t) ** 3


def fade(frame: int, start: int, end: int) -> float:
    return clamp((frame - start) / max(1, end - start))


def fade_out(frame: int, start: int, end: int) -> float:
    return 1 - fade(frame, start, end)


def layer() -> Image.Image:
    return Image.new("RGBA", (W * S, H * S), (255, 255, 255, 0))


def draw_centered(draw: ImageDraw.ImageDraw, xy, text: str, fnt, fill, anchor="mm"):
    draw.text((sc(xy[0]), sc(xy[1])), text, font=fnt, fill=fill, anchor=anchor)


def draw_round(draw: ImageDraw.ImageDraw, xywh, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box(*xywh), radius=sc(radius), fill=fill, outline=outline, width=sc(width))


def draw_grid(draw: ImageDraw.ImageDraw):
    for x in range(0, W + 1, 30):
        draw.line((sc(x), 0, sc(x), sc(H)), fill=rgb("#F0F0F0", 105), width=sc(1))
    for y in range(0, H + 1, 30):
        draw.line((0, sc(y), sc(W), sc(y)), fill=rgb("#F0F0F0", 90), width=sc(1))


def draw_text(draw, xy, text, size, color, weight=0, anchor="la", alpha=255):
    # Hiragino handles Chinese well. The small coordinate nudges keep text optically aligned.
    draw.text((sc(xy[0]), sc(xy[1])), text, font=font(size + weight), fill=rgb(color, alpha), anchor=anchor)


def load_logo() -> Image.Image | None:
    global _LOGO_CACHE
    if _LOGO_CACHE is not None:
        return _LOGO_CACHE
    if not LOGO.exists():
        return None

    source = Image.open(LOGO).convert("RGBA")
    mask = Image.new("L", source.size, 0)
    pixels = source.convert("RGB").load()
    mask_pixels = mask.load()
    for y in range(source.height):
        for x in range(source.width):
            r, g, b = pixels[x, y]
            if not (r > 244 and g > 244 and b > 244):
                mask_pixels[x, y] = 255
    bbox = mask.getbbox()
    if bbox:
        source = source.crop(bbox)

    target_w = sc(150)
    target_h = round(target_w * source.height / source.width)
    _LOGO_CACHE = source.resize((target_w, target_h), Image.Resampling.LANCZOS)
    return _LOGO_CACHE


def draw_header(base: Image.Image, draw: ImageDraw.ImageDraw, frame: int):
    logo = load_logo()
    if logo:
        base.alpha_composite(logo, (sc(58), sc(24)))
    else:
        draw_text(draw, (58, 32), "Scholay", 20, COLORS["red"], weight=2)
    draw_text(draw, (58, 82), "上传 · 分析 · 结果", 30, COLORS["text"], weight=3)
    draw_timeline(draw, frame)


def step_pill(draw: ImageDraw.ImageDraw, x: float, y: float, label: str, idx: int, active: bool, done: bool):
    bg = COLORS["green"] if done else COLORS["red"] if active else COLORS["surface2"]
    fg = "#FFFFFF" if done or active else COLORS["faint"]
    draw.ellipse(box(x, y, 26, 26), fill=rgb(bg))
    if done:
        draw.line(
            (sc(x + 7), sc(y + 13), sc(x + 11), sc(y + 18), sc(x + 20), sc(y + 8)),
            fill=rgb(fg),
            width=sc(2.4),
            joint="curve",
        )
    else:
        draw_centered(draw, (x + 13, y + 13), str(idx), font(12), rgb(fg))
    draw_text(draw, (x + 34, y + 18), label, 14, COLORS["text"] if active or done else COLORS["faint"], weight=1, anchor="lm")


def draw_timeline(draw: ImageDraw.ImageDraw, frame: int):
    y = 124
    upload_active = frame < 30
    analysis_active = 24 <= frame < 58
    result_active = frame >= 56
    step_pill(draw, 58, y, "上传稿件", 1, upload_active, frame >= 31)
    draw.line((sc(195), sc(y + 13), sc(346), sc(y + 13)), fill=rgb(COLORS["green"] if frame >= 31 else COLORS["borderStrong"]), width=sc(3))
    step_pill(draw, 362, y, "AI 分析", 2, analysis_active, frame >= 58)
    draw.line((sc(486), sc(y + 13), sc(638), sc(y + 13)), fill=rgb(COLORS["green"] if frame >= 58 else COLORS["borderStrong"]), width=sc(3))
    step_pill(draw, 654, y, "审稿结果", 3, result_active, frame >= 96)


def draw_file_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float):
    x, y = cx - 23, cy - 28
    pts = [(x, y), (x + 33, y), (x + 46, y + 14), (x + 46, y + 56), (x, y + 56)]
    draw.polygon([(sc(a), sc(b)) for a, b in pts], fill=rgb("#FFFFFF"), outline=rgb(COLORS["text"]))
    draw.line((sc(x + 33), sc(y), sc(x + 33), sc(y + 14), sc(x + 46), sc(y + 14)), fill=rgb(COLORS["text"]), width=sc(2))
    for i, w in enumerate([25, 20, 16]):
        yy = y + 28 + i * 9
        draw.line((sc(x + 9), sc(yy), sc(x + 9 + w), sc(yy)), fill=rgb(COLORS["borderStrong"]), width=sc(2))


def draw_check(draw: ImageDraw.ImageDraw, cx: float, cy: float, color=COLORS["green"]):
    draw.line((sc(cx - 10), sc(cy), sc(cx - 3), sc(cy + 8), sc(cx + 13), sc(cy - 11)), fill=rgb(color), width=sc(4), joint="curve")


def draw_upload(base: Image.Image, frame: int):
    alpha = int(255 * fade_out(frame, 42, 52) * lerp(0.86, 1, ease_out(fade(frame, 0, 8))))
    if alpha <= 0:
        return
    im = layer()
    d = ImageDraw.Draw(im)
    border = COLORS["green"] if frame >= 30 else COLORS["borderStrong"]
    draw_round(d, (84, 190, 226, 242), 12, rgb(COLORS["surface1"], alpha), outline=rgb(border, alpha), width=2)
    progress = smooth(fade(frame, 12, 30))
    file_y = lerp(40, 0, ease_out(fade(frame, 0, 13))) + lerp(0, 23, smooth(fade(frame, 23, 31)))
    draw_file_icon(d, 197, 250 + file_y)
    draw_text(d, (197, 323), "上传论文 PDF", 18, COLORS["text"], weight=2, anchor="mm", alpha=alpha)
    draw_round(d, (124, 346, 146, 8), 99, rgb("#E7E7E7", alpha))
    draw_round(d, (124, 346, 146 * progress, 8), 99, rgb(COLORS["red"], alpha))
    draw_text(d, (197, 383), "文件已校验" if frame >= 30 else "解析上传中", 13, COLORS["green"] if frame >= 30 else COLORS["faint"], weight=1, anchor="mm", alpha=alpha)
    if frame >= 30:
        draw_check(d, 197, 414)
    base.alpha_composite(im)


def draw_analysis(base: Image.Image, frame: int):
    alpha = int(255 * fade(frame, 23, 35) * fade_out(frame, 44, 56))
    if alpha <= 0:
        return
    im = layer()
    d = ImageDraw.Draw(im)
    yoff = lerp(24, 0, ease_out(fade(frame, 23, 35)))
    active = 24 <= frame < 70
    draw_round(d, (344, 190 + yoff, 272, 242), 12, rgb("#FFFFFF", alpha), outline=rgb(COLORS["red"] if active else COLORS["border"], alpha), width=2)
    draw_text(d, (362, 229 + yoff), "AI 分析", 21, COLORS["text"], weight=3, alpha=alpha)
    draw_text(d, (362, 254 + yoff), "方法学 · 创新性 · 可读性", 11, COLORS["muted"], weight=1, alpha=alpha)

    pulse = int(alpha * lerp(0.45, 1, (math.sin(frame / FPS * math.pi * 4.4) + 1) / 2))
    d.ellipse(box(550, 214 + yoff, 40, 40), fill=rgb(COLORS["dangerSoft"], pulse))
    draw_centered(d, (570, 234 + yoff), "AI", font(16), rgb(COLORS["red"], pulse))

    draw_round(d, (362, 279 + yoff, 218, 126), 8, rgb(COLORS["surface1"], alpha))
    for i, w in enumerate([166, 132, 154, 110]):
        d.rounded_rectangle(
            (sc(382), sc(299 + yoff + i * 25), sc(382 + w), sc(307 + yoff + i * 25)),
            radius=sc(99),
            fill=rgb(COLORS["text"] if i == 0 else COLORS["borderStrong"], alpha),
        )
    sx = lerp(365, 548, (math.sin(frame / FPS * math.pi * 2.2) + 1) / 2)
    d.rectangle((sc(sx - 14), sc(279 + yoff), sc(sx + 14), sc(405 + yoff)), fill=rgb(COLORS["red"], int(alpha * 0.18)))

    for i, c in enumerate([COLORS["green"], COLORS["amber"], COLORS["red"]]):
        bar_alpha = int(alpha * lerp(0.2, 1, smooth(fade(frame, 39 + i * 5, 50 + i * 5))))
        draw_round(d, (382 + i * 62, 373 + yoff, 52, 22), 5, rgb(c, bar_alpha))
    base.alpha_composite(im)


RESULT_STATES = [
    {
        "title": "录用",
        "kicker": "(修改后)录用",
        "color": COLORS["green"],
        "soft": COLORS["greenSoft"],
        "score": "86 / 100",
        "summary": "整体证据链成立，仅需少量文字与格式修订。",
        "rows": [
            ("check", "研究问题清晰", "贡献与目标期刊匹配"),
            ("check", "方法与数据充分", "关键实验能够支撑结论"),
            ("warn", "小修后通过", "完善措辞、图表与引用格式"),
        ],
    },
    {
        "title": "返修",
        "kicker": "大修后复议",
        "color": COLORS["amber"],
        "soft": COLORS["amberSoft"],
        "score": "67 / 100",
        "summary": "核心方向有价值，但必须补强证据并提交回复函。",
        "rows": [
            ("check", "选题具备潜力", "问题有明确学术价值"),
            ("warn", "实验需要补充", "缺少关键对照与稳健性检验"),
            ("cross", "结论暂不充分", "需逐条回应审稿意见"),
        ],
    },
    {
        "title": "拒稿",
        "kicker": "本轮不接收",
        "color": COLORS["red"],
        "soft": COLORS["dangerSoft"],
        "score": "42 / 100",
        "summary": "主要缺陷影响结论可信度，不适合进入本轮修订。",
        "rows": [
            ("cross", "创新性不足", "与既有工作差异不清"),
            ("cross", "方法缺陷明显", "样本、对照或统计设计不足"),
            ("cross", "结论支撑不足", "核心论断超出证据范围"),
        ],
    },
]


def active_result(frame: int):
    start = 58
    if frame < start:
        return None, 0.0, 0
    slot = 14
    idx = min(2, max(0, (frame - start) // slot))
    local = (frame - start) - idx * slot
    enter = fade(local, 0, 2)
    exit_fade = fade_out(local, 12, 14) if idx < 2 else 1
    return RESULT_STATES[idx], min(enter, exit_fade), idx


def mark_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float, kind: str, color: str, alpha: int):
    draw.ellipse(box(cx - 12, cy - 12, 24, 24), fill=rgb(color, alpha))
    if kind == "cross":
        draw.line((sc(cx - 6), sc(cy - 6), sc(cx + 6), sc(cy + 6)), fill=rgb("#FFFFFF", alpha), width=sc(2.6))
        draw.line((sc(cx + 6), sc(cy - 6), sc(cx - 6), sc(cy + 6)), fill=rgb("#FFFFFF", alpha), width=sc(2.6))
    elif kind == "warn":
        draw.line((sc(cx), sc(cy - 7), sc(cx), sc(cy + 3)), fill=rgb("#FFFFFF", alpha), width=sc(3))
        draw.ellipse(box(cx - 1.7, cy + 6, 3.4, 3.4), fill=rgb("#FFFFFF", alpha))
    else:
        draw.line((sc(cx - 6), sc(cy), sc(cx - 1), sc(cy + 6), sc(cx + 8), sc(cy - 6)), fill=rgb("#FFFFFF", alpha), width=sc(2.8), joint="curve")


def draw_result_card(draw: ImageDraw.ImageDraw, state: dict, alpha: int, progress: float):
    x, y, w, h = 94, 228 + lerp(20, 0, ease_out(progress)), 350, 198
    color = state["color"]
    draw_round(draw, (x + 5, y + 8, w, h), 12, rgb("#000000", int(alpha * 0.08)))
    draw_round(draw, (x, y, w, h), 12, rgb("#FFFFFF", alpha), outline=rgb(color, alpha), width=3)
    draw_round(draw, (x + 22, y + 22, w - 44, h - 44), 10, rgb(state["soft"], int(alpha * 0.42)))
    draw_text(draw, (x + w / 2, y + h / 2 + 2), state["title"], 58, color, weight=4, anchor="mm", alpha=alpha)


def draw_exam_sheet(draw: ImageDraw.ImageDraw, state: dict, alpha: int, progress: float):
    x, y, w, h = 505, 202 + lerp(22, 0, ease_out(progress)), 340, 250
    color = state["color"]
    draw_round(draw, (x + 6, y + 8, w, h), 12, rgb("#000000", int(alpha * 0.07)))
    draw_round(draw, (x, y, w, h), 12, rgb("#FFFFFF", alpha), outline=rgb(COLORS["borderStrong"], alpha), width=2)
    draw_text(draw, (x + 24, y + 36), "审稿结果单", 22, COLORS["text"], weight=3, alpha=alpha)
    draw_text(draw, (x + 24, y + 62), "主审依据 · 关键原因", 11, COLORS["muted"], weight=1, alpha=alpha)
    draw_round(draw, (x + 242, y + 24, 70, 70), 999, rgb(state["soft"], int(alpha * 0.9)), outline=rgb(color, alpha), width=2)
    draw_text(draw, (x + 277, y + 62), state["title"], 17, color, weight=3, anchor="mm", alpha=alpha)
    for i, (kind, title, note) in enumerate(state["rows"]):
        ry = y + 104 + i * 45
        draw_round(draw, (x + 22, ry, w - 44, 34), 8, rgb(state["soft"], int(alpha * (0.24 if kind != "cross" else 0.18))))
        mark_color = color if kind != "check" else COLORS["green"]
        mark_icon(draw, x + 43, ry + 17, kind, mark_color, alpha)
        draw_text(draw, (x + 66, ry + 14), title, 13, COLORS["text"], weight=2, anchor="lm", alpha=alpha)
        draw_text(draw, (x + 176, ry + 14), note, 10, COLORS["muted"], weight=1, anchor="lm", alpha=alpha)
    # Subtle red pen mark, like a paper grading stroke.
    draw.arc((sc(x + 238), sc(y + 139), sc(x + 320), sc(y + 204)), 205, 330, fill=rgb(color, int(alpha * 0.45)), width=sc(3))


def draw_results(base: Image.Image, frame: int):
    state, p, idx = active_result(frame)
    if not state or p <= 0:
        return
    im = layer()
    d = ImageDraw.Draw(im)
    alpha = int(255 * p)
    draw_text(d, (94, 202), "审稿结果", 15, COLORS["faint"], weight=1, alpha=alpha)
    # Three small indicators show which final state is currently on screen.
    for i, item in enumerate(RESULT_STATES):
        cx = 233 + i * 24
        d.ellipse(box(cx, 194, 10, 10), fill=rgb(item["color"] if i == idx else COLORS["borderStrong"], alpha))
    draw_result_card(d, state, alpha, p)
    draw_exam_sheet(d, state, alpha, p)
    base.alpha_composite(im)


def draw_frame(frame: int) -> Image.Image:
    im = Image.new("RGBA", (W * S, H * S), rgb(COLORS["background"]))
    d = ImageDraw.Draw(im)
    draw_grid(d)
    draw_header(im, d, frame)
    draw_round(d, (58, 168, 844, 306), 14, rgb("#FFFFFF", 239), outline=rgb(COLORS["border"]), width=2)
    draw_upload(im, frame)
    draw_analysis(im, frame)
    draw_results(im, frame)
    return im.resize((W, H), Image.Resampling.LANCZOS).convert("P", palette=Image.Palette.ADAPTIVE, colors=128)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [draw_frame(i) for i in range(FRAMES)]
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / FPS),
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"wrote {OUT} ({FRAMES / FPS:.1f}s, {FPS}fps, {W}x{H})")


if __name__ == "__main__":
    main()
