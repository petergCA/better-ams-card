/**
 * better-ams-card
 * A robust, theme-aware Lovelace card for Bambu Lab AMS units.
 *
 * Renders every AMS model correctly (AMS, AMS Lite, AMS 2 Pro, AMS HT and the
 * external spool) with a scalable CSS layout — no fixed-aspect PNGs that blow
 * up the card. Supports multiple AMS units per printer, auto-highlights the
 * unit/slot that is actively printing, shows per-slot filament/colour/remaining
 * detail and humidity / temperature / drying chips, and respects Home Assistant
 * theme variables.
 *
 * Works with the ha-bambulab integration (greghesp).
 *
 * https://github.com/petergCA/better-ams-card
 */

const VERSION = "0.1.0";

/** Per-model layout metadata. Keyed by a normalised model string. */
const MODELS = {
  "ams": { slots: 4, label: "AMS" },
  "ams lite": { slots: 4, label: "AMS Lite" },
  "ams 2 pro": { slots: 4, label: "AMS 2 Pro" },
  "ams ht": { slots: 1, label: "AMS HT" },
  "external spool": { slots: 1, label: "External" },
};

function normaliseModel(model) {
  return String(model || "").trim().toLowerCase();
}

function modelMeta(model) {
  const key = normaliseModel(model);
  if (MODELS[key]) return MODELS[key];
  // Heuristics for variants we don't have an exact key for.
  if (key.includes("ht")) return MODELS["ams ht"];
  if (key.includes("external")) return MODELS["external spool"];
  if (key.includes("lite")) return MODELS["ams lite"];
  return { slots: 4, label: model || "AMS" };
}

