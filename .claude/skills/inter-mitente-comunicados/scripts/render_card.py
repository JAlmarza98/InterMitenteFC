#!/usr/bin/env python3
"""Renders an official Inter Mitente communication as a WhatsApp-ready PNG.

Same visual recipe as the app's own callup card
(frontend/src/app/features/matches/formation/pitch-canvas-renderer.ts):
navy gradient with an amber and a violet "floodlight" glow, the crest,
"INTER MITENTE" in amber, a white Bricolage title, and the content on a
translucent glass panel. Only needs Pillow.

Example:
  python render_card.py --out comunicado.png --kind "Convocatoria" \\
    --title "Jornada 5 vs Los Kiurchx" --subtitle "Domingo 22 de noviembre" \\
    --detail "Hora=18:45" --detail "Campo=Polideportivo Andrés Torrejón" \\
    --body "Hay que estar 30 minutos antes para calentar." \\
    --bullet "Equipación azul" --bullet "Traed agua"
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"

# Brand tokens, mirrored from the app (styles.scss / theme-palettes.scss).
NAVY_TOP = (26, 32, 42)  # #1a202a
NAVY_BOTTOM = (14, 19, 29)  # #0e131d
AMBER = (255, 157, 0)  # #ff9d00 --accent-amber: club name, labels, accent pills
VIOLET = (171, 117, 248)  # #ab75f8 --accent-violet: secondary accent
GREEN = (62, 207, 142)  # #3ecf8e good news (win, confirmed)
RED = (255, 107, 107)  # bad news (cancelled, sanction)
ON_ACCENT = (22, 28, 38)  # #161c26 dark text on any filled accent, never white
WHITE = (255, 255, 255)
PANEL_FILL = (219, 227, 242, 13)  # glass card, ~5% white
PANEL_BORDER = (191, 199, 214, 46)  # ~18%

TONES = {"amber": AMBER, "violet": VIOLET, "green": GREEN, "red": RED}

WIDTH = 1080
MIN_HEIGHT = 1350  # 4:5, what WhatsApp shows uncropped in the chat
MARGIN = 48  # panel margin, same as the callup card
PAD = 52  # inside the panel


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


DISPLAY = lambda s: font("BricolageGrotesque-ExtraBold.ttf", s)  # noqa: E731
BODY = lambda s: font("Manrope-Medium.ttf", s)  # noqa: E731
BODY_BOLD = lambda s: font("Manrope-Bold.ttf", s)  # noqa: E731
BODY_XBOLD = lambda s: font("Manrope-ExtraBold.ttf", s)  # noqa: E731


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words, line = paragraph.split(), ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if draw.textlength(candidate, font=fnt) <= max_width or not line:
                line = candidate
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def background(height: int) -> Image.Image:
    """Navy diagonal gradient plus the two glows of the app's body background."""
    img = Image.new("RGB", (WIDTH, height))
    px = img.load()
    gx, gy = WIDTH * 0.3, height  # gradient axis, as in the app: (0,0) -> (0.3w, h)
    norm = gx * gx + gy * gy
    for y in range(height):
        for x in range(0, WIDTH, 4):  # 4px columns: smooth enough, much faster
            t = min(1.0, max(0.0, (x * gx + y * gy) / norm))
            c = tuple(round(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOTTOM))
            for dx in range(4):
                px[x + dx, y] = c
    for (cx, cy, radius, color, alpha) in (
        (WIDTH * 0.9, 0, WIDTH * 0.9, AMBER, 0.16),
        (WIDTH * -0.05, height * 0.35, WIDTH, VIOLET, 0.12),
    ):
        glow = Image.new("L", (WIDTH, height))
        gp = glow.load()
        for y in range(0, height, 2):
            for x in range(0, WIDTH, 2):
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                v = round(255 * alpha * max(0.0, 1 - d / radius))
                gp[x, y] = gp[min(x + 1, WIDTH - 1), y] = v
                if y + 1 < height:
                    gp[x, y + 1] = gp[min(x + 1, WIDTH - 1), y + 1] = v
        img = Image.composite(Image.new("RGB", (WIDTH, height), color), img, glow)
    return img


