const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
function localDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function makassarInputToIso(value) { return value ? new Date(`${value}:00+08:00`).toISOString() : ""; }
const productCategories = [
  ["all", "Semua"], ["outdoor", "Outdoor"], ["print-a3", "Print A3+"], ["lf-poster", "LF Poster"],
  ["lf-sticker", "LF Sticker"], ["display-banner", "Display & Banner"],
  ["merchandise", "Merchandise"], ["atk", "ATK"]
];
const fileServices = [
  { id: "READY", name: "File Siap Cetak", price: 0 },
  { id: "DESIGN_A", name: "Biaya Design A", price: 25000 },
  { id: "DESIGN_B", name: "Biaya Design B", price: 35000 },
  { id: "DESIGN_C", name: "Biaya Design C", price: 50000 },
  { id: "DESIGN_D", name: "Biaya Design D", price: 80000 }
];
const state = {
  products: [], allProducts: [], materials: [], finishings: [], machines: [], orders: [], inventory: [], stockMovements: [], statusLabels: {},
  cart: [], view: "pos", selectedProduct: null, selectedCategory: "all", editingOrderId: null,
  masterTab: "products", projectView: "list", projectSearch: "", projectDeadline: "all", projectPic: "all", projectPayment: "all", projectStatus: "all",
  projectCollapsed: new Set(["DIAMBIL"]),
  draft: { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK" }
};
const root = document.querySelector("#view-root");
const dialog = document.querySelector("#order-dialog");
const printDocument = document.querySelector("#print-document");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") showLogin();
  if (!response.ok) throw new Error(body.error || "Permintaan gagal");
  return body;
}

function toast(message, type = "") {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.className = `toast show ${type}`;
  setTimeout(() => element.className = "toast", 2600);
}

function showLogin() {
  document.querySelector("#login-view").classList.remove("hidden");
  document.querySelector("#app-shell").classList.add("hidden");
}
function showApp() {
  document.querySelector("#login-view").classList.add("hidden");
  document.querySelector("#app-shell").classList.remove("hidden");
}

async function load() {
  const data = await api("/api/bootstrap");
  Object.assign(state, data);
  document.querySelector("#active-count").textContent = state.orders.filter((o) => !["SELESAI", "DIAMBIL"].includes(o.status)).length;
  render();
}

function render() {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  document.querySelector("#page-title").textContent = { pos: "Point of Sale", projects: "Project Management", stock: "Stok Bahan", master: "Master Data" }[state.view];
  if (state.view === "pos") renderPos();
  if (state.view === "projects") renderProjects();
  if (state.view === "stock") renderStock();
  if (state.view === "master") renderMaster();
}

function selectedProduct() { return state.products.find((p) => p.id === state.selectedProduct); }
function discountActive(product, at = new Date()) {
  const discount = product?.discount;
  if (!discount?.enabled || Number(discount.value || 0) <= 0) return false;
  const timestamp = at.getTime();
  return (!discount.startsAt || timestamp >= new Date(discount.startsAt).getTime()) && (!discount.endsAt || timestamp <= new Date(discount.endsAt).getTime());
}
function promoPrice(product, price) {
  if (!discountActive(product)) return Number(price || 0);
  const value = Number(product.discount.value || 0);
  return product.discount.type === "nominal" ? Math.max(0, Number(price) - value) : Math.max(0, Math.round(Number(price) * (1 - Math.min(value, 100) / 100)));
}
function discountLabel(product) { return product.discount?.type === "nominal" ? `Hemat ${rupiah.format(product.discount.value)}` : `Diskon ${Number(product.discount?.value || 0)}%`; }
function billedLength(value) { return Math.max(1, Math.ceil(Number(value || 1) * 2 - 1e-9) / 2); }
function productBase(product, width, length, quantity) {
  const billed = billedLength(length);
  const units = product.priceBasis === "sqm" ? Number(width) * billed * Number(quantity) : billed * Number(quantity);
  const tier = product.wholesaleEnabled ? (product.priceTiers || []).filter((item) => Number(item.min) <= quantity && (item.max == null || item.max === "" || quantity <= Number(item.max))).sort((a, b) => Number(b.min) - Number(a.min))[0] : null;
  const originalUnitPrice = Number(tier?.price ?? product.price);
  const unitPrice = promoPrice(product, originalUnitPrice);
  return { billed, total: units * unitPrice, unitPrice, originalUnitPrice, tier, discountApplied: unitPrice < originalUnitPrice };
}
function suggestedFinishUnits(finish, width, length) {
  if (finish.rule === "free") return 1;
  if (finish.rule === "point") return 4;
  if (finish.rule === "perimeter") return Math.ceil((Number(width) + Number(length)) * 2);
  if (finish.rule === "top_bottom") return Math.ceil(Number(width) * 2);
  if (finish.rule === "left_right") return Math.ceil(Number(length) * 2);
  if (finish.rule === "length") return Math.ceil(Number(length));
  return 1;
}

function finishingHtml(product) {
  if (!product.finishing.length) return '<span class="note">Tidak ada finishing tambahan untuk bahan ini.</span>';
  return product.finishing.map((finish) => `
    <div class="finish-option" data-finish-option="${finish.id}">
      <div class="finish-main">
        <input type="checkbox" id="f-${finish.id}" value="${finish.id}">
        <label for="f-${finish.id}"><strong>${finish.name}</strong><small>${finish.price ? rupiah.format(finish.price) + " /unit" : "Gratis"}</small></label>
      </div>
      <div class="finish-actions">
        <button type="button" class="finish-note-toggle" data-finish-note-toggle="${finish.id}" disabled>Catatan</button>
        <div class="qty-stepper hidden" data-stepper="${finish.id}">
          <button type="button" data-minus="${finish.id}">−</button>
          <input type="number" min="1" step="1" data-finish-qty="${finish.id}" value="1" aria-label="Jumlah ${finish.name}">
          <button type="button" data-plus="${finish.id}">+</button>
        </div>
      </div>
      <div class="finish-note-row hidden" data-finish-note-row="${finish.id}"><input type="text" data-finish-note="${finish.id}" placeholder="Catatan khusus ${escapeHtml(finish.name)}"></div>
    </div>`).join("");
}

function categoryKey(product) {
  return productCategories.find(([, label]) => label === product.category)?.[0] || "all";
}

function productsForCategory(category) {
  return category === "all"
    ? state.products.filter((product) => product.featured)
    : state.products.filter((product) => categoryKey(product) === category);
}

function productCardsHtml(products) {
  const recommended = state.selectedCategory === "all";
  return products.map((product) => `<div class="choice-card ${recommended ? "recommended-card" : ""}">
    <input type="radio" id="p-${product.id}" name="product" value="${product.id}" ${product.id === state.selectedProduct ? "checked" : ""}>
    <label for="p-${product.id}" role="button" tabindex="0" data-select-product="${product.id}" aria-pressed="${product.id === state.selectedProduct}">
      ${recommended ? `<span class="product-category">${escapeHtml(product.category)}</span>` : ""}
      ${discountActive(product) ? '<span class="discount-badge">DISKON</span>' : ""}<strong>${escapeHtml(product.name)}</strong><small>${discountActive(product) ? `<s>${rupiah.format(product.price)}</s> <b>${rupiah.format(promoPrice(product, product.price))}</b>` : rupiah.format(product.price)} ${escapeHtml(product.unitLabel)}</small>
      ${recommended ? `<em>★ ${escapeHtml(product.recommendation || "Produk pilihan")}</em>` : ""}
    </label>
  </div>`).join("");
}

function fileServicesHtml() {
  return `<div class="file-service-grid">${fileServices.map((service, index) => `<div class="chip file-service-chip"><input type="radio" name="file-service" id="file-${service.id}" value="${service.id}" ${index === 0 ? "checked" : ""}><label for="file-${service.id}"><strong>${service.name}</strong><small>${service.price ? rupiah.format(service.price) : "Tanpa biaya"}</small></label></div>`).join("")}</div>`;
}

function templateOptionsHtml(product) {
  const sizes = (product.sizeVariants || []).map((size, index) => `<div class="chip"><input type="radio" name="template-size" id="size-${size.id}" value="${size.width}x${size.length}" ${index === 0 ? "checked" : ""}><label for="size-${size.id}">${escapeHtml(size.label)}</label></div>`).join("");
  const designs = (product.designTemplates || []).map((code, index) => `<div class="template-chip"><input type="radio" name="template-design" id="template-${code}" value="${code}" ${index === 0 ? "checked" : ""}><label for="template-${code}"><span class="template-thumb template-tone-${index % 5 + 1}" aria-hidden="true"><i>${code.split("-")[0]}</i></span><span><strong>${code}</strong><small>+ ${rupiah.format(product.templateDesignPrice || 35000)}</small></span></label></div>`).join("");
  return `<div class="template-variant-block"><span class="variant-label">A. Pilih Ukuran</span><div class="chips">${sizes}</div></div><div class="template-variant-block"><span class="variant-label">B. Pilih Design Template</span><div class="template-design-grid">${designs}</div></div><label class="field template-quantity"><span>Jumlah Produk</span><span class="input-with-unit"><input id="quantity" type="number" min="1" step="1" value="1"><b>Lbr</b></span></label>`;
}

function catalogCardHtml(product, promo = false) {
  return `<button type="button" class="catalog-card ${promo ? "promo-card" : ""}" data-config-product="${product.id}">
    <div class="catalog-card-title"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.category)}</span></div>
    ${promo ? `<div class="catalog-promo-copy"><b>DISKON</b><p>${escapeHtml(discountLabel(product))}</p></div>` : ""}
    <div class="catalog-price">${promo ? `<s>${rupiah.format(product.price)}</s><strong>${rupiah.format(promoPrice(product, product.price))}</strong><em>${escapeHtml(discountLabel(product))}</em>` : `<strong>${rupiah.format(product.price)}</strong>`}<small>${escapeHtml(product.unitLabel)}</small></div>
  </button>`;
}

