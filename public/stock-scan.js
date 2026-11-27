import { parseStockBarcode, scanModeLabel, signalStockUpdate, stockScanAccess, stockUpdatedKey } from "./stock-scan-rules.js";
import { acceptsScan, deliberateClick, resetScan, reviewScan, scanDraft, scanProblem, selectScanMode, setScanQuantity, stageScannedMaterial, stockAfterScan, updateScanReview } from "./stock-scan-machine.js";
import { createStockScanSession, dateOfScan, escapeScanText as h, rollNumber, scanPendingKey } from "./stock-scan-session.js";

const get = id => document.getElementById(id);
const reader = get("barcode-input");
const dialog = get("scan-dialog");
const note = get("scan-note");
const list = get("scan-draft-list");
const modeButtons = document.querySelectorAll(".scan-modes button");
const confirm = get("review-confirm");
const retry = get("catalog-retry");
const reviewTitle = get("review-title");
const historyList = get("scan-history-list");
const more = get("scan-more");
const catalog = new Map();
const draft = scanDraft();
let ready = false;
let reading = false;
let identityVersion = 0;
let pending = null;
let page = 0;
let historyVersion = 0;
let historyRows = [];

const session = createStockScanSession("scan", { onReady, onReset, onError: error => message(error, "error") });

function message(text, tone = "info") {
  const node = get("scan-message");
  node.textContent = text;
  node.dataset.tone = tone;
}

function reviewMessage(text, tone = "error") {
  const node = get("review-message");
  node.textContent = text;
  node.hidden = !text;
  node.dataset.tone = tone;
}

function focusReader() {
  if (!reader.disabled && !dialog.open) reader.focus({ preventScroll: true });
}

function connectionStatus() {
  const online = get("scan-online");
  online.textContent = navigator.onLine ? "Terhubung" : "Koneksi terputus";
  online.dataset.status = navigator.onLine ? "good" : "bad";
  const indicator = get("scan-ready");
  if (pending || dialog.open) indicator.textContent = "Scan dijeda";
  else if (!ready || !navigator.onLine) indicator.textContent = "Scanner belum siap";
  else if (document.activeElement === reader) indicator.textContent = "Siap scan";
  else indicator.textContent = "Fokuskan input scanner";
  indicator.dataset.status = indicator.textContent === "Siap scan" ? "good" : "";
}

function renderRollCount() {
  const total = [...draft.items.values()].reduce((sum, row) => sum + row.quantity, 0);
  get("scan-roll-count").textContent = `${rollNumber(total)} roll`;
}

function render() {
  const available = ready && navigator.onLine && acceptsScan(draft) && !pending && !reading;
  reader.readOnly = reading;
  reader.disabled = !ready || !navigator.onLine || !acceptsScan(draft) || Boolean(pending);
  modeButtons.forEach(button => {
    button.disabled = !available;
    button.setAttribute("aria-pressed", String(button.dataset.mode === draft.direction));
  });
  const label = get("draft-mode");
  label.textContent = draft.direction ? scanModeLabel(draft.direction) : "Pilih mode";
  label.dataset.mode = draft.direction || "";
  get("scan-review").disabled = !available || !draft.items.size;
  get("scan-cancel").disabled = !acceptsScan(draft) || Boolean(pending) || !draft.direction || reading;
  note.disabled = !acceptsScan(draft) || Boolean(pending);
  const rows = [...draft.items.values()];
  list.innerHTML = rows.length ? `<ul class="scan-rows">${rows.map(row => `<li class="scan-row${row.materialId === draft.activeId ? " active" : ""}">
    <div><strong>${h(row.name)}</strong><span class="muted">${h(row.rollWidthCm)} cm · ${h(row.sku)}</span></div>
    <div class="balance"><span class="muted">Saldo</span><strong>${row.unavailable ? "—" : `${rollNumber(row.balance)} roll`}</strong></div>
    <div class="scan-quantity">
      <label class="muted" for="scan-quantity-${h(row.materialId)}">Jumlah</label>
      <div class="scan-stepper">
        <button type="button" data-quantity-step="-1" aria-label="Kurangi jumlah roll ${h(row.name)}" ${!available || row.quantity <= 1 ? "disabled" : ""}>−</button>
        <input id="scan-quantity-${h(row.materialId)}" type="number" min="1" step="1" inputmode="numeric" value="${h(row.invalidQuantity ?? row.quantity)}" data-quantity="${h(row.materialId)}" aria-label="Jumlah roll ${h(row.name)}" aria-invalid="${row.invalidQuantity !== undefined}" ${!available ? "disabled" : ""}>
        <button type="button" data-quantity-step="1" aria-label="Tambah jumlah roll ${h(row.name)}" ${!available || row.quantity >= Number.MAX_SAFE_INTEGER ? "disabled" : ""}>+</button>
      </div>
    </div>
    <button class="scan-remove" type="button" data-remove="${h(row.materialId)}" aria-label="Hapus ${h(row.name)} dari draft" ${!available ? "disabled" : ""}>×</button>
  </li>`).join("")}</ul>` : '<p class="scan-empty">Bahan yang dipindai akan muncul di sini.</p>';
  get("scan-kind-count").textContent = `${rows.length} jenis bahan`;
  renderRollCount();
  connectionStatus();
}

