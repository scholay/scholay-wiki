from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out" / "prism-writing-flow.gif"
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
    "prismBadge": "#E5DFCE",
    "codeBg": "#09090A",
    "codeChrome": "#2B2B30",
    "codeGutter": "#050506",
    "codeText": "#e6e6e6",
    "codeMuted": "#555555",
    "codeCmd": "#7aa2f7",
    "codeGreen": "#6a7d6a",
    "codeAmber": "#d8a657",
}

FONT_CANDIDATES = [
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/SFNS.ttf",
]
MONO_CANDIDATES = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
]


def pick_font(candidates: list[str]) -> str | None:
    for item in candidates:
        if Path(item).exists():
            return item
    return None


FONT_PATH = pick_font(FONT_CANDIDATES)
MONO_PATH = pick_font(MONO_CANDIDATES) or FONT_PATH
_LOGO_CACHE: Image.Image | None = None


def font(size: int, mono: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = MONO_PATH if mono else FONT_PATH
    if path:
        return ImageFont.truetype(path, size * S)
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


def draw_round(draw: ImageDraw.ImageDraw, xywh, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box(*xywh), radius=sc(radius), fill=fill, outline=outline, width=sc(width))


def draw_text(draw, xy, text, size, color, weight=0, anchor="la", alpha=255, mono=False):
    draw.text((sc(xy[0]), sc(xy[1])), text, font=font(size + weight, mono=mono), fill=rgb(color, alpha), anchor=anchor)


def draw_grid(draw: ImageDraw.ImageDraw):
    for x in range(0, W + 1, 30):
        draw.line((sc(x), 0, sc(x), sc(H)), fill=rgb("#F0F0F0", 105), width=sc(1))
    for y in range(0, H + 1, 30):
        draw.line((0, sc(y), sc(W), sc(y)), fill=rgb("#F0F0F0", 90), width=sc(1))


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


def draw_logo(base: Image.Image, draw: ImageDraw.ImageDraw):
    logo = load_logo()
    if logo:
        base.alpha_composite(logo, (sc(28), sc(18)))
    else:
        draw_text(draw, (28, 26), "Scholay", 20, COLORS["red"], weight=2)


def draw_check(draw: ImageDraw.ImageDraw, cx: float, cy: float, color=COLORS["green"], alpha=255):
    draw.line((sc(cx - 7), sc(cy), sc(cx - 2), sc(cy + 6), sc(cx + 10), sc(cy - 8)), fill=rgb(color, alpha), width=sc(3), joint="curve")


def draw_file_icon(draw: ImageDraw.ImageDraw, x: float, y: float, color: str, alpha=255):
    draw.rectangle(box(x, y, 10, 13), fill=rgb("#FFFFFF", alpha), outline=rgb(color, alpha), width=sc(1))
    draw.line((sc(x + 2), sc(y + 5), sc(x + 8), sc(y + 5)), fill=rgb(color, alpha), width=sc(1))


def draw_editor_shell(draw: ImageDraw.ImageDraw):
    x, y, w, h = 28, 78, 904, 438
    draw_round(draw, (x + 4, y + 6, w, h), 13, rgb("#E4E4E4"))
    draw_round(draw, (x, y, w, h), 13, rgb("#FFFFFF"), outline=rgb(COLORS["borderStrong"]), width=2)
    draw_round(draw, (x, y, w, 44), 13, rgb(COLORS["surface1"]), outline=rgb(COLORS["borderStrong"]), width=2)
    draw.rectangle((sc(x + 1), sc(y + 29), sc(x + w - 1), sc(y + 44)), fill=rgb(COLORS["surface1"]))

    for i, color in enumerate(["#FF5F57", "#FEBC2E", "#28C840"]):
        draw.ellipse(box(x + 18 + i * 16, y + 17, 8, 8), fill=rgb(color))
    draw_text(draw, (x + 82, y + 27), "Prism · AI 写作", 14, COLORS["text"], weight=2, anchor="lm")
    draw_round(draw, (x + 208, y + 12, 64, 22), 5, rgb(COLORS["prismBadge"]), outline=rgb("#D8C99F"))
    draw_text(draw, (x + 240, y + 25), "main.tex", 10, COLORS["subtle"], weight=1, anchor="mm")
    draw_round(draw, (x + w - 96, y + 11, 62, 24), 6, rgb(COLORS["text"]))
    draw_text(draw, (x + w - 65, y + 25), "编译", 10, "#FFFFFF", weight=1, anchor="mm")

    body_y = y + 44
    bottom_y = y + h - 68
    draw.rectangle(box(x, body_y, 904, bottom_y - body_y), fill=rgb("#FFFFFF"))
    draw.rectangle(box(x, bottom_y, 904, 68), fill=rgb(COLORS["surface1"]))
    draw.line((sc(x), sc(bottom_y), sc(x + w), sc(bottom_y)), fill=rgb(COLORS["borderStrong"]), width=sc(1))
    draw.line((sc(192), sc(body_y), sc(192), sc(bottom_y)), fill=rgb(COLORS["borderStrong"]), width=sc(1))
    draw.line((sc(568), sc(body_y), sc(568), sc(bottom_y)), fill=rgb(COLORS["borderStrong"]), width=sc(1))


def draw_file_tree(draw: ImageDraw.ImageDraw, frame: int):
    x, y, w, h = 28, 122, 164, 326
    draw.rectangle(box(x, y, w, h), fill=rgb("#FFFFFF"))
    draw_text(draw, (x + 18, y + 24), "文件", 10, COLORS["faint"], weight=2, anchor="lm")
    files = [
        ("main.tex", 4, True),
        ("sections/", 22, False),
        ("intro.tex", 28, False),
        ("method.tex", 34, False),
        ("results.tex", 42, False),
        ("references.bib", 50, False),
    ]
    for i, (label, start, active) in enumerate(files):
        alpha = int(255 * fade(frame, start, start + 7))
        if alpha <= 0:
            continue
        row_y = y + 42 + i * 28
        indent = 0 if label in ["main.tex", "sections/", "references.bib"] else 14
        if active:
            draw_round(draw, (x + 8, row_y - 13, w - 18, 24), 5, rgb(COLORS["amberSoft"], alpha))
            draw.rectangle((sc(x + 8), sc(row_y - 13), sc(x + 11), sc(row_y + 11)), fill=rgb(COLORS["amber"], alpha))
        icon_color = COLORS["amber"] if active else COLORS["faint"]
        draw_file_icon(draw, x + 20 + indent, row_y - 7, icon_color, alpha)
        draw_text(draw, (x + 38 + indent, row_y), label, 10, COLORS["text"] if active else COLORS["subtle"], weight=1 if active else 0, anchor="lm", alpha=alpha)

    draw.line((sc(x + 16), sc(y + 220), sc(x + w - 16), sc(y + 220)), fill=rgb(COLORS["border"]), width=sc(1))
    draw_text(draw, (x + 18, y + 244), "大纲", 10, COLORS["faint"], weight=2, anchor="lm")
    outline = [
        ("1 Introduction", 32, True),
        ("2 Method", 44, True),
        ("3 Results", 58, False),
    ]
    for i, (label, start, done) in enumerate(outline):
        alpha = int(255 * fade(frame, start, start + 7))
        if alpha <= 0:
            continue
        row_y = y + 266 + i * 24
        draw_text(draw, (x + 20, row_y), label, 9, COLORS["subtle"], anchor="lm", alpha=alpha)
        if done:
            draw_check(draw, x + w - 26, row_y, COLORS["green"], alpha)


CODE_LINES = [
    ("\\documentclass[12pt]{article}", COLORS["codeCmd"]),
    ("\\usepackage{ctex,amsmath,natbib}", COLORS["codeCmd"]),
    ("\\title{AI-assisted Research Writing}", COLORS["codeAmber"]),
    ("\\author{Scholay Prism}", COLORS["codeAmber"]),
    ("\\begin{document}", COLORS["codeCmd"]),
    ("\\maketitle", COLORS["codeCmd"]),
    ("\\begin{abstract}", COLORS["codeGreen"]),
    ("This paper studies how large language models", COLORS["codeText"]),
    ("support literature review and academic drafting.", COLORS["codeText"]),
    ("\\end{abstract}", COLORS["codeGreen"]),
    ("\\section{Introduction}", COLORS["codeCmd"]),
    ("AI tools are becoming part of research workflows.", COLORS["codeText"]),
    ("\\section{Method}", COLORS["codeCmd"]),
    ("We organize writing into outline, drafting,", COLORS["codeText"]),
    ("revision, and citation verification stages.", COLORS["codeText"]),
    ("\\bibliographystyle{plainnat}", COLORS["codeCmd"]),
    ("\\bibliography{references}", COLORS["codeCmd"]),
]


def draw_code_editor(draw: ImageDraw.ImageDraw, frame: int):
    x, y, w, h = 192, 122, 376, 326
    draw.rectangle(box(x, y, w, h), fill=rgb(COLORS["codeBg"]))
    draw.rectangle(box(x, y, 40, h), fill=rgb(COLORS["codeGutter"]))
    reveal = smooth(fade(frame, 24, 74)) * len(CODE_LINES)
    cursor_idx = min(len(CODE_LINES) - 1, int(reveal))

    for i, (line, color) in enumerate(CODE_LINES):
        line_alpha = int(255 * fade(frame, 24 + i * 2, 32 + i * 2))
        if line_alpha <= 0:
            continue
        yy = y + 22 + i * 16
        if i == cursor_idx and frame < 82:
            draw.rectangle(box(x + 40, yy - 10, w - 40, 16), fill=rgb("#1D1D1D"))
        draw_text(draw, (x + 30, yy), str(i + 1), 8, COLORS["codeMuted"], anchor="rm", mono=True, alpha=line_alpha)
        draw_text(draw, (x + 52, yy), line, 8, color, anchor="lm", mono=True, alpha=line_alpha)

    if 24 <= frame < 82:
        yy = y + 22 + cursor_idx * 16
        draw.line((sc(x + 52 + min(230, len(CODE_LINES[cursor_idx][0]) * 5.2)), sc(yy - 8), sc(x + 52 + min(230, len(CODE_LINES[cursor_idx][0]) * 5.2)), sc(yy + 8)), fill=rgb("#FFFFFF"), width=sc(1))


def draw_preview(draw: ImageDraw.ImageDraw, frame: int):
    x, y, w, h = 568, 122, 364, 326
    draw.rectangle(box(x, y, w, h), fill=rgb(COLORS["prismBadge"]))
    draw_text(draw, (x + 18, y + 20), "预览 · PDF", 10, COLORS["muted"], weight=1, anchor="lm")
    page_x, page_y, page_w, page_h = x + 34, y + 38, 296, 270
    draw_round(draw, (page_x + 4, page_y + 5, page_w, page_h), 4, rgb("#D8D0BD"))
    draw_round(draw, (page_x, page_y, page_w, page_h), 4, rgb("#FFFFFF"), outline=rgb("#E0E0E0"), width=1)

    title_alpha = int(255 * fade(frame, 38, 48))
    abstract_alpha = int(255 * fade(frame, 50, 62))
    body_alpha = int(255 * fade(frame, 62, 78))
    if title_alpha:
        draw_text(draw, (page_x + page_w / 2, page_y + 34), "AI-assisted Research Writing", 14, COLORS["text"], weight=2, anchor="mm", alpha=title_alpha)
        draw_text(draw, (page_x + page_w / 2, page_y + 56), "Scholay Prism", 9, COLORS["muted"], anchor="mm", alpha=title_alpha)
    if abstract_alpha:
        draw_text(draw, (page_x + 28, page_y + 88), "Abstract", 10, COLORS["text"], weight=2, alpha=abstract_alpha)
        lines = [
            "This paper studies how large language",
            "models support literature review and",
            "academic drafting in a LaTeX workflow.",
        ]
        for i, line in enumerate(lines):
            draw_text(draw, (page_x + 28, page_y + 108 + i * 14), line, 8, COLORS["subtle"], alpha=abstract_alpha)
    if body_alpha:
        draw_text(draw, (page_x + 28, page_y + 164), "1 Introduction", 10, COLORS["text"], weight=2, alpha=body_alpha)
        for i, line in enumerate(["AI tools are becoming part of", "research workflows. Prism turns", "conversation into structured LaTeX."]):
            draw_text(draw, (page_x + 28, page_y + 184 + i * 14), line, 8, COLORS["subtle"], alpha=body_alpha)
        draw_text(draw, (page_x + 28, page_y + 238), "2 Method", 10, COLORS["text"], weight=2, alpha=body_alpha)
        draw_text(draw, (page_x + 28, page_y + 258), "Outline, draft, revise, compile.", 8, COLORS["subtle"], alpha=body_alpha)


def draw_chat_bar(draw: ImageDraw.ImageDraw, frame: int):
    x, y, w, h = 50, 458, 860, 42
    typed = "帮我生成论文 LaTeX 结构，并写出摘要和方法部分正文"
    if frame < 28:
        count = round(len(typed) * smooth(fade(frame, 1, 22)))
        draw_round(draw, (x, y, w, h), 9, rgb("#FFFFFF"), outline=rgb(COLORS["borderStrong"]), width=1.5)
        draw_text(draw, (x + 18, y + 24), typed[:count], 13, COLORS["text"], weight=1, anchor="lm")
        if frame < 24:
            cursor_x = x + 18 + min(500, count * 12)
            draw.line((sc(cursor_x), sc(y + 10), sc(cursor_x), sc(y + 31)), fill=rgb(COLORS["red"]), width=sc(1.5))
        draw_round(draw, (x + w - 43, y + 7, 28, 28), 7, rgb(COLORS["red"], int(255 * fade(frame, 16, 24))))
        draw.polygon([(sc(x + w - 35), sc(y + 16)), (sc(x + w - 20), sc(y + 21)), (sc(x + w - 35), sc(y + 26)), (sc(x + w - 31), sc(y + 21))], fill=rgb("#FFFFFF", int(255 * fade(frame, 16, 24))))
        return

    if frame < 74:
        draw_round(draw, (x, y, w, h), 9, rgb("#FFFFFF"), outline=rgb(COLORS["borderStrong"]), width=1.5)
        draw_round(draw, (x + 14, y + 9, 24, 24), 999, rgb(COLORS["dangerSoft"]), outline=rgb(COLORS["red"]), width=1)
        draw_text(draw, (x + 52, y + 24), "Prism 正在生成 LaTeX 结构和成品正文", 13, COLORS["text"], weight=1, anchor="lm")
        chips = [
            ("生成结构", COLORS["green"], COLORS["greenSoft"], 30),
            ("写入正文", COLORS["amber"], COLORS["amberSoft"], 44),
            ("编译预览", COLORS["red"], COLORS["dangerSoft"], 58),
        ]
        for i, (label, color, fill, start) in enumerate(chips):
            alpha = int(255 * fade(frame, start, start + 7))
            if alpha <= 4:
                continue
            chip_x = x + 372 + i * 108
            draw_round(draw, (chip_x, y + 9, 94, 24), 6, rgb(fill, alpha), outline=rgb(color, alpha), width=1)
            if frame >= start + 12:
                draw_check(draw, chip_x + 17, y + 21, color, alpha)
                draw_text(draw, (chip_x + 34, y + 22), label, 9, color, weight=1, anchor="lm", alpha=alpha)
            else:
                draw.ellipse(box(chip_x + 13, y + 17, 8, 8), fill=rgb(color, alpha))
                draw_text(draw, (chip_x + 30, y + 22), label, 9, color, weight=1, anchor="lm", alpha=alpha)
        return

    draw_round(draw, (x, y, w, h), 9, rgb(COLORS["greenSoft"]), outline=rgb(COLORS["green"]), width=1.5)
    draw_check(draw, x + 28, y + 22, COLORS["green"])
    draw_text(draw, (x + 54, y + 24), "已生成 main.tex、章节文件和正文，右侧预览已更新", 13, COLORS["green"], weight=1, anchor="lm")
    draw_round(draw, (x + w - 248, y + 8, 96, 26), 6, rgb(COLORS["green"]), outline=rgb(COLORS["green"]), width=1)
    draw_text(draw, (x + w - 200, y + 23), "应用到项目", 10, "#FFFFFF", weight=1, anchor="mm")
    draw_round(draw, (x + w - 140, y + 8, 96, 26), 6, rgb("#FFFFFF"), outline=rgb(COLORS["borderStrong"]), width=1)
    draw_text(draw, (x + w - 92, y + 23), "继续修改", 10, COLORS["subtle"], weight=1, anchor="mm")


def draw_frame(frame: int) -> Image.Image:
    im = Image.new("RGBA", (W * S, H * S), rgb(COLORS["background"]))
    d = ImageDraw.Draw(im)
    draw_grid(d)
    draw_logo(im, d)
    draw_editor_shell(d)
    draw_file_tree(d, frame)
    draw_code_editor(d, frame)
    draw_preview(d, frame)
    draw_chat_bar(d, frame)
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
