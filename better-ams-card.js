/**
 * better-ams-card
 * A robust, theme-aware Lovelace card for Bambu Lab AMS units.
 *
 * - Renders every AMS model with the real product artwork, sized so nothing
 *   (looking at you, AMS HT) blows the card up.
 * - Re-colours each spool's filament in the image to the ACTUAL loaded colour
 *   using a blend-mode overlay (keeps the strand texture, shifts the hue).
 * - Multiple AMS units per printer, auto-discovered; auto-highlights whichever
 *   unit/slot is actively printing.
 * - Per-slot filament/colour/remaining detail, humidity/temp/drying chips, plus
 *   fully custom user chips (any entity).
 *
 * Works with the ha-bambulab integration (greghesp).
 *
 * https://github.com/petergCA/better-ams-card
 */

const VERSION = "0.8.1";

// Default location for the bundled artwork. Raw GitHub resolves on any install
// with internet (HACS does not serve a plugin's extra files). Override with
// `image_base:` (e.g. "/local/better-ams-card/images/") for offline/local use.
let IMAGE_BASE = "https://raw.githubusercontent.com/petergCA/better-ams-card/main/images/";

/**
 * Per-model layout + image calibration.
 * windows[] are the filament strand regions as % of the image box
 * (x = left, y = top, w = width, h = height). A model with `image` + `windows`
 * renders in image mode with live re-colouring; otherwise it falls back to a
 * scalable CSS spool drawing (which already uses the real colour directly).
 */
const MODELS = {
  "ams 2 pro": {
    // v2 LAYERED render: a pre-composited base (dome/smoke/housing/shading with
    // coils in neutral grayscale) + a coil mask. Each bay's filament colour is
    // multiplied onto its coil region only — correct for every colour incl. white.
    slots: 4, label: "AMS 2 Pro",
    base: "ams2pro_base.png", coil: "ams2pro_coil.png", natW: 1902, natH: 1163,
    // per-bay horizontal clip for the multiply overlay: inset(0 r% 0 l%)
    bays: [
      { l: 0,    r: 72.4 },
      { l: 27.6, r: 50.2 },
      { l: 49.8, r: 28.3 },
      { l: 71.7, r: 0 },
    ],
    bayX: [16.6, 38.7, 60.9, 82.5], labelY: 84, emptyTint: "#3f3f3f",
  },
  "ams": {
    slots: 4, label: "AMS", image: "ams.png", natW: 1698, natH: 1094,
    emptyMask: true,   // high-res art with coloured backing → desaturate empties
    labelY: 79, bayX: [16.5, 37.6, 60.7, 83.6],
    // Each slot: main strand window + two flank masks that recolour the filament
    // visible either side of the feeder gear cluster (centre left untinted).
    windows: [
      [{ x: 9.5, y: 7, w: 16.5, h: 52 }, { x: 9.5, y: 59, w: 3.6, h: 13 }, { x: 19.8, y: 59, w: 6.2, h: 13 }],
      [{ x: 29.7, y: 7, w: 16, h: 52 }, { x: 29.7, y: 59, w: 5.6, h: 13 }, { x: 42.2, y: 59, w: 3.5, h: 13 }],
      [{ x: 52.8, y: 7, w: 16, h: 52 }, { x: 52.9, y: 59, w: 4.8, h: 13 }, { x: 64.5, y: 59, w: 4.3, h: 13 }],
      [{ x: 75.6, y: 7, w: 16, h: 52 }, { x: 75.7, y: 59, w: 4.7, h: 13 }, { x: 86.9, y: 59, w: 4.7, h: 13 }],
    ],
  },
  "ams ht": {
    slots: 1, label: "AMS HT", image: "official_amsht.png", natW: 171, natH: 360, labelY: 80,
    windows: [{ x: 22, y: 14, w: 56, h: 24 }],
  },
  "ams lite": { slots: 4, label: "AMS Lite" },       // CSS fallback
  "external spool": { slots: 1, label: "External" }, // CSS fallback
};

function normaliseModel(model) {
  return String(model || "").trim().toLowerCase();
}

function modelMeta(model) {
  const key = normaliseModel(model);
  if (MODELS[key]) return MODELS[key];
  if (key.includes("ht")) return MODELS["ams ht"];
  if (key.includes("external")) return MODELS["external spool"];
  if (key.includes("lite")) return MODELS["ams lite"];
  if (key.includes("ams")) return MODELS["ams"];
  return { slots: 4, label: model || "AMS" };
}