function applyQuantity(input, quantity) {
  const id = input.dataset.quantity;
  const item = draft.items.get(id);
  // Keep the controls mounted when a manual edit is committed during a stepper click.
  try {
    setScanQuantity(draft, id, quantity);
    input.value = item.quantity;
    list.querySelector(".scan-row.active")?.classList.remove("active");
    input.closest(".scan-row").classList.add("active");
    message("");
  } catch (error) {
    item.invalidQuantity = input.value;
    message(error.message, "error");
  }
  input.setAttribute("aria-invalid", String(item.invalidQuantity !== undefined));
  const [decrement, increment] = input.parentElement.querySelectorAll("[data-quantity-step]");
  decrement.disabled = item.quantity <= 1;
  increment.disabled = item.quantity >= Number.MAX_SAFE_INTEGER;
  renderRollCount();
}

function renderReview() {
  reviewTitle.textContent = `Konfirmasi ${scanModeLabel(draft.direction)}`;
  const rows = [...draft.items.values()];
  get("review-summary").textContent = `${session.user()?.name || ""} · ${rows.length} jenis bahan · ${rollNumber(rows.reduce((sum, row) => sum + row.quantity, 0))} roll`;
  const reviewNote = get("review-note");
  reviewNote.textContent = note.value.trim();
  reviewNote.hidden = !reviewNote.textContent;
  const incoming = draft.direction === "IN";
  const sign = incoming ? "+" : "−";
  get("review-items").innerHTML = `<ul class="review-rows">${rows.map(row => `<li class="review-row">
    <div><strong>${h(row.name)}</strong><span class="muted">${h(row.rollWidthCm)} cm · ${h(row.sku)}</span></div>
    <div class="review-numbers"><strong class="${incoming ? "positive" : "negative"}">${sign}${rollNumber(row.quantity)} roll</strong><span class="muted">${row.unavailable ? h(row.unavailable) : `Saldo ${rollNumber(row.balance)} → ${rollNumber(stockAfterScan(draft.direction, row))} roll`}</span></div>
  </li>`).join("")}</ul>`;
  const submitting = draft.phase === "SUBMITTING";
  get("review-cancel").disabled = submitting || Boolean(pending);
  get("review-edit").hidden = Boolean(pending) || !scanProblem(draft);
  confirm.textContent = submitting ? "Menyimpan…" : pending ? "Cek & ulangi" : "Konfirmasi";
  confirm.disabled = submitting || !navigator.onLine || (!pending && Boolean(scanProblem(draft)));
  if (!dialog.open) {
    dialog.showModal();
    reviewTitle.focus();
  }
  connectionStatus();
}