function allCatalogHtml() {
  const bestsellers = state.products.filter((product) => product.featured);
  const promos = state.products.filter((product) => discountActive(product));
  return `<div class="catalog-section"><div class="catalog-heading"><div><span>A</span><div><h3>Produk Terlaris</h3><p>Produk yang paling sering dipilih kasir.</p></div></div><b>${bestsellers.length} produk</b></div><div class="catalog-grid">${bestsellers.map((product) => catalogCardHtml(product)).join("") || '<div class="catalog-empty">Belum ada produk terlaris.</div>'}</div></div>
    <div class="catalog-section promo-section"><div class="catalog-heading"><div><span>B</span><div><h3>Produk Sedang Promo</h3><p>Promo aktif akan hilang otomatis setelah periodenya berakhir.</p></div></div><b>${promos.length} promo aktif</b></div><div class="catalog-grid">${promos.map((product) => catalogCardHtml(product, true)).join("") || '<div class="catalog-empty">Belum ada promo yang sedang aktif.</div>'}</div></div>`;
}

function productConfigurationHtml(product, popup = false) {
  const isUnit = product.priceBasis === "unit";
  const measurement = product.templateProduct ? templateOptionsHtml(product) : isUnit
    ? `<div class="form-grid"><label class="field"><span>Jumlah ${escapeHtml(product.unitName || "unit")}</span><input id="quantity" type="number" min="1" step="1" value="1"></label></div>`
    : `<div class="form-grid three"><div class="field full"><span>Lebar bahan</span><div class="chips" id="width-chips">${product.widths.map((width, index) => `<div class="chip"><input type="radio" name="width" id="w-${index}" value="${width}" ${index === 0 ? "checked" : ""}><label for="w-${index}">${width} meter</label></div>`).join("")}</div></div>
      <label class="field"><span>Panjang aktual</span><span class="input-with-unit"><input id="length" type="number" min="0.1" step="0.1" value="1"><b>m</b></span></label><label class="field"><span>Jumlah produk</span><span class="input-with-unit"><input id="quantity" type="number" min="1" step="1" value="1"><b>Lbr</b></span></label><div class="field"><span>Panjang ditagihkan</span><input id="billed-length" class="readonly-input" value="1 m" readonly aria-readonly="true"></div></div>`;
  const measurementTitle = product.templateProduct ? "Pilihan varian" : "Ukuran & jumlah";
  const fileSection = product.templateProduct ? "" : `<hr class="divider"><p class="section-label">${popup ? "File" : "3 · File"}</p>${fileServicesHtml()}`;
  const finishStep = product.templateProduct ? 3 : 4;
  const noteStep = finishStep + 1;
  return `<hr class="divider"><p class="section-label">${popup ? measurementTitle : `2 · ${measurementTitle}`}</p>${measurement}
    <p class="product-note" id="product-note">${escapeHtml(product.note)}</p>
    ${fileSection}
    <hr class="divider"><p class="section-label">${popup ? "Finishing" : `${finishStep} · Finishing`}</p><div class="finishing-grid" id="finishing-grid">${finishingHtml(product)}</div>
    <hr class="divider"><label class="field"><span class="section-label">${popup ? "Catatan" : `${noteStep} · Catatan`}</span><textarea id="production-note" placeholder="Tambahkan catatan khusus untuk item ini…"></textarea></label>
    <div class="item-action-bar"><div class="price-preview"><div><span>Estimasi Harga</span><p id="formula-text">—</p></div><strong id="item-price">Rp0</strong></div><button id="add-item" class="primary">+ Tambah ke Pesanan</button></div>`;
}

function renderPos() {
  let visibleProducts = productsForCategory(state.selectedCategory);
  if (!visibleProducts.some((product) => product.id === state.selectedProduct)) state.selectedProduct = null;
  const product = selectedProduct();
  const categoryTabs = productCategories.map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.selectedCategory === id}" class="category-tab ${state.selectedCategory === id ? "active" : ""}" data-category="${id}">${label}</button>`).join("");
  const intro = '<p class="section-label">1 · Pilih bahan</p>';
  const productContent = state.selectedCategory === "all" ? allCatalogHtml() : visibleProducts.length
    ? `${intro}<div class="product-grid">${productCardsHtml(visibleProducts)}</div>${product ? productConfigurationHtml(product) : ""}`
    : `<div class="category-empty"><div>＋</div><strong>Belum ada produk</strong><p>Produk untuk kategori ${escapeHtml(productCategories.find(([id]) => id === state.selectedCategory)?.[1] || "ini")} akan ditambahkan kemudian.</p></div>`;
  root.innerHTML = `<div class="view-grid">
    <section class="panel"><div class="panel-head product-panel-head"><h2>${state.editingOrderId ? "Edit Draft Pesanan" : "Produk"}</h2><div class="product-search-wrap"><span>⌕</span><input id="product-search" type="search" placeholder="Cari produk…" autocomplete="off"><kbd>Ctrl K</kbd><div id="search-popover" class="search-popover hidden"></div></div></div><div class="panel-body">
      <div class="category-tabs" role="tablist" aria-label="Kategori produk">${categoryTabs}</div><div class="category-content">${productContent}</div>
    </div></section>
    <aside><section class="panel sticky-summary"><div class="panel-head"><h2>Ringkasan Pesanan</h2><span>${state.cart.length} item</span></div><div class="panel-body"><div id="cart-list">${cartHtml()}</div>${checkoutHtml()}</div></section></aside>
  </div>`;
  bindPos();
  if (product && state.selectedCategory !== "all") updatePreview();
}

function cartHtml() {
  if (!state.cart.length) return '<div class="cart-empty">Belum ada produk.<br><small>Data pelanggan dapat diisi terlebih dahulu.</small></div>';
  return state.cart.map((line, i) => `<div class="cart-item"><div><h4>${line.productName}</h4><p>${escapeHtml(line.displaySize || `${line.width} m × ${line.billedLength} m · ${line.quantity}x`)}</p>${line.templateDesign ? `<div class="cart-price-parts"><span>Harga spanduk <b>${rupiah.format(line.baseTotal)}</b></span><span>Design Template ${escapeHtml(line.templateDesign)} <b>${rupiah.format(line.templateDesignTotal)}</b></span></div>` : ""}<p>${line.templateDesign ? "" : escapeHtml(line.fileServiceName || "File Siap Cetak")}${line.finishingNames ? `${line.templateDesign ? "" : " · "}${escapeHtml(line.finishingNames)}` : line.templateDesign ? "Tanpa finishing tambahan" : " · Tanpa finishing tambahan"}</p><p class="item-note">Catatan: ${escapeHtml(line.productionNote || "—")}</p><strong>${rupiah.format(line.previewTotal)}</strong></div><button data-remove="${i}">Hapus</button></div>`).join("");
}

function checkoutHtml() {
  const total = state.cart.reduce((sum, item) => sum + item.previewTotal, 0);
  return `<div class="summary-row total"><span>Total</span><span>${rupiah.format(total)}</span></div><form id="checkout" class="order-form"><div class="form-grid">
    <label class="field full"><span>Nama pelanggan *</span><input name="customerName" value="${escapeHtml(state.draft.customerName)}" required></label>
    <label class="field"><span>No. WhatsApp</span><input name="phone" value="${escapeHtml(state.draft.phone)}"></label>
    <label class="field"><span>Deadline</span><input name="deadline" type="datetime-local" value="${escapeHtml(state.draft.deadline)}"></label>
  </div><div class="checkout-actions"><button id="pay-order" class="primary full" type="button" ${state.cart.length ? "" : "disabled"}>Pembayaran</button><button class="secondary full" type="submit" ${state.cart.length ? "" : "disabled"}>${state.editingOrderId ? "Simpan Perubahan Draft" : "Simpan Draft Pesanan"}</button>${state.editingOrderId ? '<button id="cancel-edit" class="secondary full" type="button">Batal Edit</button>' : ""}</div></form>`;
}

function readCurrentLine() {
  const product = selectedProduct();
  const isUnit = product.priceBasis === "unit";
  const templateSize = document.querySelector('input[name="template-size"]:checked')?.value?.split("x").map(Number);
  const width = isUnit ? 1 : product.templateProduct ? Number(templateSize?.[0]) : Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
  const length = isUnit ? 1 : product.templateProduct ? Number(templateSize?.[1]) : Number(document.querySelector("#length")?.value || 1);
  const quantity = Math.max(1, Number(document.querySelector("#quantity")?.value || 1));
  const base = productBase(product, width, length, quantity);
  const fileService = product.templateProduct ? fileServices[0] : fileServices.find((service) => service.id === document.querySelector('input[name="file-service"]:checked')?.value) || fileServices[0];
  const templateDesign = product.templateProduct ? document.querySelector('input[name="template-design"]:checked')?.value || "" : "";
  const templateDesignTotal = product.templateProduct ? Number(product.templateDesignPrice || 35000) : 0;
  let finishTotal = 0;
  const finishing = [...document.querySelectorAll('#finishing-grid input[type="checkbox"]:checked')].map((input) => {
    const finish = product.finishing.find((f) => f.id === input.value);
    const units = Math.max(1, Number(document.querySelector(`[data-finish-qty="${finish.id}"]`)?.value || 1));
    finishTotal += units * finish.price;
    return { id: finish.id, units, note: document.querySelector(`[data-finish-note="${finish.id}"]`)?.value.trim() || "" };
  });
  return {
    productId: product.id, productName: product.name, width, length, billedLength: base.billed, templateDesign,
    baseTotal: base.total, templateDesignTotal,
    fileServiceId: fileService.id, fileServiceName: fileService.name, fileServicePrice: fileService.price,
    quantity, unitPrice: base.unitPrice, originalUnitPrice: base.originalUnitPrice, discountApplied: base.discountApplied, finishing,
    finishingNames: finishing.map((f) => {
      const finish = product.finishing.find((x) => x.id === f.id);
      return `${finish?.name} × ${f.units}${f.note ? ` (${f.note})` : ""}`;
    }).join(", "),
    displaySize: isUnit ? `${quantity} ${product.unitName || "unit"}` : `${width} × ${base.billed} m · ${quantity} Lbr${templateDesign ? ` · ${templateDesign}` : ""}`,
    productionNote: document.querySelector("#production-note")?.value.trim() || "",
    previewTotal: base.total + finishTotal + fileService.price + templateDesignTotal
  };
}