def pill(draw, x: int, y: int, text: str, fnt, fill, text_fill=ON_ACCENT, pad_x=26, height=52) -> int:
    """Filled rounded pill (the app's badge/slot recipe); returns its width."""
    width = int(draw.textlength(text, font=fnt)) + pad_x * 2
    draw.rounded_rectangle((x, y, x + width, y + height), radius=height // 2, fill=fill)
    draw.text((x + width / 2, y + height / 2 + 1), text, font=fnt, fill=text_fill, anchor="mm")
    return width


def layout(draw, args, inner: int):
    """Measures the panel content: returns (height, draw callback)."""
    ops = []
    y = 0
    if args.detail:
        details = [(label.strip().upper(), value.strip()) for label, _, value in (d.partition("=") for d in args.detail)]
        # Label column just as wide as the longest label, so values get the room.
        label_w = max(int(draw.textlength(label, font=BODY_XBOLD(24))) for label, _ in details) + 36
        for label, value in details:
            value_lines = wrap(draw, value, BODY_BOLD(34), inner - label_w)
            ops.append(("detail", y, label, value_lines, label_w))
            y += max(1, len(value_lines)) * 46 + 18
        y += 18
    if args.body:
        for paragraph in args.body:
            lines = wrap(draw, paragraph, BODY(32), inner)
            ops.append(("text", y, lines))
            y += len(lines) * 46 + 24
    if args.bullet:
        for item in args.bullet:
            lines = wrap(draw, item, BODY(32), inner - 40)
            ops.append(("bullet", y, lines))
            y += len(lines) * 46 + 14
    return max(y - 14, 0), ops


def render(args) -> Image.Image:
    probe = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    inner = WIDTH - 2 * MARGIN - 2 * PAD
    title_lines = wrap(probe, args.title, DISPLAY(58), WIDTH - 2 * MARGIN)
    content_h, ops = layout(probe, args, inner)

    header_h = 40 + 104 + 18 + 30 + 24 + 70 + len(title_lines) * 68 + (44 if args.subtitle else 0) + 40
    panel_h = content_h + 2 * PAD if ops else 0
    footer_h = 110
    height = max(MIN_HEIGHT, header_h + panel_h + footer_h)

    img = background(height).convert("RGBA")
    draw = ImageDraw.Draw(img)
    cx = WIDTH // 2
    tone = TONES[args.tone]

    # Header: crest, club name, kind pill, title, subtitle — centered like the
    # callup card. Short content is centered vertically above the footer.
    y = 40 + (height - (header_h + panel_h + footer_h)) // 2
    crest = Image.open(ROOT / "assets" / "crest.png").convert("RGBA")
    crest_h = 104
    crest = crest.resize((round(crest.width * crest_h / crest.height), crest_h), Image.LANCZOS)
    img.alpha_composite(crest, (cx - crest.width // 2, y))
    y += crest_h + 18
    draw.text((cx, y + 15), "INTER MITENTE", font=DISPLAY(30), fill=AMBER, anchor="mm")
    y += 30 + 24
    kind = args.kind.upper()
    kind_w = int(draw.textlength(kind, font=BODY_XBOLD(24))) + 52
    pill(draw, cx - kind_w // 2, y, kind, BODY_XBOLD(24), tone, height=46)
    y += 46 + 24
    for line in title_lines:
        draw.text((cx, y + 34), line, font=DISPLAY(58), fill=WHITE, anchor="mm")
        y += 68
    if args.subtitle:
        draw.text((cx, y + 22), args.subtitle, font=BODY(30), fill=(255, 255, 255, 178), anchor="mm")
        y += 44
    y += 40

    # Glass panel with the content.
    if ops:
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        box = (MARGIN, y, WIDTH - MARGIN, y + panel_h)
        od.rounded_rectangle(box, radius=28, fill=PANEL_FILL, outline=PANEL_BORDER, width=2)
        img.alpha_composite(overlay)
        draw = ImageDraw.Draw(img)
        left, top = MARGIN + PAD, y + PAD
        for op in ops:
            if op[0] == "detail":
                _, oy, label, value_lines, label_w = op
                draw.text((left, top + oy + 23), label, font=BODY_XBOLD(24), fill=tone, anchor="lm")
                for i, line in enumerate(value_lines):
                    draw.text((left + label_w, top + oy + 23 + i * 46), line, font=BODY_BOLD(34), fill=WHITE, anchor="lm")
            elif op[0] == "text":
                _, oy, lines = op
                for i, line in enumerate(lines):
                    draw.text((left, top + oy + i * 46), line, font=BODY(32), fill=(255, 255, 255, 230))
            else:
                _, oy, lines = op
                draw.ellipse((left + 2, top + oy + 15, left + 18, top + oy + 31), fill=tone)
                for i, line in enumerate(lines):
                    draw.text((left + 40, top + oy + i * 46), line, font=BODY(32), fill=(255, 255, 255, 230))
        y += panel_h

    # Footer: signature, quiet.
    footer = args.footer or "Inter Mitente FC"
    draw.text((cx, height - 60), footer, font=BODY_BOLD(24), fill=(255, 255, 255, 128), anchor="mm")
    return img.convert("RGB")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", required=True, help="PNG output path")
    p.add_argument("--kind", default="Comunicado", help="Short tag: Comunicado, Convocatoria, Aviso, Resultado...")
    p.add_argument("--tone", choices=sorted(TONES), default="amber", help="Accent: amber (default), violet, green (good news), red (bad news)")
    p.add_argument("--title", required=True, help="Headline, short (one or two lines)")
    p.add_argument("--subtitle", help="One line under the title: date, matchday...")
    p.add_argument("--detail", action="append", help='Key fact as "Label=Value" (Hora=18:45). Repeatable.')
    p.add_argument("--body", action="append", help="A paragraph. Repeatable.")
    p.add_argument("--bullet", action="append", help="A list item. Repeatable.")
    p.add_argument("--footer", help='Signature line (default "Inter Mitente FC")')
    args = p.parse_args()
    render(args).save(args.out, optimize=True)
    print(args.out)


if __name__ == "__main__":
    main()