function cancel() {
  if (pending || draft.phase === "SUBMITTING") return;
  if (dialog.open) dialog.close();
  resetScan(draft);
  note.value = "";
  reader.value = "";
  message("Scan dibatalkan.");
  render();
  focusReader();
}

function openReview() {
  reviewScan(draft);
  render();
  reviewMessage("");
  renderReview();
}

function onReset() {
  identityVersion++;
  historyVersion++;
  ready = false;
  reading = false;
  pending = null;
  page = 0;
  historyRows = [];
  historyList.replaceChildren();
  more.hidden = true;
  catalog.clear();
  resetScan(draft);
  reader.value = "";
  note.value = "";
  message("");
  if (dialog.open) dialog.close();
  render();
}

function savedPending(userId) {
  const raw = localStorage.getItem(scanPendingKey(userId));
  return raw ? JSON.parse(raw) : null;
}

function restorePending(saved) {
  pending = saved;
  resetScan(draft, "ERROR");
  draft.direction = saved.body.direction;
  draft.items = new Map(saved.items.map(item => [item.materialId, item]));
  note.value = saved.body.note;
  render();
  reviewMessage("Hasil penyimpanan sebelumnya belum diketahui. Periksa dengan ID transaksi yang sama.");
  renderReview();
}

function onReady(user) {
  get("scan-print").hidden = !stockScanAccess(user).print;
  try {
    const saved = savedPending(user.id);
    if (saved) restorePending(saved);
  } catch {
    message("Penyimpanan browser tidak tersedia. Periksa izin browser sebelum mengonfirmasi.", "error");
  }
  loadCatalog();
  loadHistory();
}

async function loadCatalog() {
  const version = identityVersion;
  message("Memuat bahan Per Roll…");
  retry.hidden = true;
  try {
    const result = await session.api("/api/stock/scan/catalog");
    if (identityVersion !== version) return;
    result.materials.forEach(material => catalog.set(material.materialId, material));
    ready = true;
    message(result.materials.length ? "" : "Belum ada bahan Per Roll dengan saldo dan lebar yang valid.");
  } catch (error) {
    if (identityVersion !== version) return;
    retry.hidden = false;
    message(error.message || "Daftar bahan gagal dimuat.", "error");
  }
  if (identityVersion === version) {
    render();
    focusReader();
  }
}

async function loadHistory(append = false) {
  if (!session.user()) return;
  const version = ++historyVersion;
  const offset = append ? page : 0;
  more.disabled = true;
  historyList.setAttribute("aria-busy", "true");
  if (!append) historyList.innerHTML = '<p class="scan-empty">Memuat riwayat…</p>';
  try {
    const result = await session.api(`/api/stock/scan/history?offset=${offset}&limit=10`);
    if (historyVersion !== version) return;
    if (!append) historyRows = [];
    const ids = new Set(historyRows.map(row => row.id));
    historyRows.push(...result.movements.filter(row => !ids.has(row.id)));
    page = offset + result.movements.length;
    more.textContent = "Muat lainnya";
    more.hidden = !result.hasMore;
    historyList.innerHTML = historyRows.length ? `<ul class="history-rows">${historyRows.map(row => `<li class="history-row">
      <div><strong>${h(row.productName)}</strong><span class="muted">${h(row.rollWidthCm)} cm · ${h(row.sku)} · ${h(dateOfScan.format(new Date(row.createdAt)))}</span></div>
      <div class="history-qty"><strong class="${row.change > 0 ? "positive" : "negative"}">${row.change > 0 ? "+" : ""}${rollNumber(row.change)} roll</strong><span class="muted">Saldo ${rollNumber(row.balance)} roll</span></div>
    </li>`).join("")}</ul>` : '<p class="scan-empty">Belum ada mutasi barcode.</p>';
  } catch (error) {
    if (historyVersion !== version) return;
    if (!append) {
      page = 0;
      historyList.innerHTML = `<p class="scan-empty">${h(error.message)}</p>`;
    } else message(error.message, "error");
    more.textContent = "Coba lagi";
    more.hidden = false;
  } finally {
    if (historyVersion === version) {
      more.disabled = false;
      historyList.removeAttribute("aria-busy");
    }
  }
}