function updatePreview() {
  const line = readCurrentLine();
  const product = selectedProduct();
  const billedInput = document.querySelector("#billed-length");
  if (billedInput) billedInput.value = `${line.billedLength} m`;
  document.querySelector("#item-price").textContent = rupiah.format(line.previewTotal);
  document.querySelector("#formula-text").textContent = product.priceBasis === "unit"
    ? `${line.quantity} ${product.unitName || "unit"}${line.originalUnitPrice !== product.price ? ` · Grosir ${rupiah.format(line.originalUnitPrice)}` : ""}${line.discountApplied ? ` · Promo ${rupiah.format(line.unitPrice)}` : ""}`
    : `${line.width} m × ${line.billedLength} m × ${line.quantity}${line.templateDesign ? ` · ${line.templateDesign} + ${rupiah.format(line.templateDesignTotal)}` : ""}${line.fileServicePrice ? ` · ${line.fileServiceName}` : ""}${line.originalUnitPrice !== product.price ? ` · Grosir ${rupiah.format(line.originalUnitPrice)}` : ""}${line.discountApplied ? ` · Promo ${rupiah.format(line.unitPrice)}` : ""}`;
}

function toggleFinishing(input) {
  const product = selectedProduct();
  const finish = product.finishing.find((item) => item.id === input.value);
  const stepper = document.querySelector(`[data-stepper="${finish.id}"]`);
  const noteToggle = document.querySelector(`[data-finish-note-toggle="${finish.id}"]`);
  const noteRow = document.querySelector(`[data-finish-note-row="${finish.id}"]`);
  stepper?.classList.toggle("hidden", !input.checked);
  if (noteToggle) noteToggle.disabled = !input.checked;
  if (!input.checked) noteRow?.classList.add("hidden");
  if (input.checked) {
    const templateSize = document.querySelector('input[name="template-size"]:checked')?.value?.split("x").map(Number);
    const width = product.priceBasis === "unit" ? 1 : product.templateProduct ? Number(templateSize?.[0]) : Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
    const length = product.templateProduct ? Number(templateSize?.[1]) : billedLength(document.querySelector("#length")?.value || 1);
    document.querySelector(`[data-finish-qty="${finish.id}"]`).value = suggestedFinishUnits(finish, width, length);
  }
  updatePreview();
}

function syncDraft(form) {
  const values = Object.fromEntries(new FormData(form));
  state.draft = { customerName: values.customerName || "", phone: values.phone || "", deadline: values.deadline || "", fileStatus: values.fileStatus || "SIAP_CETAK" };
}

function searchPopoverHtml(query = "") {
  const normalized = query.trim().toLowerCase();
  const products = normalized
    ? state.products.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(normalized)).slice(0, 7)
    : state.products.filter((product) => product.featured).slice(0, 4);
  const title = normalized ? "Saran pencarian" : "Quick Search · Bestseller";
  if (!products.length) return `<div class="search-popover-head">${title}</div><div class="search-empty">Produk tidak ditemukan</div>`;
  return `<div class="search-popover-head">${title}</div><div class="search-results">${products.map((product, index) => `<button type="button" class="search-result ${index === 0 ? "keyboard-active" : ""}" data-search-product="${product.id}"><span class="search-result-icon">▦</span><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${rupiah.format(product.price)} ${escapeHtml(product.unitLabel)}</small></span><b>›</b></button>`).join("")}</div><div class="search-help">↑↓ Navigasi &nbsp; Enter Pilih &nbsp; Esc Tutup</div>`;
}

function selectSearchProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  syncDraft(document.querySelector("#checkout"));
  state.selectedProduct = product.id;
  state.selectedCategory = categoryKey(product);
  renderPos();
}

function bindProductSearch() {
  const search = document.querySelector("#product-search");
  const popover = document.querySelector("#search-popover");
  if (!search || !popover) return;
  let activeIndex = 0;
  const refresh = () => {
    popover.innerHTML = searchPopoverHtml(search.value);
    popover.classList.remove("hidden");
    activeIndex = 0;
    popover.querySelectorAll("[data-search-product]").forEach((button) => button.onclick = () => selectSearchProduct(button.dataset.searchProduct));
  };
  const move = (direction) => {
    const results = [...popover.querySelectorAll("[data-search-product]")];
    if (!results.length) return;
    activeIndex = (activeIndex + direction + results.length) % results.length;
    results.forEach((item, index) => item.classList.toggle("keyboard-active", index === activeIndex));
  };
  search.addEventListener("focus", refresh);
  search.addEventListener("input", refresh);
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    if (event.key === "Enter") {
      const result = popover.querySelectorAll("[data-search-product]")[activeIndex];
      if (result) { event.preventDefault(); selectSearchProduct(result.dataset.searchProduct); }
    }
    if (event.key === "Escape") { popover.classList.add("hidden"); search.blur(); }
  });
  document.onkeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); search.focus();
    }
  };
  document.onclick = (event) => {
    if (!event.target.closest(".product-search-wrap")) popover.classList.add("hidden");
  };
}

function bindProductConfiguration(onAdd) {
  document.querySelectorAll('#length,#quantity,input[name="width"],input[name="template-size"],input[name="template-design"],input[name="file-service"],[data-finish-qty]').forEach((input) => {
    input.addEventListener("input", updatePreview); input.addEventListener("change", updatePreview);
  });
  document.querySelectorAll('#finishing-grid input[type="checkbox"]').forEach((input) => input.addEventListener("change", () => toggleFinishing(input)));
  document.querySelectorAll("[data-finish-note-toggle]").forEach((button) => button.onclick = () => {
    const row = document.querySelector(`[data-finish-note-row="${button.dataset.finishNoteToggle}"]`);
    row?.classList.toggle("hidden");
    if (!row?.classList.contains("hidden")) row.querySelector("input")?.focus();
  });
  document.querySelectorAll("[data-minus]").forEach((button) => button.onclick = () => {
    const input = document.querySelector(`[data-finish-qty="${button.dataset.minus}"]`);
    input.value = Math.max(1, Number(input.value || 1) - 1); updatePreview();
  });
  document.querySelectorAll("[data-plus]").forEach((button) => button.onclick = () => {
    const input = document.querySelector(`[data-finish-qty="${button.dataset.plus}"]`);
    input.value = Number(input.value || 0) + 1; updatePreview();
  });
  document.querySelector("#add-item")?.addEventListener("click", () => onAdd(readCurrentLine()));
}

function openProductConfigurator(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  syncDraft(document.querySelector("#checkout"));
  state.selectedProduct = product.id;
  dialog.classList.add("configurator-dialog");
  const detail = document.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head configurator-head"><div><span class="product-category">${escapeHtml(product.category)}</span><h2>${escapeHtml(product.name)}</h2><p>${discountActive(product) ? `<span class="discount-badge">DISKON</span> ${escapeHtml(discountLabel(product))}` : `${rupiah.format(product.price)} ${escapeHtml(product.unitLabel)}`}</p></div><button class="detail-close">×</button></div><div class="detail-body configurator-body">${productConfigurationHtml(product, true)}</div>`;
  detail.querySelector(".detail-close").onclick = () => dialog.close();
  dialog.onclose = () => { dialog.classList.remove("configurator-dialog"); dialog.onclose = null; };
  dialog.showModal();
  bindProductConfiguration((line) => { state.cart.push(line); dialog.close(); renderPos(); toast("Produk ditambahkan"); });
  updatePreview();
}

