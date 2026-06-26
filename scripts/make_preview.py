#!/usr/bin/env python3
"""Render a faithful README preview from the real AMS artwork.

Replicates the card's CSS `mix-blend-mode: color` (SetLum) per pixel so the
preview matches what the card actually draws. Run from the repo root:

    python3 scripts/make_preview.py
"""
from PIL import Image, ImageDraw, ImageFont

AR = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARB = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
def font(sz, bold=False): return ImageFont.truetype(ARB if bold else AR, sz)

ACCENT = (255, 152, 0)
CARD = (28, 31, 39); UNIT = (40, 43, 51); TXT = (236, 238, 240); SEC = (165, 169, 177); CHIP = (62, 65, 73)

# ---- CSS 'color' blend (W3C SetLum) ----
def lum(r, g, b): return 0.3 * r + 0.59 * g + 0.11 * b
def clip(r, g, b):
    L = lum(r, g, b); n = min(r, g, b); x = max(r, g, b)
    if n < 0 and L != n:
        r = L + (r - L) * L / (L - n); g = L + (g - L) * L / (L - n); b = L + (b - L) * L / (L - n)
    if x > 255 and x != L:
        r = L + (r - L) * (255 - L) / (x - L); g = L + (g - L) * (255 - L) / (x - L); b = L + (b - L) * (255 - L) / (x - L)
    return r, g, b
def set_lum(c, L):
    d = L - lum(*c); return clip(c[0] + d, c[1] + d, c[2] + d)

def recolor(img, box, color):
    x0, y0, x1, y1 = box; px = img.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 8: continue
            nr, ng, nb = set_lum(color, lum(r, g, b))
            px[x, y] = (int(max(0, min(255, nr))), int(max(0, min(255, ng))), int(max(0, min(255, nb))), a)
def desaturate(img, box, dark=0.0):
    x0, y0, x1, y1 = box; px = img.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 8: continue
            L = int(lum(r, g, b) * (1 - dark)); px[x, y] = (L, L, L, a)

# Calibrated filament windows (must match MODELS["ams 2 pro"].windows in the card)
WINS = [(8.6, 7, 15.0, 37), (31.1, 7, 15.0, 37), (53.4, 7, 15.0, 37), (76.2, 7, 15.0, 37)]
SLOTS = [
    dict(type="PLA",  color=(225, 225, 225), pct=60, active=False, empty=False),
    dict(type="PETG", color=(46, 111, 176),  pct=80, active=False, empty=False),
    dict(type="PLA",  color=(224, 119, 43),   pct=45, active=True,  empty=False),
    dict(type="",     color=None,             pct=None, active=False, empty=True),
]

ams = Image.open("images/ams2pro.png").convert("RGBA")
GW = 520; GH = int(GW * ams.height / ams.width)
ams = ams.resize((GW, GH), Image.LANCZOS)
def box(w):
    x, y, ww, hh = w
    return (int(x / 100 * GW), int(y / 100 * GH), int((x + ww) / 100 * GW), int((y + hh) / 100 * GH))

for w, s in zip(WINS, SLOTS):
    b = box(w)
    if s["empty"]:
        desaturate(ams, b, dark=0.35)
    else:
        recolor(ams, b, s["color"])

veil = Image.new("RGBA", ams.size, (0, 0, 0, 0)); vd = ImageDraw.Draw(veil)
for w, s in zip(WINS, SLOTS):
    if not s["active"]:
        x0, y0, x1, y1 = box(w); vd.rounded_rectangle([x0, y0, x1, y1], radius=6, fill=(0, 0, 0, 120))
ams = Image.alpha_composite(ams, veil)

