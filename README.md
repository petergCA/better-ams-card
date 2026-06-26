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
| `auto_follow`    | boolean          | `true`    | Highlight the unit/slot currently being printed from. |
| `unit_layout`    | `stack` \| `row` | `stack`   | Stack units vertically or lay them out in a row. |
| `height`         | number (px)      | `150`     | Height of each spool graphic. |
| `show_chips`     | boolean          | `true`    | Show humidity / temperature / drying chips. |
| `show_labels`    | boolean          | `true`    | Show the filament-type label under each slot. |
| `show_remaining` | boolean          | `true`    | Show the remaining-filament bar under each slot. |
| `include_external` | boolean        | `false`   | Include the external spool when auto-discovering. |

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