function bindPos() {
  bindProductSearch();
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout"));
    state.selectedCategory = button.dataset.category;
    state.selectedProduct = null;
    renderPos();
  }));
  document.querySelectorAll("[data-config-product]").forEach((button) => button.addEventListener("click", () => openProductConfigurator(button.dataset.configProduct)));
  document.querySelectorAll("[data-select-product]").forEach((label) => {
    const select = () => {
      syncDraft(document.querySelector("#checkout"));
      state.selectedProduct = state.selectedProduct === label.dataset.selectProduct ? null : label.dataset.selectProduct;
      renderPos();
    };
    label.addEventListener("click", (event) => { event.preventDefault(); select(); });
    label.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(); } });
  });
  bindProductConfiguration((line) => {
    state.cart.push(line);
    syncDraft(document.querySelector("#checkout")); renderPos(); toast("Produk ditambahkan");
  });
  document.querySelectorAll("[data-remove]").forEach((button) => button.onclick = () => {
    syncDraft(document.querySelector("#checkout")); state.cart.splice(Number(button.dataset.remove), 1); renderPos();
  });
  const checkout = document.querySelector("#checkout");
  checkout.addEventListener("input", () => syncDraft(checkout));
  checkout.addEventListener("change", () => syncDraft(checkout));
  async function savePosOrder(openPayment = false) {
    syncDraft(checkout);
    try {
      const payload = { ...state.draft, items: state.cart };
      const order = state.editingOrderId
        ? await api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      state.cart = []; state.editingOrderId = null;
      state.draft = { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK" };
      await load(); toast(`${order.code} berhasil disimpan`);
      state.view = "projects"; render();
      if (openPayment) openOrder(order.id, true);
    } catch (error) { toast(error.message, "error"); }
  }
  checkout.addEventListener("submit", async (event) => {
    event.preventDefault();
    await savePosOrder(false);
  });
  document.querySelector("#pay-order")?.addEventListener("click", async () => {
    if (!checkout.reportValidity()) return;
    await savePosOrder(true);
  });
  document.querySelector("#cancel-edit")?.addEventListener("click", () => {
    state.cart = []; state.editingOrderId = null;
    state.draft = { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK" };
    renderPos();
  });
}

function paymentStatus(order) {
  if (Number(order.paidAmount || 0) >= Number(order.total || 0) && order.total > 0) return "LUNAS";
  return order.paymentConfirmed ? "BELUM_LUNAS" : "BELUM_BAYAR";
}

function renderProjects() {
  const statuses = ["MENUNGGU_PEMBAYARAN", "DESAIN", "CETAK", "FINISHING", "SELESAI", "DIAMBIL"];
  const activeOrders = state.orders.filter((order) => !["DIAMBIL"].includes(order.status));
  const late = activeOrders.filter((order) => projectDeadlineState(order) === "late").length;
  const today = activeOrders.filter((order) => isProjectDeadlineToday(order)).length;
  const noPic = activeOrders.filter((order) => !["MENUNGGU_PEMBAYARAN"].includes(order.status) && !order.designPic).length;
  const ready = state.orders.filter((order) => order.status === "SELESAI").length;
  root.innerHTML = `<div class="project-overview">
      <div class="overview-card danger"><span>Terlambat</span><strong>${late}</strong></div><div class="overview-card warning"><span>Deadline hari ini</span><strong>${today}</strong></div><div class="overview-card"><span>Belum ada PIC</span><strong>${noPic}</strong></div><div class="overview-card success"><span>Siap diambil</span><strong>${ready}</strong></div>
    </div><section class="panel project-panel"><div class="project-toolbar">
      <div class="project-view-toggle"><button type="button" data-project-view="list" class="${state.projectView === "list" ? "active" : ""}">☷ List</button><button type="button" data-project-view="kanban" class="${state.projectView === "kanban" ? "active" : ""}">▥ Kanban</button></div>
      <input id="project-search" class="search" value="${escapeHtml(state.projectSearch)}" placeholder="Cari kode, pelanggan, atau produk…">
      <select id="project-deadline" class="project-filter"><option value="all">Semua deadline</option><option value="today">Hari ini</option><option value="late">Terlambat</option><option value="none">Tanpa deadline</option></select>
      <select id="project-pic" class="project-filter"><option value="all">Semua PIC</option><option value="unassigned">Belum ada PIC</option><option value="Gema">Gema</option><option value="Qori">Qori</option><option value="Cc/Ko">Cc/Ko</option></select>
      <select id="project-payment" class="project-filter"><option value="all">Semua pembayaran</option><option value="LUNAS">Lunas</option><option value="BELUM_LUNAS">Belum lunas</option><option value="BELUM_BAYAR">Belum bayar</option></select>
      <button id="reload-projects" class="secondary">Muat ulang</button>
    </div><div class="project-status-filters"><button data-project-status="all" class="${state.projectStatus === "all" ? "active" : ""}">Semua <b>${state.orders.length}</b></button>${statuses.map((status) => `<button data-project-status="${status}" class="${state.projectStatus === status ? "active" : ""}">${state.statusLabels[status]} <b>${state.orders.filter((order) => order.status === status).length}</b></button>`).join("")}</div><div id="project-content"></div></section>`;
  document.querySelector("#project-deadline").value = state.projectDeadline;
  document.querySelector("#project-pic").value = state.projectPic;
  document.querySelector("#project-payment").value = state.projectPayment;
  const refresh = () => renderProjectContent(statuses);
  document.querySelectorAll("[data-project-view]").forEach((button) => button.onclick = () => { state.projectView = button.dataset.projectView; renderProjects(); });
  document.querySelectorAll("[data-project-status]").forEach((button) => button.onclick = () => { state.projectStatus = button.dataset.projectStatus; renderProjects(); });
  document.querySelector("#project-search").addEventListener("input", (event) => { state.projectSearch = event.target.value; refresh(); });
  document.querySelector("#project-deadline").onchange = (event) => { state.projectDeadline = event.target.value; refresh(); };
  document.querySelector("#project-pic").onchange = (event) => { state.projectPic = event.target.value; refresh(); };
  document.querySelector("#project-payment").onchange = (event) => { state.projectPayment = event.target.value; refresh(); };
  document.querySelector("#reload-projects").onclick = load;
  refresh();
}

function witaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function projectDeadlineState(order) {
  if (!order.deadline) return "none";
  if (["SELESAI", "DIAMBIL"].includes(order.status)) return "future";
  const deadline = new Date(order.deadline);
  if (deadline.getTime() < Date.now()) return "late";
  return isProjectDeadlineToday(order) ? "today" : "future";
}

function isProjectDeadlineToday(order) { return Boolean(order.deadline) && witaDateKey(order.deadline) === witaDateKey(); }

function filteredProjectOrders() {
  const query = state.projectSearch.trim().toLowerCase();
  return state.orders.filter((order) => {
    const searchText = `${order.code} ${order.customerName} ${order.phone || ""} ${(order.items || []).map((item) => item.productName).join(" ")}`.toLowerCase();
    if (query && !searchText.includes(query)) return false;
    if (state.projectStatus !== "all" && order.status !== state.projectStatus) return false;
    if (state.projectDeadline === "today" && !isProjectDeadlineToday(order)) return false;
    if (!["all", "today"].includes(state.projectDeadline) && projectDeadlineState(order) !== state.projectDeadline) return false;
    if (state.projectPic === "unassigned" && order.designPic) return false;
    if (!["all", "unassigned"].includes(state.projectPic) && order.designPic !== state.projectPic) return false;
    if (state.projectPayment !== "all" && paymentStatus(order) !== state.projectPayment) return false;
    return true;
  });
}

function renderProjectContent(statuses) {
  const content = document.querySelector("#project-content");
  if (!content) return;
  const orders = filteredProjectOrders();
  content.innerHTML = state.projectView === "kanban"
    ? `<div class="kanban-wrap"><div class="kanban">${statuses.map((status) => projectColumn(status, orders)).join("")}</div></div>`
    : projectListHtml(statuses, orders);
  content.querySelectorAll("[data-order]").forEach((button) => button.onclick = () => openOrder(button.dataset.order));
  content.querySelectorAll("[data-project-group]").forEach((button) => button.onclick = () => {
    const status = button.dataset.projectGroup;
    if (state.projectCollapsed.has(status)) state.projectCollapsed.delete(status); else state.projectCollapsed.add(status);
    renderProjectContent(statuses);
  });
}

function projectListHtml(statuses, orders) {
  if (!orders.length) return '<div class="project-empty">Tidak ada pesanan yang sesuai dengan filter.</div>';
  return `<div class="project-table-wrap"><table class="project-table"><thead><tr><th>Order</th><th>Pelanggan</th><th>Produk</th><th>Deadline</th><th>PIC</th><th>Pembayaran</th><th class="text-right">Total</th><th></th></tr></thead><tbody>${statuses.map((status) => {
    const grouped = orders.filter((order) => order.status === status);
    if (!grouped.length) return "";
    const collapsed = state.projectCollapsed.has(status);
    const deadlineSummary = grouped.filter((order) => projectDeadlineState(order) === "late").length;
    return `<tr class="project-group-row status-${status.toLowerCase()}"><td colspan="8"><button type="button" data-project-group="${status}"><span>${collapsed ? "›" : "⌄"}</span><strong>${state.statusLabels[status]}</strong><em>${grouped.length} pesanan</em>${deadlineSummary ? `<b>${deadlineSummary} terlambat</b>` : ""}</button></td></tr>${collapsed ? "" : grouped.map(projectListRow).join("")}`;
  }).join("")}</tbody></table></div><div class="project-list-footer"><span>Menampilkan ${orders.length} dari ${state.orders.length} pesanan</span><span>List diperbarui otomatis dari alur produksi</span></div>`;
}

function projectListRow(order) {
  const payment = paymentStatus(order);
  const paymentClass = payment === "LUNAS" ? "ok" : payment === "BELUM_LUNAS" ? "danger-badge" : "warn";
  const deadlineState = projectDeadlineState(order);
  const products = (order.items || []).map((item) => item.productName);
  const firstProduct = products[0] || "—";
  const extraProducts = products.length > 1 ? ` +${products.length - 1} item` : "";
  const hideFinancial = order.status === "DESAIN";
  return `<tr class="project-order-row"><td><span class="order-code">${escapeHtml(order.code)}</span></td><td><strong>${escapeHtml(order.customerName)}</strong><small>${escapeHtml(order.phone || "Walk-in")}</small></td><td><strong>${escapeHtml(firstProduct)}</strong><small>${escapeHtml(order.items?.[0]?.displaySize || "")}${extraProducts}</small></td><td class="project-deadline ${deadlineState}">${order.deadline ? dateFormat.format(new Date(order.deadline)) : "Tidak ditentukan"}</td><td>${order.designPic ? `<span class="project-pic"><i>${escapeHtml(order.designPic.slice(0, 1))}</i>${escapeHtml(order.designPic)}</span>` : '<span class="project-unassigned">Belum ada</span>'}</td><td>${hideFinancial ? "—" : `<span class="badge ${paymentClass}">${payment.replaceAll("_", " ")}</span>`}</td><td class="project-total">${hideFinancial ? "—" : rupiah.format(order.total)}</td><td><button type="button" class="project-detail-button" data-order="${order.id}">Detail</button></td></tr>`;
}

function projectColumn(status, source = state.orders) {
  const orders = source.filter((order) => order.status === status);
  return `<section class="kanban-column"><div class="column-head"><h3>${state.statusLabels[status]}</h3><span>${orders.length}</span></div>${orders.map((order) => {
    const payment = paymentStatus(order);
    const hidePrice = status === "DESAIN";
    const paymentClass = payment === "LUNAS" ? "ok" : payment === "BELUM_LUNAS" ? "danger-badge" : "warn";
    const cardBadge = hidePrice
      ? `<span class="badge info">${order.designPic ? "PIC: " + escapeHtml(order.designPic) : "Menunggu PIC"}</span>`
      : `<span class="badge ${paymentClass}">${payment.replaceAll("_", " ")}</span>`;
    return `<article class="order-card" data-order="${order.id}"><div class="order-card-head"><span class="order-code">${order.code}</span>${cardBadge}</div><h4>${escapeHtml(order.customerName)}</h4><p>${order.items.map((i) => i.productName).join(", ")}</p>${status !== "MENUNGGU_PEMBAYARAN" && !hidePrice ? `<p class="pic-label">${order.designPic ? "PIC: " + escapeHtml(order.designPic) : "Belum ada PIC"}</p>` : ""}${hidePrice ? "" : `<p style="margin-top:7px"><strong>${rupiah.format(order.total)}</strong></p>`}</article>`;
  }).join("") || '<div class="cart-empty" style="padding:28px 5px">Kosong</div>'}</section>`;
}

function nextAction(order) {
  return { DESAIN: "File Siap Cetak", CETAK: "Cetak Selesai", FINISHING: "Finishing Selesai", SELESAI: "Pesanan Diambil" }[order.status];
}

function itemDetail(item) {
  const finishing = (item.finishing || []).map((finish) => `${escapeHtml(finish.name)} × ${finish.units}${finish.note ? ` — ${escapeHtml(finish.note)}` : ""}`).join(", ");
  const templateParts = item.templateDesign ? `<small>Harga spanduk: ${rupiah.format(item.baseTotal)}</small><small>Design Template ${escapeHtml(item.templateDesign)}: ${rupiah.format(item.templateDesignTotal || 35000)}</small>` : "";
  return `<strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.displaySize || `${item.width} × ${item.billedLength} m · ${item.quantity}x`)}</small>${templateParts}${item.templateDesign ? "" : `<small>File: ${escapeHtml(item.fileService?.name || "File Siap Cetak")}</small>`}${finishing ? `<small>Finishing: ${finishing}</small>` : ""}<small>Catatan: ${escapeHtml(item.productionNote || "—")}</small>`;
}

function openOrder(id, showPayment = false) {
  const order = state.orders.find((item) => item.id === id);
  const isDesign = order.status === "DESAIN";
  const isWaiting = order.status === "MENUNGGU_PEMBAYARAN";
  const outstanding = Math.max(0, order.total - Number(order.paidAmount || 0));
  const detail = document.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head"><div><span class="order-code">${order.code}</span><h2 style="margin:5px 0 0">${escapeHtml(order.customerName)}</h2></div><button class="detail-close">×</button></div><div class="detail-body">
    <div class="detail-meta ${isDesign ? "design-meta" : ""}"><div class="meta-card"><span>Status</span><strong>${state.statusLabels[order.status]}</strong></div>${isDesign ? "" : `<div class="meta-card"><span>Pembayaran</span><strong>${paymentStatus(order).replaceAll("_", " ")}</strong></div>`}${isWaiting ? "" : `<div class="meta-card"><span>PIC Design</span><strong>${escapeHtml(order.designPic || "Belum diambil")}</strong></div>`}</div>
    <div class="order-items-detail">${order.items.map((item, index) => `<div class="detail-item"><span class="item-number">${index + 1}</span><div>${itemDetail(item)}</div>${isDesign ? "" : `<strong class="item-price">${rupiah.format(item.subtotal)}</strong>`}</div>`).join("")}</div>
    ${isDesign ? "" : `<div class="detail-total"><span>Total Pesanan</span><strong>${rupiah.format(order.total)}</strong></div>`}
    <p class="note" style="margin-top:12px"><strong>Deadline:</strong> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "Tidak ditentukan"}</p>
    ${isDesign ? `<div class="operator-box"><div class="field"><span>Nama Operator Design</span><div class="operator-choices">${[["gema", "Gema"], ["qori", "Qori"], ["cc-ko", "Cc/Ko"]].map(([id, name]) => `<div class="chip"><input type="radio" name="design-pic" id="operator-${id}" value="${name}" ${order.designPic === name ? "checked" : ""}><label for="operator-${id}">${name}</label></div>`).join("")}</div></div><button id="save-design-pic" class="secondary">Simpan PIC</button></div>` : ""}
    <div id="payment-form-wrap" class="payment-form-wrap hidden">${paymentFormHtml(order, outstanding)}</div>
    <p class="section-label" style="margin-top:18px">Riwayat pekerjaan</p><div class="timeline">${(order.timeline || []).map((item) => `<div class="timeline-item"><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.actor)} · ${dateFormat.format(new Date(item.createdAt))}</small></div>`).join("")}</div>
    <div class="detail-actions">
      ${isWaiting ? '<button id="edit-order" class="secondary">Edit Pesanan</button><button id="show-payment-form" class="primary">Konfirmasi Pembayaran</button>' : ""}
      ${!isWaiting && paymentStatus(order) !== "LUNAS" ? '<button id="show-payment-form" class="secondary">Catat Pembayaran</button>' : ""}
      ${nextAction(order) ? `<button id="advance-order" class="primary">${nextAction(order)}</button>` : ""}
      ${!isWaiting ? '<button id="print-spk" class="secondary">Cetak SPK</button>' : ""}
      ${["SELESAI", "DIAMBIL"].includes(order.status) ? '<button id="print-receipt" class="secondary">Print Tanda Terima</button>' : ""}
    </div>
  </div>`;
  detail.querySelector(".detail-close").onclick = () => dialog.close();
  detail.querySelector("#edit-order")?.addEventListener("click", () => startEditOrder(order));
  detail.querySelector("#show-payment-form")?.addEventListener("click", () => detail.querySelector("#payment-form-wrap").classList.toggle("hidden"));
  bindPaymentForm(order, outstanding);
  detail.querySelector("#save-design-pic")?.addEventListener("click", async () => {
    try {
      const designPic = detail.querySelector('input[name="design-pic"]:checked')?.value || "";
      if (!designPic) return toast("Pilih nama operator design", "error");
      await api(`/api/orders/${order.id}/design-pic`, { method: "PATCH", body: JSON.stringify({ designPic }) });
      dialog.close(); await load(); toast("PIC Operator Design disimpan");
    } catch (error) { toast(error.message, "error"); }
  });
  detail.querySelector("#advance-order")?.addEventListener("click", async () => {
    try {
      const sequence = ["MENUNGGU_PEMBAYARAN", "DESAIN", "CETAK", "FINISHING", "SELESAI", "DIAMBIL"];
      await api(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: sequence[sequence.indexOf(order.status) + 1], actor: order.designPic || "Tim Produksi" }) });
      dialog.close(); await load(); toast("Status pesanan diperbarui");
    } catch (error) { toast(error.message, "error"); }
  });
  detail.querySelector("#print-spk")?.addEventListener("click", () => printOrder(order, "spk"));
  detail.querySelector("#print-receipt")?.addEventListener("click", () => printOrder(order, "receipt"));
  dialog.showModal();
  if (showPayment) detail.querySelector("#payment-form-wrap")?.classList.remove("hidden");
}

function paymentFormHtml(order, outstanding) {
  return `<form id="payment-form"><h3>Form Pembayaran</h3><div class="form-grid">
    <div class="field full"><span>Jenis pembayaran</span><div class="chips"><div class="chip"><input type="radio" name="type" id="pay-full" value="LUNAS" checked><label for="pay-full">Pelunasan</label></div><div class="chip"><input type="radio" name="type" id="pay-dp" value="DP"><label for="pay-dp">Pembayaran Sebagian / DP</label></div></div></div>
    <label class="field"><span>Metode</span><select name="method" required><option value="">Pilih metode</option><option value="TUNAI">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option><option value="PO / TEMPO">PO / Tempo</option></select></label>
    <label class="field"><span>Nominal diterima</span><input name="amount" type="number" min="0" value="${outstanding}" required></label>
    <label class="field full"><span>Nomor PO / referensi (opsional)</span><input name="poNumber"></label>
  </div><div class="payment-balance"><span>Sudah dibayar: ${rupiah.format(order.paidAmount || 0)}</span><strong>Sisa: ${rupiah.format(outstanding)}</strong></div><button class="primary full" type="submit">Simpan Pembayaran</button></form>`;
}

function bindPaymentForm(order, outstanding) {
  const form = document.querySelector("#payment-form");
  if (!form) return;
  form.querySelectorAll('input[name="type"]').forEach((input) => input.addEventListener("change", () => {
    if (input.checked && input.value === "LUNAS") form.elements.amount.value = outstanding;
    if (input.checked && input.value === "DP" && Number(form.elements.amount.value) >= outstanding) form.elements.amount.value = "";
  }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api(`/api/orders/${order.id}/payments`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      dialog.close(); await load(); toast("Pembayaran berhasil dicatat");
    } catch (error) { toast(error.message, "error"); }
  });
}

function startEditOrder(order) {
  state.cart = order.items.map((item) => ({
    productId: item.productId, productName: item.productName, width: item.width,
    length: item.actualLength, billedLength: item.billedLength, quantity: item.quantity,
    finishing: (item.finishing || []).map((finish) => ({ id: finish.id, units: finish.units, note: finish.note || "" })),
    finishingNames: (item.finishing || []).map((finish) => `${finish.name} × ${finish.units}${finish.note ? ` (${finish.note})` : ""}`).join(", "),
    displaySize: item.displaySize, templateDesign: item.templateDesign || "", fileServiceId: item.fileService?.id || "READY",
    fileServiceName: item.fileService?.name || "File Siap Cetak", fileServicePrice: item.fileService?.price || 0,
    baseTotal: item.baseTotal, templateDesignTotal: item.templateDesignTotal || 0,
    productionNote: item.productionNote || "", previewTotal: item.subtotal
  }));
  state.draft = { customerName: order.customerName || "", phone: order.phone || "", deadline: order.deadline || "", fileStatus: order.fileStatus || "SIAP_CETAK" };
  state.editingOrderId = order.id;
  state.selectedProduct = state.cart[0]?.productId || state.selectedProduct;
  state.selectedCategory = categoryKey(state.products.find((product) => product.id === state.selectedProduct) || {});
  state.view = "pos";
  dialog.close(); render(); window.scrollTo({ top: 0, behavior: "smooth" });
}

function printOrder(order, type) {
  const isSpk = type === "spk";
  printDocument.className = `print-document ${type}`;
  printDocument.innerHTML = `<div class="print-brand">MANNA PRINT</div><div class="print-subtitle">${isSpk ? "SURAT PERINTAH KERJA" : "TANDA TERIMA PESANAN"}</div><hr>
    <div class="print-meta"><b>${order.code}</b><span>${dateFormat.format(new Date(order.createdAt))}</span></div>
    <p><b>Pelanggan:</b> ${escapeHtml(order.customerName)}<br><b>Deadline:</b> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "—"}${isSpk ? `<br><b>PIC Design:</b> ${escapeHtml(order.designPic || "—")}` : ""}</p><hr>
    ${order.items.map((item, index) => `<div class="print-item"><b>${index + 1}. ${escapeHtml(item.productName)}</b><br>${escapeHtml(item.displaySize || `${item.width} × ${item.billedLength} m · ${item.quantity}x`)}${item.templateDesign ? `<br>${isSpk ? "Spanduk" : `Harga spanduk: ${rupiah.format(item.baseTotal)}`}<br>${isSpk ? "Design Template" : "Design Template " + escapeHtml(item.templateDesign) + ": " + rupiah.format(item.templateDesignTotal || 35000)}` : `<br>File: ${escapeHtml(item.fileService?.name || "File Siap Cetak")}`}${(item.finishing || []).length ? `<br>Finishing: ${item.finishing.map((f) => `${escapeHtml(f.name)} × ${f.units}${f.note ? ` (${escapeHtml(f.note)})` : ""}`).join(", ")}` : ""}<br><b>Catatan:</b> ${escapeHtml(item.productionNote || "—")}${isSpk ? "" : `<br><span class="print-price">${rupiah.format(item.subtotal)}</span>`}</div>`).join("<hr>")}
    ${isSpk ? '<hr><div class="spk-checks">□ File dicek &nbsp; □ Cetak<br>□ Finishing &nbsp; □ QC</div>' : `<hr><div class="print-total"><span>Total</span><b>${rupiah.format(order.total)}</b></div><div class="print-total"><span>Dibayar</span><b>${rupiah.format(order.paidAmount || 0)}</b></div><div class="print-total"><span>Sisa</span><b>${rupiah.format(Math.max(0, order.total - (order.paidAmount || 0)))}</b></div>`}
    <hr><p class="print-footer">Manna Print · Labuan Bajo<br>Terima kasih</p>`;
  document.body.classList.add("printing");
  window.onafterprint = () => { document.body.classList.remove("printing"); printDocument.innerHTML = ""; };
  window.print();
}

function masterHeader(title) {
  const labels = { products: "Produk", materials: "Bahan", finishings: "Finishing", machines: "Mesin" };
  return `<div class="master-top"><div><h1>Master Data</h1><p>Kelola katalog, komposisi bahan, mesin, dan harga jual POS.</p></div><button id="add-master" class="primary">+ Tambah ${title}</button></div>
    <div class="master-summary"><div><span>Produk aktif</span><strong>${state.allProducts.filter((item) => item.active !== false).length}</strong></div><div><span>Bahan aktif</span><strong>${state.materials.filter((item) => item.active !== false).length}</strong></div><div><span>Mesin aktif</span><strong>${state.machines.filter((item) => item.active !== false).length}</strong></div><div><span>Stok menipis</span><strong>${state.inventory.filter((item) => Number(item.quantity) <= Number(item.minStock || 0)).length}</strong></div></div>
    <div class="master-tabs">${Object.entries(labels).map(([id, label]) => `<button class="${state.masterTab === id ? "active" : ""}" data-master-tab="${id}">${label}</button>`).join("")}</div>`;
}

function renderMaster() {
  const title = { products: "Produk", materials: "Bahan", finishings: "Finishing", machines: "Mesin" }[state.masterTab];
  const productRows = state.allProducts.map((product) => {
    const materials = (product.materialSources || []).map((source) => source.name).filter(Boolean).join(", ") || "—";
    const machines = (product.machineIds || []).map((id) => state.machines.find((item) => item.id === id)?.name).filter(Boolean).join(", ") || "—";
    return `<tr data-master-row data-category="${escapeHtml(product.category)}" data-machines="${escapeHtml((product.machineIds || []).join(","))}" data-promo="${discountActive(product)}"><td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || "—")}</small></td><td>${escapeHtml(product.category)}</td><td>${escapeHtml(product.saleUnit || product.unitName || "—")}</td><td class="compact-cell">${escapeHtml(materials)}</td><td class="compact-cell">${escapeHtml(machines)}</td><td><strong>${rupiah.format(product.price)}</strong>${product.wholesaleEnabled ? '<small class="blue-text">Harga grosir aktif</small>' : ""}${discountActive(product) ? `<small class="promo-text">DISKON · ${escapeHtml(discountLabel(product))}</small>` : ""}</td><td><span class="badge ${product.active === false ? "warn" : "ok"}">${product.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-product="${product.id}">Edit</button></td></tr>`;
  }).join("");
  const materialRows = state.materials.map((material) => {
    const stock = state.inventory.find((item) => item.materialId === material.id || item.sku === material.sku);
    return `<tr><td><strong>${escapeHtml(material.name)}</strong><small>${escapeHtml(material.sku)}</small></td><td>${escapeHtml(material.category)}</td><td>${escapeHtml(material.unit)}</td><td class="${Number(stock?.quantity || 0) <= Number(material.minStock || 0) ? "stock-negative" : ""}">${Number(stock?.quantity || 0).toLocaleString("id-ID")} ${escapeHtml(material.unit)}</td><td>${rupiah.format(material.cost)}</td><td>${escapeHtml(material.supplier || "—")}</td><td><span class="badge ${material.active === false ? "warn" : "ok"}">${material.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-material="${material.id}">Edit</button></td></tr>`;
  }).join("");
  const machineRows = state.machines.map((machine) => `<tr><td><strong>${escapeHtml(machine.name)}</strong><small>${escapeHtml(machine.code)}</small></td><td>${escapeHtml(machine.type)}</td><td>${escapeHtml(machine.capacity || "—")}</td><td>${rupiah.format(machine.costPerHour)}/jam</td><td><span class="badge ${machine.status === "AKTIF" ? "ok" : "warn"}">${escapeHtml(machine.status)}</span></td><td><button class="secondary" data-edit-machine="${machine.id}">Edit</button></td></tr>`).join("");
  const finishingRows = state.finishings.map((finishing) => `<tr><td><strong>${escapeHtml(finishing.name)}</strong><small>${escapeHtml(finishing.code)}</small></td><td class="compact-cell">${(finishing.categories || []).map((category) => `<span class="mini-chip">${escapeHtml(category)}</span>`).join(" ")}</td><td>${rupiah.format(finishing.price)}</td><td>${escapeHtml({ free: "Per unit", point: "Per titik", perimeter: "Keliling", top_bottom: "Atas–bawah", left_right: "Kanan–kiri", length: "Meter lari" }[finishing.rule] || finishing.rule)}</td><td><span class="badge ${finishing.active === false ? "warn" : "ok"}">${finishing.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-finishing="${finishing.id}">Edit</button></td></tr>`).join("");
  const tables = {
    products: `<table><thead><tr><th>Produk</th><th>Kategori</th><th>Satuan</th><th>Bahan terkait</th><th>Mesin</th><th>Harga jual</th><th>Status</th><th></th></tr></thead><tbody>${productRows}</tbody></table>`,
    materials: `<table><thead><tr><th>Bahan</th><th>Kategori</th><th>Satuan</th><th>Stok</th><th>Harga dasar</th><th>Supplier</th><th>Status</th><th></th></tr></thead><tbody>${materialRows}</tbody></table>`,
    finishings: `<table><thead><tr><th>Finishing</th><th>Kategori sesuai</th><th>Harga</th><th>Perhitungan</th><th>Status</th><th></th></tr></thead><tbody>${finishingRows}</tbody></table>`,
    machines: `<table><thead><tr><th>Mesin</th><th>Jenis</th><th>Kapasitas</th><th>Biaya</th><th>Status</th><th></th></tr></thead><tbody>${machineRows}</tbody></table>`
  };
  const productFilters = state.masterTab === "products" ? `<select id="filter-category" class="filter-select"><option value="">Semua kategori</option>${productCategories.filter(([id]) => id !== "all").map(([, label]) => `<option>${label}</option>`).join("")}</select><select id="filter-machine" class="filter-select"><option value="">Semua mesin</option>${state.machines.map((machine) => `<option value="${machine.id}">${escapeHtml(machine.name)}</option>`).join("")}</select><button id="filter-promo" class="filter-chip" type="button">✦ Diskon</button>` : "";
  root.innerHTML = `<div class="master-page">${masterHeader(title)}<section class="panel"><div class="panel-head master-list-head"><h2>Daftar ${title}</h2><div class="master-filters"><input id="master-search" class="search" placeholder="Cari ${title.toLowerCase()}…">${productFilters}</div></div><div class="table-wrap master-table">${tables[state.masterTab]}</div></section></div>`;
  document.querySelectorAll("[data-master-tab]").forEach((button) => button.onclick = () => { state.masterTab = button.dataset.masterTab; renderMaster(); });
  document.querySelector("#add-master").onclick = () => state.masterTab === "products" ? openProductForm() : state.masterTab === "materials" ? openMaterialForm() : state.masterTab === "finishings" ? openFinishingForm() : openMachineForm();
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.onclick = () => openProductForm(state.allProducts.find((item) => item.id === button.dataset.editProduct)));
  document.querySelectorAll("[data-edit-material]").forEach((button) => button.onclick = () => openMaterialForm(state.materials.find((item) => item.id === button.dataset.editMaterial)));
  document.querySelectorAll("[data-edit-finishing]").forEach((button) => button.onclick = () => openFinishingForm(state.finishings.find((item) => item.id === button.dataset.editFinishing)));
  document.querySelectorAll("[data-edit-machine]").forEach((button) => button.onclick = () => openMachineForm(state.machines.find((item) => item.id === button.dataset.editMachine)));
  let promoOnly = false;
  const applyFilters = () => { const query = document.querySelector("#master-search").value.toLowerCase(); const category = document.querySelector("#filter-category")?.value || ""; const machine = document.querySelector("#filter-machine")?.value || ""; document.querySelectorAll(".master-table tbody tr").forEach((row) => { const matches = row.textContent.toLowerCase().includes(query) && (!category || row.dataset.category === category) && (!machine || (row.dataset.machines || "").split(",").includes(machine)) && (!promoOnly || row.dataset.promo === "true"); row.classList.toggle("hidden", !matches); }); };
  document.querySelector("#master-search").oninput = applyFilters;
  document.querySelector("#filter-category")?.addEventListener("change", applyFilters); document.querySelector("#filter-machine")?.addEventListener("change", applyFilters);
  document.querySelector("#filter-promo")?.addEventListener("click", (event) => { promoOnly = !promoOnly; event.currentTarget.classList.toggle("active", promoOnly); applyFilters(); });
}

function showMasterDialog(title, body) {
  dialog.classList.add("master-dialog");
  const detail = document.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head"><div><span class="eyebrow">Master Data</span><h2 style="margin:5px 0 0">${title}</h2></div><button class="detail-close">×</button></div><div class="detail-body">${body}</div>`;
  detail.querySelector(".detail-close").onclick = () => dialog.close();
  dialog.onclose = () => { dialog.classList.remove("master-dialog"); dialog.onclose = null; };
  dialog.showModal();
  return detail;
}

function switchHtml(name, checked, label = "Aktif") {
  return `<label class="switch-row"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span class="switch"></span><b>${label}</b></label>`;
}

function openMaterialForm(material = null) {
  const detail = showMasterDialog(material ? "Edit Bahan" : "Tambah Bahan", `<form id="material-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama bahan *</span><input name="name" value="${escapeHtml(material?.name || "")}" required></label><label class="field"><span>SKU bahan *</span><input name="sku" value="${escapeHtml(material?.sku || "")}" required></label>
    <label class="field"><span>Kategori bahan</span><input name="category" value="${escapeHtml(material?.category || "")}" placeholder="Roll Outdoor, Kertas, Aksesori"></label><label class="field"><span>Satuan stok *</span><select name="unit">${["m²", "m lari", "pcs", "lbr", "kg", "pack", "rim"].map((unit) => `<option ${material?.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
    ${material ? "" : `<label class="field"><span>Stok awal</span><input name="stock" type="number" min="0" step="0.01" value="0"></label>`}<label class="field"><span>Stok minimum</span><input name="minStock" type="number" min="0" step="0.01" value="${material?.minStock || 0}"></label>
    <label class="field"><span>Harga dasar / satuan</span><input name="cost" type="number" min="0" value="${material?.cost || 0}"></label><label class="field"><span>Supplier</span><input name="supplier" value="${escapeHtml(material?.supplier || "")}"></label>
  </div><div class="form-footer">${switchHtml("active", material?.active !== false)}<button class="primary" type="submit">Simpan Bahan</button></div></form>`);
  detail.querySelector("#material-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); values.active = event.target.elements.active.checked; try { await api(material ? `/api/materials/${material.id}` : "/api/materials", { method: material ? "PUT" : "POST", body: JSON.stringify(values) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "materials"; render(); toast("Bahan berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function openFinishingForm(finishing = null) {
  const categories = productCategories.filter(([id]) => id !== "all").map(([, label]) => label);
  const rules = [["free", "Per unit"], ["point", "Per titik"], ["perimeter", "Keliling"], ["top_bottom", "Atas–bawah"], ["left_right", "Kanan–kiri"], ["length", "Meter lari"]];
  const detail = showMasterDialog(finishing ? "Edit Finishing" : "Tambah Finishing", `<form id="finishing-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama finishing *</span><input name="name" value="${escapeHtml(finishing?.name || "")}" required></label><label class="field"><span>Kode finishing *</span><input name="code" value="${escapeHtml(finishing?.code || "")}" required></label>
    <label class="field"><span>Harga / unit</span><input name="price" type="number" min="0" value="${finishing?.price || 0}"></label><label class="field"><span>Dasar perhitungan</span><select name="rule">${rules.map(([value, label]) => `<option value="${value}" ${finishing?.rule === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <div class="field full"><span>Kategori yang sesuai *</span><div class="category-checks">${categories.map((category) => `<label><input type="checkbox" name="category" value="${category}" ${(finishing?.categories || []).includes(category) ? "checked" : ""}><span>${category}</span></label>`).join("")}</div><small>Finishing hanya akan muncul saat menambahkan produk dalam kategori yang dipilih.</small></div>
  </div><div class="form-footer">${switchHtml("active", finishing?.active !== false)}<button class="primary" type="submit">Simpan Finishing</button></div></form>`);
  detail.querySelector("#finishing-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); const payload = { ...values, active: event.target.elements.active.checked, categories: [...event.target.querySelectorAll('input[name="category"]:checked')].map((input) => input.value) }; try { await api(finishing ? `/api/finishings/${finishing.id}` : "/api/finishings", { method: finishing ? "PUT" : "POST", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "finishings"; render(); toast("Finishing berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function openMachineForm(machine = null) {
  const detail = showMasterDialog(machine ? "Edit Mesin" : "Tambah Mesin", `<form id="machine-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama mesin *</span><input name="name" value="${escapeHtml(machine?.name || "")}" required></label><label class="field"><span>Kode mesin *</span><input name="code" value="${escapeHtml(machine?.code || "")}" required></label>
    <label class="field"><span>Jenis mesin</span><input name="type" value="${escapeHtml(machine?.type || "")}" placeholder="Large Format, Finishing"></label><label class="field"><span>Status</span><select name="status">${["AKTIF", "MAINTENANCE", "NONAKTIF"].map((status) => `<option ${machine?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    <label class="field"><span>Biaya operasional / jam</span><input name="costPerHour" type="number" min="0" value="${machine?.costPerHour || 0}"></label><label class="field"><span>Kapasitas</span><input name="capacity" value="${escapeHtml(machine?.capacity || "")}" placeholder="Contoh: 12 m²/jam"></label>
  </div><div class="form-footer">${switchHtml("active", machine?.active !== false)}<button class="primary" type="submit">Simpan Mesin</button></div></form>`);
  detail.querySelector("#machine-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); values.active = event.target.elements.active.checked; try { await api(machine ? `/api/machines/${machine.id}` : "/api/machines", { method: machine ? "PUT" : "POST", body: JSON.stringify(values) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "machines"; render(); toast("Mesin berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function tierRowHtml(tier = {}, index = 0) {
  return `<div class="tier-row" data-tier-row><b>${index + 1}</b><input data-tier-min type="number" min="1" value="${tier.min ?? (index ? index * 10 + 1 : 1)}" aria-label="Minimum quantity"><input data-tier-max type="number" min="1" value="${tier.max ?? ""}" placeholder="∞" aria-label="Maksimum quantity"><input data-tier-price type="number" min="0" value="${tier.price || ""}" placeholder="Harga" aria-label="Harga per unit"><span data-tier-margin>—</span><button type="button" data-remove-tier title="Hapus">×</button></div>`;
}

function materialRowHtml(source = {}) {
  return `<div class="builder-row" data-material-row><select data-material-id><option value="">Pilih bahan</option>${state.materials.filter((item) => item.active !== false || item.id === source.materialId).map((item) => `<option value="${item.id}" ${item.id === source.materialId ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.unit)}</option>`).join("")}</select><input data-material-qty type="number" min="0.0001" step="0.0001" value="${source.quantity || 1}" placeholder="Jumlah"><input data-material-waste type="number" min="0" step="0.1" value="${source.wastePercent || 0}" placeholder="Waste %"><button type="button" data-remove-builder>×</button></div>`;
}

function finishingRowHtml(item = {}) {
  return `<div class="builder-row finishing-builder" data-finishing-row><input data-finishing-name value="${escapeHtml(item.name || "")}" placeholder="Nama finishing"><input data-finishing-price type="number" min="0" value="${item.price || 0}" placeholder="Harga"><select data-finishing-rule>${[["free","Per unit"],["point","Per titik"],["perimeter","Keliling"],["top_bottom","Atas–bawah"],["left_right","Kanan–kiri"],["length","Meter lari"]].map(([value,label]) => `<option value="${value}" ${item.rule === value ? "selected" : ""}>${label}</option>`).join("")}</select><button type="button" data-remove-builder>×</button></div>`;
}

function finishingOptionsHtml(category, selectedIds = []) {
  const options = state.finishings.filter((item) => item.active !== false && (item.categories || []).includes(category));
  return options.length ? options.map((item) => `<label class="finishing-master-option"><input type="checkbox" name="finishingId" value="${item.id}" ${selectedIds.includes(item.id) ? "checked" : ""}><span><strong>${escapeHtml(item.name)}</strong><small>${item.price ? rupiah.format(item.price) : "Gratis"} · ${escapeHtml({ free: "per unit", point: "per titik", perimeter: "keliling", top_bottom: "atas–bawah", left_right: "kanan–kiri", length: "meter lari" }[item.rule] || item.rule)}</small></span></label>`).join("") : '<p class="empty-inline">Belum ada finishing aktif untuk kategori ini. Tambahkan melalui tab Finishing.</p>';
}

function openProductForm(product = null) {
  const defaultTiers = product?.priceTiers?.length ? product.priceTiers : [{ min: 1, max: 1, price: product?.price || 10000 }, { min: 2, max: 10, price: product?.price ? Math.round(product.price * .9) : 9000 }, { min: 11, max: 50, price: product?.price ? Math.round(product.price * .8) : 8000 }];
  const sources = product?.materialSources?.length ? product.materialSources : [{}];
  const categories = productCategories.filter(([id]) => id !== "all").map(([, label]) => label);
  const initialCategory = product?.category || categories[0];
  const selectedFinishingIds = product?.finishingIds || [];
  const discount = product?.discount || { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" };
  const detail = showMasterDialog(product ? "Edit Produk" : "Tambah Produk", `<form id="product-form" class="master-form product-form"><div class="product-form-grid"><section><p class="section-label">Informasi produk</p><div class="form-grid">
    <label class="field"><span>Nama produk *</span><input name="name" value="${escapeHtml(product?.name || "")}" required></label><label class="field"><span>SKU produk *</span><input name="sku" value="${escapeHtml(product?.sku || "")}" required></label>
    <label class="field"><span>Kategori *</span><select name="category">${categories.map((category) => `<option ${product?.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></label><label class="field"><span>Satuan jual *</span><select name="saleUnit">${["pcs", "lbr", "m²", "m lari", "pack", "rim", "set"].map((unit) => `<option ${product?.saleUnit === unit || product?.unitName === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
    <label class="field"><span>Dasar perhitungan</span><select name="priceBasis"><option value="unit" ${product?.priceBasis === "unit" ? "selected" : ""}>Per unit</option><option value="sqm" ${product?.priceBasis === "sqm" ? "selected" : ""}>Luas m²</option><option value="linear_m" ${product?.priceBasis === "linear_m" ? "selected" : ""}>Meter lari</option></select></label><label class="field"><span>Pilihan lebar (pisahkan koma)</span><input name="widths" value="${escapeHtml((product?.widths || []).join(", "))}" placeholder="1, 1.27, 1.52"></label>
    <label class="field"><span>Harga Dasar / HPP</span><input name="baseCost" type="number" min="0" value="${product?.baseCost || 0}"></label><label class="field"><span>Harga Jual *</span><input name="price" type="number" min="0" value="${product?.price || 10000}" required></label>
    <div class="margin-summary full"><span>Margin kotor</span><strong id="margin-summary">—</strong></div><label class="field full"><span>Catatan produk</span><textarea name="note">${escapeHtml(product?.note || "")}</textarea></label>
  </div><div class="toggle-group">${switchHtml("active", product?.active !== false)}${switchHtml("featured", Boolean(product?.featured), "Tampilkan di Semua")}</div></section>
  <section><p class="section-label">Kebutuhan produksi</p><div class="builder-card"><div class="builder-head"><strong>Sumber bahan *</strong><button id="add-material-row" class="text-button" type="button">+ Tambah Bahan</button></div><div id="material-rows">${sources.map(materialRowHtml).join("")}</div><small>Jumlah pemakaian dihitung per satuan jual. Stok berkurang saat status Selesai.</small></div>
  <div class="builder-card"><div class="builder-head"><strong>Mesin yang digunakan *</strong></div><div class="machine-options">${state.machines.map((machine) => `<label><input type="checkbox" name="machineId" value="${machine.id}" ${(product?.machineIds || []).includes(machine.id) ? "checked" : ""}><span>${escapeHtml(machine.name)}</span></label>`).join("")}</div></div>
  <div class="builder-card"><div class="builder-head"><div><strong>Finishing / Add-on</strong><p>Otomatis difilter berdasarkan kategori produk.</p></div><button id="manage-finishing" class="text-button" type="button">Kelola Finishing</button></div><div id="finishing-options" class="finishing-master-grid">${finishingOptionsHtml(initialCategory, selectedFinishingIds)}</div></div></section></div>
  <section class="wholesale-card discount-editor"><div class="builder-head"><div><strong>Promo / Diskon Produk</strong><p>Label DISKON dan harga promo aktif otomatis selama periode promo.</p></div>${switchHtml("discountEnabled", Boolean(discount.enabled), "Aktif")}</div><div id="discount-fields" class="form-grid ${discount.enabled ? "" : "disabled-section"}"><label class="field"><span>Jenis diskon</span><select name="discountType"><option value="percent" ${discount.type !== "nominal" ? "selected" : ""}>Persentase (%)</option><option value="nominal" ${discount.type === "nominal" ? "selected" : ""}>Nominal (Rp)</option></select></label><label class="field"><span>Nilai diskon</span><input name="discountValue" type="number" min="0" value="${discount.value || 0}"></label><label class="field"><span>Mulai promo (WITA)</span><input name="discountStartsAt" type="datetime-local" value="${escapeHtml(localDateTimeInput(discount.startsAt))}"></label><label class="field"><span>Selesai promo (WITA)</span><input name="discountEndsAt" type="datetime-local" value="${escapeHtml(localDateTimeInput(discount.endsAt))}"></label></div></section>
  <section class="wholesale-card"><div class="builder-head"><div><strong>Harga Grosir</strong><p>Harga berubah otomatis berdasarkan jumlah pesanan.</p></div>${switchHtml("wholesaleEnabled", Boolean(product?.wholesaleEnabled))}</div><div id="tier-editor" class="${product?.wholesaleEnabled ? "" : "disabled-section"}"><div class="tier-head"><span>Tingkat</span><span>Min. Qty</span><span>Maks. Qty</span><span>Harga / Unit</span><span>Margin</span><span>Aksi</span></div><div id="tier-rows">${defaultTiers.map(tierRowHtml).join("")}</div><div class="tier-footer"><small>Maksimal 10 tingkat harga · Rentang tidak boleh tumpang tindih.</small><button id="add-tier" class="secondary" type="button">+ Tambah Tingkat Harga <b id="tier-count">${defaultTiers.length}/10</b></button></div></div></section>
  <div class="form-footer"><button type="button" class="secondary" id="cancel-master">Batal</button><button class="primary" type="submit">Simpan Produk</button></div></form>`);
  const form = detail.querySelector("#product-form");
  const refreshMargins = () => { const hpp = Number(form.elements.baseCost.value || 0); const price = Number(form.elements.price.value || 0); const margin = price ? ((price - hpp) / price * 100) : 0; detail.querySelector("#margin-summary").textContent = `${margin.toFixed(1)}% · ${rupiah.format(price - hpp)}`; detail.querySelectorAll("[data-tier-row]").forEach((row) => { const tierPrice = Number(row.querySelector("[data-tier-price]").value || 0); row.querySelector("[data-tier-margin]").textContent = tierPrice ? `${(((tierPrice - hpp) / tierPrice) * 100).toFixed(0)}%` : "—"; }); };
  const bindBuilders = () => { detail.querySelectorAll("[data-remove-builder]").forEach((button) => button.onclick = () => button.closest(".builder-row").remove()); detail.querySelectorAll("[data-remove-tier]").forEach((button) => button.onclick = () => { if (detail.querySelectorAll("[data-tier-row]").length <= 1) return; button.closest(".tier-row").remove(); [...detail.querySelectorAll("[data-tier-row]")].forEach((row, index) => row.querySelector("b").textContent = index + 1); detail.querySelector("#tier-count").textContent = `${detail.querySelectorAll("[data-tier-row]").length}/10`; refreshMargins(); }); detail.querySelectorAll("[data-tier-price]").forEach((input) => input.oninput = refreshMargins); };
  form.elements.baseCost.oninput = refreshMargins; form.elements.price.oninput = refreshMargins;
  form.elements.wholesaleEnabled.onchange = () => detail.querySelector("#tier-editor").classList.toggle("disabled-section", !form.elements.wholesaleEnabled.checked);
  form.elements.discountEnabled.onchange = () => detail.querySelector("#discount-fields").classList.toggle("disabled-section", !form.elements.discountEnabled.checked);
  form.elements.category.onchange = () => { const checked = [...form.querySelectorAll('input[name="finishingId"]:checked')].map((input) => input.value); detail.querySelector("#finishing-options").innerHTML = finishingOptionsHtml(form.elements.category.value, checked); };
  detail.querySelector("#add-tier").onclick = () => { const rows = detail.querySelector("#tier-rows"); const count = rows.children.length; if (count >= 10) return toast("Maksimal 10 tingkat harga", "error"); rows.insertAdjacentHTML("beforeend", tierRowHtml({ min: count * 10 + 1, max: (count + 1) * 10, price: form.elements.price.value }, count)); detail.querySelector("#tier-count").textContent = `${count + 1}/10`; bindBuilders(); refreshMargins(); };
  detail.querySelector("#add-material-row").onclick = () => { detail.querySelector("#material-rows").insertAdjacentHTML("beforeend", materialRowHtml()); bindBuilders(); };
  detail.querySelector("#manage-finishing").onclick = () => { dialog.close(); state.masterTab = "finishings"; renderMaster(); };
  detail.querySelector("#cancel-master").onclick = () => dialog.close(); bindBuilders(); refreshMargins();
  form.onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const payload = { ...values, active: form.elements.active.checked, featured: form.elements.featured.checked, wholesaleEnabled: form.elements.wholesaleEnabled.checked, discount: { enabled: form.elements.discountEnabled.checked, type: values.discountType, value: values.discountValue, startsAt: makassarInputToIso(values.discountStartsAt), endsAt: makassarInputToIso(values.discountEndsAt) }, widths: values.widths.split(",").map((value) => value.trim()).filter(Boolean), machineIds: [...form.querySelectorAll('input[name="machineId"]:checked')].map((input) => input.value), materialSources: [...form.querySelectorAll("[data-material-row]")].map((row) => ({ materialId: row.querySelector("[data-material-id]").value, quantity: row.querySelector("[data-material-qty]").value, wastePercent: row.querySelector("[data-material-waste]").value })).filter((item) => item.materialId), finishingIds: [...form.querySelectorAll('input[name="finishingId"]:checked')].map((input) => input.value), priceTiers: [...form.querySelectorAll("[data-tier-row]")].map((row) => ({ min: row.querySelector("[data-tier-min]").value, max: row.querySelector("[data-tier-max]").value, price: row.querySelector("[data-tier-price]").value })) }; try { await api(product ? `/api/products/${product.id}` : "/api/products", { method: product ? "PUT" : "POST", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "products"; render(); toast("Produk berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function renderStock() {
  root.innerHTML = `<div class="stock-grid"><section class="panel"><div class="panel-head"><h2>Stok Bahan</h2><span class="badge info">Berkurang saat Selesai</span></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>SKU</th><th>Stok</th><th>Minimum</th><th>Update</th><th></th></tr></thead><tbody>${state.inventory.map((item) => `<tr><td><strong>${item.productName}</strong></td><td>${escapeHtml(item.sku)}</td><td class="${Number(item.quantity) <= Number(item.minStock || 0) ? "stock-negative" : ""}">${Number(item.quantity).toLocaleString("id-ID")} ${item.unit}</td><td>${Number(item.minStock || 0).toLocaleString("id-ID")} ${item.unit}</td><td>${dateFormat.format(new Date(item.updatedAt))}</td><td><button class="secondary" data-adjust="${item.sku}">Sesuaikan</button></td></tr>`).join("")}</tbody></table></div></section><aside class="panel"><div class="panel-head"><h2>Mutasi Terakhir</h2></div><div class="panel-body">${state.stockMovements.length ? state.stockMovements.slice(0, 15).map((move) => `<div class="movement"><div><strong>${move.productName}</strong><small>${escapeHtml(move.reason)}${move.orderCode ? ` · ${move.orderCode}` : ""}<br>${dateFormat.format(new Date(move.createdAt))}</small></div><em class="${move.change > 0 ? "plus" : "minus"}">${move.change > 0 ? "+" : ""}${move.change}</em></div>`).join("") : '<div class="cart-empty">Belum ada mutasi stok.</div>'}</div></aside></div>`;
  document.querySelectorAll("[data-adjust]").forEach((button) => button.onclick = async () => {
    const change = window.prompt("Masukkan perubahan stok. Contoh: 50 atau -2.5");
    if (!change) return;
    const reason = window.prompt("Alasan penyesuaian:", "Stok awal / stok masuk");
    try { await api(`/api/inventory/${button.dataset.adjust}`, { method: "PATCH", body: JSON.stringify({ change, reason }) }); await load(); toast("Stok diperbarui"); } catch (error) { toast(error.message, "error"); }
  });
}

document.querySelectorAll(".nav-item").forEach((button) => button.onclick = () => { state.view = button.dataset.view; render(); });
const shell = document.querySelector("#app-shell");
const sidebarToggle = document.querySelector("#sidebar-toggle");
function setSidebarCollapsed(collapsed) {
  shell.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle.textContent = collapsed ? "›" : "‹";
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Buka sidebar" : "Tutup sidebar");
  sidebarToggle.title = collapsed ? "Buka sidebar" : "Tutup sidebar";
  localStorage.setItem("manna-sidebar-collapsed", collapsed ? "1" : "0");
}
setSidebarCollapsed(localStorage.getItem("manna-sidebar-collapsed") === "1");
sidebarToggle.onclick = () => setSidebarCollapsed(!shell.classList.contains("sidebar-collapsed"));
document.querySelector("#refresh-btn").onclick = load;
document.querySelector("#today").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date());
document.addEventListener("invalid", (event) => {
  if (event.target.validity?.valueMissing) event.target.setCustomValidity("Kolom tidak boleh kosong");
}, true);
document.addEventListener("input", (event) => {
  if (typeof event.target.setCustomValidity === "function") event.target.setCustomValidity("");
}, true);
document.addEventListener("change", (event) => {
  if (typeof event.target.setCustomValidity === "function") event.target.setCustomValidity("");
}, true);
document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await api("/api/login", { method: "POST", body: JSON.stringify({ pin: document.querySelector("#login-pin").value }) }); showApp(); await load(); } catch (error) { toast(error.message, "error"); }
});

const session = await api("/api/session");
if (session.authenticated) { showApp(); await load(); } else showLogin();