class BetterAmsCard extends HTMLElement {
  static getStubConfig(hass) {
    let printer;
    try {
      for (const id in (hass?.devices || {})) {
        const m = normaliseModel(hass.devices[id].model);
        if (/^(x1|p1|a1|h2)/.test(m) || m.includes("carbon")) { printer = id; break; }
      }
    } catch (e) { /* ignore */ }
    return { printer, auto_follow: true };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = null;
  }

  setConfig(config) {
    if (!config) throw new Error("better-ams-card: missing config");
    if (!config.printer && !config.ams) {
      throw new Error(
        "better-ams-card: provide 'printer' (a printer device id OR any entity from " +
        "the printer — auto-discovers its AMS units), or an explicit 'ams' list " +
        "(device ids or entity ids)."
      );
    }
    this._config = {
      view: "single",        // single (one unit + selector) | all
      show_title: true,      // show the card title text (top-left)
      auto_follow: true,
      highlight_unit: false, // draw the accent border around the active unit card
      dim_inactive: true,    // dim non-active / empty spools so the in-use one pops
      show_chips: true,
      show_labels: true,     // filament type label on each bay
      label_position: "overlay", // overlay (on the graphic) | below
      remaining: "percent",  // percent | bar | none
      recolor: true,
      blend: "color",        // color | multiply | hue | overlay
      unit_layout: "stack",  // stack | row (only when view: all)
      height: 240,           // graphic height (px) — width follows the image aspect
      ...config,
    };
    if (this._config.image_base) IMAGE_BASE = this._config.image_base;
    this._selKey = "better-ams-card:" + (config.printer || (config.ams || []).join(","));
    this._selection = this._loadSelection();
    this._sig = null;
    if (this._hass) this._render();
  }

  _loadSelection() {
    try { return window.localStorage.getItem(this._selKey) || "auto"; }
    catch (e) { return "auto"; }
  }
  _saveSelection(v) {
    this._selection = v;
    try { window.localStorage.setItem(this._selKey, v); } catch (e) { /* ignore */ }
  }

  /** In single view, resolve which unit to show given the current selection. */
  _shownUnits(units) {
    if (this._config.view === "all" || units.length <= 1) return units;
    const sel = this._selection || "auto";
    if (sel !== "auto") {
      const u = units.find((x) => x.device_id === sel);
      if (u) return [u];
    }
    return [units.find((x) => x.active) || units[0]];
  }

  set hass(hass) { this._hass = hass; this._render(); }

  // ---- data resolution ---------------------------------------------------

  _entitiesForDevice(deviceId) {
    const reg = this._hass.entities || {};
    const out = [];
    for (const eid in reg) if (reg[eid].device_id === deviceId) out.push(eid);
    return out;
  }

  _deviceName(deviceId) {
    const d = (this._hass.devices || {})[deviceId];
    return (d && (d.name_by_user || d.name)) || deviceId;
  }

  /** Accept either a device id or an entity id (resolved to its device). */
  _resolveDeviceId(ref) {
    if (!ref || typeof ref !== "string") return null;
    if (ref.includes(".")) {                       // looks like an entity_id
      const e = (this._hass.entities || {})[ref];
      return e ? e.device_id : null;
    }
    return ref;                                    // already a device id
  }

  _resolveUnits() {
    const hass = this._hass, cfg = this._config;
    let ids = [];
    if (Array.isArray(cfg.ams) && cfg.ams.length) {
      ids = cfg.ams.map((r) => this._resolveDeviceId(r)).filter(Boolean);
    } else if (cfg.printer && hass.devices) {
      const printerDev = this._resolveDeviceId(cfg.printer);
      for (const id in hass.devices) {
        const d = hass.devices[id];
        if (d.via_device_id !== printerDev) continue;
        const m = normaliseModel(d.model);
        if (m.includes("ams") || (cfg.include_external && m.includes("external"))) ids.push(id);
      }
      ids.sort((a, b) => this._deviceName(a).localeCompare(
        this._deviceName(b), undefined, { numeric: true }));
    }
    return ids.map((id) => this._buildUnit(id)).filter(Boolean);
  }

