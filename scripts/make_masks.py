#!/usr/bin/env python3
"""Generate the per-model filament alpha masks used by better-ams-card.

The card recolours each slot by drawing a colour layer in `mix-blend-mode: color`
and clipping it to one of these masks. The mask is a *graduated* alpha:

  • full opacity over the strand bundle behind the lid,
  • reduced opacity over the translucent feeder area (so it reads as a subtle glow,
    not a solid block — matching the darker AMS 2 Pro look),
  • zero below that (the grey spool hub stays grey),
  • and hard carve-outs (alpha 0) for the amber gears, the moulded "Bambu Lab AMS …"
    logo, the central silver sensor button, the front grey ledge/rails and other
    bright structural elements, so all of those read *in front* of the colour.

Run from the repo root:  python3 scripts/make_masks.py
Outputs images/ams2pro_mask.png and images/ams_mask.png (native resolution, L mode).
"""
import colorsys
from PIL import Image, ImageDraw, ImageFilter


def hsv_of(px, x, y):
    return colorsys.rgb_to_hsv(*[c / 255 for c in px[x, y]])


def col_alpha(yp, p):
    """Vertical opacity profile (yp = y as a fraction of height)."""
    yt, tf = p["y_top"], p["top_feather"]
    ysb, yfb, bf = p["y_strand_bot"], p["y_feeder_bot"], p["bot_feather"]
    fa = p["feeder_alpha"]
    if yp < yt or yp >= yfb + bf:
        return 0
    if yp < yt + tf:                       # soft top edge
        return int(255 * (yp - yt) / tf)
    if yp < ysb:                           # full strand
        return 255
    if yp < yfb:                           # subtle feeder
        return fa
    return int(fa * (1 - (yp - yfb) / bf))  # fade out above the hub


def build(src, bands, profile, gear, logo, ledge, button=None, bar=None):
    im = Image.open(src).convert("RGB")
    W, H = im.size
    px = im.load()

    # Graduated white columns per bay.
    cols = Image.new("L", (W, H), 0)
    cpx = cols.load()
    for xl, xr in bands:
        x0, x1 = int(xl * W), int(xr * W)
        for y in range(H):
            a = col_alpha(y / H, profile)
            if a:
                for x in range(x0, x1):
                    cpx[x, y] = a

    # Hard carve-outs (dilated, then subtracted).
    protect = Image.new("L", (W, H), 0)
    pp = protect.load()

    def carve_hsv(y0, y1, x0, x1, test):
        for y in range(int(y0 * H), int(y1 * H)):
            for x in range(int(x0 * W), int(x1 * W)):
                if test(*hsv_of(px, x, y)):
                    pp[x, y] = 255

    # amber feeder gears
    carve_hsv(gear["y0"], gear["y1"], 0, 1,
              lambda h, s, v: s > gear["s"] and v > gear["v"] and gear["h0"] <= h * 360 <= gear["h1"])
    # (grey ledge/bar carve intentionally disabled — reverted)
    if ledge:
        carve_hsv(ledge["y0"], ledge["y1"], 0, 1,
                  lambda h, s, v: s < ledge["s"] and ledge["v_lo"] <= v <= ledge.get("v_hi", 1.0))

    # Solid full-width strip carve — the front grey rail/ledge the user flagged: that
    # whole horizontal band stays uncoloured, in front of the filament.
    if bar:
        for y in range(int(bar["y0"] * H), int(bar["y1"] * H)):
            for x in range(W):
                pp[x, y] = 255
    # moulded logo text
    carve_hsv(logo["y0"], logo["y1"], 0.50, 1,
              lambda h, s, v: v > logo["v"] and s < logo["s"])
    # central silver sensor button (regular AMS only)
    if button:
        carve_hsv(button["y0"], button["y1"], button["x0"], button["x1"],
                  lambda h, s, v: s < button["s"] and v > button["v"])

    protect = protect.filter(ImageFilter.MaxFilter(5))

    mask = Image.new("L", (W, H), 0)
    mpx = mask.load()
    ppx = protect.load()
    for y in range(H):
        for x in range(W):
            if cpx[x, y] and not ppx[x, y]:
                mpx[x, y] = cpx[x, y]
    return mask.filter(ImageFilter.GaussianBlur(0.7))


def main():
    # AMS 2 Pro (1790x1090) — keep the strong feeder look; the front rail is a MID grey
    # (V~0.35) so the ledge carve matches a value range, not just bright grey.
    build(
        "images/ams2pro.png",
        bands=[(0.098, 0.240), (0.308, 0.465), (0.531, 0.688), (0.758, 0.916)],
        profile=dict(y_top=0.072, top_feather=0.013, y_strand_bot=0.495,
                     y_feeder_bot=0.715, bot_feather=0.02, feeder_alpha=225),
        gear=dict(y0=0.53, y1=0.76, h0=15, h1=55, s=0.35, v=0.18),
        ledge=None,
        logo=dict(y0=0.48, y1=0.595, v=0.60, s=0.28),
    ).save("images/ams2pro_mask.png")
    print("wrote images/ams2pro_mask.png")

    # Regular AMS (1698x1094) — back to the richer full-opacity column (the dialled-back
    # version read worse), keeping the slot-1 containment fix + the same mid-grey bar carve.
    build(
        "images/ams.png",
        bands=[(0.103, 0.240), (0.297, 0.455), (0.528, 0.686), (0.754, 0.915)],
        profile=dict(y_top=0.08, top_feather=0.013, y_strand_bot=0.505,
                     y_feeder_bot=0.745, bot_feather=0.02, feeder_alpha=255),
        gear=dict(y0=0.52, y1=0.74, h0=18, h1=60, s=0.30, v=0.20),
        ledge=None,
        logo=dict(y0=0.53, y1=0.605, v=0.62, s=0.26),
        button=dict(x0=0.44, x1=0.56, y0=0.42, y1=0.54, s=0.18, v=0.42),
    ).save("images/ams_mask.png")
    print("wrote images/ams_mask.png")


if __name__ == "__main__":
    main()
