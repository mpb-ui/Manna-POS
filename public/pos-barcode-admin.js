import { masterPanelHeader } from "./page-header.js";

const API = "/api/pos-barcodes";
const pageSize = 25;
const encoded = value => encodeURIComponent(value);
const rowKey = row => JSON.stringify([row.productId, row.targetKey]);
const dataFor = row => ({ productId: row.productId, targetKey: row.targetKey });
const write = (api, action, row, more = {}, method = "POST") =>
  api(API + action, { method, body: JSON.stringify({ ...dataFor(row), ...more }) });

export function posBarcodeSettings(ctx) {
  const { root, header, bindHeader, api, state, toast, switchHtml } = ctx;
  root.innerHTML = `<div class="master-page master-data-page">${header()}<section class="panel">
    ${masterPanelHeader("Pengaturan POS")}
    <div class="panel-body barcode-setting"><div><strong>Barcode Scanner</strong>
    <p class="muted">Tambahkan barang dagangan ke pesanan dengan memindai barcode.</p></div>
    ${switchHtml("posBarcodeEnabled", state.posBarcodeEnabled, "Barcode Scanner")}</div>
  </section></div>`;
  bindHeader();
  const toggle = root.querySelector('[name="posBarcodeEnabled"]');
  toggle.setAttribute("role", "switch");
  toggle.onchange = async () => {
    const previous = state.posBarcodeEnabled;
    toggle.disabled = true;
    try {
      const saved = await api(API + "/settings", { method: "PUT", body: JSON.stringify({ enabled: toggle.checked }) });
      state.posBarcodeEnabled = saved.enabled;
      toast(saved.enabled ? "Barcode Scanner POS aktif" : "Barcode Scanner POS nonaktif", "success");
    } catch (error) {
      toggle.checked = previous;
      toast(error.message, "error");
    } finally { toggle.disabled = false; }
  };
}

function editBarcodeRows(node, rows, ctx, { focus = false, onUpdate = () => {} } = {}) {
  const { api, e, toast } = ctx;
  let selected = rows[0]?.targetKey;
  let prior = null;
  let busy = false;

  function draw() {
    const row = rows.find(row => row.targetKey === selected);
    if (!row) {
      node.innerHTML = '<p class="muted">Simpan kombinasi varian aktif untuk mendaftarkan barcode.</p>';
      return;
    }
    node.innerHTML = `<div class="barcode-editor-fields">
      ${rows.length > 1 ? `<label class="field"><span>Kombinasi varian</span><select data-barcode-target>${rows.map(option =>
        `<option value="${e(option.targetKey)}" ${option.targetKey === selected ? "selected" : ""}>${e(option.variant || option.name)}</option>`).join("")}</select></label>` : ""}
      <ul class="barcode-values">${row.barcodes.map(entry => `<li><code>${e(entry.code)}</code>
        ${entry.kind === "INTERNAL" ? '<span class="badge">Internal</span>' : `<button type="button" class="text-button" data-barcode-edit="${e(entry.code)}">Edit</button>
        <button type="button" class="text-button barcode-delete" data-barcode-delete="${e(entry.code)}">Hapus</button>`}</li>`).join("") || '<li class="muted">Belum ada barcode</li>'}</ul>
      <label class="field"><span>${prior ? "Edit barcode pabrik" : "Barcode bawaan pabrik"}</span><input type="text" maxlength="128" autocapitalize="off" autocomplete="off" spellcheck="false" data-factory-code placeholder="Scan atau ketik barcode" value="${e(prior || row.legacyCode || "")}"></label>
      <div class="barcode-editor-actions">
        <button type="button" class="primary" data-barcode-save>Simpan Barcode</button>
        ${prior ? '<button type="button" class="secondary" data-barcode-abort>Batal Edit</button>' :
          `<button type="button" class="secondary" data-barcode-generate ${row.barcodes.some(entry => entry.kind === "INTERNAL") ? "disabled" : ""}>Generate Barcode</button>`}
      </div><p class="barcode-error" role="alert" hidden></p>
    </div>`;
  }

  async function save(action, extra = {}) {
    if (busy) return;
    const target = rows.find(row => row.targetKey === selected);
    if (!target) return;
    const buttons = [...node.querySelectorAll("button, input, select")].filter(input => !input.disabled);
    busy = true;
    buttons.forEach(input => { input.disabled = true; });
    const errorNode = node.querySelector(".barcode-error");
    errorNode.hidden = true;
    try {
      const deleting = action === "delete";
      const result = await write(api, action === "generate" ? "/generate" : "/register", target, extra, deleting ? "DELETE" : "POST");
      // Keep the operation bound to the captured target even if the editor was closed.
      if (deleting) target.barcodes = target.barcodes.filter(barcode => barcode.code !== extra.code);
      else {
        const { code, kind } = result.barcode;
        target.barcodes = [...target.barcodes.filter(item => item.code !== code && item.code !== extra.previousCode), { code, kind }];
      }
      if (extra.code === target.legacyCode || target.barcodes.some(item => item.code === target.legacyCode)) target.legacyCode = "";
      onUpdate(target);
      if (!node.isConnected) return;
      prior = null;
      draw();
      toast(deleting ? "Barcode dihapus" : "Barcode tersimpan", "success");
      node.querySelector("[data-factory-code]")?.focus({ preventScroll: true });
    } catch (error) {
      if (node.isConnected) { errorNode.textContent = error.message; errorNode.hidden = false; }
    } finally {
      busy = false;
      buttons.forEach(input => { input.disabled = false; });
    }
  }

  function saveInput() {
    const code = node.querySelector("[data-factory-code]").value;
    save("register", { code, ...(prior ? { previousCode: prior } : {}) });
  }
  node.onkeydown = event => {
    if (event.key !== "Enter" || !event.target.matches("[data-factory-code]") || event.isComposing) return;
    event.preventDefault();
    saveInput();
  };
  node.onchange = event => {
    if (!event.target.matches("[data-barcode-target]") || busy) return;
    selected = event.target.value;
    prior = null;
    draw();
  };
  node.onclick = event => {
    const button = event.target.closest("button");
    if (!button || button.disabled || busy) return;
    if (button.hasAttribute("data-barcode-save")) return saveInput();
    if (button.hasAttribute("data-barcode-generate")) return save("generate");
    if (button.hasAttribute("data-barcode-delete")) {
      if (window.confirm("Hapus barcode alternatif ini?")) save("delete", { code: button.dataset.barcodeDelete });
      return;
    }
    if (button.hasAttribute("data-barcode-edit") || button.hasAttribute("data-barcode-abort")) {
      prior = button.dataset.barcodeEdit || null;
      draw();
      node.querySelector("[data-factory-code]")?.select();
    }
  };
  draw();
  if (focus) node.querySelector("[data-factory-code]")?.focus();
}

