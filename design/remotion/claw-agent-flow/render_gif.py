from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out" / "claw-agent-flow.gif"
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


def draw_round(draw: ImageDraw.ImageDraw, xywh, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box(*xywh), radius=sc(radius), fill=fill, outline=outline, width=sc(width))


def draw_centered(draw: ImageDraw.ImageDraw, xy, text: str, fnt, fill, anchor="mm"):
    draw.text((sc(xy[0]), sc(xy[1])), text, font=fnt, fill=fill, anchor=anchor)


def draw_text(draw, xy, text, size, color, weight=0, anchor="la", alpha=255):
    draw.text((sc(xy[0]), sc(xy[1])), text, font=font(size + weight), fill=rgb(color, alpha), anchor=anchor)


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
    draw.line((sc(cx - 8), sc(cy), sc(cx - 2), sc(cy + 7), sc(cx + 11), sc(cy - 9)), fill=rgb(color, alpha), width=sc(3.6), joint="curve")


def draw_send_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float, alpha=255):
    pts = [(cx - 10, cy - 8), (cx + 12, cy), (cx - 10, cy + 8), (cx - 5, cy)]
    draw.polygon([(sc(x), sc(y)) for x, y in pts], fill=rgb("#FFFFFF", alpha))


def draw_claw_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float, scale: float = 1, color=COLORS["red"], alpha=255):
    lw = sc(2.4 * scale)
    c = rgb(color, alpha)
    draw.line((sc(cx - 7 * scale), sc(cy - 7 * scale), sc(cx - 27 * scale), sc(cy - 26 * scale)), fill=c, width=lw)
    draw.arc((sc(cx - 42 * scale), sc(cy - 42 * scale), sc(cx - 18 * scale), sc(cy - 17 * scale)), 45, 245, fill=c, width=lw)
    draw.line((sc(cx - 34 * scale), sc(cy - 32 * scale), sc(cx - 43 * scale), sc(cy - 40 * scale)), fill=c, width=lw)
    draw.line((sc(cx + 7 * scale), sc(cy - 7 * scale), sc(cx + 27 * scale), sc(cy - 26 * scale)), fill=c, width=lw)
    draw.arc((sc(cx + 18 * scale), sc(cy - 42 * scale), sc(cx + 42 * scale), sc(cy - 17 * scale)), -65, 135, fill=c, width=lw)
    draw.line((sc(cx + 34 * scale), sc(cy - 32 * scale), sc(cx + 43 * scale), sc(cy - 40 * scale)), fill=c, width=lw)
    draw_round(draw, (cx - 14 * scale, cy - 16 * scale, 28 * scale, 43 * scale), 14 * scale, rgb("#FFFFFF", alpha), outline=c, width=2.4 * scale)
    for yy in [cy - 1 * scale, cy + 11 * scale]:
        draw.line((sc(cx - 13 * scale), sc(yy), sc(cx + 13 * scale), sc(yy)), fill=c, width=lw)
    draw.line((sc(cx), sc(cy + 27 * scale), sc(cx), sc(cy + 39 * scale)), fill=c, width=lw)
    draw.line((sc(cx), sc(cy + 39 * scale), sc(cx - 12 * scale), sc(cy + 50 * scale)), fill=c, width=lw)
    draw.line((sc(cx), sc(cy + 39 * scale), sc(cx + 12 * scale), sc(cy + 50 * scale)), fill=c, width=lw)


def draw_chat_shell(draw: ImageDraw.ImageDraw):
    x, y, w, h = 32, 82, 896, 428
    draw_round(draw, (x + 4, y + 6, w, h), 13, rgb("#000000", 16))
    draw_round(draw, (x, y, w, h), 13, rgb("#FFFFFF"), outline=rgb(COLORS["borderStrong"]), width=2)
    draw_round(draw, (x, y, w, 52), 13, rgb(COLORS["surface1"]), outline=rgb(COLORS["borderStrong"]), width=2)
    draw.rectangle((sc(x + 1), sc(y + 34), sc(x + w - 1), sc(y + 52)), fill=rgb(COLORS["surface1"]))

    draw_round(draw, (x + 20, y + 13, 26, 26), 999, rgb(COLORS["dangerSoft"]), outline=rgb(COLORS["red"]), width=1.4)
    draw_claw_icon(draw, x + 33, y + 25, 0.18, COLORS["red"])
    draw_text(draw, (x + 58, y + 29), "Claw · 学术对话", 16, COLORS["text"], weight=2, anchor="lm")
    draw_round(draw, (x + w - 218, y + 13, 184, 26), 999, rgb("#FFFFFF"), outline=rgb(COLORS["border"]), width=1)
    draw_text(draw, (x + w - 126, y + 28), "索引文献集 · 248 篇", 12, COLORS["muted"], weight=1, anchor="mm")