async function handleBarcode(code) {
  const token = parseStockBarcode(code);
  if (!token) throw new Error("Barcode tidak dikenal.");
  if (token.type === "command") {
    if (token.value === "CANCEL") return cancel();
    if (token.value === "REVIEW") return openReview();
    selectScanMode(draft, token.value);
    message(`Mode ${scanModeLabel(draft.direction)} aktif.`);
    return;
  }
  if (token.type === "quantity") {
    setScanQuantity(draft, draft.activeId, token.value);
    message(`Jumlah bahan aktif diatur ke ${token.value} roll.`);
    return;
  }
  if (!draft.direction) throw new Error("Pilih atau scan Stok Masuk / Keluar terlebih dahulu.");
  let material = catalog.get(token.value);
  if (!material) {
    const version = identityVersion;
    ({ material } = await session.api(`/api/stock/scan/catalog/${encodeURIComponent(token.value)}`));
    if (version !== identityVersion) return;
    catalog.set(token.value, material);
  }
  const alreadyStaged = draft.items.has(material.materialId);
  stageScannedMaterial(draft, material);
  message(`${material.name} ${material.rollWidthCm} cm ${alreadyStaged ? "aktif kembali" : "terbaca"}.`);
}

function makePending() {
  const items = [...draft.items.values()];
  return {
    body: {
      requestId: crypto.randomUUID(),
      direction: draft.direction,
      items: items.map(({ materialId, quantity, version }) => ({ materialId, quantity, version })),
      note: note.value.trim()
    },
    items
  };
}

function resolvePending(userId, outcome) {
  if (savedPending(userId)?.body.requestId === outcome.body.requestId) localStorage.removeItem(scanPendingKey(userId));
  pending = null;
}

async function submitReview(event) {
  if (!deliberateClick(event) || confirm.disabled || !dialog.open || !session.user()) return;
  const { id } = session.user();
  const version = identityVersion;
  const retrying = Boolean(pending);
  const attempted = pending;
  draft.phase = "SUBMITTING";
  renderReview();
  async function submit() {
    if (version !== identityVersion) return;
    let stored;
    try {
      const existing = savedPending(id);
      if (existing && existing.body.requestId !== attempted?.body.requestId) return restorePending(existing);
      stored = existing || attempted || makePending();
      localStorage.setItem(scanPendingKey(id), JSON.stringify(stored));
    } catch {
      draft.phase = retrying ? "ERROR" : "REVIEW";
      reviewMessage("Penyimpanan browser tidak tersedia. Transaksi belum dikirim.");
      renderReview();
      return;
    }
    pending = stored;
    try {
      const response = await session.api("/api/stock/scan/commit", { method: "POST", body: JSON.stringify(stored.body) });
      if (version !== identityVersion) return;
      if (response.requestId !== stored.body.requestId || !response.groupId || !response.movements?.length) throw new Error("Server belum mengirim bukti transaksi.");
      resolvePending(id, stored);
      for (const movement of response.movements) {
        const item = draft.items.get(movement.materialId);
        catalog.set(movement.materialId, { ...item, balance: movement.balance, version: movement.balanceVersion });
      }
      dialog.close();
      resetScan(draft, "SUCCESS");
      note.value = "";
      reader.value = "";
      signalStockUpdate();
      render();
      focusReader();
      message(`${scanModeLabel(response.direction)} tersimpan. ${rollNumber(response.movements.reduce((sum, row) => sum + Math.abs(row.change), 0))} roll tercatat di Mutasi Stok.`, "success");
      loadHistory();
    } catch (error) {
      if (version !== identityVersion) return;
      if (["SCAN_REVIEW_CHANGED", "SCAN_INPUT"].includes(error.code)) {
        resolvePending(id, stored);
        updateScanReview(draft, error.materials || []);
        for (const { materialId, current } of error.materials || []) {
          if (current) catalog.set(materialId, current);
          else catalog.delete(materialId);
        }
        reviewMessage(error.message);
      } else {
        draft.phase = "ERROR";
        reviewMessage(error.status ? `${error.message} Cek ulang dengan ID transaksi yang sama.` : "Hasil penyimpanan belum diketahui. Cek ulang dengan ID transaksi yang sama saat koneksi pulih.");
      }
      render();
      renderReview();
    }
  }
  try {
    if (navigator.locks) await navigator.locks.request(scanPendingKey(id), submit);
    else await submit();
  } catch (error) {
    if (version !== identityVersion) return;
    draft.phase = pending ? "ERROR" : "REVIEW";
    reviewMessage(error.message);
    renderReview();
  }
}