export async function mountProductBarcodes(node, productId, ctx) {
  try {
    const result = await ctx.api(API + "/catalog?productId=" + encoded(productId));
    if (node.isConnected) editBarcodeRows(node, result.rows, ctx);
  } catch (error) {
    if (node.isConnected) node.textContent = error.message;
  }
}

export async function mountBarcodeRegistration(ctx) {
  const { root, header, bindHeader, api, e, toast, showDialog, showProducts, printLabels } = ctx;
  const filters = `<input class="search" type="search" data-barcode-search placeholder="Cari nama produk…" aria-label="Cari nama produk">
    <select class="filter-select" data-barcode-category aria-label="Kategori produk"><option value="">Semua kategori</option></select>
    <select class="filter-select" data-barcode-state aria-label="Status registrasi"><option value="all">Semua status</option>
      <option value="registered">Sudah Terdaftar</option><option value="unregistered">Belum Terdaftar</option></select>`;
  const actions = `<button class="secondary" type="button" data-barcode-back>Daftar Produk</button>
    <button class="primary" type="button" data-print-selected disabled>Cetak Label</button>`;
  root.innerHTML = `<div class="master-page master-data-page barcode-registration">${header()}
    <section class="panel">${masterPanelHeader("Registrasi Barcode", { filters, actions })}
    <div data-barcode-counts class="barcode-counts" aria-live="polite"></div>
    <div class="table-wrap master-table master-readable-list"><table class="barcode-table">
      <thead><tr><th scope="col">Label</th><th scope="col">Produk / Varian</th><th scope="col">SKU</th><th scope="col">Barcode</th><th scope="col">Aksi</th></tr></thead>
      <tbody data-barcode-table><tr><td colspan="5">Memuat barang dagangan…</td></tr></tbody>
    </table></div><div class="barcode-pagination" data-barcode-page></div></section></div>`;
  bindHeader();
  const page = root.querySelector(".barcode-registration");
  const table = page.querySelector("[data-barcode-table]");
  const search = page.querySelector("[data-barcode-search]");
  const category = page.querySelector("[data-barcode-category]");
  const status = page.querySelector("[data-barcode-state]");
  const selected = new Set();
  let rows = [], visible = [], index = 0;
  const selectedButton = page.querySelector("[data-print-selected]");
  page.querySelector("[data-barcode-back]").onclick = showProducts;

  const draw = () => {
    const query = search.value.trim().toLocaleLowerCase("id");
    const matched = rows.filter(row => row.name.toLocaleLowerCase("id").includes(query) && (!category.value || row.category === category.value));
    const registered = matched.filter(row => row.barcodes.length).length;
    page.querySelector("[data-barcode-counts]").textContent = `${registered} sudah terdaftar · ${matched.length - registered} belum terdaftar`;
    const filtered = matched.filter(row => status.value === "all" || Boolean(row.barcodes.length) === (status.value === "registered"));
    const last = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
    index = Math.min(index, last);
    visible = filtered.slice(index * pageSize, (index + 1) * pageSize);
    table.innerHTML = visible.map((row, position) => `<tr data-barcode-row="${position}">
      <td><input type="checkbox" data-barcode-select aria-label="Pilih label ${e(row.name)} ${e(row.variant)}" ${selected.has(rowKey(row)) ? "checked" : ""} ${row.barcodes.length ? "" : "disabled"}></td>
      <td><strong>${e(row.name)}</strong>${row.variant ? `<small>${e(row.variant)}</small>` : ""}${row.active ? "" : '<small>Nonaktif</small>'}</td>
      <td>${e(row.sku)}</td><td><div class="barcode-cell">${row.barcodes.map(code => `<code>${e(code.code)}</code>`).join("") || '<span class="muted">Belum terdaftar</span>'}</div></td>
      <td><div class="barcode-row-actions">
        <button type="button" class="secondary" data-barcode-action="scan">Scan Barcode</button>
        <button type="button" class="secondary" data-barcode-action="generate" ${row.barcodes.some(code => code.kind === "INTERNAL") ? "disabled" : ""}>Generate Barcode</button>
        ${row.barcodes.length ? '<button type="button" class="secondary" data-barcode-action="edit">Edit Barcode</button><button type="button" class="secondary" data-barcode-action="print">Cetak Label</button>' : ""}
      </div></td></tr>`).join("") || '<tr><td colspan="5">Tidak ada produk yang sesuai.</td></tr>';
    selectedButton.textContent = selected.size ? `Cetak Label (${selected.size})` : "Cetak Label";
    selectedButton.disabled = selected.size === 0;
    const paging = page.querySelector("[data-barcode-page]");
    paging.hidden = last === 0;
    paging.innerHTML = `<button class="secondary" type="button" data-page="-1" ${index ? "" : "disabled"}>Sebelumnya</button>
      <span>Halaman ${index + 1} dari ${last + 1}</span>
      <button class="secondary" type="button" data-page="1" ${index === last ? "disabled" : ""}>Berikutnya</button>`;
  };

  const filter = () => { index = 0; draw(); };
  search.oninput = category.onchange = status.onchange = filter;
  page.querySelector("[data-barcode-page]").onclick = event => {
    const move = event.target.closest("[data-page]");
    if (move) { index += Number(move.dataset.page); draw(); }
  };
  selectedButton.onclick = () => printLabels(rows.filter(row => selected.has(rowKey(row)) && row.barcodes.length));
  table.onchange = event => {
    const checkbox = event.target.closest("[data-barcode-select]");
    if (!checkbox) return;
    const key = rowKey(visible[checkbox.closest("tr").dataset.barcodeRow]);
    if (checkbox.checked) selected.add(key); else selected.delete(key);
    selectedButton.textContent = selected.size ? `Cetak Label (${selected.size})` : "Cetak Label";
    selectedButton.disabled = !selected.size;
  };
  table.onclick = async event => {
    const button = event.target.closest("[data-barcode-action]");
    if (!button || button.disabled) return;
    const row = visible[button.closest("tr").dataset.barcodeRow];
    const action = button.dataset.barcodeAction;
    if (action === "print") return printLabels([row]);
    if (action === "generate") {
      button.disabled = true;
      try {
        const { barcode } = await write(api, "/generate", row);
        if (!row.barcodes.some(entry => entry.code === barcode.code)) row.barcodes.push(barcode);
        if (page.isConnected) { draw(); toast("Barcode internal tersimpan", "success"); }
      } catch (error) { if (page.isConnected) toast(error.message, "error"); }
      finally { if (button.isConnected) button.disabled = false; }
      return;
    }
    const detail = showDialog(action === "scan" ? "Scan Barcode" : "Edit Barcode", `<div class="barcode-target-heading">
      <strong>${e(row.name)}</strong><small>${e([row.variant, row.sku].filter(Boolean).join(" · "))}</small></div><div data-barcode-editor></div>`);
    editBarcodeRows(detail.querySelector("[data-barcode-editor]"), [row], ctx, {
      focus: action === "scan",
      onUpdate: target => {
        if (!target.barcodes.length) selected.delete(rowKey(target));
        if (page.isConnected) draw();
      }
    });
  };
  try {
    const result = await api(API + "/catalog");
    if (!page.isConnected) return;
    rows = result.rows;
    for (const name of [...new Set(rows.map(row => row.category))].sort((a, b) => a.localeCompare(b, "id"))) {
      category.add(new Option(name, name));
    }
    draw();
  } catch (error) {
    if (page.isConnected) table.innerHTML = `<tr><td colspan="5" role="alert">${e(error.message)}</td></tr>`;
  }
}
