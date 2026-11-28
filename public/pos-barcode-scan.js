import { barcodeText, internalBarcodePrefix, inventoryBarcode, POS_BARCODE_MAX_LENGTH } from "./pos-barcode-rules.js";
import { STAFF_SCAN_CODE } from "./stock-scan-rules.js";

const GAP_MS = 100;
const EDITOR = "input, textarea, select, [contenteditable], [role=textbox]";

export function barcodeBuffer() {
  let value = "", at = 0, source = null;
  return {
    clear() { value = ""; at = 0; source = null; },
    push(key, time, target) {
      if (time - at > GAP_MS || source !== target) value = "";
      // An overlong frame stays overlong until Enter or the next burst.
      if (value.length <= POS_BARCODE_MAX_LENGTH) value += key;
      at = time;
      source = target;
    },
    take(time, target) {
      const frame = source === target && time - at <= GAP_MS ? value : "";
      this.clear();
      return frame;
    }
  };
}

export function mountBarcodeScanner({ root, active, known, onCode, onInvalid }) {
  const listeners = new AbortController();
  const buffer = barcodeBuffer();
  const signal = listeners.signal;
  document.addEventListener("focusin", () => buffer.clear(), { signal });
  document.addEventListener("keydown", event => {
    const search = root.querySelector("#product-search");
    const searchFocused = event.target === search;
    if (!active() || !search?.isConnected || event.isComposing ||
        event.altKey || event.ctrlKey || event.metaKey) {
      buffer.clear();
      return;
    }
    if (event.repeat) return;
    if (document.querySelector("dialog[open]") || !searchFocused && event.target.closest?.(EDITOR)) {
      // Leave normal typing alone and do not retain any characters from other fields.
      // A scanner's Enter suffix must not activate a focused button or submit a form.
      if (event.key.length === 1) buffer.push("x", event.timeStamp, "protected");
      else if (event.key === "Enter" && buffer.take(event.timeStamp, "protected").length >= 2) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (event.key !== "Shift") buffer.clear();
      return;
    }
    const source = searchFocused ? "search" : "global";
    if (event.key.length === 1) {
      buffer.push(event.key, event.timeStamp, source);
      return;
    }
    if (event.key !== "Enter") {
      if (event.key !== "Shift") buffer.clear();
      return;
    }
    const frame = buffer.take(event.timeStamp, source);
    const query = searchFocused ? search.value.trim() : "";
    const recognizable = code => known(code) || inventoryBarcode.test(code) || STAFF_SCAN_CODE.test(code) ||
      internalBarcodePrefix.test(code) || /^\d{6,}$/.test(code);
    const emptyResults = !root.querySelector("#pos-search-results [data-search-product]");
    const usable = searchFocused
      ? recognizable(query) ? query
        : recognizable(frame) ? frame
        : frame === query && frame.length >= 3 && emptyResults && /^[A-Z0-9][A-Z0-9._:/-]+$/.test(frame) ? frame : ""
      : frame.length >= 3 || known(frame) ? frame : "";
    if (!usable) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (searchFocused) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const code = barcodeText(usable);
    if (code) onCode(code);
    else onInvalid();
  }, { capture: true, signal });
  return () => listeners.abort();
}

let audio;
export function barcodeFeedback(success) {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try {
    audio ||= new Context();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const signal = audio.createOscillator();
    const level = audio.createGain();
    const now = audio.currentTime;
    signal.frequency.value = success ? 860 : 320;
    level.gain.setValueAtTime(.055, now);
    level.gain.exponentialRampToValueAtTime(.001, now + .11);
    signal.connect(level).connect(audio.destination);
    signal.start(now);
    signal.stop(now + .12);
  } catch { /* The visual feedback remains available. */ }
}