reader.addEventListener("keydown", async event => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  if (event.repeat || !acceptsScan(draft) || pending || reading || !ready) return;
  const version = identityVersion;
  const code = reader.value;
  reader.value = "";
  if (!code.trim()) return;
  reading = true;
  reader.readOnly = true;
  try { await handleBarcode(code); }
  catch (error) { if (identityVersion === version) message(error.message, "error"); }
  finally {
    if (identityVersion === version) {
      reading = false;
      render();
      focusReader();
    }
  }
});

reader.addEventListener("focus", connectionStatus);
reader.addEventListener("blur", () => queueMicrotask(connectionStatus));
modeButtons.forEach(button => button.onclick = () => {
  if (reading) return;
  try { selectScanMode(draft, button.dataset.mode); message(`Mode ${scanModeLabel(draft.direction)} aktif.`); }
  catch (error) { message(error.message, "error"); }
  render();
  focusReader();
});
list.onchange = event => {
  const input = event.target;
  if (!input.dataset.quantity || !acceptsScan(draft) || reading) return;
  applyQuantity(input, input.valueAsNumber);
};
list.onclick = event => {
  const button = event.target.closest("button");
  if (!button || button.disabled || !acceptsScan(draft) || reading) return;
  const { quantityStep, remove } = button.dataset;
  if (quantityStep) {
    const input = button.parentElement.querySelector("[data-quantity]");
    const { quantity } = draft.items.get(input.dataset.quantity);
    applyQuantity(input, quantity + Number(quantityStep));
    if (event.detail > 0) focusReader();
  } else if (remove) {
    draft.items.delete(remove);
    if (draft.activeId === remove) draft.activeId = [...draft.items.keys()].at(-1);
    message("");
    render();
    focusReader();
  }
};
get("scan-cancel").onclick = () => { if (!reading) cancel(); };
get("review-cancel").onclick = cancel;
get("scan-review").onclick = () => {
  if (reading) return;
  try { openReview(); } catch (error) { message(error.message, "error"); }
};
get("review-edit").onclick = () => {
  if (pending) return;
  dialog.close();
  draft.phase = "SCANNING";
  render();
  focusReader();
};
dialog.oncancel = event => {
  event.preventDefault();
  if (draft.phase === "REVIEW") {
    dialog.close();
    draft.phase = "SCANNING";
    render();
    focusReader();
  }
};
dialog.addEventListener("keydown", event => {
  if (event.key === "Enter") event.preventDefault();
}, true);
confirm.onclick = submitReview;
retry.onclick = loadCatalog;
more.onclick = () => loadHistory(Boolean(page));
for (const event of ["online", "offline"]) window.addEventListener(event, () => {
  render();
  if (dialog.open) renderReview();
  if (event === "online") {
    if (session.user() && !ready) loadCatalog();
    focusReader();
  }
});
window.addEventListener("storage", event => {
  const id = session.user()?.id;
  if (!id) return;
  if (event.key === scanPendingKey(id) && event.newValue && draft.phase !== "SUBMITTING" && !pending) {
    if (!draft.items.size) restorePending(JSON.parse(event.newValue));
    else message("Ada transaksi yang sedang diproses di tab lain. Periksa hasilnya sebelum mengonfirmasi draft ini.");
  }
  if (event.key === stockUpdatedKey) loadHistory();
});

render();
session.refreshSession();
