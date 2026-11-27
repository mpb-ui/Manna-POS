import { normalizedStockUnit, stockMethodLabel, stockSetupNeedsCount } from "./stock-methods.js";
import { compareMasterNames } from "./master-filters.js";
import { witaDay } from "./order-rules.js";
import { signalStockUpdate, stockScanAccess, stockUpdatedKey } from "./stock-scan-rules.js";

const stockDateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Makassar" });
const stockDateLabel = day => stockDateFormat.format(new Date(`${day}T00:00:00+08:00`));

export function createStockUi(c) {
  const h = c.escapeHtml;
  const units = ["m²", "m lari", "pcs", "lbr", "lembar", "kg", "pack", "rim", "set", "roll"];
  const unitOptions = (selected = "pcs") => [...new Set([...units, selected])].map(unit =>
    `<option value="${h(unit)}" ${unit === selected ? "selected" : ""}>${h(unit)}</option>`).join("");
  const methodOptions = method => [["UNIT", "Per Satuan"], ["ROLL", "Per Roll"]].map(([key, label]) =>
    `<option value="${key}" ${method === key ? "selected" : ""}>${label}</option>`).join("");
  const row = (label, control) => `<label class="material-field"><span>${label}</span>${control}</label>`;
  const number = (name, value, unit, attrs = "") => `<span class="input-with-unit"><input name="${name}" type="number" value="${h(value)}" ${attrs}><b ${unit ? "" : "data-physical-unit"} aria-hidden="true">${h(unit)}</b></span>`;
  const formatted = value => Number(value ?? 0).toLocaleString("id-ID", { maximumFractionDigits: 4 });
  const timestamp = value => value && Number.isFinite(Date.parse(value))
    ? c.dateFormat.format(new Date(value)).replace(/(\d{1,2})\.(\d{2})$/, "$1:$2") : "—";
  let refreshPending = false;
  let refreshing = false;
  let lastRefresh = 0;
  const currentStockView = () => c.state.view === "stock" && c.can("stock.view") && c.root.querySelector(".stock-page");

  async function refreshStock() {
    if (!currentStockView() || c.dialog.open || refreshing) return;
    const userId = c.state.currentUser?.id;
    refreshing = true;
    refreshPending = false;
    try {
      const { inventory } = await c.api("/api/stock-balances");
      if (!currentStockView() || c.state.currentUser?.id !== userId) return;
      if (c.dialog.open) { refreshPending = true; return; }
      c.state.inventory = inventory;
      renderStock();
    } catch (error) {
      if (currentStockView()) c.toast(error.message, "error");
    } finally {
      refreshing = false;
      if (refreshPending && !c.dialog.open) refreshStock();
    }
  }

  window.addEventListener("storage", event => {
    if (event.key !== stockUpdatedKey || !currentStockView()) return;
    refreshPending = true;
    refreshStock();
  });
  window.addEventListener("focus", () => {
    if (!currentStockView() || Date.now() - lastRefresh < 15000) return;
    refreshPending = true;
    refreshStock();
  });
  c.dialog.addEventListener("close", () => { if (refreshPending) refreshStock(); });
  const canConfigureStock = () => c.can("stock.view") && c.can("stock.adjust") && c.can("master.materials");
  const countSnapshot = stock => ({
    expectedQuantity:Number(stock.quantity), expectedUnit:stock.unit, expectedMethod:stock.stockMethod, expectedUpdatedAt:stock.updatedAt
  });
  const countFields = () => [
    row("Hasil Hitung Fisik", number("stockOpeningBalance", "", "", 'min="0" step="any" required')),
    row("Alasan", '<input name="stockCountReason" required maxlength="250" placeholder="Contoh: Hitung fisik gudang">')
  ].join("");
  const stockSummary = (stock, label) => `<div class="stock-entry-summary"><span>${h(stock.productName)}</span><strong>${label} ${formatted(stock.quantity)} ${h(stock.unit)}</strong></div>`;
  const stockFooter = label => `<p class="stock-form-error" role="alert" data-stock-form-error hidden></p><div class="form-footer sticky-form-footer"><button class="secondary" type="button" data-close-stock>Batal</button><button class="primary" type="submit">${label}</button></div>`;

  function bindSave(form, submit) {
    const feedback = form.querySelector("[data-stock-form-error]");
    form.querySelector("[data-close-stock]")?.addEventListener("click", () => c.dialog.close());
    form.onsubmit = async event => {
      event.preventDefault();
      if (form.dataset.saving) return;
      form.dataset.saving = "true";
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      if (feedback) feedback.hidden = true;
      try { await submit(Object.fromEntries(new FormData(form))); }
      catch (error) {
        if (feedback && c.dialog.open) {
          feedback.hidden = false;
          feedback.textContent = error.message;
        } else c.toast(error.message, "error");
      }
      finally { delete form.dataset.saving; button.disabled = false; }
    };
  }

  function openMaterialForm(material = null) {
    const method = material?.stockMethod || "UNIT";
    const stock = material && c.state.inventory.find(row => row.materialId === material.id);
    const allowCount = Boolean(stock && canConfigureStock());
    const input = (name, value, extra = "") => `<input name="${name}" value="${h(value ?? "")}" ${extra}>`;
    const detail = c.showMasterDialog(material ? "Edit Bahan" : "Tambah Bahan", `<form id="material-form" class="master-form" data-compact-master-form>
      <div class="material-fields">
        ${row("SKU Bahan", input("sku", material?.sku, "required"))}
        ${row("Nama Bahan", input("name", material?.name, "required"))}
        ${row("Kategori Bahan", `<select name="category" required>${[...(c.state.catalogOptions.materialCategories || [])].sort((a,b)=>a.localeCompare(b,"id")).map(category=>`<option value="${h(category)}" ${category === (material?.category || "Lainnya") ? "selected" : ""}>${h(category)}</option>`).join("")}</select>`)}
        ${row("Satuan Kalkulasi", `<select name="unit">${unitOptions(material?.unit)}</select>`)}
        ${material ? '<p class="product-note material-edit-note" data-calculation-note hidden>Periksa HPP per satuan baru dan takaran bahan pada produk terkait. Sistem tidak mengonversi nilainya.</p>' : ""}
        ${row("Harga Dasar / HPP", `<span class="material-cost"><b aria-hidden="true">Rp</b><input name="cost" type="number" min="0" step="any" value="${h(material?.cost ?? "")}"></span>`)}
        ${row("Metode Pencatatan Stok", `<select name="stockMethod">${methodOptions(method)}</select>`)}
        <div data-roll-width ${method === "ROLL" ? "" : "hidden"}>${row("Lebar Roll", number("rollWidthCm", material?.rollWidthCm ?? "", "cm", 'min="0.01" step="any" placeholder="110"'))}</div>
        ${row("Supplier", input("supplier", material?.supplier))}
        <div class="material-balances">
          ${row("Stok Minimum", number("minStock", material?.minStock || "", "", 'min="0" step="any"'))}
          ${material ? "" : row("Stok Awal", number("stock", "", "", 'min="0" step="any" placeholder="0"'))}
        </div>
        ${material ? `<div class="material-balances" data-material-count hidden>
          <p class="product-note material-edit-note">${allowCount ? `Saldo tercatat: ${formatted(stock.quantity)} ${h(stock.unit)}. Masukkan hasil hitung dalam satuan baru. Saldo lama tetap tercatat di riwayat.` : "Perubahan metode atau satuan stok fisik memerlukan akses penyesuaian stok."}</p>
          ${allowCount ? countFields() : ""}
        </div>` : ""}
      </div>
      <div class="form-footer sticky-form-footer material-footer">${c.switchHtml("active", material?.active !== false)}${c.deleteButtonHtml(material,"Bahan")}<button class="primary" type="submit">Simpan Bahan</button></div></form>`);
    c.bindDeleteRecord(detail,material,"materials","Bahan","materials");
    const form = detail.querySelector("form"), fields = form.elements;
    const needsCount = () => material && stockSetupNeedsCount(material, fields.stockMethod.value, fields.unit.value);
    const countSection = form.querySelector("[data-material-count]");
    const calculationNote = form.querySelector("[data-calculation-note]");
    let previousNeedsCount = false;
    const originalMinimum = fields.minStock.value;
    bindStockUnits(form, material ? "stockOpeningBalance" : "stock", roll => {
      if (!material) return;
      const changing = Boolean(needsCount());
      calculationNote.hidden = normalizedStockUnit(fields.unit.value) === normalizedStockUnit(material.unit);
      countSection.hidden = !changing;
      countSection.querySelectorAll("input").forEach(field => { field.disabled = !changing; });
      if (changing !== previousNeedsCount) fields.minStock.value = changing ? "" : originalMinimum;
      previousNeedsCount = changing;
      fields.rollWidthCm.required = roll && changing;
    });
    bindSave(form, async values => {
      values.active = fields.active.checked;
      if (needsCount()) {
        if (!allowCount) throw new Error("Perubahan metode atau satuan stok fisik memerlukan akses penyesuaian stok.");
        Object.assign(values, countSnapshot(stock), { confirmStockCount:true });
      }
      await c.api(material ? `/api/materials/${encodeURIComponent(material.id)}` : "/api/materials", { method:material ? "PUT" : "POST", body:JSON.stringify(values) });
      c.dialog.close(); await c.load(); c.toast("Bahan berhasil disimpan");
    });
  }

  function setStockUnit(form, balanceName, unit, roll) {
    const balance = form.elements[balanceName];
    if (balance) balance.step = roll ? "1" : "any";
    for (const label of form.querySelectorAll("[data-physical-unit]")) label.textContent = unit;
  }

  function bindStockUnits(form, balanceName, onSync) {
    const fields = form.elements;
    const sync = () => {
      const roll = fields.stockMethod.value === "ROLL";
      form.querySelector("[data-roll-width]").hidden = !roll;
      fields.rollWidthCm.required = roll;
      fields.rollWidthCm.disabled = !roll;
      setStockUnit(form, balanceName, roll ? "roll" : fields.unit.value, roll);
      onSync(roll);
    };
    fields.stockMethod.onchange = fields.unit.onchange = sync;
    sync();
    return sync;
  }

  function openStockCount(stock) {
    if (!stock) return;
    const material = canConfigureStock() && c.state.materials.find(row => row.id === stock.materialId);
    const needsSetup = stock.stockNeedsCount;
    if (needsSetup && !material) return;
    const detail = c.showMasterDialog("Stok Opname", `<form id="stock-count-form" class="master-form" data-compact-master-form>
      ${stockSummary(stock, "Saldo tercatat")}
      ${needsSetup ? '<p class="product-note">Tetapkan saldo dalam jumlah roll berdasarkan hasil hitung fisik.</p>' : ""}
      <div class="material-fields">${countFields()}</div>
      ${material ? `${needsSetup ? "" : '<label class="stock-check"><input type="checkbox" data-configure-stock> Ubah pengaturan stok</label>'}
      <fieldset class="material-fields stock-count-settings" data-stock-setup ${needsSetup ? "" : "hidden disabled"}>
        ${row("Metode Pencatatan Stok", `<select name="stockMethod">${methodOptions(stock.stockMethod)}</select>`)}
        ${row("Satuan Kalkulasi", `<select name="unit">${unitOptions(material.unit)}</select>`)}
        <div data-roll-width>${row("Lebar Roll", number("rollWidthCm", material.rollWidthCm ?? "", "cm", 'min="0.01" step="any" placeholder="110"'))}</div>
        ${row("Stok Minimum", number("minStock", material.minStock ?? "", "", 'min="0" step="any"'))}
      </fieldset>` : ""}
      ${stockFooter("Simpan Stok Opname")}
    </form>`, "Stok Bahan");
    const form = detail.querySelector("form");
    const fields = form.elements;
    const setup = form.querySelector("[data-stock-setup]");
    const useCurrentUnit = () => setStockUnit(form, "stockOpeningBalance", stock.unit, stock.stockMethod === "ROLL");
    if (setup) {
      const originalMinimum = fields.minStock.value;
      let previousNeedsCount = false;
      const sync = bindStockUnits(form, "stockOpeningBalance", () => {
        if (setup.disabled) return useCurrentUnit();
        const changing = stockSetupNeedsCount(material, fields.stockMethod.value, fields.unit.value);
        if (changing !== previousNeedsCount) fields.minStock.value = changing ? "" : originalMinimum;
        previousNeedsCount = changing;
      });
      const toggle = form.querySelector("[data-configure-stock]");
      toggle?.addEventListener("change", () => {
        setup.hidden = setup.disabled = !toggle.checked;
        sync();
      });
    } else useCurrentUnit();
    bindSave(form, async values => {
      await c.api(`/api/inventory/${encodeURIComponent(stock.sku)}/count`, { method:"POST", body:JSON.stringify({
        ...values, ...countSnapshot(stock)
      }) });
      c.dialog.close(); await c.load(); c.toast("Stok opname berhasil dicatat");
    });
  }

  function movementHtml(move) {
    const count = move.type === "METHOD_OPENING";
    const change = Number(move.change);
    const quantity = count ? `= ${formatted(move.balance)}` : `${change > 0 ? "+" : ""}${formatted(change)}`;
    const tone = change > 0 ? "plus" : change < 0 ? "minus" : "";
    const invoice = move.orderId && move.orderCode && c.can("orders.view")
      ? `<button type="button" class="movement-order-link" data-stock-order="${h(move.orderId)}" aria-haspopup="dialog" aria-label="Detail pesanan ${h(move.orderCode)}">${h(move.orderCode)}</button>`
      : h(move.orderCode || "");
    const source = move.source === "BARCODE" ? "Barcode"
      : move.source === "CORRECTION" ? "Koreksi Stok"
      : count ? "Stok Opname"
      : ["AUTO_USE", "DEFECT_EXCHANGE"].includes(move.type) ? "Otomatis POS"
      : move.type ? "Input Manual" : "";
    const attribution = [source, move.actor].filter(Boolean).map(h).join(" · ");
    const correction = move.source === "BARCODE" && stockScanAccess(c.state.currentUser).correct
      ? `<button type="button" class="movement-order-link" data-stock-correct="${h(move.id)}" aria-haspopup="dialog">Koreksi</button>` : "";
    return `<article class="stock-movement">
      <div class="stock-movement-top"><strong>${h(move.productName)}</strong><span class="stock-movement-delta ${tone}">${quantity} ${h(move.unit || "")}</span></div>
      <p>${h(move.reason)}${invoice ? ` · ${invoice}` : ""}${count ? `<br>Saldo lama: ${formatted(move.previousBalance)} ${h(move.previousUnit)}` : ""}</p>
      <div class="stock-movement-meta">
        <div class="stock-movement-labels"><time datetime="${h(move.createdAt)}">${h(timestamp(move.createdAt))}</time>${attribution ? `<small class="stock-movement-source">${attribution}</small>` : ""}</div>
        ${correction}
      </div>
    </article>`;
  }

  function renderStock() {
    lastRefresh = Date.now();
    const { inventory, materials } = c.state;
    const legacyIds = new Set(materials.filter(material => material.lfLegacyGroup).map(material => material.id));
    const categories = [...new Set(inventory.map(stock => stock.category || "Lainnya"))].sort(compareMasterNames);
    const sortedStock = [...inventory].sort((a, b) => compareMasterNames(a.productName, b.productName) || compareMasterNames(a.sku, b.sku));
    const selectedDate = c.state.stockMovementDate || witaDay();
    const allowActions = c.can("stock.adjust");
    const allowSetup = canConfigureStock();
    const scanAccess = stockScanAccess(c.state.currentUser);
    const stockRow = stock => {
      const category = h(stock.category || "Lainnya");
      const sku = h(stock.sku);
      const unit = h(stock.unit);
      const pending = stock.stockNeedsCount;
      const lowStock = !pending && Number(stock.quantity) <= Number(stock.minStock || 0);
      const [updateDate, updateTime] = timestamp(stock.updatedAt).split(", ");
      return `<tr data-stock-row data-search="${h(`${stock.productName} ${stock.sku}`.toLowerCase())}" data-category="${category}">
        <td class="stock-item"><strong>${h(stock.productName)}</strong><small>${sku}</small>
          ${legacyIds.has(stock.materialId) ? '<small>Bahan generik lama · saldo belum dibagi</small>' : ""}
          ${stock.rollWidthCm ? `<small>Lebar ${h(stock.rollWidthCm)} cm</small>` : ""}
          ${stock.productId ? '<small>Barang Dagangan</small>' : ""}</td>
        <td><span class="mini-chip stock-category">${category}</span></td>
        <td class="stock-balance${lowStock ? " stock-negative" : ""}">${formatted(stock.quantity)} ${unit}${pending ? "<small>Saldo lama</small>" : ""}</td>
        <td class="stock-minimum">${formatted(stock.minStock)} ${unit}</td>
        <td class="stock-method">${stockMethodLabel(stock.stockMethod)}${pending ? "<small>Perlu stok opname roll</small>" : ""}</td>
        <td class="stock-updated">${h(updateDate)}${updateTime ? `,<br>${h(updateTime)}` : ""}</td>
        ${allowActions ? `<td><div class="stock-actions">
          ${pending ? "" : `<button type="button" class="primary" data-stock-movement="${sku}" aria-haspopup="dialog">Stok Masuk / Keluar</button>`}
          ${!pending || allowSetup && stock.materialId ? `<button type="button" class="${pending ? "primary" : "secondary"}" data-stock-count="${sku}" aria-haspopup="dialog">Stok Opname</button>` : ""}
        </div></td>` : ""}
      </tr>`;
    };
    c.root.innerHTML = `<div class="stock-page unified-page">
      <header class="page-toolbar"><h1>Stok Bahan</h1>
        <div class="stock-scan-links">
          ${scanAccess.print ? '<a class="secondary" href="/stock/scan/print">Cetak Barcode</a>' : ""}
          ${scanAccess.scan ? '<a class="primary" href="/stock/scan">Stock Scan</a>' : ""}
        </div>
      </header>
      <div class="stock-grid">
        <section class="panel stock-list" aria-labelledby="stock-list-title">
          <div class="panel-head stock-list-head"><h2 id="stock-list-title">Daftar Bahan</h2>
            <div class="stock-filters"><input id="stock-search" type="search" class="search" value="${h(c.state.stockSearch)}" aria-label="Cari bahan atau SKU" placeholder="Cari bahan atau SKU">
              <select id="stock-category" class="filter-select" aria-label="Kategori bahan"><option value="">Semua kategori</option>${categories.map(category => `<option value="${h(category)}" ${category === c.state.stockCategory ? "selected" : ""}>${h(category)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="table-wrap"><table class="stock-table" aria-labelledby="stock-list-title"><thead><tr>
            <th scope="col">Bahan</th><th scope="col">Kategori</th><th scope="col">Stok</th><th scope="col">Minimum</th>
            <th scope="col">Metode</th><th scope="col">Update</th>${allowActions ? '<th scope="col">Aksi</th>' : ""}
          </tr></thead><tbody>${sortedStock.map(stockRow).join("")}</tbody></table></div>
          <div id="stock-empty" class="cart-empty hidden">Bahan tidak ditemukan.</div>
        </section>
        <aside class="panel stock-movement-panel" aria-labelledby="stock-movement-title">
          <div class="panel-head stock-movement-head"><h2 id="stock-movement-title">Mutasi Stok</h2>
            <label class="stock-movement-date">
              <span aria-hidden="true" data-stock-date-label>${h(stockDateLabel(selectedDate))}</span>
              <img src="/stock-assets/calendar.svg" width="12" height="12" alt="">
              <input type="date" id="stock-movement-date" aria-label="Tanggal mutasi stok (WITA)" value="${h(selectedDate)}" required>
            </label>
          </div>
          <div id="stock-movement-list" aria-busy="true"></div>
          <button type="button" class="secondary" id="stock-more-movements" hidden>Mutasi lainnya</button>
        </aside>
      </div>
    </div>`;
    const search = c.root.querySelector("#stock-search");
    const category = c.root.querySelector("#stock-category");
    const empty = c.root.querySelector("#stock-empty");
    const rows = c.root.querySelectorAll("[data-stock-row]");
    const apply = () => {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      for (const row of rows) {
        const show = row.dataset.search.includes(query) && (!category.value || row.dataset.category === category.value);
        row.classList.toggle("hidden", !show);
        if (show) visible++;
      }
      empty.classList.toggle("hidden", visible > 0);
      c.state.stockSearch = search.value;
      c.state.stockCategory = category.value;
    };
    search.oninput = category.onchange = apply;
    apply();
    c.root.querySelectorAll("[data-stock-movement]").forEach(button => button.onclick = () => openStockEntry(inventory.find(stock => stock.sku === button.dataset.stockMovement)));
    c.root.querySelectorAll("[data-stock-count]").forEach(button => button.onclick = () => openStockCount(inventory.find(stock => stock.sku === button.dataset.stockCount)));
    bindStockMovements();
  }

  function bindStockMovements() {
    const movementList = c.root.querySelector("#stock-movement-list");
    const datePicker = c.root.querySelector("#stock-movement-date");
    const dateLabel = c.root.querySelector("[data-stock-date-label]");
    const more = c.root.querySelector("#stock-more-movements");
    const status = message => `<p class="stock-movement-status" role="status">${h(message)}</p>`;
    let selectedDate = datePicker.value;
    let offset = 0;
    let requestVersion = 0;
    let openingOrder = false;

    movementList.onclick = async event => {
      const correct = event.target.closest("[data-stock-correct]");
      if (correct) {
        if (correct.disabled || c.dialog.open || !stockScanAccess(c.state.currentUser).correct) return;
        correct.disabled = true;
        try { await openScanCorrection(correct); }
        catch (error) { if (correct.isConnected) c.toast(error.message, "error"); }
        finally { correct.disabled = false; }
        return;
      }
      const button = event.target.closest("[data-stock-order]");
      if (!button || openingOrder || c.dialog.open || c.state.view !== "stock" || !c.can("orders.view")) return;
      const userId = c.state.currentUser?.id;
      const active = () => button.isConnected && c.state.view === "stock" && c.state.currentUser?.id === userId && c.can("orders.view");
      openingOrder = true;
      button.setAttribute("aria-busy", "true");
      try {
        const order = await c.api(`/api/order-history/${encodeURIComponent(button.dataset.stockOrder)}`);
        if (active() && !c.dialog.open) c.showOrderDetail(order);
      } catch (error) {
        if (active()) c.toast(error.message, "error");
      } finally {
        openingOrder = false;
        button.removeAttribute("aria-busy");
      }
    };

    async function loadPage() {
      const version = ++requestVersion;
      const pageOffset = offset;
      const active = () => version === requestVersion && movementList.isConnected && c.state.view === "stock";
      more.disabled = true;
      movementList.setAttribute("aria-busy", "true");
      if (!pageOffset) {
        more.hidden = true;
        movementList.innerHTML = status("Memuat mutasi stok…");
      }
      try {
        const { movements, hasMore } = await c.api(`/api/stock-movements?date=${encodeURIComponent(selectedDate)}&offset=${pageOffset}&limit=15`);
        if (!active()) return;
        const html = movements.map(movementHtml).join("");
        if (pageOffset) movementList.insertAdjacentHTML("beforeend", html);
        else movementList.innerHTML = html || status("Belum ada mutasi pada tanggal ini.");
        const knownIds = new Set(c.state.stockMovements.map(move => move.id));
        c.state.stockMovements.push(...movements.filter(move => !knownIds.has(move.id)));
        offset = pageOffset + movements.length;
        more.textContent = "Mutasi lainnya";
        more.hidden = !hasMore;
      } catch (error) {
        if (!active()) return;
        if (pageOffset) c.toast(error.message, "error");
        else movementList.innerHTML = status(error.message);
        more.textContent = "Coba lagi";
        more.hidden = false;
      } finally {
        if (active()) {
          more.disabled = false;
          movementList.removeAttribute("aria-busy");
        }
      }
    }

    datePicker.onchange = () => {
      if (!datePicker.value) datePicker.value = selectedDate;
      if (datePicker.value === selectedDate) return;
      selectedDate = datePicker.value;
      c.state.stockMovementDate = selectedDate;
      dateLabel.textContent = stockDateLabel(selectedDate);
      offset = 0;
      loadPage();
    };
    more.onclick = loadPage;
    loadPage();
  }

  async function openScanCorrection(button) {
    const userId = c.state.currentUser?.id;
    const path = `/api/stock/scan/movements/${encodeURIComponent(button.dataset.stockCorrect)}/correction`;
    const details = await c.api(path);
    if (!button.isConnected || c.state.currentUser?.id !== userId || !currentStockView() || c.dialog.open) return;
    const { current, original, correction, issue } = details;
    const maximum = Math.abs(original.change);
    const origin = `${original.change > 0 ? "+" : "−"}${formatted(maximum)} roll · ${h(original.actor)} · ${h(timestamp(original.createdAt))} WITA`;
    const detail = c.showMasterDialog("Koreksi Stok Barcode", `
      <form id="scan-correction-form" class="master-form" data-compact-master-form>
        <div class="stock-entry-summary"><span>${h(original.productName)} · ${h(original.rollWidthCm)} cm</span><strong>${h(original.sku)}</strong></div>
        <p class="product-note">Mutasi asal ${origin}</p>
        ${issue ? `<p role="status">${h(issue)}${correction ? ` ${h(correction.actor)} · ${h(timestamp(correction.createdAt))} WITA.` : ""}</p>
          <div class="form-footer"><button type="button" class="secondary" data-close-stock>Tutup</button></div>`
        : `${row(original.change > 0 ? "Roll dikeluarkan" : "Roll dikembalikan", number("quantity", maximum, "roll", `min="1" max="${maximum}" step="1" required`))}
          <p class="product-note">Saldo saat ini <strong>${formatted(current.balance)} roll</strong>. Setiap mutasi asal memiliki satu kesempatan koreksi.</p>
          ${row("Alasan koreksi", '<input name="reason" maxlength="250" required>')}
          <label class="stock-check"><input type="checkbox" name="physicalConfirmed" required> Saya sudah memeriksa kondisi fisik roll dan jumlah koreksi.</label>
          ${stockFooter("Simpan Koreksi")}`}
      </form>`, "Stok Bahan");
    const form = detail.querySelector("#scan-correction-form");
    if (issue) {
      form.querySelector("[data-close-stock]").onclick = () => c.dialog.close();
      return;
    }
    let version = current.version;
    let request = null;
    const submit = form.querySelector("[type=submit]");
    bindSave(form, async values => {
      request ||= { requestId: crypto.randomUUID(), quantity: Number(values.quantity), reason: values.reason, physicalConfirmed: values.physicalConfirmed === "on", version };
      try { await c.api(path, { method: "POST", body: JSON.stringify(request) }); }
      catch (error) {
        if (["SCAN_CORRECTION_REVIEW", "SCAN_INPUT"].includes(error.code)) {
          request = null;
          form.querySelectorAll("input").forEach(input => { input.readOnly = false; });
          const latest = await c.api(path);
          if (latest.issue) throw new Error(latest.issue);
          version = latest.current.version;
          form.querySelector(".product-note strong").textContent = `${formatted(latest.current.balance)} roll`;
          form.elements.physicalConfirmed.checked = false;
        } else {
          form.querySelectorAll("input:not([type=checkbox])").forEach(input => { input.readOnly = true; });
          submit.textContent = "Cek & ulangi";
        }
        throw error;
      }
      refreshPending = true;
      c.dialog.close();
      signalStockUpdate();
      c.toast("Koreksi stok tersimpan");
    });
  }
  function openStockEntry(stock) {
    if (!stock || stock.stockNeedsCount) return;
    const roll = stock.stockMethod === "ROLL";
    const today = witaDay();
    const returns = c.state.stockMovements.filter(move => move.sku === stock.sku && move.type === "AUTO_USE" && move.unit === stock.unit);
    const detail = c.showMasterDialog("Stok Masuk / Keluar", `<form id="stock-entry-form" class="master-form" data-compact-master-form>
      ${stockSummary(stock, "Stok saat ini")}
      <fieldset class="stock-direction" data-stock-direction>
        <legend>Jenis Mutasi</legend>
        <div>
          <label><input class="visually-hidden" type="radio" name="direction" value="in" checked><span>Stok Masuk</span></label>
          <label><input class="visually-hidden" type="radio" name="direction" value="out"><span>Stok Keluar</span></label>
        </div>
      </fieldset>
      <div class="form-grid">
        <label class="field"><span data-stock-quantity-label>Jumlah stok masuk</span>${number("change", "", stock.unit, roll ? 'min="1" step="1" required' : 'min="0.0001" step="any" required')}</label>
        <label class="field"><span>Tanggal stok</span><input name="movementDate" type="date" value="${today}" required></label>
        <label class="field full"><span>Alasan</span><input name="reason" value="Stok masuk" required></label>
        ${returns.length ? `<label class="field full" data-stock-reversal><span>Koreksi mutasi transaksi (opsional)</span>
          <select name="reversalOf"><option value="">Pilih mutasi asal</option>${returns.map(move => `<option value="${h(move.id)}">${h(move.orderCode || "Transaksi")} · ${formatted(-move.change)} ${h(move.unit)}</option>`).join("")}</select>
        </label><label class="stock-check field full" data-stock-returned hidden><input type="checkbox" name="physicalReturned" disabled> Barang sudah kembali secara fisik</label>` : ""}
      </div>
      ${stockFooter("Simpan Mutasi Stok")}
    </form>`, "Stok Bahan");
    const form = detail.querySelector("form");
    const fields = form.elements;
    const quantityLabel = form.querySelector("[data-stock-quantity-label]");
    const reversal = form.querySelector("[data-stock-reversal]");
    const returned = form.querySelector("[data-stock-returned]");
    const requestId = crypto.randomUUID();
    let defaultReason = "Stok masuk";
    const syncDirection = () => {
      const outgoing = fields.direction.value === "out";
      const reason = outgoing ? (roll ? "Roll dibuka untuk produksi" : "Stok keluar") : "Stok masuk";
      if (fields.reason.value === defaultReason) fields.reason.value = reason;
      defaultReason = reason;
      quantityLabel.textContent = outgoing ? "Jumlah stok keluar" : "Jumlah stok masuk";
      if (!reversal) return;
      reversal.hidden = fields.reversalOf.disabled = outgoing;
      returned.hidden = fields.physicalReturned.disabled = outgoing || !fields.reversalOf.value;
      fields.physicalReturned.required = !returned.hidden;
      if (returned.hidden) fields.physicalReturned.checked = false;
    };
    form.querySelector("[data-stock-direction]").onchange = syncDirection;
    if (reversal) fields.reversalOf.onchange = syncDirection;
    bindSave(form, async ({ direction, change, movementDate, reason, reversalOf, physicalReturned }) => {
      const quantity = Number(change);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Jumlah stok harus lebih dari nol");
      await c.api(`/api/inventory/${encodeURIComponent(stock.sku)}`, { method: "PATCH", body: JSON.stringify({
        change: direction === "out" ? -quantity : quantity, movementDate, reason, reversalOf, physicalReturned: physicalReturned === "on",
        requestId, expectedUnit: stock.unit, expectedMethod: stock.stockMethod
      }) });
      c.dialog.close(); await c.load(); c.toast("Mutasi stok berhasil dicatat");
    });
  }
  return { openMaterialForm, renderStock };
}
