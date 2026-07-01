# Better AMS Card

A robust, theme-aware [Home Assistant](https://www.home-assistant.io/) Lovelace
card for **Bambu Lab AMS** units — built to fix the things the stock
[ha-bambulab](https://github.com/greghesp/ha-bambulab) AMS card gets awkward.

![Better AMS Card preview](https://raw.githubusercontent.com/petergCA/better-ams-card/main/images/preview.png)

- 🎨 **Live spool re-colouring** — the real AMS artwork, with each spool tinted
  to the **actual loaded filament colour** (keeps the strand texture, shifts the
  hue). Empty/idle bays are dimmed so the in-use one pops.
- 🧩 **Every model, correctly sized** — AMS, AMS Lite, AMS 2 Pro, **AMS HT** and
  the external spool. The tall single-spool **HT no longer blows the card up**.
- 🔄 **Single view + built-in selector** — shows one AMS at a time with an
  **Auto / per-AMS** dropdown packaged right in the card (remembered per
  browser). Auto follows whatever is printing. No `input_select` helper.
- 🏷️ **Per-slot detail** — filament type on each bay, remaining %, tap → more-info.
- 💧 **Humidity / temperature / drying chips**, plus **custom chips** for any
  entity you like.
- 🎚️ **Theme-aware & sizable** — respects HA theme variables, configurable height.

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

Point the card at your **printer** and it **auto-discovers every AMS attached to
it** — each AMS reports to Home Assistant as a sub-device of the printer, so you
don't list them. `printer` accepts a **device id _or_ any entity from the
printer** (entities are easier to find):

```yaml
# Easiest — reference any entity that belongs to the printer:
type: custom:better-ams-card
title: H2C
printer: sensor.h2c_print_progress
```

```yaml
# Or use the printer's device id:
type: custom:better-ams-card
title: H2C
printer: 588de0eb4f4634b2feb57a0703a0411a
```

Prefer to list AMS units explicitly? `ams` entries are also device ids **or**
entity ids (any entity from each AMS):

```yaml
type: custom:better-ams-card
ams:
  - sensor.x1c_ams_humidity          # entity from the AMS  → resolves its device
  - 1a7566d65e5a3261d91c9606170ccbd8 # …or the AMS device id directly
```

### Finding the reference

- **By entity (recommended):** Settings → Devices & Services → **Entities**, search
  for your printer/AMS (e.g. `humidity`, `nozzle`, `progress`), and copy the
  entity id. Any entity belonging to the printer works for `printer:`.
- **By device id:** Settings → Devices & Services → **Devices** → open the printer
  (or AMS) → the id is the long hex string in the page URL
  (`/config/devices/device/<id>`).

---

## Options

| Option           | Type             | Default   | Description |
|------------------|------------------|-----------|-------------|
| `printer`        | string           | —         | Printer **device id** _or_ any **entity id** from the printer. Auto-discovers the AMS sub-devices. Either this or `ams` is required. |
| `ams`            | list of strings  | —         | Explicit AMS **device ids or entity ids** (overrides discovery). |
| `title`          | string           | —         | Optional card title (top-left). |
| `show_title`     | boolean          | `true`    | Set `false` to hide the title text while keeping `title` set. |
| `view`           | `single` \| `all`| `single`  | `single` shows one unit with a built-in **Auto / per-AMS selector**; `all` shows every unit at once. |
| `chips`          | list             | —         | Custom entity chips shown in the card header (see below). |
| `auto_follow`    | boolean          | `true`    | In `single`/Auto, show whichever unit is printing. |
| `dim_inactive`   | boolean          | `true`    | Dim non-active / empty spools so the in-use filament stands out. |
| `highlight_unit` | boolean          | `false`   | Draw the accent border around the active unit card. |
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

Add any entities you like to the card header (right side, next to the selector):

```yaml
chips:
  # simple value chip
  - entity: sensor.chamber_temperature
    icon: mdi:thermometer
    round: true            # round a numeric state
    unit: true             # append the entity's unit ("83 °F"); or unit: "%"

  # status chip with per-state text + colour
  - entity: binary_sensor.x1c_hms_errors
    icon: mdi:alert-circle-outline
    name: HMS              # optional static prefix
    map: { on: Errors, off: OK }
    colors: { on: "#E24B4A", off: "#1D9E75" }

  # a toggle (e.g. an enclosure fan)
  - entity: switch.air_filter
    icon: mdi:air-filter
    name: Bento
    map: { on: "On", off: "Off" }
    tap_action: toggle     # default is more-info

  # only show while actually printing
  - entity: sensor.x1c_print_weight
    icon: mdi:weight-gram
    name: Weight
    round: true
    unit: true
    hide_when:
      entity: sensor.x1c_print_status      # optional; defaults to this chip's entity
      states: [unavailable, offline, idle]  # hide the chip in any of these states
```

Per-chip options: `entity` (required), `icon`, `name`, `map` (state→text),
`colors` (state→icon colour), `color` (static), `round`, `unit`
(`true` or a literal like `"%"`), `tap_action` (`more-info` | `toggle`),
`hide_when` (`{ entity?, states: [...] }` — hide the chip when the gate
entity's state, case-insensitive, is one of `states`; `entity` defaults to
the chip's own).

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

- Visual config editor.
- Spoolman / remaining-weight integration.
- Per-model recolour calibration for AMS Lite / external spool.
- Nozzle / drying state animations.

---

## License

[MIT](LICENSE) © petergCA