  _buildUnit(deviceId) {
    const hass = this._hass;
    const dev = (hass.devices || {})[deviceId];
    if (!dev) return null;
    const meta = modelMeta(dev.model);
    const eids = this._entitiesForDevice(deviceId);

    const trays = [];
    let humidity, temperature, drying;
    for (const eid of eids) {
      if (/_tray_\d+$/.test(eid)) trays.push(eid);
      else if (/_humidity$/.test(eid)) humidity = eid;
      else if (/_temperature$/.test(eid)) temperature = eid;
      else if (/remaining_drying_time$/.test(eid)) drying = eid;
    }
    trays.sort((a, b) =>
      parseInt((a.match(/_tray_(\d+)$/) || [])[1] || "0", 10) -
      parseInt((b.match(/_tray_(\d+)$/) || [])[1] || "0", 10));

    const slots = trays.map((eid) => {
      const st = hass.states[eid];
      const a = (st && st.attributes) || {};
      const empty = !st || ["Empty", "unknown", "unavailable"].includes(st.state);
      return {
        entity_id: eid,
        empty,
        color: normaliseColor(a.color),
        type: a.type || (empty ? "" : (st ? st.state : "")),
        name: a.name || (st ? st.state : ""),
        remain: typeof a.remain === "number" ? a.remain : null,
        active: !!(a.active || a.in_use),
      };
    });

    return {
      device_id: deviceId, name: this._deviceName(deviceId), model: dev.model, meta,
      slots, humidity, temperature, drying, active: slots.some((s) => s.active),
    };
  }

  _signature(units, shown) {
    const hass = this._hass, cfg = this._config;
    const parts = [cfg.title || "", cfg.height, cfg.blend, cfg.recolor ? 1 : 0, cfg.unit_layout,
      cfg.view, cfg.remaining, cfg.label_position, this._selection,
      "shown:" + shown.map((u) => u.device_id).join(",")];
    for (const c of (cfg.chips || [])) {
      const st = hass.states[c.entity];
      parts.push("chip", c.entity, st ? st.state : "");
      if (c.hide_when && c.hide_when.entity) {
        const gs = hass.states[c.hide_when.entity];
        parts.push("gate", c.hide_when.entity, gs ? gs.state : "");
      }
    }
    for (const u of units) {
      parts.push(u.device_id, u.name, u.model);
      for (const s of u.slots) parts.push(s.type, s.color, s.remain, s.active ? 1 : 0, s.empty ? 1 : 0);
      for (const eid of [u.humidity, u.temperature, u.drying]) {
        const st = eid && hass.states[eid];
        parts.push(st ? st.state : "");
      }
    }
    return parts.join("|");
  }

  // ---- rendering ---------------------------------------------------------