class BetterAmsCard extends HTMLElement {
  static getStubConfig(hass) {
    // Best-effort: pick the first bambu printer device we can find.
    let printer;
    try {
      const devices = hass?.devices || {};
      for (const id in devices) {
        const m = normaliseModel(devices[id].model);
        if (m && (m.startsWith("x1") || m.startsWith("p1") || m.startsWith("a1") ||
                  m.startsWith("h2") || m.includes("carbon"))) {
          printer = id;
          break;
        }
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
        "better-ams-card: provide a 'printer' device id (auto-discovers AMS units) " +
        "or an explicit 'ams' list of AMS device ids."
      );
    }
    this._config = {
      auto_follow: true,
      show_chips: true,
      show_labels: true,
      show_remaining: true,
      unit_layout: "stack", // stack | row
      height: 150,          // slot body height (px)
      ...config,
    };
    this._sig = null; // force re-render
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  // ---- data resolution ---------------------------------------------------

  _entitiesForDevice(deviceId) {
    const hass = this._hass;
    const out = [];
    const reg = hass.entities || {};
    for (const eid in reg) {
      if (reg[eid].device_id === deviceId) out.push(eid);
    }
    return out;
  }

  /** Resolve the ordered list of AMS device ids to render. */
  _resolveUnits() {
    const hass = this._hass;
    const cfg = this._config;
    let ids = [];

    if (Array.isArray(cfg.ams) && cfg.ams.length) {
      ids = cfg.ams.slice();
    } else if (cfg.printer && hass.devices) {
      // Auto-discover: AMS sub-devices hang off the printer via via_device_id.
      for (const id in hass.devices) {
        const d = hass.devices[id];
        if (d.via_device_id !== cfg.printer) continue;
        const m = normaliseModel(d.model);
        if (m.includes("ams") || (cfg.include_external && m.includes("external"))) {
          ids.push(id);
        }
      }
      // Stable, human order by device name (AMS 1, AMS 2, AMS HT, ...).
      ids.sort((a, b) => this._deviceName(a).localeCompare(
        this._deviceName(b), undefined, { numeric: true }));
    }

    return ids.map((id) => this._buildUnit(id)).filter(Boolean);
  }

  _deviceName(deviceId) {
    const d = (this._hass.devices || {})[deviceId];
    return (d && (d.name_by_user || d.name)) || deviceId;
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
    trays.sort((a, b) => {
      const na = parseInt((a.match(/_tray_(\d+)$/) || [])[1] || "0", 10);
      const nb = parseInt((b.match(/_tray_(\d+)$/) || [])[1] || "0", 10);
      return na - nb;
    });

    const slots = trays.map((eid) => {
      const st = hass.states[eid];
      const a = (st && st.attributes) || {};
      const empty = !st || st.state === "Empty" || st.state === "unknown" || st.state === "unavailable";
      return {
        entity_id: eid,
        empty,
        color: a.color || null,
        type: a.type || (empty ? "" : st.state),
        name: a.name || (st ? st.state : ""),
        remain: typeof a.remain === "number" ? a.remain : null,
        active: !!(a.active || a.in_use),
      };
    });

    return {
      device_id: deviceId,
      name: this._deviceName(deviceId),
      model: dev.model,
      meta,
      slots,
      humidity,
      temperature,
      drying,
      active: slots.some((s) => s.active),
    };
  }

  _signature(units) {
    // Compact fingerprint of everything we render, to skip idle re-renders.
    const hass = this._hass;
    const parts = [this._config.title || ""];
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
    try {
      units = this._resolveUnits();
    } catch (e) {
      this._renderError(String(e));
      return;
    }

    const sig = this._signature(units);
    if (sig === this._sig) return;
    this._sig = sig;

    if (!units.length) {
      this._renderError(
        "No AMS units found. Check the 'printer' device id, or pass an explicit 'ams' list."
      );
      return;
    }

    const cfg = this._config;
    const rowLayout = cfg.unit_layout === "row";
    const unitsHtml = units.map((u) => this._unitHtml(u)).join("");

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        ${cfg.title ? `<div class="card-title">${escapeHtml(cfg.title)}</div>` : ""}
        <div class="units ${rowLayout ? "row" : "stack"}">${unitsHtml}</div>
      </ha-card>
    `;
    this._wireEvents();
  }

  _unitHtml(u) {
    const cfg = this._config;
    const chips = cfg.show_chips ? this._chipsHtml(u) : "";
    const slots = u.slots.map((s, i) => this._slotHtml(s, i, u.meta)).join("");
    const activeCls = cfg.auto_follow && u.active ? "active" : "";
    return `
      <div class="unit ${activeCls}" style="--slot-h:${Number(cfg.height) || 150}px">
        <div class="unit-head">
          <div class="unit-name">${escapeHtml(u.name)}${
            u.active && cfg.auto_follow ? `<span class="dot" title="Printing"></span>` : ""
          }</div>
          <div class="chips">${chips}</div>
        </div>
        <div class="slots slots-${u.meta.slots}">${slots}</div>
      </div>
    `;
  }

  _slotHtml(s, i, meta) {
    const cfg = this._config;
    const color = s.empty ? "var(--bac-empty)" : (s.color || "var(--bac-empty)");
    const remain = cfg.show_remaining && s.remain != null
      ? `<div class="remain"><span style="width:${clamp(s.remain, 0, 100)}%"></span></div>`
      : "";
    const label = cfg.show_labels
      ? `<div class="label">${s.empty ? "Empty" : escapeHtml(s.type || "")}</div>`
      : "";
    return `
      <div class="slot ${s.active ? "active" : ""} ${s.empty ? "empty" : ""}"
           data-entity="${s.entity_id}" title="${escapeHtml(s.name || "")}">
        <div class="spool" style="--c:${color}">
          <ha-icon icon="${s.empty ? "mdi:tray" : "mdi:printer-3d-nozzle"}"></ha-icon>
        </div>
        ${remain}
        ${label}
      </div>
    `;
  }

  _chipsHtml(u) {
    const hass = this._hass;
    const out = [];
    const fmt = (eid) => {
      const st = hass.states[eid];
      if (!st) return null;
      const unit = st.attributes.unit_of_measurement || "";
      return `${st.state}${unit}`;
    };
    if (u.humidity && hass.states[u.humidity]) {
      out.push(chip("mdi:water-percent", fmt(u.humidity), u.humidity));
    }
    if (u.temperature && hass.states[u.temperature]) {
      out.push(chip("mdi:thermometer", fmt(u.temperature), u.temperature));
    }
    if (u.drying && hass.states[u.drying]) {
      const v = parseFloat(hass.states[u.drying].state);
      if (!isNaN(v) && v > 0) out.push(chip("mdi:hair-dryer", `${hass.states[u.drying].state}m`, u.drying));
    }
    return out.join("");
  }

  _renderError(msg) {
    this._sig = "__error__" + msg;
    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card><div class="error">⚠️ ${escapeHtml(msg)}</div></ha-card>
    `;
  }

  _wireEvents() {
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => {
      el.addEventListener("click", () => {
        const entityId = el.getAttribute("data-entity");
        if (entityId) this._moreInfo(entityId);
      });
    });
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  _styles() {
    return `
      :host { display: block; }
      ha-card { padding: 12px 14px; }
      .card-title {
        font-weight: 600; font-size: 1.05em; color: var(--primary-text-color);
        margin: 0 0 8px 2px;
      }
      .units.stack { display: flex; flex-direction: column; gap: 14px; }
      .units.row { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 14px; }
      .unit {
        --bac-empty: var(--divider-color, #444);
        border-radius: 12px;
        padding: 8px 10px 10px;
        background: var(--bac-unit-bg, rgba(127,127,127,0.06));
        border: 1px solid var(--divider-color, rgba(127,127,127,0.2));
        transition: border-color .2s, box-shadow .2s;
      }
      .unit.active {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 1px var(--primary-color) inset;
      }
      .unit-head {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; margin-bottom: 8px; min-height: 24px;
      }
      .unit-name {
        font-weight: 600; color: var(--primary-text-color);
        display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
      }
      .dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--primary-color); box-shadow: 0 0 6px var(--primary-color);
      }
      .chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .chip {
        display: inline-flex; align-items: center; gap: 3px;
        background: var(--bac-chip-bg, rgba(127,127,127,0.18));
        color: var(--primary-text-color);
        border-radius: 999px; padding: 3px 9px 3px 7px; font-size: 0.8em; cursor: pointer;
        white-space: nowrap;
      }
      .chip ha-icon { --mdc-icon-size: 16px; color: var(--secondary-text-color); }

      .slots { display: grid; gap: 8px; }
      .slots-1 { grid-template-columns: minmax(70px, 120px); justify-content: center; }
      .slots-4 { grid-template-columns: repeat(4, 1fr); }
      .slots-2 { grid-template-columns: repeat(2, 1fr); }
      .slots-3 { grid-template-columns: repeat(3, 1fr); }

      .slot {
        display: flex; flex-direction: column; align-items: stretch; gap: 5px;
        cursor: pointer; border-radius: 10px; padding: 4px; transition: background .15s;
      }
      .slot:hover { background: rgba(127,127,127,0.10); }
      .spool {
        height: var(--slot-h, 150px);
        border-radius: 9px 9px 7px 7px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.20), rgba(0,0,0,0.10) 40%, rgba(0,0,0,0.25)),
          var(--c);
        border: 1px solid rgba(0,0,0,0.35);
        box-shadow: inset 0 2px 6px rgba(255,255,255,0.18), inset 0 -8px 14px rgba(0,0,0,0.30);
        display: flex; align-items: center; justify-content: center;
        position: relative;
      }
      .spool ha-icon {
        --mdc-icon-size: 26px; color: rgba(255,255,255,0.92);
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
      }
      .slot.empty .spool {
        background: repeating-linear-gradient(45deg,
          rgba(127,127,127,0.10), rgba(127,127,127,0.10) 6px,
          rgba(127,127,127,0.04) 6px, rgba(127,127,127,0.04) 12px);
        border-style: dashed; box-shadow: none;
      }
      .slot.empty .spool ha-icon { color: var(--secondary-text-color); opacity: 0.6; }
      .slot.active .spool {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
        box-shadow: inset 0 2px 6px rgba(255,255,255,0.18), 0 0 10px var(--primary-color);
      }
      .remain {
        height: 4px; border-radius: 3px; overflow: hidden;
        background: rgba(127,127,127,0.25);
      }
      .remain span {
        display: block; height: 100%;
        background: var(--primary-color); border-radius: 3px;
      }
      .label {
        text-align: center; font-size: 0.78em; color: var(--secondary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .slot.active .label { color: var(--primary-text-color); font-weight: 600; }
      .error { padding: 12px; color: var(--error-color, #db4437); font-size: 0.9em; }
    `;
  }

  getCardSize() {
    const units = (this._sig && this._resolveSafe()) || [];
    return Math.max(2, units.length * 3);
  }

  _resolveSafe() {
    try { return this._resolveUnits(); } catch (e) { return []; }
  }

  static getConfigElement() { return document.createElement("better-ams-card-editor"); }
}

function chip(icon, text, entityId) {
  if (text == null) return "";
  return `<div class="chip" data-entity="${entityId}"><ha-icon icon="${icon}"></ha-icon><span>${escapeHtml(text)}</span></div>`;
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
    description: "Robust, theme-aware card for Bambu Lab AMS units (all models, multi-AMS, auto-follow).",
    documentationURL: "https://github.com/petergCA/better-ams-card",
  });
  // eslint-disable-next-line no-console
  console.info(
    `%c BETTER-AMS-CARD %c v${VERSION} `,
    "color:#fff;background:#0a7d3c;font-weight:700;border-radius:4px 0 0 4px;padding:2px 6px;",
    "color:#0a7d3c;background:#222;border-radius:0 4px 4px 0;padding:2px 6px;"
  );
}