def draw_composer(draw: ImageDraw.ImageDraw, frame: int):
    alpha = int(255 * fade_out(frame, 24, 32))
    if alpha <= 0:
        return
    x, y, w, h = 64, 456, 832, 38
    draw_round(draw, (x, y, w, h), 8, rgb("#FFFFFF", alpha), outline=rgb(COLORS["borderStrong"], alpha), width=1.5)
    typed = "帮我找几篇关于 AI 辅助论文写作的核心文献"
    count = round(len(typed) * smooth(fade(frame, 1, 18)))
    draw_text(draw, (x + 18, y + 22), typed[:count], 13, COLORS["text"], weight=1, anchor="lm", alpha=alpha)
    if frame < 20:
        cursor_x = x + 18 + min(350, count * 12)
        draw.line((sc(cursor_x), sc(y + 10), sc(cursor_x), sc(y + 28)), fill=rgb(COLORS["red"], alpha), width=sc(1.5))
    send_alpha = int(alpha * fade(frame, 13, 21))
    draw_round(draw, (x + w - 43, y + 6, 26, 26), 6, rgb(COLORS["red"], send_alpha))
    draw_send_icon(draw, x + w - 30, y + 19, send_alpha)


def draw_user_message(draw: ImageDraw.ImageDraw, frame: int):
    p = fade(frame, 20, 32)
    alpha = int(255 * p)
    if alpha <= 0:
        return
    x, y, w, h = 388, 152 + lerp(14, 0, ease_out(p)), 508, 58
    draw_round(draw, (x, y, w, h), 10, rgb(COLORS["text"], alpha))
    draw_text(draw, (x + w - 20, y + 21), "帮我找几篇关于 AI 辅助论文写作的核心文献", 14, "#FFFFFF", weight=1, anchor="ra", alpha=alpha)
    draw_text(draw, (x + w - 20, y + 43), "需要基础信息和可引用线索", 11, "#D8D8D8", anchor="ra", alpha=alpha)


def draw_tool_row(draw: ImageDraw.ImageDraw, x: float, y: float, label: str, note: str, state: str, color: str, alpha: int):
    draw_round(draw, (x, y, 430, 34), 8, rgb(COLORS["surface1"], alpha), outline=rgb(COLORS["border"], alpha), width=1)
    if state == "done":
        draw_round(draw, (x + 12, y + 8, 18, 18), 999, rgb(COLORS["green"], alpha))
        draw_check(draw, x + 21, y + 17, "#FFFFFF", alpha)
    elif state == "active":
        pulse = 0.55 + 0.45 * math.sin(y + alpha)
        draw_round(draw, (x + 12, y + 8, 18, 18), 999, rgb(color, int(alpha * pulse)))
        draw.ellipse(box(x + 18, y + 14, 6, 6), fill=rgb("#FFFFFF", alpha))
    else:
        draw_round(draw, (x + 12, y + 8, 18, 18), 999, rgb(COLORS["borderStrong"], alpha))
    draw_text(draw, (x + 42, y + 17), label, 12, COLORS["text"], weight=2, anchor="lm", alpha=alpha)
    draw_text(draw, (x + 170, y + 17), note, 10, COLORS["muted"], weight=1, anchor="lm", alpha=alpha)


def draw_tool_calls(draw: ImageDraw.ImageDraw, frame: int):
    active = fade(frame, 30, 40) * fade_out(frame, 61, 70)
    alpha = int(255 * active)
    if alpha <= 0:
        return
    x, y, w, h = 64, 238 + lerp(12, 0, ease_out(active)), 650, 140
    draw_round(draw, (x, y, w, h), 10, rgb("#FFFFFF", alpha), outline=rgb(COLORS["borderStrong"], alpha), width=1.5)
    draw_round(draw, (x + 20, y + 20, 52, 52), 999, rgb(COLORS["dangerSoft"], alpha), outline=rgb(COLORS["red"], alpha), width=1.5)
    draw_claw_icon(draw, x + 46, y + 43, 0.29, COLORS["red"], alpha)
    draw_text(draw, (x + 88, y + 34), "AI 正在调用智能体 / 工具", 19, COLORS["text"], weight=2, alpha=alpha)
    draw_text(draw, (x + 88, y + 60), "从文献集检索、抽取元数据、组织引用依据", 12, COLORS["muted"], weight=1, alpha=alpha)

    rows = [
        ("智能检索", "查找相关论文", 35, COLORS["green"], COLORS["greenSoft"]),
        ("文献解析", "读取标题、作者、年份", 43, COLORS["amber"], COLORS["amberSoft"]),
        ("引用整理", "生成卡片与回答", 51, COLORS["red"], COLORS["dangerSoft"]),
    ]
    for i, (label, note, start, color, soft) in enumerate(rows):
        if frame >= start + 10:
            state = "done"
        elif frame >= start:
            state = "active"
        else:
            state = "wait"
        row_alpha = int(alpha * fade(frame, start - 3, start + 3))
        chip_x = x + 88 + i * 172
        fill = soft if state != "wait" else COLORS["surface2"]
        stroke = color if state != "wait" else COLORS["borderStrong"]
        draw_round(draw, (chip_x, y + 88, 150, 32), 7, rgb(fill, row_alpha), outline=rgb(stroke, row_alpha), width=1)
        if state == "done":
            draw_check(draw, chip_x + 20, y + 104, color, row_alpha)
        elif state == "active":
            draw.ellipse(box(chip_x + 15, y + 99, 10, 10), fill=rgb(color, row_alpha))
        else:
            draw.ellipse(box(chip_x + 15, y + 99, 10, 10), fill=rgb(COLORS["borderStrong"], row_alpha))
        draw_text(draw, (chip_x + 40, y + 105), label, 12, color if state != "wait" else COLORS["faint"], weight=1, anchor="lm", alpha=row_alpha)