  _render() {
    if (!this._hass || !this._config) return;
    let units;
    try { units = this._resolveUnits(); }
    catch (e) { this._renderError(String(e)); return; }

    if (!units.length) {
      this._renderError("No AMS units found. Check the 'printer' device id, or pass an explicit 'ams' list.");
      return;
    }

    const shown = this._shownUnits(units);
    const sig = this._signature(units, shown);
    if (sig === this._sig) return;
    this._sig = sig;

    const cfg = this._config;
    const header = this._headerHtml(units);
    const unitsHtml = shown.map((u) => this._unitHtml(u)).join("");

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        ${header}
        <div class="units ${cfg.unit_layout === "row" ? "row" : "stack"}">${unitsHtml}</div>
      </ha-card>
    `;
    this._wireEvents();
  }

  _headerHtml(units) {
    const cfg = this._config;
    const customChips = (cfg.chips || []).map((c) => this._customChip(c)).join("");
    const selector = this._selectorHtml(units);
    const showTitle = cfg.title && cfg.show_title !== false;
    if (!showTitle && !customChips && !selector) return "";
    return `
      <div class="card-head">
        <div class="head-left">
          ${showTitle ? `<div class="card-title">${escapeHtml(cfg.title)}</div>` : ""}
          ${selector}
        </div>
        <div class="chips">${customChips}</div>
      </div>`;
  }

  /** Built-in Auto / per-unit selector (single view, >1 unit). Persisted. */
  _selectorHtml(units) {
    if (this._config.view === "all" || units.length <= 1) return "";
    const sel = this._selection || "auto";
    const opts = [`<option value="auto" ${sel === "auto" ? "selected" : ""}>Auto</option>`]
      .concat(units.map((u) =>
        `<option value="${u.device_id}" ${sel === u.device_id ? "selected" : ""}>${escapeHtml(u.name)}</option>`));
    return `<div class="selector"><ha-icon icon="mdi:swap-horizontal"></ha-icon>
      <select class="sel">${opts.join("")}</select></div>`;
  }

  _unitHtml(u) {
    const cfg = this._config;
    const chips = cfg.show_chips ? this._unitChips(u) : "";
    const layeredMode = !!(u.meta.base && u.meta.coil);
    const imageMode = !layeredMode && u.meta.image && u.meta.windows && cfg.recolor !== "off";
    const overlayLabels = (layeredMode || imageMode) && cfg.show_labels && cfg.label_position !== "below";
    const body = layeredMode ? this._layeredHtml(u, overlayLabels)
               : imageMode ? this._graphicHtml(u, overlayLabels)
               : this._cssSpoolsHtml(u);
    const belowLabels = cfg.show_labels && !overlayLabels ? this._labelsHtml(u) : "";
    const activeCls = cfg.highlight_unit && u.active ? "active" : "";
    return `
      <div class="unit ${activeCls}" style="--slot-h:${Number(cfg.height) || 240}px;--gfx-h:${Number(cfg.height) || 240}px">
        <div class="unit-head">
          <div class="unit-name">${escapeHtml(u.name)}${
            u.active && cfg.auto_follow ? `<span class="dot" title="Printing"></span>` : ""}</div>
          <div class="chips">${chips}</div>
        </div>
        ${body}
        ${belowLabels}
      </div>`;
  }

  /**
   * Layered mode: a pre-composited base render (dome/smoke/housing/shading, coils
   * in neutral grayscale) with each bay's filament colour multiplied onto its coil
   * region via a shared coil mask + per-bay horizontal clip. multiply over a neutral
   * base is correct for every colour, white included.
   */
  _layeredHtml(u, overlayLabels) {
    const cfg = this._config;
    const meta = u.meta;
    const baseSrc = this._imageUrl(meta, "base");
    const coilSrc = this._imageUrl(meta, "coil");
    const ar = meta.natW / meta.natH;
    const labelY = cfg.label_y != null ? cfg.label_y : (meta.labelY != null ? meta.labelY : 22);
    const hasActive = u.slots.some((s) => s.active);
    const emptyTint = meta.emptyTint || "#3f3f3f";
    const recolor = cfg.recolor !== "off";
    const films = [], labels = [];
    meta.bays.forEach((bay, i) => {
      const s = u.slots[i];
      if (!s) return;
      const mask = `-webkit-mask-image:url('${coilSrc}');mask-image:url('${coilSrc}');clip-path:inset(0 ${bay.r}% 0 ${bay.l}%);`;
      if (recolor) {
        const c = s.empty ? emptyTint : (s.color || "#888888");
        films.push(`<div class="cfilm" data-entity="${s.entity_id}" title="${escapeHtml(s.name)}"
                     style="--c:${c};${mask}"></div>`);
        if (!s.empty && cfg.dim_inactive && !s.active && hasActive) {
          films.push(`<div class="cveil" style="${mask}"></div>`);
        }
      }
      if (overlayLabels) {
        const cx = (meta.bayX && meta.bayX[i] != null) ? meta.bayX[i] : 50;
        const accent = (!s.empty && s.color) ? s.color : "#FF9800";
        const dimL = s.empty || (!s.active && hasActive);
        labels.push(`<div class="bay ${s.active ? "active" : ""} ${dimL ? "dim" : ""}"
                       style="left:${cx}%;top:${labelY}%;--bay-accent:${accent};"
                       data-entity="${s.entity_id}">${this._bayInner(s)}</div>`);
      }
    });
    return `
      <div class="graphic" style="--ar:${ar};">
        <img class="bg" src="${baseSrc}" alt="${escapeHtml(meta.label)}" />
        <div class="films">${films.join("")}</div>
        <div class="bays">${labels.join("")}</div>
      </div>`;
  }

  /** Image mode: real artwork + per-slot re-colour overlays (+ optional bay labels). */
  _graphicHtml(u, overlayLabels) {
    const cfg = this._config;
    const meta = u.meta;
    const src = this._imageUrl(meta);
    const ar = meta.natW / meta.natH;
    const labelY = cfg.label_y != null ? cfg.label_y : (meta.labelY != null ? meta.labelY : 84);

    const blend = meta.blend || cfg.blend;        // some images recolour better with multiply
    const fcls = meta.feather ? " feather" : "";  // soften edges on low-contrast art
    const hasActive = u.slots.some((s) => s.active);
    const films = [], veils = [], labels = [];
    meta.windows.forEach((wdef, i) => {
      const s = u.slots[i];
      if (!s) return;
      // A slot can carry one rect or several (e.g. to split around feeder gears).
      const rects = Array.isArray(wdef) ? wdef : [wdef];
      const veilOn = s.empty ? !!meta.emptyMask
                             : (cfg.dim_inactive && !s.active && hasActive);
      rects.forEach((w) => {
        const style = `left:${w.x}%;top:${w.y}%;width:${w.w}%;height:${w.h}%;`;
        if (!s.empty) {
          const c = s.color || "#888888";
          films.push(`<div class="film${fcls}" style="${style}--c:${c};mix-blend-mode:${blend};"
                       data-entity="${s.entity_id}" title="${escapeHtml(s.name)}"></div>`);
        } else if (meta.emptyMask) {
          films.push(`<div class="film empty${fcls}" style="${style}" data-entity="${s.entity_id}" title="Empty"></div>`);
        }
        if (veilOn) veils.push(`<div class="veil" style="${style}"></div>`);
      });
      if (overlayLabels) {
        const w0 = rects[0];
        const cx = (meta.bayX && meta.bayX[i] != null) ? meta.bayX[i] : (w0.x + w0.w / 2);
        const accent = (!s.empty && s.color) ? s.color : "#FF9800";
        const dimL = s.empty || (!s.active && hasActive);
        labels.push(`<div class="bay ${s.active ? "active" : ""} ${dimL ? "dim" : ""}"
                       style="left:${cx}%;top:${labelY}%;--bay-accent:${accent};"
                       data-entity="${s.entity_id}">${this._bayInner(s)}</div>`);
      }
    });
    return `
      <div class="graphic" style="--ar:${ar};">
        <img class="bg" src="${src}" alt="${escapeHtml(meta.label)}" />
        <div class="films">${films.join("")}</div>
        <div class="veils">${veils.join("")}</div>
        <div class="bays">${labels.join("")}</div>
      </div>`;
  }

  /** Inner content of a bay label: type + optional remaining percentage. */
  _bayInner(s) {
    const cfg = this._config;
    const type = s.empty ? "Empty" : (s.type || "");
    const pct = (cfg.remaining === "percent" && !s.empty && s.remain != null)
      ? `<span class="bpct">${clamp(s.remain, 0, 100)}%</span>` : "";
    return `<span class="btype">${escapeHtml(type)}</span>${pct}`;
  }

  /** CSS fallback for models without image calibration. */
  _cssSpoolsHtml(u) {
    const cfg = this._config;
    const slots = u.slots.map((s) => {
      const color = s.empty ? "var(--bac-empty)" : (s.color || "var(--bac-empty)");
      return `
        <div class="slot ${s.active ? "active" : ""} ${s.empty ? "empty" : ""}"
             data-entity="${s.entity_id}" title="${escapeHtml(s.name)}">
          <div class="spool" style="--c:${color}">
            <ha-icon icon="${s.empty ? "mdi:tray" : "mdi:printer-3d-nozzle"}"></ha-icon>
          </div>
        </div>`;
    }).join("");
    return `<div class="slots slots-${u.meta.slots}">${slots}</div>`;
  }

  _labelsHtml(u) {
    const cfg = this._config;
    const cells = u.slots.map((s) => {
      let t = s.empty ? "Empty" : (s.type || "");
      if (cfg.remaining === "percent" && !s.empty && s.remain != null) {
        t += ` <span class="lpct">${clamp(s.remain, 0, 100)}%</span>`;
      }
      const bar = cfg.remaining === "bar" && !s.empty && s.remain != null
        ? `<div class="remain"><span style="width:${clamp(s.remain, 0, 100)}%"></span></div>` : "";
      return `<div class="lcell ${s.active ? "active" : ""}">
                <div class="lname">${t}</div>${bar}</div>`;
    }).join("");
    return `<div class="labels labels-${u.slots.length}">${cells}</div>`;
  }

  _unitChips(u) {
    const hass = this._hass;
    const out = [];
    const fmt = (eid) => {
      const st = hass.states[eid]; if (!st) return null;
      return `${st.state}${st.attributes.unit_of_measurement || ""}`;
    };
    if (u.humidity && hass.states[u.humidity]) out.push(chip("mdi:water-percent", fmt(u.humidity), u.humidity, "#36A2E0"));
    if (u.temperature && hass.states[u.temperature]) out.push(chip("mdi:thermometer", fmt(u.temperature), u.temperature, "#E5544B"));
    if (u.drying && hass.states[u.drying]) {
      const st = hass.states[u.drying];
      const v = parseFloat(st.state);
      if (!isNaN(v) && v > 0) {
        const um = (st.attributes.unit_of_measurement || "h").toLowerCase();
        let mins = um.startsWith("h") ? v * 60 : (um.startsWith("s") ? v / 60 : v);
        mins = Math.round(mins);
        const h = Math.floor(mins / 60), m = mins % 60;
        const txt = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
        out.push(chip("mdi:hair-dryer", txt, u.drying));
      }
    }
    return out.join("");
  }

  /** Custom user chip from a config entry: {entity, icon?, name?, tap_action?}. */
  /**
   * Custom chip config:
   *   { entity, icon?, name?, map?, colors?, color?, round?, unit?, tap_action?, hide_when? }
   *   map:     { <state>: "text" }    state -> display text
   *   colors:  { <state>: "#rgb" }    state -> icon colour
   *   round:   true                   round a numeric state
   *   unit:    true | "%"             append unit (auto or literal)
   *   tap_action: "more-info" (default) | "toggle"
   *   hide_when: { entity?, states: [ ... ] }
   *            hide the chip entirely when the gate entity's state (or the
   *            chip's own, if `entity` omitted) is one of `states`
   *            (case-insensitive). A missing gate entity counts as
   *            "unavailable".
   */
  _customChip(c) {
    if (!c || !c.entity) return "";
    if (c.hide_when && Array.isArray(c.hide_when.states)) {
      const gate = this._hass.states[c.hide_when.entity || c.entity];
      const cur = (gate ? gate.state : "unavailable").toLowerCase();
      if (c.hide_when.states.some((s) => String(s).toLowerCase() === cur)) return "";
    }
    const st = this._hass.states[c.entity];
    const icon = c.icon || (st && st.attributes.icon) || "mdi:eye";
    if (!st) return chip(icon, c.name ? `${c.name} —` : "—", c.entity, c.color, c.tap_action);

    let value;
    if (c.map && c.map[st.state] != null) {
      value = c.map[st.state];
    } else {
      let v = st.state;
      if (c.round) { const n = parseFloat(v); if (!isNaN(n)) v = String(Math.round(n)); }
      const u = c.unit === true ? (st.attributes.unit_of_measurement || "")
                                : (typeof c.unit === "string" ? c.unit : "");
      value = u ? (u === "%" ? `${v}%` : `${v} ${u}`) : v;
    }
    const text = c.name ? `${c.name} ${value}` : value;
    let color = c.color;
    if (c.colors && c.colors[st.state] != null) color = c.colors[st.state];
    return chip(icon, text, c.entity, color, c.tap_action);
  }

  _imageUrl(meta, key = "image") {
    const cfg = this._config;
    if (key === "image") {
      const override = cfg.images && (cfg.images[meta.label] || cfg.images[normaliseModel(meta.label)]);
      if (override) return override;
    }
    return IMAGE_BASE + meta[key];
  }

  _renderError(msg) {
    this._sig = "__error__" + msg;
    this.shadowRoot.innerHTML =
      `<style>${this._styles()}</style><ha-card><div class="error">⚠️ ${escapeHtml(msg)}</div></ha-card>`;
  }

  _wireEvents() {
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-entity");
        if (!id) return;
        if (el.getAttribute("data-tap") === "toggle") {
          this._hass.callService("homeassistant", "toggle", { entity_id: id });
        } else {
          this.dispatchEvent(new CustomEvent("hass-more-info",
            { detail: { entityId: id }, bubbles: true, composed: true }));
        }
      });
    });
    const sel = this.shadowRoot.querySelector("select.sel");
    if (sel) sel.addEventListener("change", (e) => {
      this._saveSelection(e.target.value);
      this._sig = null;
      this._render();
    });
  }

  _styles() {
    return `
      :host { display: block; }
      ha-card { padding: 12px 14px; }
      .card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 10px 2px; flex-wrap:wrap; }
      .head-left { display:flex; align-items:center; gap:10px; }
      .card-title { font-weight:600; font-size:1.05em; color:var(--primary-text-color); }
      .selector { display:inline-flex; align-items:center; gap:4px; background:var(--bac-chip-bg, rgba(127,127,127,0.18));
                  border-radius:999px; padding:2px 6px 2px 9px; }
      .selector ha-icon { --mdc-icon-size:16px; color:var(--secondary-text-color); }
      .selector select { appearance:none; -webkit-appearance:none; background:transparent; border:none; outline:none;
                  color:var(--primary-text-color); font-size:0.85em; font-weight:600; font-family:inherit;
                  padding:2px 4px; cursor:pointer; }
      .selector select option { color:#000; }
      .units.stack { display:flex; flex-direction:column; gap:16px; }
      .units.row { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; gap:16px; }

      .unit {
        --bac-empty: var(--divider-color, #444);
        border-radius:12px; padding:8px 10px 10px;
        background:var(--bac-unit-bg, rgba(127,127,127,0.06));
        border:1px solid var(--divider-color, rgba(127,127,127,0.2));
        transition:border-color .2s, box-shadow .2s;
      }
      .unit.active { border-color:var(--primary-color); box-shadow:0 0 0 1px var(--primary-color) inset; }
      .unit-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px; min-height:24px; }
      .unit-name { font-weight:600; color:var(--primary-text-color); display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
      .dot { width:8px; height:8px; border-radius:50%; background:var(--primary-color); box-shadow:0 0 6px var(--primary-color); }
      .chips { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
      .chip { display:inline-flex; align-items:center; gap:3px; background:var(--bac-chip-bg, rgba(127,127,127,0.18));
              color:var(--primary-text-color); border-radius:999px; padding:3px 9px 3px 7px; font-size:0.8em; cursor:pointer; white-space:nowrap; }
      .chip ha-icon { --mdc-icon-size:16px; color:var(--secondary-text-color); }

      /* image mode */
      .graphic { position:relative; height:var(--gfx-h,240px); aspect-ratio:var(--ar); margin:0 auto; isolation:isolate; }
      .graphic .bg { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; }
      .films { position:absolute; inset:0; }
      /* layered mode: full-box colour multiplied onto a bay's coil via mask + clip */
      .cfilm { position:absolute; inset:0; background:var(--c); mix-blend-mode:multiply; cursor:pointer;
               -webkit-mask-size:100% 100%; mask-size:100% 100%; -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; }
      .cveil { position:absolute; inset:0; background:rgba(0,0,0,0.5); pointer-events:none;
               -webkit-mask-size:100% 100%; mask-size:100% 100%; -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; }
      .film { position:absolute; border-radius:4px; cursor:pointer; background:var(--c, transparent); }
      .film.empty { background:#9a9a9a; mix-blend-mode:saturation; border-radius:4px; }
      /* feather all four edges so the recolour blends into low-contrast artwork */
      .film.feather {
        -webkit-mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent),
                            linear-gradient(to bottom, transparent, #000 13%, #000 87%, transparent);
        -webkit-mask-composite: source-in; mask-composite: intersect;
        mask-image: linear-gradient(to right, transparent, #000 14%, #000 86%, transparent),
                    linear-gradient(to bottom, transparent, #000 13%, #000 87%, transparent);
      }
      /* dim veil over non-active / empty spools so the in-use one pops */
      .veils { position:absolute; inset:0; pointer-events:none; }
      .veil { position:absolute; background:rgba(0,0,0,0.5); border-radius:4px; }
      /* bay labels overlaid on the graphic */
      .bays { position:absolute; inset:0; pointer-events:none; }
      .bay { position:absolute; transform:translate(-50%,-50%); pointer-events:auto; cursor:pointer;
             display:flex; flex-direction:column; align-items:center; line-height:1.08;
             background:rgba(0,0,0,0.62); color:#fff; border-radius:9px; padding:4px 11px;
             font-size:1.2em; white-space:nowrap; backdrop-filter:blur(2px);
             border:1px solid rgba(255,255,255,0.10); transition:opacity .2s; }
      .bay.dim { opacity:0.5; }
      .bay.active { border:2px solid var(--bay-accent, var(--primary-color));
             box-shadow:0 0 10px var(--bay-accent, var(--primary-color)); background:rgba(0,0,0,0.80); }
      .bay .btype { font-weight:700; }
      .bay .bpct { font-size:0.82em; opacity:0.85; }

      /* css fallback spools */
      .slots { display:grid; gap:8px; }
      .slots-1 { grid-template-columns:minmax(70px,120px); justify-content:center; }
      .slots-2 { grid-template-columns:repeat(2,1fr); }
      .slots-3 { grid-template-columns:repeat(3,1fr); }
      .slots-4 { grid-template-columns:repeat(4,1fr); }
      .slot { cursor:pointer; border-radius:10px; padding:4px; }
      .slot .spool { height:var(--slot-h,200px); border-radius:9px 9px 7px 7px;
        background:linear-gradient(180deg, rgba(255,255,255,0.20), rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.25)), var(--c);
        border:1px solid rgba(0,0,0,0.35); box-shadow:inset 0 2px 6px rgba(255,255,255,0.18), inset 0 -8px 14px rgba(0,0,0,0.30);
        display:flex; align-items:center; justify-content:center; }
      .slot .spool ha-icon { --mdc-icon-size:26px; color:rgba(255,255,255,0.92); filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
      .slot.empty .spool { background:repeating-linear-gradient(45deg, rgba(127,127,127,0.10), rgba(127,127,127,0.10) 6px, rgba(127,127,127,0.04) 6px, rgba(127,127,127,0.04) 12px); border-style:dashed; box-shadow:none; }
      .slot.active .spool { outline:2px solid var(--primary-color); outline-offset:1px; }

      /* labels row */
      .labels { display:grid; gap:6px; margin-top:8px; }
      .labels-1 { grid-template-columns:1fr; max-width:140px; margin-left:auto; margin-right:auto; }
      .labels-2 { grid-template-columns:repeat(2,1fr); }
      .labels-3 { grid-template-columns:repeat(3,1fr); }
      .labels-4 { grid-template-columns:repeat(4,1fr); }
      .lcell { text-align:center; }
      .lname { font-size:0.78em; color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lname .lpct { opacity:0.8; }
      .lcell.active .lname { color:var(--primary-text-color); font-weight:600; }
      .remain { height:4px; border-radius:3px; overflow:hidden; background:rgba(127,127,127,0.25); margin-top:3px; }
      .remain span { display:block; height:100%; background:var(--primary-color); border-radius:3px; }
      .error { padding:12px; color:var(--error-color,#db4437); font-size:0.9em; }
    `;
  }

  getCardSize() {
    const n = this._resolveSafe().length || 1;
    return Math.max(3, n * 4);
  }
  _resolveSafe() { try { return this._resolveUnits(); } catch (e) { return []; } }
}

function chip(icon, text, entityId, color, tap) {
  if (text == null) return "";
  const ic = color ? ` style="color:${color}"` : "";
  const td = tap ? ` data-tap="${tap}"` : "";
  return `<div class="chip" data-entity="${entityId}"${td}><ha-icon icon="${icon}"${ic}></ha-icon><span>${escapeHtml(text)}</span></div>`;
}

/** Normalise Bambu colour attribute (#RRGGBB, #RRGGBBAA, or bare hex) to CSS. */
function normaliseColor(c) {
  if (!c) return null;
  let s = String(c).trim();
  if (!s.startsWith("#")) s = "#" + s;
  // #RRGGBBAA -> drop alpha for a solid swatch (alpha can be 00 on some firmwares)
  if (/^#[0-9a-fA-F]{8}$/.test(s)) s = s.slice(0, 7);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, Number(n) || 0)); }
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

if (!customElements.get("better-ams-card")) {
  customElements.define("better-ams-card", BetterAmsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "better-ams-card",
    name: "Better AMS Card",
    preview: false,
    description: "Robust, theme-aware card for Bambu Lab AMS units — real artwork, live spool re-colouring, multi-AMS, auto-follow, custom chips.",
    documentationURL: "https://github.com/petergCA/better-ams-card",
  });
  // eslint-disable-next-line no-console
  console.info(
    `%c BETTER-AMS-CARD %c v${VERSION} `,
    "color:#fff;background:#0a7d3c;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;",
    "color:#0a7d3c;background:#222;border-radius:0 4px 4px 0;padding:2px 6px;"
  );
}