def bay_label(img, cx, cy, type_, pct, active, dim):
    d = ImageDraw.Draw(img); f1 = font(17, True); f2 = font(13)
    lines = [type_ if type_ else "Empty"] + ([f"{pct}%"] if pct is not None else [])
    w1 = d.textlength(lines[0], font=f1); w2 = d.textlength(lines[1], font=f2) if len(lines) > 1 else 0
    bw = int(max(w1, w2)) + 22; bh = (26 if len(lines) > 1 else 18) + 12
    x0 = int(cx - bw / 2); y0 = int(cy - bh / 2)
    alpha = 255 if active else (130 if dim else 200)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0)); ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=8,
                         fill=(0, 0, 0, int(0.78 * alpha) if active else int(0.62 * alpha)),
                         outline=ACCENT if active else (255, 255, 255, 40), width=2 if active else 1)
    img.alpha_composite(layer)
    d = ImageDraw.Draw(img); col = (255, 255, 255, alpha)
    ty = y0 + (5 if len(lines) > 1 else 6)
    d.text((cx - w1 / 2, ty), lines[0], font=f1, fill=col)
    if len(lines) > 1:
        d.text((cx - w2 / 2, ty + 18), lines[1], font=f2, fill=(255, 255, 255, int(alpha * 0.85)))

for w, s in zip(WINS, SLOTS):
    x, y, ww, hh = w; cx = int((x + ww / 2) / 100 * GW); cy = int(0.84 * GH)
    bay_label(ams, cx, cy, s["type"], s["pct"], s["active"], dim=not s["active"])

PAD = 18; UPAD = 12
CW = GW + PAD * 2 + UPAD * 2
header_h = 44; uhead_h = 30
CH = PAD + header_h + UPAD + uhead_h + GH + UPAD + PAD
canvas = Image.new("RGBA", (CW, CH), CARD + (255,)); d = ImageDraw.Draw(canvas)
d.text((PAD + 4, PAD + 8), "H2C", font=font(22, True), fill=TXT)
tw = d.textlength("Auto", font=font(15, True)); px0 = PAD + 70
d.rounded_rectangle([px0, PAD + 6, px0 + tw + 44, PAD + 34], radius=14, fill=CHIP)
d.text((px0 + 26, PAD + 11), "Auto", font=font(15, True), fill=TXT)
d.polygon([(px0 + tw + 30, PAD + 18), (px0 + tw + 38, PAD + 18), (px0 + tw + 34, PAD + 24)], fill=SEC)
d.ellipse([px0 + 10, PAD + 15, px0 + 20, PAD + 25], outline=SEC, width=2)
def chip(x, txt):
    w = d.textlength(txt, font=font(14, True)) + 34
    d.rounded_rectangle([x, PAD + 6, x + w, PAD + 34], radius=14, fill=CHIP)
    d.text((x + 26, PAD + 11), txt, font=font(14, True), fill=TXT)
    return w
t2 = d.textlength("30°C", font=font(14, True)) + 34; t1 = d.textlength("21%", font=font(14, True)) + 34
cx2 = CW - PAD - t2; cx1 = cx2 - 8 - t1
chip(cx1, "21%"); chip(cx2, "30°C")
d.ellipse([cx1 + 9, PAD + 15, cx1 + 19, PAD + 25], fill=(80, 170, 240))
d.rounded_rectangle([cx2 + 11, PAD + 13, cx2 + 15, PAD + 27], radius=2, fill=(240, 140, 90))
uy0 = PAD + header_h
d.rounded_rectangle([PAD, uy0, CW - PAD, CH - PAD], radius=14, fill=UNIT, outline=(70, 73, 81), width=1)
d.text((PAD + UPAD, uy0 + 8), "H2C AMS 2", font=font(15, True), fill=TXT)
d.ellipse([PAD + UPAD + 92, uy0 + 13, PAD + UPAD + 101, uy0 + 22], fill=ACCENT)
canvas.alpha_composite(ams, (PAD + UPAD, uy0 + uhead_h))
canvas.convert("RGB").save("images/preview.png", quality=92)
print("wrote images/preview.png", canvas.size)