REFERENCE = {
    "idx": "[1]",
    "title": "AI-assisted Scholarly Writing",
    "authors": "Lee, Morgan & Zhao",
    "year": "2024",
    "venue": "Journal of Academic Writing",
    "abstract_lines": [
        "摘要：本文综述 AI 辅助学术写作的主要场景，覆盖选题、文献综述、",
        "草稿润色与引用检查，并讨论准确性、署名与透明披露风险。",
    ],
}


def draw_ref_chip(draw: ImageDraw.ImageDraw, x: float, y: float, text: str, alpha: int):
    draw_round(draw, (x, y, 28, 18), 4, rgb(COLORS["dangerSoft"], alpha), outline=rgb(COLORS["red"], alpha), width=1)
    draw_text(draw, (x + 14, y + 11), text, 8, COLORS["red"], weight=1, anchor="mm", alpha=alpha)


def draw_action_button(draw: ImageDraw.ImageDraw, x: float, y: float, label: str, fill: str, color: str, alpha: int, outline: str | None = None):
    draw_round(draw, (x, y, 92, 28), 7, rgb(fill, alpha), outline=rgb(outline or fill, alpha), width=1)
    draw_text(draw, (x + 46, y + 17), label, 10, color, weight=1, anchor="mm", alpha=alpha)


def draw_reference_card(draw: ImageDraw.ImageDraw, x: float, y: float, w: float, item: dict, alpha: int):
    draw_round(draw, (x, y, w, 130), 9, rgb("#FFFFFF", alpha), outline=rgb(COLORS["border"], alpha), width=1)
    draw_ref_chip(draw, x + 18, y + 18, item["idx"], alpha)
    draw_text(draw, (x + 62, y + 23), item["title"], 16, COLORS["text"], weight=2, anchor="lm", alpha=alpha)
    draw_round(draw, (x + w - 96, y + 14, 70, 26), 999, rgb(COLORS["dangerSoft"], alpha), outline=rgb(COLORS["red"], alpha), width=1)
    draw_text(draw, (x + w - 61, y + 30), item["year"], 11, COLORS["red"], weight=2, anchor="mm", alpha=alpha)
    draw_text(draw, (x + 62, y + 49), f"{item['authors']} · {item['venue']}", 11, COLORS["muted"], weight=1, anchor="lm", alpha=alpha)
    for i, line in enumerate(item["abstract_lines"]):
        draw_text(draw, (x + 62, y + 78 + i * 18), line, 10, COLORS["subtle"], weight=1, anchor="lm", alpha=alpha)
    draw_action_button(draw, x + 62, y + 104, "查看详情", COLORS["red"], "#FFFFFF", alpha)
    draw_action_button(draw, x + 166, y + 104, "加入文献集", COLORS["greenSoft"], COLORS["green"], alpha, COLORS["green"])
    draw_action_button(draw, x + 282, y + 104, "继续追问", "#FFFFFF", COLORS["subtle"], alpha, COLORS["borderStrong"])


def draw_answer(draw: ImageDraw.ImageDraw, frame: int):
    p = fade(frame, 64, 76)
    alpha = int(255 * p)
    if alpha <= 0:
        return

    x, y, w, h = 64, 236 + lerp(14, 0, ease_out(p)), 832, 220
    draw_round(draw, (x, y, w, h), 10, rgb(COLORS["surface1"], alpha), outline=rgb(COLORS["borderStrong"], alpha), width=1.5)
    draw_round(draw, (x + 18, y + 16, 30, 30), 999, rgb(COLORS["dangerSoft"], alpha), outline=rgb(COLORS["red"], alpha), width=1.3)
    draw_claw_icon(draw, x + 33, y + 29, 0.17, COLORS["red"], alpha)
    draw_text(draw, (x + 62, y + 27), "找到 1 篇可优先阅读的参考文献。下面是基础信息：", 15, COLORS["text"], weight=1, anchor="lm", alpha=alpha)
    card_alpha = int(alpha * fade(frame, 72, 82))
    draw_reference_card(draw, x + 62, y + 58, 720, REFERENCE, card_alpha)


def draw_frame(frame: int) -> Image.Image:
    im = Image.new("RGBA", (W * S, H * S), rgb(COLORS["background"]))
    d = ImageDraw.Draw(im)
    draw_grid(d)
    draw_logo(im, d)
    chat = layer()
    cd = ImageDraw.Draw(chat)
    draw_chat_shell(cd)
    draw_composer(cd, frame)
    draw_user_message(cd, frame)
    draw_tool_calls(cd, frame)
    draw_answer(cd, frame)
    im.alpha_composite(chat)
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
