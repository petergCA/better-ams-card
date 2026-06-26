# Better AMS Card

A robust, theme-aware [Home Assistant](https://www.home-assistant.io/) Lovelace
card for **Bambu Lab AMS** units — built to fix the things the stock
[ha-bambulab](https://github.com/greghesp/ha-bambulab) AMS card gets awkward:

- ✅ **Every model rendered correctly** — AMS, AMS Lite, AMS 2 Pro, **AMS HT**
  and the external spool. The graphic is drawn with scalable CSS, so the tall
  single-spool **HT no longer blows the card up** to a giant portrait image.
- ✅ **Multiple AMS units in one card** — auto-discovered from the printer.
- ✅ **Auto-follow** — the unit and slot that's *actively printing* is
  highlighted automatically. No `input_select` hacks.
- ✅ **Per-slot detail** — filament type, colour swatch, remaining %, active
  highlight, tap → more-info.
- ✅ **Humidity / temperature / drying chips** per unit.
- ✅ **Theme-aware & sizable** — respects HA theme variables and a configurable
  slot height; stack or row layouts.

> Works with the `ha-bambulab` integration. Buildless single file — no toolchain.

---

## Installation

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories**
2. Add `https://github.com/petergCA/better-ams-card`, category **Dashboard**.
3. Install **Better AMS Card**, then reload your browser.

### Manual

1. Copy `better-ams-card.js` to `config/www/`.
2. Add a dashboard resource:
   `/local/better-ams-card.js` as a **JavaScript Module**.

---

## Usage

The simplest config — point it at your **printer device** and it discovers every
AMS unit attached to it:

```yaml
type: custom:better-ams-card
title: H2C
printer: 588de0eb4f4634b2feb57a0703a0411a   # printer device id
```

Or list AMS units explicitly:

```yaml
type: custom:better-ams-card
ams:
  - f614140a3991efffe7ed083ddbd64b0b   # AMS 1 device id
  - 110e434960ec2b68cd84c00f5420c5b2   # AMS 2 device id
  - 1a7566d65e5a3261d91c9606170ccbd8   # AMS HT device id
```

> **Finding device ids:** Settings → Devices & Services → Devices → open the AMS
> (or printer) → the id is in the URL, or use Developer Tools.

---

## Options

| Option           | Type             | Default   | Description |
|------------------|------------------|-----------|-------------|
| `printer`        | string           | —         | Printer **device id**. Auto-discovers AMS sub-devices and enables auto-follow. Either this or `ams` is required. |
| `ams`            | list of strings  | —         | Explicit AMS **device ids** to render (overrides discovery). |
| `title`          | string           | —         | Optional card title. |
| `view`           | `single` \| `all`| `single`  | `single` shows one unit with a built-in **Auto / per-AMS selector**; `all` shows every unit at once. |
| `chips`          | list             | —         | Custom entity chips shown in the card header (see below). |
| `auto_follow`    | boolean          | `true`    | In `single`/Auto, show whichever unit is printing; also highlights the active unit/slot. |
| `label_position` | `overlay`\|`below`| `overlay`| Show the filament-type label on the AMS bays (overlay) or in a row beneath the graphic. |
| `remaining`      | `percent`\|`bar`\|`none`| `percent` | How remaining filament is shown on each bay/label. |
| `unit_layout`    | `stack` \| `row` | `stack`   | When `view: all`, stack units vertically or lay them out in a row. |
| `height`         | number (px)      | `240`     | Height of each unit's graphic. Width follows the image aspect, so every unit lines up — and the tall HT no longer dominates. |
| `recolor`        | boolean          | `true`    | Re-colour each spool's filament in the artwork to the actual loaded colour. Set `false` to keep the stock artwork colours. |
| `blend`          | string           | `color`   | Blend mode for re-colouring: `color` (recommended), `multiply`, `hue`, `overlay`. |
| `images`         | map              | —         | Override the artwork per model, e.g. `{ "AMS 2 Pro": "/local/my-ams.png" }`. |
| `image_base`     | string           | (GitHub)  | Base URL for the bundled artwork. Point at a `/local/...` path for fully offline installs. |
| `show_chips`     | boolean          | `true`    | Show humidity / temperature / drying chips. |
| `show_labels`    | boolean          | `true`    | Show the filament-type label per slot. |
| `label_y`        | number (%)       | (per model)| Override the vertical position of the overlay bay labels. |
| `include_external` | boolean        | `false`   | Include the external spool when auto-discovering. |

### Single view + built-in selector

By default the card shows **one AMS at a time** with a small selector in the
header: **Auto** (follows whatever is actively printing) plus an entry for each
unit so you can pin a specific one. Your choice is remembered per browser — no
`input_select` helper required. Set `view: all` to show every unit stacked.

### Custom chips

Add any entities you like to the card header:

```yaml
type: custom:better-ams-card
printer: 588de0eb4f4634b2feb57a0703a0411a
title: H2C
chips:
  - entity: sensor.h2c_print_progress
    icon: mdi:progress-clock
  - entity: sensor.h2c_nozzle_temperature
    icon: mdi:printer-3d-nozzle-heat
    name: Nozzle          # optional prefix; otherwise just the value is shown
  - entity: binary_sensor.h2c_online
```

Each chip shows its icon + value and opens more-info on tap.

### Live spool re-colouring

The card renders the real AMS artwork, then tints each filament window to the
**actual loaded colour** (from the tray sensor's `color` attribute) using a CSS
blend — so the strand texture and lighting are kept while the colour matches
what's really in the bay. Empty bays are desaturated. Turn it off with
`recolor: false`, or tune the look with `blend:`.

---

## How auto-follow works

Each AMS tray sensor reports an `active` / `in_use` attribute while it is the
tray being printed from. The card highlights any such slot and marks its parent
unit — so with all your AMS units shown at once, the active one stands out
without you switching anything.

---

## Roadmap

- Optional per-model background images (plug in your own artwork).
- Visual config editor.
- Spoolman / remaining-weight integration.
- Nozzle / drying state animations.

---

## License

[MIT](LICENSE) © petergCA
