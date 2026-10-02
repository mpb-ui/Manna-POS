import { finishingPriceForUnits, normalizeFinishingTiers } from "./finishing-pricing.js";
import { mountEmployees, hasUnsavedPayroll, discardPayrollDrafts, clearEmployeeSession } from "./employees-ui.js";
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
const projectDateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Makassar" });
const projectTimeFormat = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Makassar" });
function localDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function makassarInputToIso(value) { return value ? new Date(`${value}:00+08:00`).toISOString() : ""; }
const defaultProductCategories = [
  ["all", "Semua"], ["outdoor", "Outdoor"], ["print-a3", "Print A3+"], ["lf-poster", "LF Poster"],
  ["lf-sticker", "LF Sticker"], ["display-banner", "Display & Banner"],
  ["merchandise", "Merchandise"], ["sablon-dtf", "Sablon DTF"], ["atk", "ATK"], ["akrilik", "Akrilik"], ["stempel", "Stempel"]
];
function slug(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function productCategories() {
  const labels = state.catalogOptions?.categories?.length ? state.catalogOptions.categories : defaultProductCategories.filter(([id]) => id !== "all").map(([, label]) => label);
  return [["all", "Semua"], ...labels.map((label) => [categoryId(label), label])];
}
function categoryId(label, kind = "products") { return state.catalogOptions[kind === "products" ? "categoryKeys" : "materialCategoryKeys"]?.[label] || slug(label); }
function canManageSettings() { return ["OWNER", "ADMIN"].includes(state.currentUser?.role); }
function activePics() { return state.pics || []; }
function picSelectOptions(order) {
  const current = order.designPic || "";
  const legacy = current && !activePics().some((pic) => pic.name === current) ? `<option value="${escapeHtml(current)}" selected disabled>${escapeHtml(current)} (riwayat)</option>` : "";
  return legacy + activePics().map((pic) => `<option value="${escapeHtml(pic.name)}" ${current === pic.name ? "selected" : ""}>${escapeHtml(pic.name)}</option>`).join("");
}
const fileServices = [
  { id: "READY", name: "File Siap Cetak", price: 0 },
  { id: "DESIGN_A", name: "Biaya Design A", price: 25000 },
  { id: "DESIGN_B", name: "Biaya Design B", price: 35000 },
  { id: "DESIGN_C", name: "Biaya Design C", price: 50000 },
  { id: "DESIGN_D", name: "Biaya Design D", price: 80000 }
];
const atkGroups = ["Amplop", "Alat tulis", "Map & arsip", "Perekat", "Kertas & label", "ID & lanyard", "Peralatan lainnya"];
const state = {
  products: [], allProducts: [], materials: [], finishings: [], machines: [], orders: [], pics: [], inventory: [], shirtStock: [], stockMovements: [], statusLabels: {}, catalogOptions: { categories: [], materialCategories: [], saleUnits: [], priceBases: [] }, categoryScroll: 0,
  currentUser: null, permissions: [], permissionCatalog: [], rolePresets: {}, users: [], auditLogs: [], report: null,
  cart: [], view: "pos", selectedProduct: null, selectedCategory: "all", a3Kind: "paper", atkGroup: "Semua", atkSearch: "", directSearch: { Akrilik: "", Stempel: "" }, editingOrderId: null,
  masterTab: "products", categorySettingsKind: "products", reportTab: "overview", reportSort: { key: "date", direction: "desc" }, reportFilters: { from: "", to: "", category: "", machineId: "", paymentStatus: "" }, projectCategory: "orders", projectView: "list", projectSearch: "", projectDeadline: "all", projectPic: "all", projectPayment: "all", projectStatus: "all",
  stockSearch: "", stockCategory: "",
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

function parseMoney(value) { return Number(String(value ?? "").replace(/[^0-9-]/g, "")) || 0; }
function formatMoneyValue(value) { return parseMoney(value).toLocaleString("id-ID"); }
function moneyField(name, value, attributes = "") { return `<span class="money-input"><b>Rp</b><input name="${name}" type="text" inputmode="numeric" value="${formatMoneyValue(value)}" ${attributes}></span>`; }
function bindMoneyInputs(container = document) {
  container.querySelectorAll(".money-input input").forEach((input) => {
    input.addEventListener("input", () => { const cursorAtEnd = input.selectionStart === input.value.length; input.value = input.dataset.optionalMoney !== undefined && !input.value.trim() ? "" : formatMoneyValue(input.value); if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length); input.dispatchEvent(new CustomEvent("moneychange", { bubbles: true })); });
    input.addEventListener("focus", () => input.select());
  });
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
  clearEmployeeSession();
  state.currentUser = null;
  state.permissions = [];
  root.innerHTML = "";
  dialog.close();
  printDocument.innerHTML = "";
  document.body.classList.remove("printing");
  document.querySelector('[data-view="employees"]').classList.add("hidden");
  document.querySelector("#login-view").classList.remove("hidden");
  document.querySelector("#app-shell").classList.add("hidden");
}
function showApp() {
  document.querySelector("#login-view").classList.add("hidden");
  document.querySelector("#app-shell").classList.remove("hidden");
}

function can(permission) { return state.permissions.includes(permission); }
const viewPermissions = { pos: "pos.view", projects: "projects.orders", stock: "stock.view", reports: "reports.view", master: "master.view" };
function canView(view) { return view === "employees" ? canManageSettings() : can(viewPermissions[view]); }
function firstAllowedView() { return Object.keys(viewPermissions).find((view) => can(viewPermissions[view])) || "none"; }

async function load() {
  const data = await api("/api/bootstrap");
  Object.assign(state, data);
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("hidden", !canView(button.dataset.view)));
  if (!canView(state.view)) state.view = firstAllowedView();
  document.querySelector("#current-user-name").textContent = state.currentUser?.name || "—";
  document.querySelector("#current-user-role").textContent = state.currentUser?.roleLabel || "—";
  document.querySelector("#active-count").textContent = state.orders.filter((o) => !["SELESAI", "DIAMBIL"].includes(o.status)).length;
  render();
}

function render() {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  document.querySelector("#page-title").textContent = { pos: "Point of Sale", projects: "Project Management", stock: "Stok Bahan", reports: "Laporan", master: "Master Data", employees: "Karyawan", none: "Akses Terbatas" }[state.view];
  if (state.view === "none") root.innerHTML = '<div class="category-empty"><strong>Belum ada menu yang dapat diakses</strong><p>Hubungi Admin atau Owner untuk mengatur permission akun ini.</p></div>';
  if (state.view === "pos") renderPos();
  if (state.view === "projects") renderProjects();
  if (state.view === "stock") renderStock();
  if (state.view === "reports") renderReports();
  if (state.view === "master") renderMaster();
  if (state.view === "employees" && canManageSettings()) mountEmployees({ root, dialog, printDocument, api, toast, escapeHtml, moneyField, parseMoney, bindMoneyInputs, rupiah, isActive: () => state.view === "employees" && canManageSettings() });
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
function billedLength(value, increment = 0.5) {
  const step = Number(increment) > 0 ? Number(increment) : 0.5;
  return Math.max(1, Number((Math.ceil(Number(value || 1) / step - 1e-9) * step).toFixed(4)));
}
function productBase(product, width, length, quantity, fixedVariant = null, materialVariant = null, combination = null) {
  const billed = billedLength(length, product.billingIncrement);
  const units = fixedVariant ? Number(quantity) : product.priceBasis === "sqm" ? Number(width) * billed * Number(quantity) : billed * Number(quantity);
  const tierList = combination?.priceTiers?.length ? combination.priceTiers : combination?.price != null ? []
    : materialVariant?.priceTiers?.length ? materialVariant.priceTiers : materialVariant?.price != null || fixedVariant?.price != null ? []
    : product.wholesaleEnabled ? product.priceTiers || [] : [];
  const tier = tierList.filter((item) => Number(item.min) <= quantity && (item.max == null || item.max === "" || quantity <= Number(item.max))).sort((a, b) => Number(b.min) - Number(a.min))[0];
  const originalUnitPrice = Number(tier?.price ?? combination?.price ?? materialVariant?.price ?? fixedVariant?.price ?? product.price);
  const unitPrice = promoPrice(product, originalUnitPrice);
  return { billed, units, total: units * unitPrice, unitPrice, originalUnitPrice, tier, discountApplied: unitPrice < originalUnitPrice };
}
function manualAreaFinishing(finish) { return finish.rule === "area" && finish.name === "Kisscut LF"; }
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
        <label for="f-${finish.id}"><strong>${escapeHtml(finish.name)}</strong><small data-finishing-price="${escapeHtml(finish.id)}">${finish.price ? rupiah.format(finish.price) + ({ area: " /m²", point: " /titik" }[finish.rule] || " /unit") : "Gratis"}</small></label>
      </div>
      <div class="finish-actions">
        <button type="button" class="finish-note-toggle" data-finish-note-toggle="${finish.id}" disabled>Catatan</button>
        <div class="qty-stepper hidden" data-stepper="${finish.id}">
          <button type="button" data-minus="${finish.id}" ${finish.rule === "area" && !manualAreaFinishing(finish) ? "disabled" : ""}>−</button>
          <input type="number" min="1" step="${manualAreaFinishing(finish) ? "0.1" : "1"}" data-finish-qty="${finish.id}" value="1" aria-label="Jumlah ${finish.name}" ${finish.rule === "area" && !manualAreaFinishing(finish) ? "readonly" : ""}>
          <button type="button" data-plus="${finish.id}" ${finish.rule === "area" && !manualAreaFinishing(finish) ? "disabled" : ""}>+</button>
        </div>
      </div>
      <div class="finish-note-row hidden" data-finish-note-row="${finish.id}"><input type="text" data-finish-note="${finish.id}" placeholder="Catatan khusus ${escapeHtml(finish.name)}"></div>
    </div>`).join("");
}

function fixedSizeMeasurementHtml(product) {
  const hasCustomSize = product.priceBasis !== "unit";
  const options = [
    ...(hasCustomSize ? [{ id: "custom", label: "Meteran", price: null }] : []),
    ...(product.fixedSizeVariants || [])
  ];
  const chips = options.map((variant, index) => `<div class="chip size-variant-chip"><input type="radio" name="size-variant" id="size-variant-${product.id}-${variant.id}" value="${variant.id}" ${index === 0 ? "checked" : ""}><label for="size-variant-${product.id}-${variant.id}"><strong>${escapeHtml(variant.label)}</strong>${variant.price ? `<small>${rupiah.format(variant.price)}</small>` : ""}</label></div>`).join("");
  const customFields = hasCustomSize ? `<div class="form-grid three fixed-size-custom" data-size-custom><div class="field full"><span>Lebar bahan</span><div class="chips" id="width-chips">${product.widths.map((width, index) => `<div class="chip"><input type="radio" name="width" id="w-${index}" value="${width}" ${index === 0 ? "checked" : ""}><label for="w-${index}">${width} meter</label></div>`).join("")}</div></div><label class="field"><span>Panjang aktual</span><span class="input-with-unit"><input id="length" type="number" min="0.1" step="0.1" value="1"><b>m</b></span></label><div class="field"><span>Panjang ditagihkan</span><input id="billed-length" class="readonly-input" value="1 m" readonly aria-readonly="true"></div></div>` : "";
  return `<div class="field full"><span>Pilih varian</span><div class="chips size-variant-options">${chips}</div></div>${customFields}<div class="form-grid variant-quantity"><label class="field"><span>Jumlah Produk</span><span class="input-with-unit"><input id="quantity" type="number" min="1" step="1" value="1"><b>${escapeHtml(product.groupedProduct ? product.unitName || "unit" : "Lbr")}</b></span></label></div>`;
}

function choiceGroupsHtml(product) {
  return (product.choiceGroups || []).map((group) => `<div class="variant-choice-group"><span class="variant-label">${escapeHtml(group.label)}</span><div class="chips exclusive-choice-options">${(group.options || []).map((option, index) => `<div class="chip exclusive-choice"><input type="radio" name="choice-${group.id}" id="choice-${product.id}-${group.id}-${option.id}" value="${option.id}" ${index === 0 ? "checked" : ""}><label for="choice-${product.id}-${group.id}-${option.id}"><i aria-hidden="true"></i>${escapeHtml(option.label)}</label></div>`).join("")}</div><small>Hanya satu pilihan yang dapat dipilih.</small></div>`).join("");
}

function materialVariantOptionsHtml(product) {
  if (!product.hasMaterialVariants || !product.materialVariants?.length) return "";
  return `<div class="field full"><span>Varian Bahan *</span><div class="chips">${product.materialVariants.map((variant, index) => `<div class="chip size-variant-chip"><input type="radio" name="material-variant" id="material-variant-${escapeHtml(product.id)}-${escapeHtml(variant.id)}" value="${escapeHtml(variant.id)}" ${index === 0 ? "checked" : ""}><label for="material-variant-${escapeHtml(product.id)}-${escapeHtml(variant.id)}"><strong>${escapeHtml(variant.label)}</strong>${variant.price != null ? `<small>${rupiah.format(variant.price)}</small>` : ""}</label></div>`).join("")}</div></div>`;
}

function subVariantOptionsHtml(product) {
  if (!product.hasMaterialVariants || !product.subVariants?.length) return "";
  return product.materialVariants.map((variant, variantIndex) => {
    const enabled = product.subVariants.filter((sub) => variant.combinations?.find((item) => item.subVariantId === sub.id && item.active !== false));
    return `<div class="field full material-sub-options ${variantIndex ? "hidden" : ""}" data-sub-options-for="${escapeHtml(variant.id)}"><span>${escapeHtml(product.subVariantLabel || "Sub-varian")} *</span><div class="chips">${enabled.map((sub, index) => { const combo = variant.combinations.find((item) => item.subVariantId === sub.id); const price = combo.price ?? variant.price ?? product.price; return `<div class="chip size-variant-chip"><input type="radio" name="sub-variant" id="sub-variant-${escapeHtml(product.id)}-${escapeHtml(variant.id)}-${escapeHtml(sub.id)}" value="${escapeHtml(sub.id)}" ${!variantIndex && !index ? "checked" : ""}><label for="sub-variant-${escapeHtml(product.id)}-${escapeHtml(variant.id)}-${escapeHtml(sub.id)}"><strong>${escapeHtml(sub.label)}</strong><small>${rupiah.format(price)}</small></label></div>`; }).join("")}</div></div>`;
  }).join("");
}

function categoryKey(product) {
  return productCategories().find(([, label]) => label === product.category)?.[0] || "all";
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
      ${discountActive(product) ? '<span class="discount-badge">DISKON</span>' : ""}<strong>${escapeHtml(product.name)}</strong><small>${product.groupedProduct ? "Mulai dari " : ""}${discountActive(product) ? `<s>${rupiah.format(product.price)}</s> <b>${rupiah.format(promoPrice(product, product.price))}</b>` : rupiah.format(product.cardPrice || product.price)} ${escapeHtml(product.unitLabel)}</small>
      ${recommended ? `<em>★ ${escapeHtml(product.recommendation || "Produk pilihan")}</em>` : ""}
    </label>
  </div>`).join("");
}

function a3CatalogHtml(products, selected) {
  const kind = selected?.a3Kind || state.a3Kind;
  const curated = products.filter((item) => item.active !== false && item.a3Kind === kind);
  const families = [...new Set(curated.map((item) => item.a3Family))].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
  const quickFamilies = kind === "paper" ? ["Art Paper (AP)", "HVS", "Bluishwhite"] : kind === "sticker" ? ["White Glossy", "White Matte", "Bontak"] : [];
  const quickCards = quickFamilies.filter((family) => families.includes(family)).map((family) => `<button type="button" class="a3-quick-card ${selected?.a3Family === family ? "active" : ""}" data-a3-family="${escapeHtml(family)}" aria-pressed="${selected?.a3Family === family}"><strong>${escapeHtml(family === "Art Paper (AP)" ? "Art Paper" : family)}</strong><small>${kind === "paper" ? "Kertas A3+" : "Sticker A3+"}</small></button>`).join("");
  const other = kind === "paper" ? products.filter((item) => item.active !== false && !item.a3Kind) : [];
  const readyGroups = ["Kartu Nama", "Map Folder", "Voucher Pad", "Tent Card", "Karcis Pad", "Brosur", "Buku Nota"];
  const readyOptions = readyGroups.map((group) => {
    const items = curated.filter((item) => item.a3ReadyGroup === group);
    return items.length ? `<optgroup label="${group}">${items.sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true })).map((item) => `<option value="family:${escapeHtml(item.a3Family)}" ${selected?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${rupiah.format(item.price)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  const options = kind === "ready" ? readyOptions : [
    ...families.map((family) => `<option value="family:${escapeHtml(family)}" ${selected?.a3Family === family ? "selected" : ""}>${escapeHtml(family)}</option>`),
    ...other.map((item) => `<option value="product:${escapeHtml(item.id)}" ${selected?.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`)
  ].join("");
  const variants = selected?.a3Family ? [...new Set(curated.filter((item) => item.a3Family === selected.a3Family).map((item) => item.a3Variant))].sort((a, b) => a.localeCompare(b, "id", { numeric: true })) : [];
  const variantsHtml = variants.length > 1 ? `<div class="a3-field"><span>Varian bahan</span><div class="chips">${variants.map((variant) => `<button type="button" class="a3-option ${selected?.a3Variant === variant ? "active" : ""}" data-a3-variant="${escapeHtml(variant)}" aria-pressed="${selected?.a3Variant === variant}">${escapeHtml(variant)}</button>`).join("")}</div></div>` : "";
  const printModes = selected?.a3Family === "HVS" ? `<div class="a3-field"><span>Varian print</span><div class="chips">${[["BW", "Print BW"], ["Warna", "Print Warna"]].map(([mode, label]) => `<button type="button" class="a3-option ${selected.a3PrintMode === mode ? "active" : ""}" data-a3-print-mode="${mode}" aria-pressed="${selected.a3PrintMode === mode}">${label}</button>`).join("")}</div></div>` : "";
  const sides = selected?.a3Kind === "paper" ? `<div class="a3-field"><span>Sisi cetak</span><div class="chips">${["1S", "2S"].map((side) => {
    const option = curated.find((item) => item.a3Family === selected.a3Family && item.a3Variant === selected.a3Variant && item.a3PrintMode === selected.a3PrintMode && item.a3Side === side);
    return `<button type="button" class="a3-option ${selected.id === option?.id ? "active" : ""}" data-a3-side="${side}" aria-pressed="${selected.id === option?.id}" ${option ? "" : "disabled"}>Cetak ${side === "1S" ? "1 sisi" : "2 sisi"}${option ? ` · ${rupiah.format(option.price)}` : ""}</button>`;
  }).join("")}</div></div>` : selected?.a3Kind === "sticker" ? `<p class="a3-sticker-price">Sticker A3+ · ${rupiah.format(selected.price)}/lembar</p>` : "";
  const selectedOption = selected?.a3Family ? selected.a3Family : selected?.id ? selected.name : "";
  return `<div class="a3-kind-tabs" role="group" aria-label="Jenis bahan Print A3+">${[["paper", "Kertas"], ["sticker", "Sticker"], ["ready", "Produk Jadi"]].map(([id, label]) => `<button type="button" data-a3-kind="${id}" class="${kind === id ? "active" : ""}" aria-pressed="${kind === id}">${label}</button>`).join("")}</div>
    ${quickCards ? `<div class="a3-quick"><span>Sering dipilih</span><div class="a3-quick-list">${quickCards}</div></div>` : ""}
    <label class="field a3-picker"><span>Pilih bahan atau produk</span><select id="a3-product-select" ${kind === "ready" && !families.length ? "disabled" : ""}><option value="">${kind === "paper" ? "Pilih bahan kertas…" : kind === "sticker" ? "Pilih jenis sticker…" : families.length ? "Pilih produk jadi…" : "Belum ada produk jadi"}</option>${options}</select></label>
    ${kind === "ready" && !families.length ? '<div class="category-empty"><strong>Produk Jadi belum tersedia</strong><p>Produk dapat ditambahkan kemudian.</p></div>' : ""}
    ${selected ? `<div class="a3-selection"><h3>${escapeHtml(selectedOption)}</h3>${variantsHtml}${printModes}${sides}${productConfigurationHtml(selected)}</div>` : ""}`;
}

function flatCatalogHtml(products, category) {
  const isAtK = categoryId(category) === "atk";
  const active = products.filter((item) => item.active !== false);
  const searchValue = isAtK ? state.atkSearch : state.directSearch[category] || "";
  const query = searchValue.trim().toLocaleLowerCase("id-ID");
  const visible = active.filter((item) => (!isAtK || state.atkGroup === "Semua" || (item.atkGroup || "Peralatan lainnya") === state.atkGroup)
    && (!query || `${item.name} ${item.sku} ${item.barcode || ""}`.toLocaleLowerCase("id-ID").includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true }));
  const tabs = isAtK ? ["Semua", ...atkGroups].map((group) => `<button type="button" class="atk-tab ${state.atkGroup === group ? "active" : ""}" data-atk-group="${escapeHtml(group)}" aria-pressed="${state.atkGroup === group}">${escapeHtml(group)}</button>`).join("") : "";
  const rows = visible.map((item) => {
    const line = (item.retailAtK || item.quickSale) && !item.hasMaterialVariants ? state.cart.find((entry) => entry.productId === item.id) : null;
    const control = line ? `<div class="atk-stepper" role="group" aria-label="Jumlah ${escapeHtml(item.name)}"><button type="button" data-flat-qty="-1" data-flat-product="${escapeHtml(item.id)}" aria-label="Kurangi ${escapeHtml(item.name)}">−</button><input type="text" inputmode="numeric" pattern="[0-9]*" data-flat-quantity="${escapeHtml(item.id)}" value="${line.quantity}" aria-label="Jumlah ${escapeHtml(item.name)}"><button type="button" data-flat-qty="1" data-flat-product="${escapeHtml(item.id)}" aria-label="Tambah ${escapeHtml(item.name)}">+</button></div>`
      : `<button type="button" class="atk-pick" data-flat-product="${escapeHtml(item.id)}"><b aria-hidden="true">+</b> Pilih</button>`;
    return `<div class="atk-row ${line ? "selected" : ""}"><button type="button" class="atk-name" data-flat-product="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button><span class="atk-price">${rupiah.format(promoPrice(item, item.price))}</span>${control}</div>`;
  }).join("");
  return `<label class="field atk-search"><span>Cari produk ${escapeHtml(category)}</span><input id="flat-search" type="search" value="${escapeHtml(searchValue)}" placeholder="${isAtK ? "Nama, merek, warna, ukuran, atau barcode…" : "Cari nama atau ukuran produk…"}" autocomplete="off"></label>
    ${isAtK ? `<div class="atk-tabs" role="group" aria-label="Jenis produk ATK">${tabs}</div>` : ""}
    <div class="atk-count">${visible.length} produk${query ? " ditemukan" : ""}</div>
    <div class="atk-list">${visible.length ? `<div class="atk-list-head"><span>Produk</span><span>Harga</span><span>Jumlah</span></div>${rows}` : '<p class="atk-empty">Produk tidak ditemukan. Coba kata lain atau pilih Semua.</p>'}</div>`;
}

function fileServicesHtml() {
  return `<div class="file-service-grid">${fileServices.map((service, index) => `<div class="file-service-option"><div class="chip file-service-chip"><input type="radio" name="file-service" id="file-${service.id}" value="${service.id}" ${index === 0 ? "checked" : ""}><label for="file-${service.id}"><strong>${service.name}</strong><small>${service.price ? rupiah.format(service.price) : "Tanpa biaya"}</small></label></div>${service.price ? `<div class="file-design-controls hidden" data-design-controls="${service.id}"><div class="file-design-actions"><button type="button" class="finish-note-toggle" data-design-note-toggle="${service.id}">Catatan</button><div class="qty-stepper"><button type="button" data-design-minus="${service.id}" aria-label="Kurangi jumlah ${service.name}">−</button><input data-design-qty="${service.id}" type="number" min="1" step="1" value="1" aria-label="Jumlah ${service.name}"><button type="button" data-design-plus="${service.id}" aria-label="Tambah jumlah ${service.name}">+</button></div></div><div class="finish-note-row hidden" data-design-note-row="${service.id}"><input data-design-note="${service.id}" maxlength="2000" placeholder="Catatan ${service.name}" aria-label="Catatan ${service.name}"></div></div>` : ""}</div>`).join("")}</div>`;
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
  if (product.dtfShirt) return dtfShirtConfigurationHtml(product);
  const isUnit = product.priceBasis === "unit";
  const hasMaterialChoice = product.hasMaterialVariants && product.materialVariants?.length && !product.templateProduct && !product.fixedSizeVariants?.length;
  const unitQuantity = `<div class="form-grid variant-quantity"><label class="field"><span>Jumlah ${escapeHtml(product.unitName || "unit")}</span><input id="quantity" type="number" min="1" step="1" value="1"></label></div>`;
  const areaQuantity = `<div class="form-grid variant-quantity"><label class="field"><span>Jumlah produk</span><span class="input-with-unit"><input id="quantity" type="number" min="1" step="1" value="1"><b>Lbr</b></span></label></div>`;
  const measurement = product.templateProduct ? templateOptionsHtml(product) : product.fixedSizeVariants?.length
    ? fixedSizeMeasurementHtml(product)
    : isUnit
    ? hasMaterialChoice ? "" : unitQuantity
    : `<div class="form-grid three"><div class="field full"><span>Lebar bahan</span><div class="chips" id="width-chips">${product.widths.map((width, index) => `<div class="chip"><input type="radio" name="width" id="w-${index}" value="${width}" ${index === 0 ? "checked" : ""}><label for="w-${index}">${width} meter</label></div>`).join("")}</div></div>
      <label class="field"><span>Panjang aktual</span><span class="input-with-unit"><input id="length" type="number" min="0.1" step="0.1" value="1"><b>m</b></span></label>${hasMaterialChoice ? "" : `<label class="field"><span>Jumlah produk</span><span class="input-with-unit"><input id="quantity" type="number" min="1" step="1" value="1"><b>Lbr</b></span></label>`}<div class="field"><span>Panjang ditagihkan</span><input id="billed-length" class="readonly-input" value="1 m" readonly aria-readonly="true"></div></div>`;
  const measurementTitle = product.templateProduct ? "Pilihan varian" : "Ukuran & jumlah";
  const fileSection = product.templateProduct || product.a3Kind === "ready" ? "" : `<hr class="divider"><p class="section-label">${popup ? "File" : "3 · File"}</p>${fileServicesHtml()}`;
  const finishStep = product.templateProduct || product.a3Kind === "ready" ? 3 : 4;
  const noteStep = finishStep + 1;
  return `<hr class="divider"><p class="section-label">${popup ? measurementTitle : `2 · ${measurementTitle}`}</p>${measurement}${materialVariantOptionsHtml(product)}${subVariantOptionsHtml(product)}${hasMaterialChoice ? isUnit ? unitQuantity : areaQuantity : ""}${choiceGroupsHtml(product)}
    <p class="product-note" id="product-note">${escapeHtml(product.note)}</p>
    ${fileSection}
    <hr class="divider"><p class="section-label">${popup ? "Finishing" : `${finishStep} · Finishing`}</p><div class="finishing-grid" id="finishing-grid">${finishingHtml(product)}</div>
    <hr class="divider"><label class="field"><span class="section-label">${popup ? "Catatan" : `${noteStep} · Catatan`}</span><textarea id="production-note" placeholder="Tambahkan catatan khusus untuk item ini…"></textarea></label>
    <div class="item-action-bar"><div class="price-preview"><div><span>Estimasi Harga</span><p id="formula-text">—</p></div><strong id="item-price">Rp0</strong></div><button id="add-item" class="primary">+ Tambah ke Pesanan</button></div>`;
}

function dtfShirtRowHtml(index) {
  const colors = ["Hitam", "Putih"];
  const sizes = ["S", "M", "L", "XL", "XXL"];
  return `<div class="dtf-shirt-row" data-shirt-row>
    <label class="field"><span>Warna</span><select data-shirt-color>${colors.map((color) => `<option value="${color}">${color}</option>`).join("")}</select></label>
    <label class="field"><span>Ukuran</span><select data-shirt-size>${sizes.map((size) => `<option value="${size}" ${size === "M" ? "selected" : ""}>${size}</option>`).join("")}</select></label>
    <label class="field"><span>Jumlah</span><input data-shirt-quantity type="number" min="1" step="1" value="1" inputmode="numeric"></label>
    <button type="button" class="secondary" data-remove-shirt aria-label="Hapus varian ${index + 1}" ${index ? "" : "disabled"}>×</button>
    <small class="dtf-stock-note" data-shirt-stock></small>
  </div>`;
}

function dtfShirtConfigurationHtml(product) {
  return `<hr class="divider"><p class="section-label">2 · Pilih paket sablon</p><div class="dtf-packages" role="group" aria-label="Paket sablon">${product.dtfPackages.map((pack, index) => `<label class="dtf-package"><input type="radio" name="dtf-package" value="${escapeHtml(pack.id)}" ${index === 0 ? "checked" : ""}><span><strong>${escapeHtml(pack.label)}</strong><small>${rupiah.format(pack.price)} / kaos</small></span></label>`).join("")}</div>
    <hr class="divider"><p class="section-label">3 · Warna, ukuran & jumlah kaos</p><div id="dtf-shirt-rows">${dtfShirtRowHtml(0)}</div><button id="add-shirt-row" type="button" class="secondary dtf-add-row">+ Tambah kombinasi warna/ukuran</button><p class="product-note">Ukuran XXL menambah Rp15.000 per kaos. Stok mengikuti kombinasi warna dan ukuran, bukan paket sablon.</p>
    <hr class="divider"><label class="field"><span class="section-label">4 · Catatan produksi</span><textarea id="production-note" placeholder="Posisi desain, ukuran cetak, atau catatan khusus…"></textarea></label>
    <div class="item-action-bar"><div class="price-preview"><div><span>Estimasi Harga</span><p id="formula-text">—</p></div><strong id="item-price">Rp0</strong></div><button id="add-item" class="primary" type="button">+ Tambah ke Pesanan</button></div>`;
}

function renderPos() {
  let visibleProducts = productsForCategory(state.selectedCategory);
  if (!visibleProducts.some((product) => product.id === state.selectedProduct)) state.selectedProduct = null;
  const product = selectedProduct();
  if (product?.a3Kind) state.a3Kind = product.a3Kind;
  const categoryTabs = productCategories().map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.selectedCategory === id}" class="category-tab ${state.selectedCategory === id ? "active" : ""}" data-category="${id}">${escapeHtml(label)}</button>`).join("");
  const intro = `<p class="section-label">1 · ${state.selectedCategory === "display-banner" ? "Pilih produk" : "Pilih bahan"}</p>`;
  const productContent = state.selectedCategory === "all" ? allCatalogHtml() : state.selectedCategory === "print-a3" && visibleProducts.some((item) => item.a3Kind)
    ? a3CatalogHtml(visibleProducts, product) : ["atk", "akrilik", "stempel"].includes(state.selectedCategory)
    ? flatCatalogHtml(visibleProducts, productCategories().find(([id]) => id === state.selectedCategory)?.[1] || "ATK") : visibleProducts.length
    ? `${intro}<div class="product-grid">${productCardsHtml(visibleProducts)}</div>${product ? productConfigurationHtml(product) : ""}`
    : `<div class="category-empty"><div>＋</div><strong>Belum ada produk</strong><p>Produk untuk kategori ${escapeHtml(productCategories().find(([id]) => id === state.selectedCategory)?.[1] || "ini")} akan ditambahkan kemudian.</p></div>`;
  root.innerHTML = `<div class="view-grid">
    <section class="panel"><div class="panel-head product-panel-head"><h2>${state.editingOrderId ? "Edit Draft Pesanan" : "Produk"}</h2><div class="product-search-wrap"><span>⌕</span><input id="product-search" type="search" placeholder="Cari produk…" autocomplete="off"><kbd>Ctrl K</kbd><div id="search-popover" class="search-popover hidden"></div></div></div><div class="panel-body">
      <div class="category-strip"><button class="category-scroll-button" type="button" data-category-scroll="-1" aria-label="Geser kategori ke kiri">‹</button><div class="category-tabs" role="tablist" aria-label="Kategori produk">${categoryTabs}</div><button class="category-scroll-button" type="button" data-category-scroll="1" aria-label="Geser kategori ke kanan">›</button>${canManageSettings() ? '<button class="category-settings-button" type="button" id="configure-category-tabs" aria-label="Atur urutan tab kategori" title="Atur urutan tab kategori"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m16 3 5 5L8 21H3v-5L16 3Z"/><path d="m13 6 5 5"/></svg></button>' : ""}</div><div class="category-content">${productContent}</div>
    </div></section>
    <aside><section class="panel sticky-summary"><div class="panel-head"><h2>Ringkasan Pesanan</h2><span>${state.cart.length} item</span></div><div class="panel-body"><div id="cart-list">${cartHtml()}</div>${checkoutHtml()}</div></section></aside>
  </div>`;
  bindPos();
  if (product && state.selectedCategory !== "all") updatePreview();
}

function cartHtml() {
  if (!state.cart.length) return '<div class="cart-empty">Belum ada produk.<br><small>Data pelanggan dapat diisi terlebih dahulu.</small></div>';
  return state.cart.map((line, i) => {
    const product = state.products.find((item) => item.id === line.productId);
    const detail = (product?.retailAtK || product?.quickSale) && !product?.hasMaterialVariants ? "" : product?.a3Kind === "ready"
      ? `${line.finishingNames ? `<p>${escapeHtml(line.finishingNames)}</p>` : ""}<p class="item-note">Catatan: ${escapeHtml(line.productionNote || "—")}</p>`
      : `<p>${line.templateDesign ? "" : escapeHtml(line.fileServiceName || "File Siap Cetak") + (line.fileServicePrice ? ` × ${line.fileServiceQuantity || 1}${line.fileServiceNote ? ` (${escapeHtml(line.fileServiceNote)})` : ""}` : "")}${line.finishingNames ? `${line.templateDesign ? "" : " · "}${escapeHtml(line.finishingNames)}` : line.templateDesign ? "Tanpa finishing tambahan" : " · Tanpa finishing tambahan"}</p><p class="item-note">Catatan: ${escapeHtml(line.productionNote || "—")}</p>`;
    return `<div class="cart-item"><div><h4>${escapeHtml(line.productName)}</h4><p>${escapeHtml(line.displaySize || `${line.width} m × ${line.billedLength} m · ${line.quantity}x`)}</p>${line.templateDesign ? `<div class="cart-price-parts"><span>Harga spanduk <b>${rupiah.format(line.baseTotal)}</b></span><span>Design Template ${escapeHtml(line.templateDesign)} <b>${rupiah.format(line.templateDesignTotal)}</b></span></div>` : ""}${detail}<strong>${rupiah.format(line.previewTotal)}</strong></div><button data-remove="${i}">Hapus</button></div>`;
  }).join("");
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
  if (product?.dtfShirt) {
    const pack = product.dtfPackages.find((item) => item.id === document.querySelector('input[name="dtf-package"]:checked')?.value) || product.dtfPackages[0];
    const shirtVariants = [...document.querySelectorAll("[data-shirt-row]")].map((row) => ({
      color: row.querySelector("[data-shirt-color]").value, size: row.querySelector("[data-shirt-size]").value,
      quantity: Number(row.querySelector("[data-shirt-quantity]").value)
    }));
    const quantity = shirtVariants.reduce((sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0), 0);
    const previewTotal = shirtVariants.reduce((sum, item) => sum + item.quantity * (pack.price + (item.size === "XXL" ? 15000 : 0)), 0);
    return { productId: product.id, productName: product.name, dtfPackageId: pack.id, shirtVariants,
      quantity, previewTotal, baseTotal: previewTotal, fileServiceId: "READY", fileServiceName: "File Siap Cetak", fileServicePrice: 0,
      displaySize: `${pack.label} · ${shirtVariants.map((item) => `${item.color} ${item.size} × ${item.quantity}`).join(", ")}`,
      productionNote: document.querySelector("#production-note")?.value.trim() || "" };
  }
  const sizeVariantId = document.querySelector('input[name="size-variant"]:checked')?.value || "";
  const fixedVariant = (product.fixedSizeVariants || []).find((item) => item.id === sizeVariantId) || null;
  const materialVariantId = document.querySelector('input[name="material-variant"]:checked')?.value || "";
  const materialVariant = (product.materialVariants || []).find((item) => item.id === materialVariantId) || null;
  const subVariantId = document.querySelector('[data-sub-options-for]:not(.hidden) input[name="sub-variant"]:checked')?.value || "";
  const subVariant = (product.subVariants || []).find((item) => item.id === subVariantId) || null;
  const combination = materialVariant?.combinations?.find((item) => item.subVariantId === subVariantId) || null;
  const isFixedSize = Boolean(fixedVariant);
  const isUnit = product.priceBasis === "unit" || isFixedSize;
  const templateSize = document.querySelector('input[name="template-size"]:checked')?.value?.split("x").map(Number);
  const width = isUnit ? 1 : product.templateProduct ? Number(templateSize?.[0]) : Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
  const length = isUnit ? 1 : product.templateProduct ? Number(templateSize?.[1]) : Number(document.querySelector("#length")?.value || 1);
  const quantity = Math.max(1, Number(document.querySelector("#quantity")?.value || 1));
  const base = productBase(product, width, length, quantity, fixedVariant, materialVariant, combination);
  const fileService = product.templateProduct ? fileServices[0] : fileServices.find((service) => service.id === document.querySelector('input[name="file-service"]:checked')?.value) || fileServices[0];
  const fileServiceQuantity = fileService.price ? Math.max(1, Math.floor(Number(document.querySelector(`[data-design-qty="${fileService.id}"]`)?.value || 1))) : 1;
  const fileServiceNote = fileService.price ? document.querySelector(`[data-design-note="${fileService.id}"]`)?.value.trim() || "" : "";
  const templateDesign = product.templateProduct ? document.querySelector('input[name="template-design"]:checked')?.value || "" : "";
  const templateDesignTotal = product.templateProduct ? Number(product.templateDesignPrice || 35000) : 0;
  let finishTotal = 0;
  document.querySelectorAll("[data-finishing-price]").forEach((label) => {
    const finish = product.finishing.find((item) => item.id === label.dataset.finishingPrice);
    if (finish) label.textContent = finish.price ? `${rupiah.format(finish.price)}${({ area: " /m²", point: " /titik" }[finish.rule] || " /unit")}` : "Gratis";
  });
  const finishing = [...document.querySelectorAll('#finishing-grid input[type="checkbox"]:checked')].map((input) => {
    const finish = product.finishing.find((f) => f.id === input.value);
    const areaUnits = isFixedSize ? Number(fixedVariant.area || 1) * quantity : product.priceBasis === "unit" ? Number(product.areaPerUnit || 1) * quantity : product.priceBasis === "sqm" ? width * base.billed * quantity : base.billed * quantity;
    const quantityInput = document.querySelector(`[data-finish-qty="${finish.id}"]`);
    const units = manualAreaFinishing(finish) ? Math.max(1, Number(quantityInput?.value || 1)) : finish.rule === "area" ? Number(areaUnits.toFixed(4)) : Math.max(1, Number(quantityInput?.value || 1));
    if (finish.rule === "area" && quantityInput) quantityInput.value = units;
    const unitPrice = finishingPriceForUnits(finish, units);
    finishTotal += Math.round(units * unitPrice);
    const priceLabel = [...document.querySelectorAll("[data-finishing-price]")].find((label) => label.dataset.finishingPrice === finish.id);
    if (priceLabel) priceLabel.textContent = `${rupiah.format(unitPrice)}${({ area: " /m²", point: " /titik" }[finish.rule] || " /unit")}${unitPrice !== Number(finish.price) ? " · Grosir" : ""}`;
    return { id: finish.id, units, note: document.querySelector(`[data-finish-note="${finish.id}"]`)?.value.trim() || "" };
  });
  const choices = (product.choiceGroups || []).map((group) => ({ groupId: group.id, optionId: document.querySelector(`input[name="choice-${group.id}"]:checked`)?.value || "" }));
  const choiceLabels = choices.map((choice) => product.choiceGroups.find((group) => group.id === choice.groupId)?.options.find((option) => option.id === choice.optionId)?.label).filter(Boolean);
  return {
    productId: product.id, productName: product.name, width, length, billedLength: base.billed, templateDesign,
    sizeVariantId: fixedVariant?.id || "", sizeVariantLabel: fixedVariant?.label || "", materialVariantId: materialVariant?.id || "", materialVariantLabel: materialVariant?.label || "", subVariantId: subVariant?.id || "", subVariantLabel: subVariant?.label || "", choices,
    baseTotal: base.total, templateDesignTotal,
    fileServiceId: fileService.id, fileServiceName: fileService.name, fileServicePrice: fileService.price, fileServiceQuantity, fileServiceNote,
    quantity, unitPrice: base.unitPrice, originalUnitPrice: base.originalUnitPrice, discountApplied: base.discountApplied, finishing,
    finishingNames: finishing.map((f) => {
      const finish = product.finishing.find((x) => x.id === f.id);
      return `${finish?.name} × ${f.units}${f.note ? ` (${f.note})` : ""}`;
    }).join(", "),
    displaySize: `${isFixedSize ? `${fixedVariant.label} · ${quantity} ${product.groupedProduct ? product.unitName || "unit" : "Lbr"}` : isUnit ? `${quantity} ${product.unitName || "unit"}` : `${width} × ${base.billed} m · ${quantity} Lbr${templateDesign ? ` · ${templateDesign}` : ""}`}${materialVariant ? ` · ${materialVariant.label}` : ""}${subVariant ? ` · ${subVariant.label}` : ""}${choiceLabels.length ? ` · ${choiceLabels.join(" · ")}` : ""}`,
    productionNote: document.querySelector("#production-note")?.value.trim() || "",
    previewTotal: base.total + finishTotal + fileService.price * fileServiceQuantity + templateDesignTotal
  };
}

function updatePreview() {
  const line = readCurrentLine();
  const product = selectedProduct();
  if (product?.dtfShirt) {
    document.querySelector("#item-price").textContent = rupiah.format(Number.isFinite(line.previewTotal) ? line.previewTotal : 0);
    document.querySelector("#formula-text").textContent = `${line.quantity} kaos · ${line.shirtVariants.filter((item) => item.size === "XXL").reduce((sum, item) => sum + item.quantity, 0)} XXL`;
    document.querySelectorAll("[data-shirt-row]").forEach((row) => {
      const stock = state.shirtStock.find((item) => item.color === row.querySelector("[data-shirt-color]").value && item.size === row.querySelector("[data-shirt-size]").value);
      row.querySelector("[data-shirt-stock]").textContent = `Tersedia ${stock?.available ?? 0} pcs`;
    });
    return;
  }
  const billedInput = document.querySelector("#billed-length");
  if (billedInput) billedInput.value = `${line.billedLength} m`;
  document.querySelector("#item-price").textContent = rupiah.format(line.previewTotal);
  document.querySelector("#formula-text").textContent = line.sizeVariantId
    ? `${line.sizeVariantLabel} × ${line.quantity} ${product.groupedProduct ? product.unitName || "unit" : "Lbr"} · ${rupiah.format(line.unitPrice)}/${product.groupedProduct ? product.unitName || "unit" : "lembar"}`
    : product.priceBasis === "unit"
    ? `${line.quantity} ${product.unitName || "unit"}${line.originalUnitPrice !== product.price ? ` · Grosir ${rupiah.format(line.originalUnitPrice)}` : ""}${line.discountApplied ? ` · Promo ${rupiah.format(line.unitPrice)}` : ""}`
    : `${line.width} m × ${line.billedLength} m × ${line.quantity}${line.templateDesign ? ` · ${line.templateDesign} + ${rupiah.format(line.templateDesignTotal)}` : ""}${line.fileServicePrice ? ` · ${line.fileServiceName} × ${line.fileServiceQuantity || 1}` : ""}${line.originalUnitPrice !== product.price ? ` · Grosir ${rupiah.format(line.originalUnitPrice)}` : ""}${line.discountApplied ? ` · Promo ${rupiah.format(line.unitPrice)}` : ""}`;
}

function syncFixedSizeUi() {
  const selected = document.querySelector('input[name="size-variant"]:checked')?.value || "";
  document.querySelector("[data-size-custom]")?.classList.toggle("hidden", selected !== "custom");
}

function syncMaterialVariantUi() {
  const id = document.querySelector('input[name="material-variant"]:checked')?.value;
  document.querySelectorAll("[data-sub-options-for]").forEach((group) => {
    const visible = group.dataset.subOptionsFor === id;
    group.classList.toggle("hidden", !visible);
    if (visible && !group.querySelector('input[name="sub-variant"]:checked')) group.querySelector('input[name="sub-variant"]')?.click();
    if (!visible) group.querySelectorAll('input[name="sub-variant"]').forEach((input) => { input.checked = false; });
  });
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
    const fixedVariantId = document.querySelector('input[name="size-variant"]:checked')?.value || "";
    const fixedVariant = (product.fixedSizeVariants || []).find((item) => item.id === fixedVariantId);
    const templateSize = document.querySelector('input[name="template-size"]:checked')?.value?.split("x").map(Number);
    const width = product.priceBasis === "unit" ? 1 : product.templateProduct ? Number(templateSize?.[0]) : Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
    const length = product.templateProduct ? Number(templateSize?.[1]) : billedLength(document.querySelector("#length")?.value || 1, product.billingIncrement);
    const quantity = Math.max(1, Number(document.querySelector("#quantity")?.value || 1));
    const suggested = finish.rule === "area"
      ? (fixedVariant ? Number(fixedVariant.area || 1) * quantity : product.priceBasis === "unit" ? Number(product.areaPerUnit || 1) * quantity : Number(width) * Number(length) * quantity)
      : finish.id === "fin-a3-card-rounded" ? 1 : suggestedFinishUnits(finish, width, length);
    document.querySelector(`[data-finish-qty="${finish.id}"]`).value = manualAreaFinishing(finish) ? Math.max(1, Number(suggested.toFixed?.(4) ?? suggested)) : Number(suggested.toFixed?.(4) ?? suggested);
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
  if (selectedProduct()?.dtfShirt) {
    const rows = document.querySelector("#dtf-shirt-rows");
    rows.addEventListener("input", updatePreview);
    rows.addEventListener("change", updatePreview);
    document.querySelectorAll('input[name="dtf-package"]').forEach((input) => input.addEventListener("change", updatePreview));
    document.querySelector("#add-shirt-row").onclick = () => {
      if (rows.querySelectorAll("[data-shirt-row]").length >= 10) return toast("Maksimal 10 kombinasi kaos", "error");
      rows.insertAdjacentHTML("beforeend", dtfShirtRowHtml(rows.querySelectorAll("[data-shirt-row]").length));
      rows.querySelector("[data-shirt-row] button:disabled")?.removeAttribute("disabled");
      updatePreview();
    };
    rows.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-shirt]");
      if (!button) return;
      button.closest("[data-shirt-row]").remove();
      if (rows.querySelectorAll("[data-shirt-row]").length === 1) rows.querySelector("[data-remove-shirt]").disabled = true;
      updatePreview();
    });
    document.querySelector("#add-item").onclick = () => {
      const line = readCurrentLine();
      const combinations = line.shirtVariants.map((item) => `${item.color}-${item.size}`);
      if (line.shirtVariants.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1)) return toast("Jumlah setiap varian harus bilangan bulat positif", "error");
      if (new Set(combinations).size !== combinations.length) return toast("Gabungkan jumlah kaos dengan warna dan ukuran yang sama", "error");
      onAdd(line);
    };
    return;
  }
  document.querySelectorAll('#length,#quantity,input[name="width"],input[name="size-variant"],input[name="material-variant"],input[name="sub-variant"],input[name^="choice-"],input[name="template-size"],input[name="template-design"],input[name="file-service"],[data-finish-qty]').forEach((input) => {
    input.addEventListener("input", updatePreview); input.addEventListener("change", updatePreview);
  });
  document.querySelectorAll('#finishing-grid input[type="checkbox"]').forEach((input) => input.addEventListener("change", () => toggleFinishing(input)));
  document.querySelectorAll('input[name="size-variant"]').forEach((input) => input.addEventListener("change", syncFixedSizeUi));
  document.querySelectorAll('input[name="material-variant"]').forEach((input) => input.addEventListener("change", syncMaterialVariantUi));
  syncFixedSizeUi();
  syncMaterialVariantUi();
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
  const syncDesignControls = () => {
    const selected = document.querySelector('input[name="file-service"]:checked')?.value;
    if (!selected) return;
    document.querySelectorAll("[data-design-controls]").forEach((control) => control.classList.toggle("hidden", control.dataset.designControls !== selected));
    updatePreview();
  };
  document.querySelectorAll('input[name="file-service"]').forEach((input) => input.addEventListener("change", syncDesignControls));
  document.querySelectorAll("[data-design-qty]").forEach((input) => {
    input.addEventListener("input", updatePreview);
    input.addEventListener("change", () => { input.value = Math.max(1, Math.floor(Number(input.value) || 1)); updatePreview(); });
  });
  document.querySelectorAll("[data-design-minus],[data-design-plus]").forEach((button) => button.onclick = () => {
    const id = button.dataset.designMinus || button.dataset.designPlus;
    const input = document.querySelector(`[data-design-qty="${id}"]`);
    input.value = Math.max(1, Math.floor(Number(input.value) || 1) + (button.dataset.designPlus ? 1 : -1));
    updatePreview();
  });
  document.querySelectorAll("[data-design-note-toggle]").forEach((button) => button.onclick = () => {
    const row = document.querySelector(`[data-design-note-row="${button.dataset.designNoteToggle}"]`);
    row.classList.toggle("hidden"); if (!row.classList.contains("hidden")) row.querySelector("input").focus();
  });
  syncDesignControls();
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
  const tabs = document.querySelector(".category-tabs");
  tabs.scrollLeft = state.categoryScroll;
  tabs.addEventListener("scroll", () => { state.categoryScroll = tabs.scrollLeft; });
  document.querySelectorAll("[data-category-scroll]").forEach((button) => button.onclick = () => tabs.scrollBy({ left: Number(button.dataset.categoryScroll) * Math.max(180, tabs.clientWidth * .7), behavior: "smooth" }));
  document.querySelector("#configure-category-tabs")?.addEventListener("click", openCategoryOrderForm);
  const setFlatQuantity = (productId, change, absolute = false) => {
    const product = state.products.find((item) => item.id === productId && categoryKey(item) === state.selectedCategory && item.active !== false);
    if (!product) return;
    if (product.hasMaterialVariants || (!product.retailAtK && !product.quickSale)) return openProductConfigurator(productId);
    const existing = state.cart.findIndex((line) => line.productId === productId);
    const quantity = absolute ? change : Math.max(0, (existing >= 0 ? Number(state.cart[existing].quantity) : 0) + change);
    if (!Number.isSafeInteger(quantity) || quantity < 0) return toast("Jumlah harus bilangan bulat nol atau lebih", "error");
    syncDraft(document.querySelector("#checkout"));
    if (existing >= 0) state.cart.splice(existing, 1);
    if (quantity) {
      const base = productBase(product, 1, 1, quantity);
      const line = { productId, productName: product.name, quantity, displaySize: `${quantity} ${product.unitName || "pcs"}`,
        baseTotal: base.total, previewTotal: base.total, unitPrice: base.unitPrice, originalUnitPrice: base.originalUnitPrice,
        fileServiceId: "READY", fileServiceName: "File Siap Cetak", fileServicePrice: 0, finishing: [], productionNote: "" };
      state.cart.push(line);
    }
    renderPos();
    if (state.atkSearch || state.directSearch[product.category]) document.querySelector("#flat-search")?.focus();
  };
  document.querySelectorAll("[data-atk-group]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout")); state.atkGroup = button.dataset.atkGroup; renderPos();
  }));
  document.querySelector("#flat-search")?.addEventListener("input", (event) => {
    const caret = event.target.selectionStart;
    syncDraft(document.querySelector("#checkout"));
    if (state.selectedCategory === "atk") state.atkSearch = event.target.value;
    else state.directSearch[productCategories().find(([id]) => id === state.selectedCategory)?.[1]] = event.target.value;
    renderPos();
    const input = document.querySelector("#flat-search");
    input.focus(); input.setSelectionRange(caret, caret);
  });
  document.querySelector("#flat-search")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || state.selectedCategory !== "atk") return;
    event.preventDefault();
    const barcode = event.currentTarget.value.trim();
    const match = state.products.find((item) => categoryKey(item) === "atk" && item.active !== false && item.barcode && item.barcode === barcode);
    if (match) { state.atkGroup = match.atkGroup || "Peralatan lainnya"; state.atkSearch = ""; setFlatQuantity(match.id, 1); }
  });
  document.querySelectorAll("[data-flat-qty]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const input = button.parentElement.querySelector("[data-flat-quantity]");
      if (!/^\d+$/.test(input.value.trim()) || !Number.isSafeInteger(Number(input.value))) return toast("Jumlah harus bilangan bulat nol atau lebih", "error");
      setFlatQuantity(button.dataset.flatProduct, Math.max(0, Number(input.value) + Number(button.dataset.flatQty)), true);
    });
  });
  document.querySelectorAll("[data-flat-quantity]").forEach((input) => {
    input.addEventListener("focus", () => input.select());
    input.addEventListener("change", () => {
      if (!/^\d+$/.test(input.value.trim()) || !Number.isSafeInteger(Number(input.value))) {
        input.value = state.cart.find((line) => line.productId === input.dataset.flatQuantity)?.quantity || 1;
        return toast("Jumlah harus bilangan bulat nol atau lebih", "error");
      }
      setFlatQuantity(input.dataset.flatQuantity, Number(input.value), true);
    });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); input.blur(); } });
  });
  document.querySelectorAll(".atk-pick,.atk-name").forEach((button) => button.addEventListener("click", () => setFlatQuantity(button.dataset.flatProduct, state.cart.some((line) => line.productId === button.dataset.flatProduct) ? 0 : 1)));
  const selectA3Family = (family) => {
    const candidates = state.products.filter((item) => item.active !== false && item.a3Kind === state.a3Kind && item.a3Family === family);
    state.selectedProduct = (candidates.find((item) => item.a3PrintMode === "BW" && item.a3Side === "1S")
      || candidates.find((item) => item.a3Side === "1S") || candidates[0])?.id || null;
    renderPos();
  };
  document.querySelectorAll("[data-a3-kind]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout"));
    state.a3Kind = button.dataset.a3Kind;
    state.selectedProduct = null;
    renderPos();
  }));
  document.querySelectorAll("[data-a3-family]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout"));
    selectA3Family(button.dataset.a3Family);
  }));
  document.querySelector("#a3-product-select")?.addEventListener("change", (event) => {
    syncDraft(document.querySelector("#checkout"));
    const value = event.target.value;
    if (value.startsWith("family:")) return selectA3Family(value.slice(7));
    state.selectedProduct = value.startsWith("product:") ? value.slice(8) : null;
    renderPos();
  });
  document.querySelectorAll("[data-a3-variant]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout"));
    const current = selectedProduct();
    const options = state.products.filter((item) => item.a3Kind === "paper" && item.a3Family === current?.a3Family && item.a3Variant === button.dataset.a3Variant && item.active !== false);
    state.selectedProduct = (options.find((item) => item.a3PrintMode === current.a3PrintMode && item.a3Side === current.a3Side)
      || options.find((item) => item.a3PrintMode === current.a3PrintMode && item.a3Side === "1S"))?.id || null;
    renderPos();
  }));
  document.querySelectorAll("[data-a3-print-mode]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout"));
    const current = selectedProduct();
    state.selectedProduct = state.products.find((item) => item.active !== false && item.a3Kind === "paper" && item.a3Family === "HVS"
      && item.a3PrintMode === button.dataset.a3PrintMode && item.a3Side === current.a3Side)?.id || null;
    renderPos();
  }));
  document.querySelectorAll("[data-a3-side]").forEach((button) => button.addEventListener("click", () => {
    syncDraft(document.querySelector("#checkout"));
    const current = selectedProduct();
    state.selectedProduct = state.products.find((item) => item.a3Family === current?.a3Family && item.a3Variant === current?.a3Variant
      && item.a3PrintMode === current?.a3PrintMode && item.a3Side === button.dataset.a3Side && item.active !== false)?.id || current?.id;
    renderPos();
  }));
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
  if (!can("projects.waiting") && state.projectCategory === "waiting") state.projectCategory = "orders";
  const orderStatuses = ["DESAIN", "CETAK", "FINISHING", "SELESAI"];
  const waitingStatuses = ["MENUNGGU_PEMBAYARAN"];
  const statuses = state.projectCategory === "waiting" ? waitingStatuses : orderStatuses;
  const orderCount = state.orders.filter((order) => orderStatuses.includes(order.status)).length;
  const waitingCount = state.orders.filter((order) => waitingStatuses.includes(order.status)).length;
  root.innerHTML = `<div class="project-category-tabs"><button type="button" data-project-category="orders" class="${state.projectCategory === "orders" ? "active" : ""}">Order <b>${orderCount}</b></button>${can("projects.waiting") ? `<button type="button" data-project-category="waiting" class="${state.projectCategory === "waiting" ? "active" : ""}">Menunggu Pembayaran <b>${waitingCount}</b></button>` : ""}</div>
    <section class="panel project-panel"><div class="project-toolbar">
      ${state.projectCategory === "orders" ? `<div class="project-view-toggle"><button type="button" data-project-view="list" class="${state.projectView === "list" ? "active" : ""}">☷ List</button><button type="button" data-project-view="kanban" class="${state.projectView === "kanban" ? "active" : ""}">▥ Kanban</button></div>` : ""}
      <input id="project-search" class="search" value="${escapeHtml(state.projectSearch)}" placeholder="Cari kode, pelanggan, atau produk…">
      <select id="project-deadline" class="project-filter"><option value="all">Semua deadline</option><option value="today">Hari ini</option><option value="late">Terlambat</option><option value="none">Tanpa deadline</option></select>
      ${state.projectCategory === "orders" && can("projects.assign") ? `<select id="project-pic" class="project-filter"><option value="all">Semua PIC</option><option value="unassigned">Belum ada PIC</option>${[...new Set([...activePics().map((pic) => pic.name), ...state.orders.map((order) => order.designPic).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "id")).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select>` : ""}
      <button id="reload-projects" class="secondary">Muat ulang</button>
    </div>${state.projectCategory === "orders" ? `<div class="project-status-filter-section"><div class="project-status-filter-label" id="project-status-filter-label">Filter status</div><div class="project-status-filters" role="group" aria-labelledby="project-status-filter-label"><button type="button" aria-pressed="${state.projectStatus === "all"}" data-project-status="all" class="${state.projectStatus === "all" ? "active" : ""}">Semua <b>${orderCount}</b></button>${statuses.map((status) => `<button type="button" aria-pressed="${state.projectStatus === status}" data-project-status="${status}" class="${state.projectStatus === status ? "active" : ""}">${state.statusLabels[status]} <b>${state.orders.filter((order) => order.status === status).length}</b></button>`).join("")}</div></div>` : ""}<div id="project-content"></div></section>`;
  document.querySelector("#project-deadline").value = state.projectDeadline;
  if (document.querySelector("#project-pic")) document.querySelector("#project-pic").value = state.projectPic;
  const refresh = () => renderProjectContent(statuses);
  document.querySelectorAll("[data-project-category]").forEach((button) => button.onclick = () => { state.projectCategory = button.dataset.projectCategory; state.projectStatus = "all"; renderProjects(); });
  document.querySelectorAll("[data-project-view]").forEach((button) => button.onclick = () => { state.projectView = button.dataset.projectView; renderProjects(); });
  document.querySelectorAll("[data-project-status]").forEach((button) => button.onclick = () => { state.projectStatus = button.dataset.projectStatus; renderProjects(); });
  document.querySelector("#project-search").addEventListener("input", (event) => { state.projectSearch = event.target.value; refresh(); });
  document.querySelector("#project-deadline").onchange = (event) => { state.projectDeadline = event.target.value; refresh(); };
  if (document.querySelector("#project-pic")) document.querySelector("#project-pic").onchange = (event) => { state.projectPic = event.target.value; refresh(); };
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

function formatProjectDeadline(order) {
  if (!order.deadline) return "-";
  const deadline = new Date(order.deadline);
  if (Number.isNaN(deadline.getTime())) return "-";
  const today = new Date(`${witaDateKey()}T00:00:00Z`);
  const target = new Date(`${witaDateKey(deadline)}T00:00:00Z`);
  const dayOffset = Math.round((target - today) / 86400000);
  const time = projectTimeFormat.format(deadline);
  if (dayOffset === 0) return `Hari ini, ${time}`;
  if (dayOffset === 1) return `Besok, ${time}`;
  return `${projectDateFormat.format(deadline)}, ${time}`;
}

function filteredProjectOrders() {
  const query = state.projectSearch.trim().toLowerCase();
  const categoryStatuses = state.projectCategory === "waiting" ? ["MENUNGGU_PEMBAYARAN"] : ["DESAIN", "CETAK", "FINISHING", "SELESAI"];
  return state.orders.filter((order) => {
    if (!categoryStatuses.includes(order.status)) return false;
    const searchText = `${order.code} ${order.customerName} ${order.phone || ""} ${(order.items || []).map((item) => item.productName).join(" ")}`.toLowerCase();
    if (query && !searchText.includes(query)) return false;
    if (state.projectStatus !== "all" && order.status !== state.projectStatus) return false;
    if (state.projectDeadline === "today" && !isProjectDeadlineToday(order)) return false;
    if (!["all", "today"].includes(state.projectDeadline) && projectDeadlineState(order) !== state.projectDeadline) return false;
    if (state.projectCategory === "orders" && state.projectPic === "unassigned" && order.designPic) return false;
    if (state.projectCategory === "orders" && !["all", "unassigned"].includes(state.projectPic) && order.designPic !== state.projectPic) return false;
    return true;
  });
}

function renderProjectContent(statuses) {
  const content = document.querySelector("#project-content");
  if (!content) return;
  const orders = filteredProjectOrders();
  content.innerHTML = state.projectCategory === "orders" && state.projectView === "kanban"
    ? `<div class="kanban-wrap"><div class="kanban">${statuses.map((status) => projectColumn(status, orders)).join("")}</div></div>`
    : projectListHtml(statuses, orders);
  content.querySelectorAll("[data-order]").forEach((button) => button.onclick = () => openOrder(button.dataset.order));
  content.querySelectorAll("[data-project-row-order]").forEach((row) => {
    const openRow = (event) => {
      if (event.target.closest("button, select, input, a")) return;
      openOrder(row.dataset.projectRowOrder);
    };
    row.addEventListener("click", openRow);
    row.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key) && !event.target.closest("button, select, input, a")) {
        event.preventDefault(); openOrder(row.dataset.projectRowOrder);
      }
    });
  });
  content.querySelectorAll("[data-project-pic-order]").forEach((select) => select.addEventListener("change", async () => {
    const order = state.orders.find((item) => item.id === select.dataset.projectPicOrder);
    const previousPic = order?.designPic || "";
    select.disabled = true;
    try {
      const designPic = select.value;
      await api(`/api/orders/${select.dataset.projectPicOrder}/design-pic`, { method: "PATCH", body: JSON.stringify({ designPic }) });
      if (order) order.designPic = designPic;
      select.classList.remove("unassigned");
      toast(`PIC diubah menjadi ${designPic}`);
    } catch (error) {
      select.value = previousPic;
      toast(error.message, "error");
    } finally { select.disabled = false; }
  }));
  content.querySelectorAll("[data-project-group]").forEach((button) => button.onclick = () => {
    const status = button.dataset.projectGroup;
    if (state.projectCollapsed.has(status)) state.projectCollapsed.delete(status); else state.projectCollapsed.add(status);
    renderProjectContent(statuses);
  });
}

function projectListHtml(statuses, orders) {
  if (!orders.length) return '<div class="project-empty">Tidak ada pesanan yang sesuai dengan filter.</div>';
  const waiting = state.projectCategory === "waiting";
  const columnCount = waiting ? 4 : 5;
  return `<div class="project-table-wrap"><table class="project-table ${waiting ? "waiting-table" : ""}"><thead><tr><th>Order</th><th>Produk</th><th>Deadline</th>${waiting ? "" : "<th>PIC</th>"}<th></th></tr></thead><tbody>${statuses.map((status) => {
    const grouped = orders.filter((order) => order.status === status);
    if (!grouped.length) return "";
    const collapsed = state.projectCollapsed.has(status);
    const deadlineSummary = grouped.filter((order) => projectDeadlineState(order) === "late").length;
    const groupLabel = status === "MENUNGGU_PEMBAYARAN" ? "Menunggu Pembayaran & Draft" : state.statusLabels[status];
    return `<tr class="project-group-row status-${status.toLowerCase()}"><td colspan="${columnCount}"><button type="button" data-project-group="${status}" aria-expanded="${!collapsed}" aria-label="${collapsed ? "Buka" : "Tutup"} kelompok ${escapeHtml(groupLabel)}"><span aria-hidden="true">${collapsed ? "›" : "⌄"}</span><strong>${groupLabel}</strong><em>${grouped.length} pesanan</em>${deadlineSummary ? `<b class="project-overdue-summary"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18.5a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>${deadlineSummary} terlambat</b>` : ""}</button></td></tr>${collapsed ? "" : grouped.map(projectListRow).join("")}`;
  }).join("")}</tbody></table></div><div class="project-list-footer"><span>Menampilkan ${orders.length} pesanan pada tab ini</span><span>List diperbarui otomatis dari alur produksi</span></div>`;
}

function projectListRow(order) {
  const deadlineState = projectDeadlineState(order);
  const products = (order.items || []).map((item) => item.productName);
  const firstProduct = products[0] || "—";
  const extraProducts = products.length > 1 ? `<b class="project-extra-items">+${products.length - 1} item lainnya</b>` : "";
  const waiting = state.projectCategory === "waiting";
  const picOptions = picSelectOptions(order);
  return `<tr class="project-order-row" data-project-row-order="${order.id}" tabindex="0" aria-label="Buka detail pesanan ${escapeHtml(order.customerName)}"><td class="project-order-identity"><strong>${escapeHtml(order.customerName)}</strong><small><b class="project-phone">${escapeHtml(order.phone || "Walk-in")}</b> - ${escapeHtml(order.code)}</small></td><td><strong>${escapeHtml(firstProduct)}</strong><small>${escapeHtml(order.items?.[0]?.displaySize || "")}${extraProducts}</small></td><td class="project-deadline ${deadlineState}">${formatProjectDeadline(order)}</td>${waiting ? "" : `<td>${can("projects.assign") ? `<select class="project-pic-select ${order.designPic ? "" : "unassigned"}" data-project-pic-order="${order.id}" aria-label="Pilih PIC untuk ${escapeHtml(order.customerName)}"><option value="" disabled ${order.designPic ? "" : "selected"}>-</option>${picOptions}</select>` : `<span class="project-pic-static">${escapeHtml(order.designPic || "-")}</span>`}</td>`}<td><button type="button" class="project-detail-button" data-order="${order.id}">Detail</button></td></tr>`;
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
    return `<article class="order-card" data-order="${order.id}"><div class="order-card-head"><span class="order-code">${order.code}</span>${cardBadge}</div><h4>${escapeHtml(order.customerName)}</h4><p>${order.items.map((i) => i.productName).join(", ")}</p>${status !== "MENUNGGU_PEMBAYARAN" && !hidePrice ? `<p class="pic-label">${order.designPic ? "PIC: " + escapeHtml(order.designPic) : "Belum ada PIC"}</p>` : ""}${hidePrice || !can("projects.money") ? "" : `<p style="margin-top:7px"><strong>${rupiah.format(order.total)}</strong></p>`}</article>`;
  }).join("") || '<div class="cart-empty" style="padding:28px 5px">Kosong</div>'}</section>`;
}

function nextAction(order) {
  return { DESAIN: "File Siap Cetak", CETAK: "Cetak Selesai", FINISHING: "Finishing Selesai", SELESAI: "Pesanan Diambil" }[order.status];
}

function itemDetail(item) {
  const finishing = (item.finishing || []).map((finish) => `${escapeHtml(finish.name)} × ${finish.units}${finish.note ? ` — ${escapeHtml(finish.note)}` : ""}`).join(", ");
  const templateParts = item.templateDesign ? (can("projects.money") ? `<small>Harga spanduk: ${rupiah.format(item.baseTotal)}</small><small>Design Template ${escapeHtml(item.templateDesign)}: ${rupiah.format(item.templateDesignTotal || 35000)}</small>` : `<small>Template: ${escapeHtml(item.templateDesign)}</small>`) : "";
  return `<strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.displaySize || `${item.width} × ${item.billedLength} m · ${item.quantity}x`)}</small>${templateParts}${item.templateDesign ? "" : `<small>File: ${escapeHtml(item.fileService?.name || "File Siap Cetak") + (item.fileService?.id && item.fileService.id !== "READY" ? ` × ${item.fileService.quantity || 1}${item.fileService.note ? ` (${escapeHtml(item.fileService.note)})` : ""}` : "")}</small>`}${finishing ? `<small>Finishing: ${finishing}</small>` : ""}<small>Catatan: ${escapeHtml(item.productionNote || "—")}</small>`;
}

function openOrder(id, showPayment = false) {
  const order = state.orders.find((item) => item.id === id);
  const showMoney = can("projects.money");
  const isDesign = order.status === "DESAIN";
  const isWaiting = order.status === "MENUNGGU_PEMBAYARAN";
  const outstanding = showMoney ? Math.max(0, order.total - Number(order.paidAmount || 0)) : 0;
  const detail = document.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head"><div><span class="order-code">${order.code}</span><h2 style="margin:5px 0 0">${escapeHtml(order.customerName)}</h2></div><button class="detail-close">×</button></div><div class="detail-body">
    <div class="detail-meta ${isDesign ? "design-meta" : ""}"><div class="meta-card"><span>Status</span><strong>${state.statusLabels[order.status]}</strong></div>${showMoney && !isDesign ? `<div class="meta-card"><span>Pembayaran</span><strong>${paymentStatus(order).replaceAll("_", " ")}</strong></div>` : ""}${isWaiting ? "" : `<div class="meta-card"><span>PIC Design</span><strong>${escapeHtml(order.designPic || "Belum diambil")}</strong></div>`}</div>
    <div class="order-items-detail">${order.items.map((item, index) => `<div class="detail-item"><span class="item-number">${index + 1}</span><div>${itemDetail(item)}</div>${showMoney && !isDesign ? `<strong class="item-price">${rupiah.format(item.subtotal)}</strong>` : ""}</div>`).join("")}</div>
    ${showMoney && !isDesign ? `<div class="detail-total"><span>Total Pesanan</span><strong>${rupiah.format(order.total)}</strong></div>` : ""}
    <p class="note" style="margin-top:12px"><strong>Deadline:</strong> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "Tidak ditentukan"}</p>
    ${isDesign && can("projects.assign") ? `<div class="operator-box"><div class="field"><span>Nama Operator Design</span><div class="operator-choices">${activePics().map((pic) => `<div class="chip"><input type="radio" name="design-pic" id="operator-${escapeHtml(pic.id)}" value="${escapeHtml(pic.name)}" ${order.designPic === pic.name ? "checked" : ""}><label for="operator-${escapeHtml(pic.id)}">${escapeHtml(pic.name)}</label></div>`).join("") || '<p class="product-note">Belum ada PIC aktif. Tambahkan melalui Master Data → PIC.</p>'}</div></div><button id="save-design-pic" class="secondary">Simpan PIC</button></div>` : ""}
    ${can("pos.payment") ? `<div id="payment-form-wrap" class="payment-form-wrap hidden">${paymentFormHtml(order, outstanding)}</div>` : ""}
    <p class="section-label" style="margin-top:18px">Riwayat pekerjaan</p><div class="timeline">${(order.timeline || []).map((item) => `<div class="timeline-item"><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.actor)} · ${dateFormat.format(new Date(item.createdAt))}</small></div>`).join("")}</div>
    <div class="detail-actions">
      ${isWaiting && can("pos.edit") ? '<button id="edit-order" class="secondary">Edit Pesanan</button>' : ""}${isWaiting && can("pos.payment") ? '<button id="show-payment-form" class="primary">Konfirmasi Pembayaran</button>' : ""}
      ${!isWaiting && can("pos.payment") && paymentStatus(order) !== "LUNAS" ? '<button id="show-payment-form" class="secondary">Catat Pembayaran</button>' : ""}
      ${can("projects.status") && nextAction(order) ? `<button id="advance-order" class="primary">${nextAction(order)}</button>` : ""}
      ${!isWaiting ? '<button id="print-spk" class="secondary">Cetak SPK</button>' : ""}
      ${showMoney && ["SELESAI", "DIAMBIL"].includes(order.status) ? '<button id="print-receipt" class="secondary">Print Tanda Terima</button>' : ""}
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
    <div class="field full"><span>Jenis pembayaran</span><div class="payment-tabs"><label><input type="radio" name="type" value="PAYMENT" checked><span>Pembayaran</span></label><label><input type="radio" name="type" value="PO"><span>Pembayaran PO</span></label></div></div>
    <div id="payment-fields" class="payment-tab-panel full"><label class="field"><span>Metode</span><select name="method"><option value="">Pilih metode</option><option value="TUNAI">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option></select></label>
    <label class="field"><span>Nominal diterima</span><div class="payment-amount-field">${moneyField("amount", outstanding, "required")}<button type="button" id="payment-half" class="payment-half">50%</button></div></label></div>
    <div id="po-fields" class="payment-tab-panel full hidden"><label class="field"><span>Nomor PO *</span><input name="poNumber" placeholder="Contoh: PO/0924/001"></label><label class="field"><span>Upload PO <small>(opsional)</small></span><input name="poFile" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="po-preview" class="po-preview hidden"></div></div>
  </div><div class="payment-balance"><span>Sudah dibayar: ${rupiah.format(order.paidAmount || 0)}</span><strong>Sisa: ${rupiah.format(outstanding)}</strong></div><button class="primary full" type="submit">Simpan Pembayaran</button></form>`;
}

function bindPaymentForm(order, outstanding) {
  const form = document.querySelector("#payment-form");
  if (!form) return;
  const halfButton = form.querySelector("#payment-half");
  form.elements.method.required = true;
  const applyHalfPayment = () => {
    form.elements.amount.value = formatMoneyValue(Math.min(outstanding, Math.round(Number(order.total || 0) * 0.5)));
  };
  bindMoneyInputs(form);
  form.querySelectorAll('input[name="type"]').forEach((input) => input.addEventListener("change", () => {
    if (!input.checked) return;
    const po = input.value === "PO";
    form.querySelector("#payment-fields").classList.toggle("hidden", po);
    form.querySelector("#po-fields").classList.toggle("hidden", !po);
    form.elements.method.required = !po; form.elements.amount.required = !po; form.elements.poNumber.required = po;
  }));
  halfButton.addEventListener("click", applyHalfPayment);
  form.elements.poFile.addEventListener("change", () => { const file = form.elements.poFile.files[0]; const preview = form.querySelector("#po-preview"); if (!file) return preview.classList.add("hidden"); const url = URL.createObjectURL(file); preview.innerHTML = `<img src="${url}" alt="Preview PO"><span>${escapeHtml(file.name)}</span>`; preview.classList.remove("hidden"); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const values = Object.fromEntries(new FormData(form)); values.amount = values.type === "PO" ? 0 : parseMoney(values.amount); delete values.poFile;
      const file = form.elements.poFile.files[0];
      if (values.type === "PO" && file) values.poAttachment = await readPoAttachment(file);
      await api(`/api/orders/${order.id}/payments`, { method: "POST", body: JSON.stringify(values) });
      dialog.close(); await load(); toast("Pembayaran berhasil dicatat");
    } catch (error) { toast(error.message, "error"); }
  });
}

function readPoAttachment(file) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return Promise.reject(new Error("File PO harus berupa gambar JPG, PNG, atau WebP"));
  if (file.size > 2_500_000) return Promise.reject(new Error("Ukuran gambar PO maksimal 2,5 MB"));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Gambar PO tidak dapat dibaca")); reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result }); reader.readAsDataURL(file); });
}

function startEditOrder(order) {
  state.cart = order.items.map((item) => ({
    productId: item.productId, productName: item.productName, width: item.width,
    dtfPackageId: item.dtfPackageId || "", shirtVariants: (item.shirtVariants || []).map((variant) => ({ ...variant })),
    length: item.actualLength, billedLength: item.billedLength, quantity: item.quantity,
    sizeVariantId: item.sizeVariantId || "", sizeVariantLabel: item.sizeVariantLabel || "",
    materialVariantId: item.materialVariantId || "", materialVariantLabel: item.materialVariantLabel || "",
    subVariantId: item.subVariantId || "", subVariantLabel: item.subVariantLabel || "",
    choices: (item.choices || []).map((choice) => ({ groupId: choice.groupId, optionId: choice.optionId })),
    finishing: (item.finishing || []).map((finish) => ({ id: finish.id, units: finish.units, note: finish.note || "" })),
    finishingNames: (item.finishing || []).map((finish) => `${finish.name} × ${finish.units}${finish.note ? ` (${finish.note})` : ""}`).join(", "),
    displaySize: item.displaySize, templateDesign: item.templateDesign || "", fileServiceId: item.fileService?.id || "READY",
    fileServiceName: item.fileService?.name || "File Siap Cetak", fileServicePrice: item.fileService?.price || 0, fileServiceQuantity: item.fileService?.quantity || 1, fileServiceNote: item.fileService?.note || "",
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
    ${order.items.map((item, index) => `<div class="print-item"><b>${index + 1}. ${escapeHtml(item.productName)}</b><br>${escapeHtml(item.displaySize || `${item.width} × ${item.billedLength} m · ${item.quantity}x`)}${item.templateDesign ? `<br>${isSpk ? "Spanduk" : `Harga spanduk: ${rupiah.format(item.baseTotal)}`}<br>${isSpk ? "Design Template" : "Design Template " + escapeHtml(item.templateDesign) + ": " + rupiah.format(item.templateDesignTotal || 35000)}` : `<br>File: ${escapeHtml(item.fileService?.name || "File Siap Cetak") + (item.fileService?.id && item.fileService.id !== "READY" ? ` × ${item.fileService.quantity || 1}${item.fileService.note ? ` (${escapeHtml(item.fileService.note)})` : ""}` : "")}`}${(item.finishing || []).length ? `<br>Finishing: ${item.finishing.map((f) => `${escapeHtml(f.name)} × ${f.units}${f.note ? ` (${escapeHtml(f.note)})` : ""}`).join(", ")}` : ""}<br><b>Catatan:</b> ${escapeHtml(item.productionNote || "—")}${isSpk ? "" : `<br><span class="print-price">${rupiah.format(item.subtotal)}</span>`}</div>`).join("<hr>")}
    ${isSpk ? '<hr><div class="spk-checks">□ File dicek &nbsp; □ Cetak<br>□ Finishing &nbsp; □ QC</div>' : `<hr><div class="print-total"><span>Total</span><b>${rupiah.format(order.total)}</b></div><div class="print-total"><span>Dibayar</span><b>${rupiah.format(order.paidAmount || 0)}</b></div><div class="print-total"><span>Sisa</span><b>${rupiah.format(Math.max(0, order.total - (order.paidAmount || 0)))}</b></div>`}
    <hr><p class="print-footer">Manna Print · Labuan Bajo<br>Terima kasih</p>`;
  document.body.classList.add("printing");
  window.onafterprint = () => { document.body.classList.remove("printing"); printDocument.innerHTML = ""; };
  window.print();
}

function reportMoney(value) { return value == null ? "—" : rupiah.format(Number(value || 0)); }
function reportPercent(value) { return value == null || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toFixed(1)}%`; }
function reportMetric(label, value, meta = "", tone = "") { return `<article class="report-metric ${tone}"><span>${label}</span><strong>${value}</strong>${meta ? `<small>${meta}</small>` : ""}</article>`; }
function reportBars(rows, money) {
  const maximum = Math.max(1, ...rows.map((row) => Number(money ? row.sales : row.quantity || row.orders || 0)));
  return rows.slice(-14).map((row) => { const value = Number(money ? row.sales : row.quantity || row.orders || 0); return `<div class="report-bar-item" title="${escapeHtml(row.label)} · ${money ? reportMoney(value) : value}"><span style="height:${Math.max(4, value / maximum * 100)}%"></span><small>${escapeHtml(row.label.slice(5))}</small></div>`; }).join("");
}
function reportRankingRows(rows, capabilities) {
  return rows.slice(0, 12).map((row, index) => `<tr><td><b>${index + 1}</b></td><td><strong>${escapeHtml(row.label)}</strong>${row.category ? `<small>${escapeHtml(row.category)}</small>` : ""}</td><td>${Number(row.orders || row.jobs || 0).toLocaleString("id-ID")}</td><td>${Number(row.quantity || 0).toLocaleString("id-ID")}</td>${capabilities.money ? `<td>${reportMoney(row.sales)}</td>` : ""}${capabilities.cost ? `<td>${reportMoney(row.profit)}</td><td>${reportPercent(row.margin)}</td>` : ""}</tr>`).join("");
}

async function renderReports() {
  root.innerHTML = `<div class="report-page"><div class="report-top"><div><h1>Laporan</h1><p>Analisa penjualan, produk, mesin, dan perkembangan bisnis.</p></div></div><section class="panel"><div class="report-loading">Memuat laporan…</div></section></div>`;
  try {
    const params = new URLSearchParams(Object.entries(state.reportFilters).filter(([, value]) => value));
    const report = await api(`/api/reports?${params}`); state.report = report;
    if (!state.reportFilters.from) state.reportFilters.from = report.range.from;
    if (!state.reportFilters.to) state.reportFilters.to = report.range.to;
    if (state.view === "reports") drawReports();
  } catch (error) { root.innerHTML = `<div class="category-empty"><strong>Laporan tidak dapat dimuat</strong><p>${escapeHtml(error.message)}</p></div>`; }
}

function drawReports() {
  const report = state.report; if (!report) return;
  const capabilities = report.capabilities; const summary = report.summary;
  const changeMeta = summary.change == null ? "Belum ada periode pembanding" : `${summary.change >= 0 ? "Naik" : "Turun"} ${Math.abs(summary.change).toFixed(1)}% dari periode sebelumnya`;
  const tabs = [["overview", "Ringkasan"], ["sales", "Penjualan"], ["products", "Produk & Kategori"], ["customers", "Pelanggan"], ["payments", "Pembayaran"], ["operations", "Operasional"], ["machines", "Mesin"], ["inventory", "Persediaan"]];
  const kpis = [reportMetric("Jumlah Pesanan", Number(summary.orders).toLocaleString("id-ID"), `${summary.items} item`), capabilities.money ? reportMetric("Penjualan Bersih", reportMoney(summary.sales), changeMeta, summary.change >= 0 ? "positive" : "negative") : reportMetric("Produk Terjual", Number(summary.items).toLocaleString("id-ID"), "Nilai uang disembunyikan"), capabilities.money ? reportMetric("Uang Diterima", reportMoney(summary.paid), `Sisa ${reportMoney(summary.outstanding)}`) : "", capabilities.cost ? reportMetric("Laba Kotor Estimasi", reportMoney(summary.profit), `Margin ${reportPercent(summary.margin)}`) : ""].join("");
  root.innerHTML = `<div class="report-page"><div class="report-top"><div><h1>Laporan</h1><p>Analisa penjualan, produk, mesin, dan perkembangan bisnis.</p></div><div class="report-actions">${capabilities.export ? '<button id="report-export" class="secondary">↓ Download CSV</button>' : ""}${capabilities.print ? '<button id="report-print" class="primary">Print / PDF</button>' : ""}</div></div>
    <section class="panel report-filter-card"><div class="report-filters"><label><span>Dari tanggal</span><input id="report-from" type="date" value="${report.range.from}" ${report.range.locked ? "disabled" : ""}></label><label><span>Sampai tanggal</span><input id="report-to" type="date" value="${report.range.to}" ${report.range.locked ? "disabled" : ""}></label><label><span>Kategori</span><select id="report-category"><option value="">Semua kategori</option>${productCategories().filter(([id]) => id !== "all").map(([, label]) => `<option ${state.reportFilters.category === label ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label><label><span>Mesin</span><select id="report-machine"><option value="">Semua mesin</option>${state.machines.map((machine) => `<option value="${machine.id}" ${state.reportFilters.machineId === machine.id ? "selected" : ""}>${escapeHtml(machine.name)}</option>`).join("")}</select></label><label><span>Pembayaran</span><select id="report-payment"><option value="">Semua pembayaran</option>${["BELUM_BAYAR", "BELUM_LUNAS", "LUNAS"].map((value) => `<option value="${value}" ${state.reportFilters.paymentStatus === value ? "selected" : ""}>${value.replaceAll("_", " ")}</option>`).join("")}</select></label><button id="apply-report" class="primary">Terapkan</button></div>${report.range.locked ? '<p class="report-scope-note">Akses role ini dibatasi pada data hari ini.</p>' : report.range.scope === "own" ? '<p class="report-scope-note">Laporan hanya menampilkan pekerjaan yang dibuat atau ditugaskan kepada Anda.</p>' : ""}</section>
    <div class="report-tabs">${tabs.map(([id, label]) => `<button data-report-tab="${id}" class="${state.reportTab === id ? "active" : ""}">${label}</button>`).join("")}</div><div class="report-kpis">${kpis}</div><div id="report-content"></div></div>`;
  const content = document.querySelector("#report-content");
  if (state.reportTab === "overview") content.innerHTML = `<div class="report-grid"><section class="panel report-chart-card"><div class="panel-head"><h2>Tren ${capabilities.money ? "Penjualan" : "Jumlah Produk"}</h2><span>${report.range.from} — ${report.range.to}</span></div><div class="report-bars">${reportBars(report.days, capabilities.money)}</div></section><section class="panel report-insights"><div class="panel-head"><h2>Insight & Rekomendasi</h2></div><div class="panel-body">${report.insights.map((item) => `<div class="report-insight"><span>✦</span><p>${escapeHtml(item)}</p></div>`).join("")}</div></section></div><section class="panel report-ranking"><div class="panel-head"><h2>Kategori Teratas</h2></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Kategori</th><th>Order</th><th>Qty</th>${capabilities.money ? "<th>Penjualan</th>" : ""}${capabilities.cost ? "<th>Laba</th><th>Margin</th>" : ""}</tr></thead><tbody>${reportRankingRows(report.categories, capabilities)}</tbody></table></div></section>`;
  if (state.reportTab === "sales") content.innerHTML = reportSalesTable(report);
  if (state.reportTab === "products") content.innerHTML = `<section class="panel report-ranking"><div class="panel-head"><h2>Performa Produk</h2><span>${report.products.length} produk</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Produk</th><th>Order</th><th>Qty</th>${capabilities.money ? "<th>Penjualan</th>" : ""}${capabilities.cost ? "<th>Laba</th><th>Margin</th>" : ""}</tr></thead><tbody>${reportRankingRows(report.products, capabilities)}</tbody></table></div></section>`;
  if (state.reportTab === "machines") content.innerHTML = `<section class="panel report-ranking"><div class="panel-head"><h2>Performa Mesin</h2><span>Berdasarkan mesin yang terhubung ke produk</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Mesin</th><th>Pekerjaan</th><th>Qty</th>${capabilities.money ? "<th>Penjualan terkait</th>" : ""}</tr></thead><tbody>${reportRankingRows(report.machines, capabilities)}</tbody></table></div></section>`;
  if (state.reportTab === "customers") content.innerHTML = `<section class="panel report-ranking"><div class="panel-head"><h2>Performa Pelanggan</h2><span>${report.customers.length} pelanggan</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Pelanggan</th><th>Order</th><th>Item</th><th>Pesanan Terakhir</th>${capabilities.money ? "<th>Penjualan</th><th>Dibayar</th>" : ""}</tr></thead><tbody>${report.customers.map((row, index) => `<tr><td><b>${index + 1}</b></td><td><strong>${escapeHtml(row.label)}</strong><small>${escapeHtml(row.phone || "Walk-in")}</small></td><td>${row.orders}</td><td>${row.items}</td><td>${projectDateFormat.format(new Date(row.lastOrderAt))}</td>${capabilities.money ? `<td>${reportMoney(row.sales)}</td><td>${reportMoney(row.paid)}</td>` : ""}</tr>`).join("") || '<tr><td colspan="7">Belum ada data pelanggan.</td></tr>'}</tbody></table></div></section>`;
  if (state.reportTab === "payments") content.innerHTML = `<div class="report-kpis report-sub-kpis">${reportMetric("Belum Bayar", report.paymentSummary.unpaid, "pesanan")}${reportMetric("Pembayaran Sebagian", report.paymentSummary.partial, "pesanan")}${reportMetric("Lunas", report.paymentSummary.paidOrders, "pesanan")}${capabilities.money ? reportMetric("Sisa Pembayaran", reportMoney(report.paymentSummary.outstanding), "piutang pada periode") : ""}</div>${capabilities.money ? purchaseOrderReport(report.purchaseOrders || []) : ""}${reportSalesTable(report)}`;
  if (state.reportTab === "operations") content.innerHTML = `<section class="panel report-ranking"><div class="panel-head"><h2>Beban Pekerjaan per Tahap</h2><span>Mempermudah identifikasi antrean produksi</span></div><div class="table-wrap"><table><thead><tr><th>Tahap</th><th>Pesanan</th><th>Item</th></tr></thead><tbody>${report.statuses.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong></td><td>${row.orders}</td><td>${row.items}</td></tr>`).join("") || '<tr><td colspan="3">Belum ada pekerjaan.</td></tr>'}</tbody></table></div></section>`;
  if (state.reportTab === "inventory") content.innerHTML = `<section class="panel report-ranking"><div class="panel-head"><h2>Persediaan & Stok Minimum</h2><span>${report.inventory.filter((row) => row.low).length} bahan perlu diperiksa</span></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>SKU</th><th>Stok</th><th>Minimum</th><th>Kondisi</th>${capabilities.cost ? "<th>Nilai Stok</th>" : ""}</tr></thead><tbody>${report.inventory.map((row) => `<tr><td><strong>${escapeHtml(row.label)}</strong></td><td>${escapeHtml(row.sku)}</td><td>${row.quantity.toLocaleString("id-ID")} ${escapeHtml(row.unit)}</td><td>${row.minStock.toLocaleString("id-ID")} ${escapeHtml(row.unit)}</td><td><span class="badge ${row.low ? "warn" : "ok"}">${row.low ? "PERLU DIPERIKSA" : "AMAN"}</span></td>${capabilities.cost ? `<td>${reportMoney(row.value)}</td>` : ""}</tr>`).join("")}</tbody></table></div></section>`;
  document.querySelectorAll("[data-report-tab]").forEach((button) => button.onclick = () => { state.reportTab = button.dataset.reportTab; drawReports(); });
  document.querySelector("#apply-report").onclick = () => { state.reportFilters = { from: document.querySelector("#report-from").value, to: document.querySelector("#report-to").value, category: document.querySelector("#report-category").value, machineId: document.querySelector("#report-machine").value, paymentStatus: document.querySelector("#report-payment").value }; renderReports(); };
  document.querySelector("#report-export")?.addEventListener("click", exportReportCsv);
  document.querySelector("#report-print")?.addEventListener("click", printReport);
  bindReportSorting();
}

function reportSalesTable(report) {
  const rows = [...report.rows].sort((a, b) => { const key = state.reportSort.key; const direction = state.reportSort.direction === "asc" ? 1 : -1; return (typeof a[key] === "number" ? a[key] - b[key] : String(a[key] || "").localeCompare(String(b[key] || ""))) * direction; });
  const head = (key, label) => `<button data-report-sort="${key}">${label}${state.reportSort.key === key ? state.reportSort.direction === "asc" ? " ↑" : " ↓" : ""}</button>`;
  return `<section class="panel report-ranking"><div class="panel-head"><h2>Detail Penjualan</h2><span>${rows.length} transaksi</span></div><div class="table-wrap"><table class="report-detail-table"><thead><tr><th>${head("date", "Tanggal")}</th><th>${head("code", "Invoice")}</th><th>${head("customer", "Order")}</th><th>Produk</th><th>${head("itemCount", "Item")}</th><th>Status</th>${report.capabilities.money ? `<th>${head("sales", "Penjualan")}</th><th>${head("paid", "Dibayar")}</th>` : ""}${report.capabilities.cost ? `<th>${head("profit", "Laba")}</th><th>${head("margin", "Margin")}</th>` : ""}</tr></thead><tbody>${rows.map((row) => `<tr><td>${new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date(row.date))}</td><td><strong>${escapeHtml(row.code)}</strong></td><td>${escapeHtml(row.customer)}</td><td>${escapeHtml(row.products)}</td><td>${row.itemCount}</td><td>${escapeHtml(row.status)}</td>${report.capabilities.money ? `<td>${reportMoney(row.sales)}</td><td>${reportMoney(row.paid)}</td>` : ""}${report.capabilities.cost ? `<td>${reportMoney(row.profit)}</td><td>${reportPercent(row.margin)}</td>` : ""}</tr>`).join("") || '<tr><td colspan="10">Belum ada transaksi pada periode ini.</td></tr>'}</tbody></table></div></section>`;
}

function purchaseOrderReport(rows) {
  return `<section class="panel report-ranking po-report"><div class="panel-head"><div><h2>Dokumen Pembayaran PO</h2><span>${rows.length} surat PO pada periode</span></div></div><div class="po-report-grid">${rows.length ? rows.map((row) => `<article><div class="po-report-image">${row.attachment?.dataUrl ? `<img src="${escapeHtml(row.attachment.dataUrl)}" alt="PO ${escapeHtml(row.poNumber)}">` : '<span>Dokumen<br>belum diunggah</span>'}</div><div><strong>${escapeHtml(row.poNumber)}</strong><p>${escapeHtml(row.customer)} · ${escapeHtml(row.code)}</p><small>${dateFormat.format(new Date(row.createdAt))}${row.attachment?.name ? ` · ${escapeHtml(row.attachment.name)}` : ""}</small></div></article>`).join("") : '<div class="cart-empty">Belum ada pembayaran PO pada periode ini.</div>'}</div></section>`;
}

function bindReportSorting() { document.querySelectorAll("[data-report-sort]").forEach((button) => button.onclick = () => { const key = button.dataset.reportSort; state.reportSort = { key, direction: state.reportSort.key === key && state.reportSort.direction === "desc" ? "asc" : "desc" }; drawReports(); }); }
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function exportReportCsv() {
  const report = state.report; const headers = ["Tanggal", "Invoice", "Customer", "Produk", "Jumlah Item", "Status", "Status Pembayaran"];
  if (report.capabilities.money) headers.push("Nomor PO");
  if (report.capabilities.money) headers.push("Penjualan", "Dibayar", "Sisa"); if (report.capabilities.cost) headers.push("HPP Estimasi", "Laba", "Margin %");
  const data = report.rows.map((row) => { const values = [row.date, row.code, row.customer, row.products, row.itemCount, row.status, row.paymentStatus]; if (report.capabilities.money) values.push((row.poNumbers || []).join("; "), row.sales, row.paid, row.outstanding); if (report.capabilities.cost) values.push(row.cost, row.profit, Number(row.margin || 0).toFixed(2)); return values; });
  const blob = new Blob(["\uFEFF" + [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `laporan-manna-${report.range.from}-${report.range.to}.csv`; link.click(); URL.revokeObjectURL(link.href);
}
function printReport() {
  const report = state.report; printDocument.className = "print-document report-print"; printDocument.innerHTML = `<div class="print-brand">MANNA PRINT</div><div class="print-subtitle">LAPORAN BISNIS</div><p>Periode ${report.range.from} — ${report.range.to}</p><hr><div class="print-report-summary"><div>Pesanan <b>${report.summary.orders}</b></div><div>Item <b>${report.summary.items}</b></div>${report.capabilities.money ? `<div>Penjualan <b>${reportMoney(report.summary.sales)}</b></div><div>Dibayar <b>${reportMoney(report.summary.paid)}</b></div>` : ""}${report.capabilities.cost ? `<div>Laba Estimasi <b>${reportMoney(report.summary.profit)}</b></div><div>Margin <b>${reportPercent(report.summary.margin)}</b></div>` : ""}</div><h3>Insight</h3>${report.insights.map((item) => `<p>• ${escapeHtml(item)}</p>`).join("")}<h3>Produk Teratas</h3><table><thead><tr><th>Produk</th><th>Qty</th>${report.capabilities.money ? "<th>Penjualan</th>" : ""}</tr></thead><tbody>${report.products.slice(0, 10).map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.quantity}</td>${report.capabilities.money ? `<td>${reportMoney(row.sales)}</td>` : ""}</tr>`).join("")}</tbody></table>`; document.body.classList.add("printing"); window.onafterprint = () => { document.body.classList.remove("printing"); printDocument.innerHTML = ""; }; window.print();
}

function masterHeader(title) {
  const labels = { products: "Produk", materials: "Bahan", categories: "Kategori", finishings: "Finishing", machines: "Mesin", users: "User & Akses", pics: "PIC" };
  const allowed = { products: can("master.products"), materials: can("master.materials"), categories: canManageSettings(), finishings: can("master.finishings"), machines: can("master.machines"), users: can("users.manage"), pics: canManageSettings() };
  return `<div class="master-top"><div><h1>Master Data</h1><p>Kelola katalog, komposisi bahan, mesin, harga, serta akses user.</p></div><button id="add-master" class="primary">+ Tambah ${title}</button></div>
    <div class="master-summary"><div><span>Produk aktif</span><strong>${state.allProducts.filter((item) => item.active !== false).length}</strong></div><div><span>Bahan aktif</span><strong>${state.materials.filter((item) => item.active !== false).length}</strong></div><div><span>Mesin aktif</span><strong>${state.machines.filter((item) => item.active !== false).length}</strong></div><div><span>Stok menipis</span><strong>${state.inventory.filter((item) => Number(item.quantity) <= Number(item.minStock || 0)).length}</strong></div></div>
    <div class="master-tabs">${Object.entries(labels).filter(([id]) => allowed[id]).map(([id, label]) => `<button class="${state.masterTab === id ? "active" : ""}" data-master-tab="${id}">${label}</button>`).join("")}</div>`;
}

function renderMaster() {
  const allowedTabs = [["products", "master.products"], ["materials", "master.materials"], ["finishings", "master.finishings"], ["machines", "master.machines"], ["users", "users.manage"]].filter(([, permission]) => can(permission)).map(([id]) => id);
  if (canManageSettings()) allowedTabs.push("categories", "pics");
  if (!allowedTabs.includes(state.masterTab)) state.masterTab = allowedTabs[0] || "users";
  if (["categories", "pics"].includes(state.masterTab)) return renderSettingsMaster();
  const title = { products: "Produk", materials: "Bahan", finishings: "Finishing", machines: "Mesin", users: "User" }[state.masterTab];
  const productRows = state.allProducts.map((product) => {
    const materials = (product.materialSources || []).map((source) => source.name).filter(Boolean).join(", ") || "—";
    const machines = (product.machineIds || []).map((id) => state.machines.find((item) => item.id === id)?.name).filter(Boolean).join(", ") || "—";
    return `<tr data-master-row data-category="${escapeHtml(product.category)}" data-machines="${escapeHtml((product.machineIds || []).join(","))}" data-promo="${discountActive(product)}"><td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || "—")}</small></td><td>${escapeHtml(product.category)}</td><td>${escapeHtml(product.saleUnit || product.unitName || "—")}</td><td class="compact-cell">${escapeHtml(materials)}</td><td class="compact-cell">${escapeHtml(machines)}</td><td><strong>${rupiah.format(product.price)}</strong>${product.wholesaleEnabled ? '<small class="blue-text">Harga grosir aktif</small>' : ""}${discountActive(product) ? `<small class="promo-text">DISKON · ${escapeHtml(discountLabel(product))}</small>` : ""}</td><td><span class="badge ${product.active === false ? "warn" : "ok"}">${product.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-product="${product.id}">Edit</button></td></tr>`;
  }).join("");
  const materialRows = state.materials.map((material) => {
    const stock = state.inventory.find((item) => item.materialId === material.id || item.sku === material.sku);
    return `<tr data-category="${escapeHtml(material.category)}" data-sort-category="${escapeHtml(material.category)}"><td><strong>${escapeHtml(material.name)}</strong><small>${escapeHtml(material.sku)}</small></td><td>${escapeHtml(material.category)}</td><td>${escapeHtml(material.unit)}</td><td class="${Number(stock?.quantity || 0) <= Number(material.minStock || 0) ? "stock-negative" : ""}">${Number(stock?.quantity || 0).toLocaleString("id-ID")} ${escapeHtml(material.unit)}</td><td>${rupiah.format(material.cost)}</td><td>${escapeHtml(material.supplier || "—")}</td><td><span class="badge ${material.active === false ? "warn" : "ok"}">${material.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-material="${material.id}">Edit</button></td></tr>`;
  }).join("");
  const machineRows = state.machines.map((machine) => `<tr><td><strong>${escapeHtml(machine.name)}</strong><small>${escapeHtml(machine.code)}</small></td><td>${escapeHtml(machine.type)}</td><td>${escapeHtml(machine.capacity || "—")}</td><td>${rupiah.format(machine.costPerHour)}/jam</td><td><span class="badge ${machine.status === "AKTIF" ? "ok" : "warn"}">${escapeHtml(machine.status)}</span></td><td><button class="secondary" data-edit-machine="${machine.id}">Edit</button></td></tr>`).join("");
  const finishingRows = state.finishings.map((finishing) => `<tr data-categories="${escapeHtml(JSON.stringify(finishing.categories || []))}" data-sort-category="${escapeHtml([...(finishing.categories || [])].sort((a, b) => a.localeCompare(b, "id"))[0] || "")}"><td><strong>${escapeHtml(finishing.name)}</strong><small>${escapeHtml(finishing.code)}</small></td><td class="compact-cell">${(finishing.categories || []).map((category) => `<span class="mini-chip">${escapeHtml(category)}</span>`).join(" ")}</td><td>${rupiah.format(finishing.price)}</td><td>${escapeHtml({ free: "Per unit", area: "Per m²", point: "Per titik", perimeter: "Keliling", top_bottom: "Atas–bawah", left_right: "Kanan–kiri", length: "Meter lari" }[finishing.rule] || finishing.rule)}</td><td><span class="badge ${finishing.active === false ? "warn" : "ok"}">${finishing.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-finishing="${finishing.id}">Edit</button></td></tr>`).join("");
  const userRows = state.users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username)}</small></td><td><span class="role-badge role-${user.role.toLowerCase()}">${escapeHtml(user.roleLabel)}</span></td><td>${user.permissions.length} permission</td><td>${escapeHtml({ all: "Semua periode", today: "Hari ini", own: "Pekerjaan sendiri" }[user.reportScope] || user.reportScope)}</td><td>${user.lastLoginAt ? dateFormat.format(new Date(user.lastLoginAt)) : "Belum pernah"}</td><td><span class="badge ${user.active === false ? "warn" : "ok"}">${user.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-user="${user.id}">Atur Akses</button></td></tr>`).join("");
  const tables = {
    products: `<table><thead><tr><th>Produk</th><th>Kategori</th><th>Satuan</th><th>Bahan terkait</th><th>Mesin</th><th>Harga jual</th><th>Status</th><th></th></tr></thead><tbody>${productRows}</tbody></table>`,
    materials: `<table><thead><tr><th>Bahan</th><th>Kategori</th><th>Satuan</th><th>Stok</th><th>Harga dasar</th><th>Supplier</th><th>Status</th><th></th></tr></thead><tbody>${materialRows}</tbody></table>`,
    finishings: `<table><thead><tr><th>Finishing</th><th>Kategori sesuai</th><th>Harga</th><th>Perhitungan</th><th>Status</th><th></th></tr></thead><tbody>${finishingRows}</tbody></table>`,
    machines: `<table><thead><tr><th>Mesin</th><th>Jenis</th><th>Kapasitas</th><th>Biaya</th><th>Status</th><th></th></tr></thead><tbody>${machineRows}</tbody></table>`,
    users: `<table><thead><tr><th>User</th><th>Role</th><th>Akses</th><th>Scope Laporan</th><th>Login Terakhir</th><th>Status</th><th></th></tr></thead><tbody>${userRows}</tbody></table>`
  };
  const productFilters = ["materials", "finishings"].includes(state.masterTab) ? `<select id="filter-category" class="filter-select"><option value="">Semua kategori</option>${[...(state.masterTab === "materials" ? state.catalogOptions.materialCategories : state.catalogOptions.categories)].sort((a, b) => a.localeCompare(b, "id")).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select><select id="sort-master" class="filter-select"><option value="category-asc">Kategori A–Z</option><option value="category-desc">Kategori Z–A</option><option value="name">Nama A–Z</option></select>` : state.masterTab === "products" ? `<select id="filter-category" class="filter-select"><option value="">Semua kategori</option>${productCategories().filter(([id]) => id !== "all").map(([, label]) => `<option>${escapeHtml(label)}</option>`).join("")}</select><select id="filter-machine" class="filter-select"><option value="">Semua mesin</option>${state.machines.map((machine) => `<option value="${machine.id}">${escapeHtml(machine.name)}</option>`).join("")}</select><button id="filter-promo" class="filter-chip" type="button">✦ Diskon</button>` : "";
  const audit = state.masterTab === "users" && can("audit.view") ? `<section class="panel audit-panel"><div class="panel-head"><h2>Audit Log Terakhir</h2><span>${state.auditLogs.length} aktivitas</span></div><div class="audit-list">${state.auditLogs.slice(0, 30).map((item) => `<div><span>${escapeHtml(item.action)}</span><p><strong>${escapeHtml(item.userName)}</strong> · ${escapeHtml(item.description)}</p><small>${dateFormat.format(new Date(item.createdAt))}</small></div>`).join("") || '<p class="note">Belum ada aktivitas.</p>'}</div></section>` : "";
  root.innerHTML = `<div class="master-page">${masterHeader(title)}<section class="panel"><div class="panel-head master-list-head"><h2>Daftar ${title}</h2><div class="master-filters"><input id="master-search" class="search" placeholder="Cari ${title.toLowerCase()}…">${productFilters}</div></div><div class="table-wrap master-table">${tables[state.masterTab]}</div></section>${audit}</div>`;
  document.querySelectorAll("[data-master-tab]").forEach((button) => button.onclick = () => { state.masterTab = button.dataset.masterTab; renderMaster(); });
  document.querySelector("#add-master").onclick = () => state.masterTab === "products" ? openProductForm() : state.masterTab === "materials" ? openMaterialForm() : state.masterTab === "finishings" ? openFinishingForm() : state.masterTab === "machines" ? openMachineForm() : openUserForm();
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.onclick = () => openProductForm(state.allProducts.find((item) => item.id === button.dataset.editProduct)));
  document.querySelectorAll("[data-edit-material]").forEach((button) => button.onclick = () => openMaterialForm(state.materials.find((item) => item.id === button.dataset.editMaterial)));
  document.querySelectorAll("[data-edit-finishing]").forEach((button) => button.onclick = () => openFinishingForm(state.finishings.find((item) => item.id === button.dataset.editFinishing)));
  document.querySelectorAll("[data-edit-machine]").forEach((button) => button.onclick = () => openMachineForm(state.machines.find((item) => item.id === button.dataset.editMachine)));
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.onclick = () => openUserForm(state.users.find((item) => item.id === button.dataset.editUser)));
  let promoOnly = false;
  const applyFilters = () => { const query = document.querySelector("#master-search").value.toLowerCase(); const category = document.querySelector("#filter-category")?.value || ""; const machine = document.querySelector("#filter-machine")?.value || ""; document.querySelectorAll(".master-table tbody tr").forEach((row) => { const matches = row.textContent.toLowerCase().includes(query) && (!category || row.dataset.category === category || JSON.parse(row.dataset.categories || "[]").includes(category)) && (!machine || (row.dataset.machines || "").split(",").includes(machine)) && (!promoOnly || row.dataset.promo === "true"); row.classList.toggle("hidden", !matches); }); };
  document.querySelector("#master-search").oninput = applyFilters;
  document.querySelector("#filter-category")?.addEventListener("change", applyFilters); document.querySelector("#filter-machine")?.addEventListener("change", applyFilters);
  const sortRows = () => { const mode = document.querySelector("#sort-master")?.value; if (!mode) return; const body = document.querySelector(".master-table tbody"); const rows = [...body.rows].sort((a, b) => { const nameA = a.cells[0].querySelector("strong")?.textContent || ""; const nameB = b.cells[0].querySelector("strong")?.textContent || ""; const group = mode === "name" ? 0 : (a.dataset.sortCategory || "").localeCompare(b.dataset.sortCategory || "", "id") * (mode === "category-desc" ? -1 : 1); return group || nameA.localeCompare(nameB, "id", { numeric: true }); }); rows.forEach((row) => body.append(row)); };
  document.querySelector("#sort-master")?.addEventListener("change", sortRows); sortRows();
  document.querySelector("#filter-promo")?.addEventListener("click", (event) => { promoOnly = !promoOnly; event.currentTarget.classList.toggle("active", promoOnly); applyFilters(); });
}

function renderSettingsMaster() {
  const categories = state.masterTab === "categories";
  const kind = state.categorySettingsKind;
  const names = categories ? state.catalogOptions[kind === "products" ? "categories" : "materialCategories"] : [];
  const rows = categories ? names.map((name) => {
    const count = (kind === "products" ? state.allProducts : state.materials).filter((item) => item.category === name).length;
    return `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${count} ${kind === "products" ? "produk" : "bahan"}</td><td><button class="secondary" data-edit-category-name="${escapeHtml(name)}">Edit</button></td></tr>`;
  }).join("") : activePics().map((pic) => `<tr><td><strong>${escapeHtml(pic.name)}</strong></td><td>${state.orders.filter((order) => order.designPicId === pic.id && !["SELESAI", "DIAMBIL"].includes(order.status)).length} pesanan berjalan</td><td><button class="secondary" data-edit-pic="${escapeHtml(pic.id)}">Edit</button></td></tr>`).join("");
  root.innerHTML = `<div class="master-page">${masterHeader(categories ? "Kategori" : "PIC")}${categories ? `<div class="settings-kind-tabs">${[["products", "Kategori Produk"], ["materials", "Kategori Bahan"]].map(([id, name]) => `<button class="secondary ${kind === id ? "active" : ""}" data-settings-category-kind="${id}">${name}</button>`).join("")}</div>` : '<p class="product-note">PIC adalah daftar nama mandiri untuk kolom PIC pesanan, terpisah dari akun User.</p>'}<section class="panel"><div class="panel-head master-list-head"><h2>${categories ? kind === "products" ? "Kategori Produk" : "Kategori Bahan" : "Daftar PIC"}</h2><input id="settings-search" class="search" type="search" placeholder="Cari ${categories ? "kategori" : "PIC"}…"></div><div class="table-wrap master-table"><table><thead><tr><th>Nama</th><th>Penggunaan</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3">Belum ada data.</td></tr>'}</tbody></table></div></section></div>`;
  document.querySelectorAll("[data-master-tab]").forEach((button) => button.onclick = () => { state.masterTab = button.dataset.masterTab; renderMaster(); });
  document.querySelectorAll("[data-settings-category-kind]").forEach((button) => button.onclick = () => { state.categorySettingsKind = button.dataset.settingsCategoryKind; renderSettingsMaster(); });
  document.querySelector("#add-master").onclick = () => categories ? openCategoryForm(kind) : openPicForm();
  document.querySelectorAll("[data-edit-category-name]").forEach((button) => button.onclick = () => openCategoryForm(kind, button.dataset.editCategoryName));
  document.querySelectorAll("[data-edit-pic]").forEach((button) => button.onclick = () => openPicForm(activePics().find((pic) => pic.id === button.dataset.editPic)));
  document.querySelector("#settings-search").oninput = (event) => document.querySelectorAll(".master-table tbody tr").forEach((row) => row.classList.toggle("hidden", !row.textContent.toLowerCase().includes(event.target.value.toLowerCase())));
}

function openCategoryForm(kind, name = null) {
  const title = `Kategori ${kind === "products" ? "Produk" : "Bahan"}`;
  const detail = showMasterDialog(`${name ? "Edit" : "Tambah"} ${title}`, `<form id="category-form" class="master-form"><label class="field"><span>Nama kategori *</span><input name="name" required maxlength="100" value="${escapeHtml(name || "")}"></label><p class="product-note">${kind === "products" ? "Nama kategori diperbarui pada produk, tab POS, pilihan finishing, dan filter laporan." : "Nama kategori diperbarui pada bahan, stok, serta filter bahan."}</p><div class="form-footer">${deleteButtonHtml(name, "Kategori")}<button type="button" class="secondary" id="cancel-category-form">Batal</button><button class="primary" type="submit">Simpan Kategori</button></div></form>`);
  detail.querySelector("#cancel-category-form").onclick = () => dialog.close();
  detail.querySelector("[data-delete-record]")?.addEventListener("click", () => openDeleteCategoryDialog(kind, name));
  detail.querySelector("#category-form").onsubmit = async (event) => {
    event.preventDefault(); const updated = event.target.elements.name.value.trim();
    try { await api(`/api/categories/${kind}${name ? `/${encodeURIComponent(name)}` : ""}`, { method: name ? "PUT" : "POST", body: JSON.stringify({ name: updated }) }); dialog.close(); await load(); renderMaster(); toast("Kategori berhasil disimpan"); } catch (error) { toast(error.message, "error"); }
  };
}

function openDeleteCategoryDialog(kind, name) {
  const replacements = state.catalogOptions[kind === "products" ? "categories" : "materialCategories"].filter((label) => label !== name);
  const confirm = document.createElement("dialog"); confirm.className = "delete-confirm";
  confirm.innerHTML = `<form class="delete-confirm-body"><h3>Apakah anda yakin mau menghapus kategori ini?</h3><p>Semua ${kind === "products" ? "produk dan hubungan finishing" : "bahan dan stok"} pada kategori ${escapeHtml(name)} akan dipindahkan terlebih dahulu.</p><label class="field"><span>Kategori pengganti *</span><select name="replacement" required><option value="">Pilih kategori pengganti…</option>${replacements.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("")}</select></label>${replacements.length ? "" : '<p>Tambahkan kategori lain sebelum menghapus kategori terakhir.</p>'}<div class="delete-confirm-actions"><button class="delete-trigger" type="submit" ${replacements.length ? "" : "disabled"}>Ya, Hapus</button><button class="secondary" type="button" data-cancel>Batal</button></div></form>`;
  document.body.append(confirm); const close = () => { confirm.close(); confirm.remove(); };
  confirm.oncancel = (event) => { event.preventDefault(); close(); };
  confirm.querySelector("[data-cancel]").onclick = close;
  confirm.querySelector("form").onsubmit = async (event) => {
    event.preventDefault(); const button = confirm.querySelector('[type="submit"]'); button.disabled = true;
    try { await api(`/api/categories/${kind}/${encodeURIComponent(name)}`, { method: "DELETE", body: JSON.stringify({ replacement: event.target.elements.replacement.value }) }); state.selectedCategory = "all"; state.selectedProduct = null; close(); dialog.close(); await load(); renderMaster(); toast("Kategori dipindahkan dan dihapus"); } catch (error) { toast(error.message, "error"); button.disabled = false; }
  };
  confirm.showModal();
}

function openPicForm(pic = null) {
  const detail = showMasterDialog(pic ? "Edit PIC" : "Tambah PIC", `<form id="pic-form" class="master-form"><label class="field"><span>Nama PIC *</span><input name="name" required maxlength="100" value="${escapeHtml(pic?.name || "")}"></label><p class="product-note">Mengubah nama akan memperbarui PIC pada pesanan berjalan. Nama pada pesanan selesai tetap tersimpan sebagai riwayat.</p><div class="form-footer">${deleteButtonHtml(pic, "PIC")}<button type="button" class="secondary" id="cancel-pic-form">Batal</button><button class="primary" type="submit">Simpan PIC</button></div></form>`);
  bindDeleteRecord(detail, pic, "pics", "PIC", "pics");
  detail.querySelector("#cancel-pic-form").onclick = () => dialog.close();
  detail.querySelector("#pic-form").onsubmit = async (event) => {
    event.preventDefault();
    try { await api(`/api/pics${pic ? `/${encodeURIComponent(pic.id)}` : ""}`, { method: pic ? "PUT" : "POST", body: JSON.stringify({ name: event.target.elements.name.value.trim() }) }); dialog.close(); await load(); renderMaster(); toast("PIC berhasil disimpan"); } catch (error) { toast(error.message, "error"); }
  };
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

function deleteButtonHtml(item, label) {
  return item ? `<button type="button" class="delete-trigger" data-delete-record>Hapus ${label}</button>` : "";
}

function openCategoryOrderForm() {
  if (!canManageSettings()) return;
  const ordered = [...state.catalogOptions.categories];
  const detail = showMasterDialog("Atur Tab Kategori", `<form id="category-order-form" class="master-form"><p class="product-note">Urutan berlaku untuk seluruh kasir. Tab Semua tetap berada di posisi pertama.</p><div class="category-order-fixed">Semua <small>Tetap di awal</small></div><div id="category-order-rows"></div><div class="form-footer"><button type="button" class="secondary" id="cancel-category-order">Batal</button><button class="primary" type="submit">Simpan Urutan</button></div></form>`);
  const rows = detail.querySelector("#category-order-rows");
  const draw = () => { rows.innerHTML = ordered.map((name, index) => `<div class="category-order-row"><span>${escapeHtml(name)}</span><button type="button" class="secondary" data-move-category="${index}" data-direction="-1" aria-label="Naikkan ${escapeHtml(name)}" ${index ? "" : "disabled"}>↑</button><button type="button" class="secondary" data-move-category="${index}" data-direction="1" aria-label="Turunkan ${escapeHtml(name)}" ${index === ordered.length - 1 ? "disabled" : ""}>↓</button></div>`).join(""); };
  rows.onclick = (event) => { const button = event.target.closest("[data-move-category]"); if (!button) return; const index = Number(button.dataset.moveCategory); const next = index + Number(button.dataset.direction); if (next < 0 || next >= ordered.length) return; [ordered[index], ordered[next]] = [ordered[next], ordered[index]]; draw(); };
  draw();
  detail.querySelector("#cancel-category-order").onclick = () => dialog.close();
  detail.querySelector("#category-order-form").onsubmit = async (event) => {
    event.preventDefault(); syncDraft(document.querySelector("#checkout"));
    try { state.catalogOptions = await api("/api/category-order", { method: "PUT", body: JSON.stringify({ categories: ordered }) }); dialog.close(); render(); toast("Urutan tab kategori disimpan"); } catch (error) { toast(error.message, "error"); }
  };
}

function bindDeleteRecord(detail, item, kind, label, tab) {
  if (!item) return;
  detail.querySelector("[data-delete-record]").onclick = () => {
    const confirm = document.createElement("dialog");
    confirm.className = "delete-confirm";
    confirm.innerHTML = `<div class="delete-confirm-body"><h3>Apakah anda yakin mau menghapus ${label.toLowerCase()} ini?</h3><p>${escapeHtml({ products: "Produk akan hilang dari POS dan daftar produk. Pesanan lama tetap tersimpan.", materials: "Bahan harus tidak dipakai produk aktif, stoknya nol, dan tidak dipakai pesanan berjalan.", finishings: "Finishing tidak tersedia lagi untuk pesanan baru. Pesanan lama tetap tersimpan.", machines: "Mesin harus dilepas dari semua produk aktif terlebih dahulu.", users: "Akses user akan dihentikan. Riwayat pekerjaan dan audit tetap tersimpan.", pics: "PIC hilang dari pilihan penugasan baru. Nama pada pesanan yang sudah ditugaskan tetap tersimpan." }[kind])}</p><div class="delete-confirm-actions"><button type="button" class="delete-trigger" data-confirm-delete>Ya, Hapus</button><button type="button" class="secondary" data-cancel-delete>Batal</button></div></div>`;
    document.body.append(confirm);
    const close = () => { confirm.close(); confirm.remove(); };
    confirm.oncancel = (event) => { event.preventDefault(); close(); };
    confirm.querySelector("[data-cancel-delete]").onclick = close;
    confirm.querySelector("[data-confirm-delete]").onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try {
        await api(`/api/${kind}/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        close(); dialog.close(); await load(); state.view = "master"; state.masterTab = tab; render(); toast(`${label} berhasil dihapus`);
      } catch (error) { toast(error.message, "error"); button.disabled = false; }
    };
    confirm.showModal();
  };
}

function switchHtml(name, checked, label = "Aktif") {
  return `<label class="switch-row"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span class="switch"></span><b>${label}</b></label>`;
}

function openMaterialForm(material = null) {
  const detail = showMasterDialog(material ? "Edit Bahan" : "Tambah Bahan", `<form id="material-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama bahan *</span><input name="name" value="${escapeHtml(material?.name || "")}" required></label><label class="field"><span>SKU bahan *</span><input name="sku" value="${escapeHtml(material?.sku || "")}" required></label>
    <label class="field"><span>Kategori bahan *</span><select name="category" required>${[...(state.catalogOptions.materialCategories || [])].sort((a, b) => a.localeCompare(b, "id")).map((category) => `<option value="${escapeHtml(category)}" ${category === (material?.category || "Lainnya") ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select><small>Tambah atau ubah kategori melalui tab Kategori → Kategori Bahan.</small></label><label class="field"><span>Satuan stok *</span><select name="unit">${["m²", "m lari", "pcs", "lbr", "kg", "pack", "rim"].map((unit) => `<option ${material?.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
    ${material ? "" : `<label class="field"><span>Stok awal</span><input name="stock" type="number" min="0" step="0.01" value="0"></label>`}<label class="field"><span>Stok minimum</span><input name="minStock" type="number" min="0" step="0.01" value="${material?.minStock || 0}"></label>
    <label class="field"><span>Harga dasar / satuan</span><input name="cost" type="number" min="0" value="${material?.cost || 0}"></label><label class="field"><span>Supplier</span><input name="supplier" value="${escapeHtml(material?.supplier || "")}"></label>
  </div><div class="form-footer">${switchHtml("active", material?.active !== false)}${deleteButtonHtml(material, "Bahan")}<button class="primary" type="submit">Simpan Bahan</button></div></form>`);
  bindDeleteRecord(detail, material, "materials", "Bahan", "materials");
  detail.querySelector("#material-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); values.active = event.target.elements.active.checked; try { await api(material ? `/api/materials/${material.id}` : "/api/materials", { method: material ? "PUT" : "POST", body: JSON.stringify(values) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "materials"; render(); toast("Bahan berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function finishingTierRowHtml(tier = {}) {
  return `<div class="builder-row" data-finishing-tier><label class="field"><span>Jumlah minimum</span><input data-finishing-min type="number" min="0.0001" step="any" value="${tier.min ?? ""}" required></label><label class="field"><span>Jumlah maksimum</span><input data-finishing-max type="number" min="0.0001" step="any" value="${tier.max ?? ""}" placeholder="Tanpa batas"></label><label class="field"><span>Harga / unit</span><span class="money-input"><b>Rp</b><input data-finishing-tier-price type="text" inputmode="numeric" value="${tier.price == null ? "" : formatMoneyValue(tier.price)}" required></span></label><button type="button" class="text-button" data-remove-finishing-tier aria-label="Hapus tingkat grosir">×</button></div>`;
}

function openFinishingForm(finishing = null) {
  const categories = productCategories().filter(([id]) => id !== "all").map(([, label]) => label);
  const rules = [["free", "Per unit"], ["area", "Per m²"], ["point", "Per titik"], ["perimeter", "Keliling"], ["top_bottom", "Atas–bawah"], ["left_right", "Kanan–kiri"], ["length", "Meter lari"]];
  const detail = showMasterDialog(finishing ? "Edit Finishing" : "Tambah Finishing", `<form id="finishing-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama finishing *</span><input name="name" value="${escapeHtml(finishing?.name || "")}" required></label><label class="field"><span>Kode finishing *</span><input name="code" value="${escapeHtml(finishing?.code || "")}" required></label>
    <label class="field"><span>Harga / unit</span>${moneyField("price", finishing?.price || 0)}</label><label class="field"><span>Dasar perhitungan</span><select name="rule">${rules.map(([value, label]) => `<option value="${value}" ${finishing?.rule === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <div class="field full"><div class="builder-head"><span>Harga grosir finishing (opsional)</span><button type="button" class="text-button" id="add-finishing-tier">+ Tingkat Grosir</button></div><small>Berdasarkan jumlah finishing per item pesanan, sesuai dasar perhitungan. Di luar rentang grosir, gunakan harga biasa. Maksimal 10 tingkat.</small><div id="finishing-tiers">${(finishing?.priceTiers || []).map(finishingTierRowHtml).join("")}</div></div>
    <div class="field full"><span>Kategori yang sesuai *</span><div class="category-checks">${categories.map((category) => `<label><input type="checkbox" name="category" value="${category}" ${(finishing?.categories || []).includes(category) ? "checked" : ""}><span>${category}</span></label>`).join("")}</div><small>Finishing hanya akan muncul saat menambahkan produk dalam kategori yang dipilih.</small></div>
  </div><div class="form-footer">${switchHtml("active", finishing?.active !== false)}${deleteButtonHtml(finishing, "Finishing")}<button class="primary" type="submit">Simpan Finishing</button></div></form>`);
  bindDeleteRecord(detail, finishing, "finishings", "Finishing", "finishings");
  const tierList = detail.querySelector("#finishing-tiers");
  tierList.onclick = (event) => { const button = event.target.closest("[data-remove-finishing-tier]"); if (button) button.closest("[data-finishing-tier]").remove(); };
  detail.querySelector("#add-finishing-tier").onclick = () => {
    if (tierList.children.length >= 10) return toast("Maksimal 10 tingkat grosir", "error");
    tierList.insertAdjacentHTML("beforeend", finishingTierRowHtml());
    bindMoneyInputs(tierList.lastElementChild);
    tierList.lastElementChild.querySelector("[data-finishing-min]").focus();
  };
  bindMoneyInputs(detail);
  detail.querySelector("#finishing-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); const payload = { ...values, price: parseMoney(values.price), active: event.target.elements.active.checked, categories: [...event.target.querySelectorAll('input[name="category"]:checked')].map((input) => input.value) }; try { payload.priceTiers = normalizeFinishingTiers([...tierList.querySelectorAll("[data-finishing-tier]")].map((row) => ({ min: row.querySelector("[data-finishing-min]").value, max: row.querySelector("[data-finishing-max]").value, price: row.querySelector("[data-finishing-tier-price]").value.trim() === "" ? "" : parseMoney(row.querySelector("[data-finishing-tier-price]").value) }))); await api(finishing ? `/api/finishings/${finishing.id}` : "/api/finishings", { method: finishing ? "PUT" : "POST", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "finishings"; render(); toast("Finishing berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function openMachineForm(machine = null) {
  const detail = showMasterDialog(machine ? "Edit Mesin" : "Tambah Mesin", `<form id="machine-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama mesin *</span><input name="name" value="${escapeHtml(machine?.name || "")}" required></label><label class="field"><span>Kode mesin *</span><input name="code" value="${escapeHtml(machine?.code || "")}" required></label>
    <label class="field"><span>Jenis mesin</span><input name="type" value="${escapeHtml(machine?.type || "")}" placeholder="Large Format, Finishing"></label><label class="field"><span>Status</span><select name="status">${["AKTIF", "MAINTENANCE", "NONAKTIF"].map((status) => `<option ${machine?.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    <label class="field"><span>Biaya operasional / jam</span><input name="costPerHour" type="number" min="0" value="${machine?.costPerHour || 0}"></label><label class="field"><span>Kapasitas</span><input name="capacity" value="${escapeHtml(machine?.capacity || "")}" placeholder="Contoh: 12 m²/jam"></label>
  </div><div class="form-footer">${switchHtml("active", machine?.active !== false)}${deleteButtonHtml(machine, "Mesin")}<button class="primary" type="submit">Simpan Mesin</button></div></form>`);
  bindDeleteRecord(detail, machine, "machines", "Mesin", "machines");
  detail.querySelector("#machine-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); values.active = event.target.elements.active.checked; try { await api(machine ? `/api/machines/${machine.id}` : "/api/machines", { method: machine ? "PUT" : "POST", body: JSON.stringify(values) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "machines"; render(); toast("Mesin berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function openUserForm(user = null) {
  const role = user?.role || "CASHIER";
  const selected = new Set(user?.permissions || state.rolePresets[role]?.permissions || []);
  const groups = state.permissionCatalog.reduce((map, permission) => { (map[permission.group] ||= []).push(permission); return map; }, {});
  const permissionHtml = Object.entries(groups).map(([group, permissions]) => `<section class="permission-group"><div><strong>${escapeHtml(group)}</strong><button type="button" data-check-group="${escapeHtml(group)}">Pilih semua</button></div>${permissions.map((permission) => `<label><input type="checkbox" name="permission" value="${permission.id}" ${selected.has(permission.id) ? "checked" : ""}><span><b>${escapeHtml(permission.label)}</b><small>${escapeHtml(permission.id)}</small></span></label>`).join("")}</section>`).join("");
  const detail = showMasterDialog(user ? "Atur User & Permission" : "Tambah User", `<form id="user-form" class="master-form user-form"><div class="form-grid"><label class="field"><span>Nama lengkap *</span><input name="name" value="${escapeHtml(user?.name || "")}" required></label><label class="field"><span>Username *</span><input name="username" value="${escapeHtml(user?.username || "")}" required></label><label class="field"><span>Role *</span><select name="role">${Object.entries(state.rolePresets).map(([id, preset]) => `<option value="${id}" ${role === id ? "selected" : ""}>${escapeHtml(preset.label)}</option>`).join("")}</select></label><label class="field"><span>${user ? "PIN baru (kosongkan jika tetap)" : "PIN *"}</span><input name="pin" type="password" inputmode="numeric" minlength="4" ${user ? "" : "required"}></label><label class="field"><span>Scope laporan</span><select name="reportScope"><option value="all" ${user?.reportScope === "all" ? "selected" : ""}>Semua periode</option><option value="today" ${user?.reportScope === "today" ? "selected" : ""}>Hari ini saja</option><option value="own" ${user?.reportScope === "own" ? "selected" : ""}>Pekerjaan sendiri</option></select></label></div><div class="permission-heading"><div><h3>Permission Khusus</h3><p>Role memberikan template awal. Permission dapat disesuaikan untuk user ini.</p></div><button id="reset-role-permissions" class="secondary" type="button">Gunakan Template Role</button></div><div class="permission-grid">${permissionHtml}</div><div class="form-footer">${switchHtml("active", user?.active !== false)}${deleteButtonHtml(user, "User")}<button type="button" class="secondary" id="cancel-master">Batal</button><button class="primary" type="submit">Simpan User</button></div></form>`);
  const form = detail.querySelector("#user-form");
  bindDeleteRecord(detail, user, "users", "User", "users");
  const applyRole = () => { const preset = state.rolePresets[form.elements.role.value]; const allowed = new Set(preset?.permissions || []); form.querySelectorAll('input[name="permission"]').forEach((input) => input.checked = allowed.has(input.value)); form.elements.reportScope.value = preset?.reportScope || "all"; };
  form.elements.role.onchange = applyRole;
  detail.querySelector("#reset-role-permissions").onclick = applyRole;
  detail.querySelectorAll("[data-check-group]").forEach((button) => button.onclick = () => { const section = button.closest(".permission-group"); const inputs = [...section.querySelectorAll('input[name="permission"]')]; const select = inputs.some((input) => !input.checked); inputs.forEach((input) => input.checked = select); button.textContent = select ? "Batalkan semua" : "Pilih semua"; });
  detail.querySelector("#cancel-master").onclick = () => dialog.close();
  form.onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const payload = { ...values, active: form.elements.active.checked, permissions: [...form.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value) }; try { await api(user ? `/api/users/${user.id}` : "/api/users", { method: user ? "PUT" : "POST", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "users"; render(); toast("User dan permission berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function tierRowHtml(tier = {}, index = 0) {
  return `<div class="tier-row" data-tier-row><b>${index + 1}</b><input data-tier-min type="number" min="1" value="${tier.min ?? (index ? index * 10 + 1 : 1)}" aria-label="Minimum quantity"><input data-tier-max type="number" min="1" value="${tier.max ?? ""}" placeholder="∞" aria-label="Maksimum quantity"><span class="money-input compact"><b>Rp</b><input data-tier-price type="text" inputmode="numeric" value="${formatMoneyValue(tier.price || 0)}" placeholder="Harga" aria-label="Harga per unit"></span><span data-tier-margin>—</span><button type="button" data-remove-tier title="Hapus">×</button></div>`;
}

function referenceField(label, name, options, selected, kind, valueFor = (item) => item, labelFor = (item) => item) {
  return `<div class="field reference-field"><span>${label} *</span><div class="reference-control"><select name="${name}">${options.map((item) => `<option value="${escapeHtml(valueFor(item))}" ${valueFor(item) === selected ? "selected" : ""}>${escapeHtml(labelFor(item))}</option>`).join("")}</select><button type="button" class="secondary add-reference" data-reference-kind="${kind}" aria-label="Tambah ${label}">＋</button></div><div class="reference-editor hidden" data-reference-editor="${kind}"><input data-reference-label placeholder="Nama ${label.toLowerCase()}">${kind === "priceBases" ? '<select data-reference-mode><option value="unit">Per unit</option><option value="sqm">Luas m²</option><option value="linear_m">Meter lari</option></select>' : ""}<button type="button" class="primary" data-save-reference>Simpan</button><button type="button" class="secondary" data-cancel-reference>×</button></div></div>`;
}

function materialRowHtml(source = {}) {
  return `<div class="builder-row" data-material-row><select data-material-id><option value="">Pilih bahan</option>${state.materials.filter((item) => item.active !== false || item.id === source.materialId).map((item) => `<option value="${item.id}" ${item.id === source.materialId ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.unit)}</option>`).join("")}</select><input data-material-qty type="number" min="0.0001" step="0.0001" value="${source.quantity || 1}" placeholder="Jumlah"><input data-material-waste type="number" min="0" step="0.1" value="${source.wastePercent || 0}" placeholder="Waste %"><button type="button" data-remove-builder>×</button></div>`;
}

function variantSourcesHtml(product) {
  if (!product) return "";
  const variants = [...(product.fixedSizeVariants || []).map((item) => ({ ...item, kind: "fixed" })), ...(product.sizeVariants || []).map((item) => ({ ...item, kind: "template" }))];
  const optionHtml = (selected) => `<option value="">Pilih bahan</option>${state.materials.filter((item) => item.active !== false || item.id === selected).map((item) => `<option value="${escapeHtml(item.id)}" ${selected === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.unit)}</option>`).join("")}`;
  if (!variants.length && !(product.choiceGroups || []).length) return "";
  return `<div class="builder-card" id="variant-materials"><div class="builder-head"><div><strong>Sumber bahan per varian</strong><p>Stok berkurang saat pesanan Selesai. Bahan varian menggantikan bahan umum; kosong berarti memakai bahan umum. Bahan dari pilihan ditambahkan di luar bahan varian.</p></div></div>
    ${variants.map((variant) => `<div class="variant-material-group" data-variant-kind="${variant.kind}" data-variant-id="${escapeHtml(variant.id)}"><div class="builder-head"><strong>${escapeHtml(variant.label)}</strong><button type="button" class="text-button" data-add-variant-material>+ Tambah Bahan</button></div><div data-variant-material-rows>${(variant.materialSources || []).map(materialRowHtml).join("")}</div><small>${variant.materialSources?.length ? "Jumlah per satu produk varian." : "Mengikuti bahan umum dan luas varian jika kosong."}</small></div>`).join("")}
    ${(product.choiceGroups || []).map((group) => `<div class="variant-material-group" data-choice-group="${escapeHtml(group.id)}"><strong>${escapeHtml(group.label)} · bahan sesuai pilihan kasir</strong>${group.options.map((option) => `<div class="builder-row choice-material-row" data-choice-option="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span><select data-choice-material aria-label="Bahan ${escapeHtml(option.label)}">${optionHtml(option.materialId)}</select><input data-choice-quantity type="number" min="0.0001" step="0.0001" value="${Number(option.quantity || 1)}" aria-label="Jumlah bahan ${escapeHtml(option.label)}"><span>${escapeHtml(option.unit || "")}</span></div>`).join("")}</div>`).join("")}</div>`;
}

function editableMaterialVariantHtml(variant = {}) {
  return `<div class="variant-material-group editable-material-variant" data-editable-material-variant data-variant-id="${escapeHtml(variant.id || `mv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)}"><div class="builder-head"><strong>Varian Bahan</strong><button type="button" class="text-button" data-remove-material-variant>Hapus Varian</button></div><div class="form-grid"><label class="field"><span>Nama varian *</span><input data-material-variant-label maxlength="100" value="${escapeHtml(variant.label || "")}" placeholder="Contoh: Albatros"></label><label class="field"><span>Harga varian (opsional)</span><span class="money-input"><b>Rp</b><input data-material-variant-price data-optional-money type="text" inputmode="numeric" value="${variant.price == null ? "" : formatMoneyValue(variant.price)}" placeholder="Ikuti harga produk"></span></label></div><div class="builder-head"><span>Bahan stok untuk varian ini *</span><button type="button" class="text-button" data-add-custom-material>+ Tambah Bahan</button></div><div data-variant-material-rows>${(variant.materialSources?.length ? variant.materialSources : [{}]).map(materialRowHtml).join("")}</div><small>Jumlah bahan per satuan dasar perhitungan. Bahan umum tetap ditambahkan bila diisi.</small><div class="builder-head"><span>Harga grosir varian (opsional)</span><button type="button" class="text-button" data-add-choice-tier>+ Tingkat Grosir</button></div><div data-choice-tier-list>${(variant.priceTiers || []).map(choiceTierRowHtml).join("")}</div></div>`;
}

function choiceTierRowHtml(tier = {}) {
  return `<div class="builder-row" data-choice-tier-row><input data-choice-tier-min type="number" min="1" value="${tier.min ?? 1}" aria-label="Jumlah minimum"><input data-choice-tier-max type="number" min="1" value="${tier.max ?? ""}" placeholder="Maksimum (opsional)" aria-label="Jumlah maksimum"><span class="money-input"><b>Rp</b><input data-choice-tier-price type="text" inputmode="numeric" value="${tier.price == null ? "" : formatMoneyValue(tier.price)}" placeholder="Harga grosir" aria-label="Harga grosir"></span><button type="button" class="text-button" data-remove-choice-tier>×</button></div>`;
}

function editableSubVariantHtml(sub = {}) {
  return `<div class="builder-row" data-editable-sub-variant data-sub-id="${escapeHtml(sub.id || `sv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)}"><input data-sub-label maxlength="100" value="${escapeHtml(sub.label || "")}" placeholder="Contoh: 1 sisi"><button type="button" class="text-button" data-remove-sub-variant>Hapus</button></div>`;
}

function combinationRowHtml(variant, sub, combo = {}) {
  return `<div class="variant-material-group" data-combination data-variant-id="${escapeHtml(variant.id)}" data-sub-id="${escapeHtml(sub.id)}"><div class="builder-head"><strong>${escapeHtml(variant.label || "Varian Bahan")} · ${escapeHtml(sub.label || "Sub-varian")}</strong><label><input type="checkbox" data-combination-active ${combo.active !== false ? "checked" : ""}> Tersedia di POS</label></div><label class="field"><span>Harga kombinasi (opsional)</span><span class="money-input"><b>Rp</b><input data-combination-price data-optional-money type="text" inputmode="numeric" value="${combo.price == null ? "" : formatMoneyValue(combo.price)}" placeholder="Ikuti harga varian"></span></label><div class="builder-head"><span>Harga grosir kombinasi (opsional)</span><button type="button" class="text-button" data-add-choice-tier>+ Tingkat Grosir</button></div><div data-choice-tier-list>${(combo.priceTiers || []).map(choiceTierRowHtml).join("")}</div></div>`;
}

function readChoiceTiers(container) {
  return [...container.querySelectorAll(":scope > [data-choice-tier-row]")].map((row) => ({ min: row.querySelector("[data-choice-tier-min]").value, max: row.querySelector("[data-choice-tier-max]").value, price: parseMoney(row.querySelector("[data-choice-tier-price]").value) }));
}

function readMaterialRows(container) {
  return [...container.querySelectorAll("[data-material-row]")].map((row) => ({ materialId: row.querySelector("[data-material-id]").value, quantity: row.querySelector("[data-material-qty]").value, wastePercent: row.querySelector("[data-material-waste]").value })).filter((item) => item.materialId);
}

function finishingRowHtml(item = {}) {
  return `<div class="builder-row finishing-builder" data-finishing-row><input data-finishing-name value="${escapeHtml(item.name || "")}" placeholder="Nama finishing"><input data-finishing-price type="number" min="0" value="${item.price || 0}" placeholder="Harga"><select data-finishing-rule>${[["free","Per unit"],["point","Per titik"],["perimeter","Keliling"],["top_bottom","Atas–bawah"],["left_right","Kanan–kiri"],["length","Meter lari"]].map(([value,label]) => `<option value="${value}" ${item.rule === value ? "selected" : ""}>${label}</option>`).join("")}</select><button type="button" data-remove-builder>×</button></div>`;
}

function finishingOptionsHtml(category, selectedIds = [], product = null) {
  const options = state.finishings.filter((item) => {
    if (item.active === false || !(item.categories || []).includes(category)) return false;
    if (product?.a3Kind === "sticker" && categoryId(category) === "print-a3") return item.id.startsWith("fin-a3-sticker-");
    if (product?.a3Kind === "ready" && categoryId(category) === "print-a3") return product.a3ReadyType === "card" ? item.id.startsWith("fin-a3-card-")
      : product.a3ReadyType === "nota" ? item.id === "fin-a3-nota-design" : false;
    if (product?.a3Kind === "paper" && categoryId(category) === "print-a3") return !item.id.startsWith("fin-a3-sticker-") && item.id !== "fin-a3-two-side" &&
      !item.id.startsWith("fin-a3-card-") && item.id !== "fin-a3-nota-design" &&
      !(item.id.startsWith("fin-a3-lam-") && !item.id.endsWith(product.a3Side === "1S" ? "-1" : "-2"));
    return true;
  });
  return options.length ? options.map((item) => `<label class="finishing-master-option"><input type="checkbox" name="finishingId" value="${item.id}" ${selectedIds.includes(item.id) ? "checked" : ""}><span><strong>${escapeHtml(item.name)}</strong><small>${item.price ? rupiah.format(item.price) : "Gratis"} · ${escapeHtml({ free: "per unit", point: "per titik", perimeter: "keliling", top_bottom: "atas–bawah", left_right: "kanan–kiri", length: "meter lari" }[item.rule] || item.rule)}</small></span></label>`).join("") : '<p class="empty-inline">Belum ada finishing aktif untuk kategori ini. Tambahkan melalui tab Finishing.</p>';
}

function openProductForm(product = null) {
  if (product?.dtfShirt) return openDtfProductForm(product);
  const defaultTiers = product?.priceTiers?.length ? product.priceTiers : [{ min: 1, max: 1, price: product?.price || 10000 }, { min: 2, max: 10, price: product?.price ? Math.round(product.price * .9) : 9000 }, { min: 11, max: 50, price: product?.price ? Math.round(product.price * .8) : 8000 }];
  const sources = product?.materialSources?.length ? product.materialSources : [{}];
  const categories = productCategories().filter(([id]) => id !== "all").map(([, label]) => label);
  const saleUnits = state.catalogOptions.saleUnits?.length ? state.catalogOptions.saleUnits : ["pcs", "lbr", "m²", "m lari", "pack", "rim", "set"];
  const priceBases = state.catalogOptions.priceBases?.length ? state.catalogOptions.priceBases : [{ id: "unit", label: "Per unit", mode: "unit" }, { id: "sqm", label: "Luas m²", mode: "sqm" }, { id: "linear_m", label: "Meter lari", mode: "linear_m" }];
  const selectedBasis = priceBases.find((item) => item.label === product?.priceBasisLabel) || priceBases.find((item) => item.mode === product?.priceBasis) || priceBases[0];
  const initialCategory = product?.category || categories[0];
  const selectedFinishingIds = product?.finishingIds || [];
  const discount = product?.discount || { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" };
  const detail = showMasterDialog(product ? "Edit Produk" : "Tambah Produk", `<form id="product-form" class="master-form product-form"><div class="product-form-grid"><section><p class="section-label">Informasi produk</p><div class="form-grid">
    <label class="field"><span>Nama produk *</span><input name="name" value="${escapeHtml(product?.name || "")}" required></label><label class="field"><span>SKU produk *</span><input name="sku" value="${escapeHtml(product?.sku || "")}" required></label>
    ${referenceField("Kategori", "category", categories, initialCategory, "categories")}${referenceField("Satuan jual", "saleUnit", saleUnits, product?.saleUnit || product?.unitName || saleUnits[0], "saleUnits")}
    <label class="field atk-master-field ${categoryId(initialCategory) === "atk" ? "" : "hidden"}"><span>Jenis ATK</span><select name="retailAtK"><option value="false" ${!product?.retailAtK ? "selected" : ""}>Jasa produksi</option><option value="true" ${product?.retailAtK ? "selected" : ""}>Barang dagangan</option></select></label>
    <label class="field atk-master-field ${categoryId(initialCategory) === "atk" ? "" : "hidden"}"><span>Tab ATK</span><select name="atkGroup">${atkGroups.map((group) => `<option value="${escapeHtml(group)}" ${product?.atkGroup === group ? "selected" : ""}>${escapeHtml(group)}</option>`).join("")}</select></label>
    <label class="field atk-master-field ${categoryId(initialCategory) === "atk" ? "" : "hidden"}"><span>Barcode (opsional)</span><input name="barcode" type="text" maxlength="128" value="${escapeHtml(product?.barcode || "")}" placeholder="Isi kode dari kemasan produk"></label>
    ${referenceField("Dasar perhitungan", "priceBasisId", priceBases, selectedBasis.id, "priceBases", (item) => item.id, (item) => item.label)}<label class="field"><span>Pilihan lebar (pisahkan koma)</span><input name="widths" value="${escapeHtml((product?.widths || []).join(", "))}" placeholder="1, 1.27, 1.52"></label>
    <label class="field"><span>Harga Dasar / HPP</span>${moneyField("baseCost", product?.baseCost || 0)}</label><label class="field"><span>Harga Jual *</span>${moneyField("price", product?.price || 10000, "required")}</label>
    <div class="margin-summary full"><span>Margin kotor</span><strong id="margin-summary">—</strong></div><label class="field full"><span>Catatan produk</span><textarea name="note">${escapeHtml(product?.note || "")}</textarea></label>
  </div><div class="toggle-group">${switchHtml("active", product?.active !== false)}${switchHtml("featured", Boolean(product?.featured), "Tampilkan di Semua")}</div></section>
  <section id="product-production-section"><p class="section-label">Kebutuhan produksi</p><div class="builder-card" id="product-common-sources"><div class="builder-head"><strong>Sumber bahan umum</strong><button id="add-material-row" class="text-button" type="button">+ Tambah Bahan</button></div><div id="material-rows">${sources.map(materialRowHtml).join("")}</div><small>Wajib jika produk tidak memiliki varian bahan. Stok berkurang saat status Selesai.</small></div>
  <div class="builder-card" id="material-variant-editor"><label class="variant-checkbox"><input type="checkbox" name="hasMaterialVariants" ${product?.hasMaterialVariants ? "checked" : ""}> Produk Memiliki Varian Bahan</label><div id="material-variant-fields" class="${product?.hasMaterialVariants ? "" : "hidden"}"><p class="product-note">Pilih satu varian di POS. Setiap varian memakai bahan stoknya sendiri. Harga varian dan tingkat grosir dapat dikosongkan.</p><div id="editable-material-variants">${(product?.materialVariants || []).map(editableMaterialVariantHtml).join("")}</div><button type="button" class="secondary" id="add-material-variant">+ Tambah Varian</button><div class="variant-material-group"><label class="variant-checkbox"><input type="checkbox" name="hasSubVariants" ${product?.subVariants?.length ? "checked" : ""}> Produk Memiliki Sub-varian</label><div id="sub-variant-fields" class="${product?.subVariants?.length ? "" : "hidden"}"><p class="product-note">Sub-varian adalah pilihan kedua di POS. Stok tetap mengikuti varian bahan. Harga dan grosir kombinasi dapat diatur per pilihan.</p><label class="field"><span>Nama kelompok sub-varian</span><input name="subVariantLabel" maxlength="80" value="${escapeHtml(product?.subVariantLabel || "Sub-varian")}" placeholder="Contoh: Sisi cetak"></label><div id="editable-sub-variants">${(product?.subVariants || []).map(editableSubVariantHtml).join("")}</div><button type="button" class="secondary" id="add-sub-variant">+ Tambah Sub-varian</button><div id="combination-matrix"></div></div></div></div></div>
  ${variantSourcesHtml(product)}
  <div class="builder-card"><div class="builder-head"><strong>Mesin yang digunakan *</strong></div><div class="machine-options">${state.machines.map((machine) => `<label><input type="checkbox" name="machineId" value="${machine.id}" ${(product?.machineIds || []).includes(machine.id) ? "checked" : ""}><span>${escapeHtml(machine.name)}</span></label>`).join("")}</div></div>
  <div class="builder-card"><div class="builder-head"><div><strong>Finishing / Add-on</strong><p>Otomatis difilter berdasarkan kategori produk.</p></div><button id="manage-finishing" class="text-button" type="button">Kelola Finishing</button></div><div id="finishing-options" class="finishing-master-grid">${finishingOptionsHtml(initialCategory, selectedFinishingIds, product)}</div></div></section></div>
  <section class="wholesale-card discount-editor"><div class="builder-head"><div><strong>Promo / Diskon Produk</strong><p>Label DISKON dan harga promo aktif otomatis selama periode promo.</p></div>${switchHtml("discountEnabled", Boolean(discount.enabled), "Aktif")}</div><div id="discount-fields" class="form-grid ${discount.enabled ? "" : "disabled-section"}"><label class="field"><span>Jenis diskon</span><select name="discountType"><option value="percent" ${discount.type !== "nominal" ? "selected" : ""}>Persentase (%)</option><option value="nominal" ${discount.type === "nominal" ? "selected" : ""}>Nominal (Rp)</option></select></label><label class="field"><span>Nilai diskon</span><input name="discountValue" type="number" min="0" value="${discount.value || 0}"></label><label class="field"><span>Mulai promo (WITA)</span><input name="discountStartsAt" type="datetime-local" value="${escapeHtml(localDateTimeInput(discount.startsAt))}"></label><label class="field"><span>Selesai promo (WITA)</span><input name="discountEndsAt" type="datetime-local" value="${escapeHtml(localDateTimeInput(discount.endsAt))}"></label></div></section>
  <section class="wholesale-card"><div class="builder-head"><div><strong>Harga Grosir</strong><p>Harga berubah otomatis berdasarkan jumlah pesanan.</p></div>${switchHtml("wholesaleEnabled", Boolean(product?.wholesaleEnabled))}</div><div id="tier-editor" class="${product?.wholesaleEnabled ? "" : "disabled-section"}"><div class="tier-head"><span>Tingkat</span><span>Min. Qty</span><span>Maks. Qty</span><span>Harga / Unit</span><span>Margin</span><span>Aksi</span></div><div id="tier-rows">${defaultTiers.map(tierRowHtml).join("")}</div><div class="tier-footer"><small>Maksimal 10 tingkat harga · Rentang tidak boleh tumpang tindih.</small><button id="add-tier" class="secondary" type="button">+ Tambah Tingkat Harga <b id="tier-count">${defaultTiers.length}/10</b></button></div></div></section>
  <div class="form-footer sticky-form-footer">${deleteButtonHtml(product, "Produk")}<button type="button" class="secondary" id="cancel-master">Batal</button><button class="primary" type="submit">Simpan Produk</button></div></form>`);
  const form = detail.querySelector("#product-form");
  bindDeleteRecord(detail, product, "products", "Produk", "products");
  const refreshMargins = () => { const hpp = parseMoney(form.elements.baseCost.value); const price = parseMoney(form.elements.price.value); const margin = price ? ((price - hpp) / price * 100) : 0; detail.querySelector("#margin-summary").textContent = `${margin.toFixed(1)}% · ${rupiah.format(price - hpp)}`; detail.querySelectorAll("[data-tier-row]").forEach((row) => { const tierPrice = parseMoney(row.querySelector("[data-tier-price]").value); row.querySelector("[data-tier-margin]").textContent = tierPrice ? `${(((tierPrice - hpp) / tierPrice) * 100).toFixed(0)}%` : "—"; }); };
  const bindBuilders = () => { detail.querySelectorAll("[data-remove-builder]").forEach((button) => button.onclick = () => button.closest(".builder-row").remove()); detail.querySelectorAll("[data-remove-tier]").forEach((button) => button.onclick = () => { if (detail.querySelectorAll("[data-tier-row]").length <= 1) return; button.closest(".tier-row").remove(); [...detail.querySelectorAll("[data-tier-row]")].forEach((row, index) => row.querySelector("b").textContent = index + 1); detail.querySelector("#tier-count").textContent = `${detail.querySelectorAll("[data-tier-row]").length}/10`; refreshMargins(); }); detail.querySelectorAll("[data-tier-price]").forEach((input) => input.oninput = refreshMargins); };
  bindMoneyInputs(detail); form.elements.baseCost.addEventListener("moneychange", refreshMargins); form.elements.price.addEventListener("moneychange", refreshMargins);
  form.elements.wholesaleEnabled.onchange = () => detail.querySelector("#tier-editor").classList.toggle("disabled-section", !form.elements.wholesaleEnabled.checked);
  form.elements.discountEnabled.onchange = () => detail.querySelector("#discount-fields").classList.toggle("disabled-section", !form.elements.discountEnabled.checked);
  const updateAtKFields = () => { const category = form.elements.category.value; const isAtk = categoryId(category) === "atk"; const direct = ["akrilik", "stempel"].includes(categoryId(category)); detail.querySelectorAll(".atk-master-field").forEach((field) => field.classList.toggle("hidden", !isAtk)); detail.querySelector("#product-production-section").classList.toggle("hidden", !form.elements.hasMaterialVariants.checked && (direct || (isAtk && form.elements.retailAtK.value === "true"))); };
  form.elements.hasMaterialVariants.onchange = () => { detail.querySelector("#material-variant-fields").classList.toggle("hidden", !form.elements.hasMaterialVariants.checked); updateAtKFields(); };
  form.elements.retailAtK.onchange = updateAtKFields;
  form.elements.category.onchange = () => { const checked = [...form.querySelectorAll('input[name="finishingId"]:checked')].map((input) => input.value); detail.querySelector("#finishing-options").innerHTML = finishingOptionsHtml(form.elements.category.value, checked, product); updateAtKFields(); };
  updateAtKFields();
  detail.querySelector("#add-tier").onclick = () => { const rows = detail.querySelector("#tier-rows"); const count = rows.children.length; if (count >= 10) return toast("Maksimal 10 tingkat harga", "error"); rows.insertAdjacentHTML("beforeend", tierRowHtml({ min: count * 10 + 1, max: (count + 1) * 10, price: parseMoney(form.elements.price.value) }, count)); detail.querySelector("#tier-count").textContent = `${count + 1}/10`; bindMoneyInputs(rows.lastElementChild); bindBuilders(); refreshMargins(); };
  detail.querySelector("#add-material-row").onclick = () => { detail.querySelector("#material-rows").insertAdjacentHTML("beforeend", materialRowHtml()); bindBuilders(); };
  const matrix = detail.querySelector("#combination-matrix");
  const initialCombos = new Map((product?.materialVariants || []).flatMap((variant) => (variant.combinations || []).map((combo) => [`${variant.id}:${combo.subVariantId}`, combo])));
  const refreshMatrix = () => {
    const previous = new Map([...matrix.querySelectorAll("[data-combination]")].map((row) => [`${row.dataset.variantId}:${row.dataset.subId}`, { active: row.querySelector("[data-combination-active]").checked, price: row.querySelector("[data-combination-price]").value.trim() ? parseMoney(row.querySelector("[data-combination-price]").value) : null, priceTiers: readChoiceTiers(row.querySelector("[data-choice-tier-list]")) }]));
    const variants = [...detail.querySelectorAll("[data-editable-material-variant]")].map((row) => ({ id: row.dataset.variantId, label: row.querySelector("[data-material-variant-label]").value.trim() }));
    const subs = [...detail.querySelectorAll("[data-editable-sub-variant]")].map((row) => ({ id: row.dataset.subId, label: row.querySelector("[data-sub-label]").value.trim() }));
    matrix.innerHTML = variants.length && subs.length ? `<p class="section-label">Harga per kombinasi</p>${variants.flatMap((variant) => subs.map((sub) => combinationRowHtml(variant, sub, previous.get(`${variant.id}:${sub.id}`) || initialCombos.get(`${variant.id}:${sub.id}`) || {}))).join("")}` : "";
    bindMoneyInputs(matrix);
  };
  detail.querySelector("#add-material-variant").onclick = () => { const list = detail.querySelector("#editable-material-variants"); if (list.children.length >= 40) return toast("Maksimal 40 varian bahan", "error"); list.insertAdjacentHTML("beforeend", editableMaterialVariantHtml()); bindMoneyInputs(list.lastElementChild); bindBuilders(); refreshMatrix(); list.lastElementChild.querySelector("[data-material-variant-label]").focus(); };
  detail.querySelector("#editable-material-variants").onclick = (event) => {
    const row = event.target.closest("[data-editable-material-variant]");
    if (!row) return;
    if (event.target.closest("[data-remove-material-variant]")) { row.remove(); refreshMatrix(); }
    if (event.target.closest("[data-add-custom-material]")) { row.querySelector("[data-variant-material-rows]").insertAdjacentHTML("beforeend", materialRowHtml()); bindBuilders(); }
  };
  detail.querySelector("#editable-material-variants").addEventListener("change", (event) => { if (event.target.matches("[data-material-variant-label]")) refreshMatrix(); });
  form.elements.hasSubVariants.onchange = () => detail.querySelector("#sub-variant-fields").classList.toggle("hidden", !form.elements.hasSubVariants.checked);
  detail.querySelector("#add-sub-variant").onclick = () => { const list = detail.querySelector("#editable-sub-variants"); if (list.children.length >= 10) return toast("Maksimal 10 sub-varian", "error"); list.insertAdjacentHTML("beforeend", editableSubVariantHtml()); refreshMatrix(); list.lastElementChild.querySelector("[data-sub-label]").focus(); };
  detail.querySelector("#editable-sub-variants").onclick = (event) => { if (event.target.closest("[data-remove-sub-variant]")) { event.target.closest("[data-editable-sub-variant]").remove(); refreshMatrix(); } };
  detail.querySelector("#editable-sub-variants").addEventListener("change", (event) => { if (event.target.matches("[data-sub-label]")) refreshMatrix(); });
  detail.querySelector("#material-variant-editor").addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-choice-tier]");
    if (add) { const rows = add.closest(".variant-material-group").querySelector("[data-choice-tier-list]"); if (rows.children.length >= 10) return toast("Maksimal 10 tingkat harga", "error"); rows.insertAdjacentHTML("beforeend", choiceTierRowHtml({ min: rows.children.length ? Number(rows.lastElementChild.querySelector("[data-choice-tier-max]").value || 0) + 1 : 1 })); bindMoneyInputs(rows.lastElementChild); }
    if (event.target.closest("[data-remove-choice-tier]")) event.target.closest("[data-choice-tier-row]").remove();
  });
  refreshMatrix();
  detail.querySelectorAll("[data-add-variant-material]").forEach((button) => button.onclick = () => { button.closest("[data-variant-id]").querySelector("[data-variant-material-rows]").insertAdjacentHTML("beforeend", materialRowHtml()); bindBuilders(); });
  detail.querySelector("#manage-finishing").onclick = () => { dialog.close(); state.masterTab = "finishings"; renderMaster(); };
  detail.querySelector("#cancel-master").onclick = () => dialog.close(); bindBuilders(); refreshMargins();
  detail.querySelectorAll("[data-reference-kind]").forEach((button) => button.onclick = () => { const editor = button.closest(".reference-field").querySelector("[data-reference-editor]"); editor.classList.remove("hidden"); editor.querySelector("[data-reference-label]").focus(); });
  detail.querySelectorAll("[data-cancel-reference]").forEach((button) => button.onclick = () => button.closest(".reference-editor").classList.add("hidden"));
  detail.querySelectorAll("[data-save-reference]").forEach((button) => button.onclick = async () => { const editor = button.closest(".reference-editor"); const field = editor.closest(".reference-field"); const kind = editor.dataset.referenceEditor; const label = editor.querySelector("[data-reference-label]").value.trim(); if (!label) return toast("Nama pilihan wajib diisi", "error"); try { const result = await api(`/api/catalog-options/${kind}`, { method: "POST", body: JSON.stringify({ label, mode: editor.querySelector("[data-reference-mode]")?.value }) }); state.catalogOptions = result.options; const select = field.querySelector("select[name]"); const option = result.option; select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(typeof option === "string" ? option : option.id)}" selected>${escapeHtml(typeof option === "string" ? option : option.label)}</option>`); editor.classList.add("hidden"); if (kind === "categories") { form.elements.category.dispatchEvent(new Event("change")); } toast("Pilihan baru ditambahkan"); } catch (error) { toast(error.message, "error"); } });
  form.onsubmit = async (event) => { event.preventDefault(); if (form.elements.hasMaterialVariants.checked && form.elements.hasSubVariants.checked && !form.querySelector("[data-editable-sub-variant]")) return toast("Tambahkan minimal satu sub-varian", "error"); const values = Object.fromEntries(new FormData(form)); const basis = state.catalogOptions.priceBases.find((item) => item.id === values.priceBasisId) || priceBases.find((item) => item.id === values.priceBasisId); const payload = { ...values, price: parseMoney(values.price), baseCost: parseMoney(values.baseCost), priceBasis: basis?.mode || "unit", priceBasisLabel: basis?.label || "Per unit", active: form.elements.active.checked, featured: form.elements.featured.checked, wholesaleEnabled: form.elements.wholesaleEnabled.checked, discount: { enabled: form.elements.discountEnabled.checked, type: values.discountType, value: Number(values.discountValue || 0), startsAt: makassarInputToIso(values.discountStartsAt), endsAt: makassarInputToIso(values.discountEndsAt) }, widths: values.widths.split(",").map((value) => value.trim()).filter(Boolean), machineIds: [...form.querySelectorAll('input[name="machineId"]:checked')].map((input) => input.value), materialSources: readMaterialRows(form.querySelector("#material-rows")), hasMaterialVariants: form.elements.hasMaterialVariants.checked, materialVariants: form.elements.hasMaterialVariants.checked ? [...form.querySelectorAll("[data-editable-material-variant]")].map((group) => ({ id: group.dataset.variantId, label: group.querySelector("[data-material-variant-label]").value.trim(), price: group.querySelector("[data-material-variant-price]").value.trim() ? parseMoney(group.querySelector("[data-material-variant-price]").value) : null, materialSources: readMaterialRows(group), priceTiers: readChoiceTiers(group.querySelector("[data-choice-tier-list]")), combinations: form.elements.hasSubVariants.checked ? [...form.querySelectorAll("[data-editable-sub-variant]")].map((sub) => { const row = [...matrix.querySelectorAll("[data-combination]")].find((item) => item.dataset.variantId === group.dataset.variantId && item.dataset.subId === sub.dataset.subId); return { subVariantId: sub.dataset.subId, active: row.querySelector("[data-combination-active]").checked, price: row.querySelector("[data-combination-price]").value.trim() ? parseMoney(row.querySelector("[data-combination-price]").value) : null, priceTiers: readChoiceTiers(row.querySelector("[data-choice-tier-list]")) }; }) : [] })) : [], subVariants: form.elements.hasMaterialVariants.checked && form.elements.hasSubVariants.checked ? [...form.querySelectorAll("[data-editable-sub-variant]")].map((row) => ({ id: row.dataset.subId, label: row.querySelector("[data-sub-label]").value.trim() })) : [], fixedSizeVariants: product?.fixedSizeVariants?.length ? [...form.querySelectorAll('[data-variant-kind="fixed"]')].map((group) => ({ id: group.dataset.variantId, materialSources: readMaterialRows(group) })) : undefined, sizeVariants: product?.sizeVariants?.length ? [...form.querySelectorAll('[data-variant-kind="template"]')].map((group) => ({ id: group.dataset.variantId, materialSources: readMaterialRows(group) })) : undefined, choiceGroups: product?.choiceGroups?.length ? [...form.querySelectorAll("[data-choice-group]")].map((group) => ({ id: group.dataset.choiceGroup, options: [...group.querySelectorAll("[data-choice-option]")].map((option) => ({ id: option.dataset.choiceOption, materialId: option.querySelector("[data-choice-material]").value, quantity: option.querySelector("[data-choice-quantity]").value })) })) : undefined, finishingIds: [...form.querySelectorAll('input[name="finishingId"]:checked')].map((input) => input.value), priceTiers: [...form.querySelectorAll("[data-tier-row]")].map((row) => ({ min: row.querySelector("[data-tier-min]").value, max: row.querySelector("[data-tier-max]").value, price: parseMoney(row.querySelector("[data-tier-price]").value) })) }; try { await api(product ? `/api/products/${product.id}` : "/api/products", { method: product ? "PUT" : "POST", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "products"; render(); toast("Produk berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function openDtfProductForm(product) {
  const stockVariants = product.dtfStockVariants || ["Hitam", "Putih"].flatMap((color) => ["S", "M", "L", "XL", "XXL"].map((size) => ({ color, size, materialId: state.materials.find((item) => item.name === `Kaos Polos ${color} ${size}`)?.id || "" })));
  const shirtMaterials = state.materials.filter((item) => categoryId(item.category, "materials") === "kaos-polos-dtf");
  const detail = showMasterDialog("Edit Sablon Kaos", `<form id="dtf-master-form" class="master-form"><p class="product-note">Satu produk di POS. Stok kaos Hitam/Putih per ukuran dikelola melalui Stok Bahan → Kaos Polos DTF.</p><p class="section-label">Harga paket sablon / kaos</p><div class="form-grid">${product.dtfPackages.map((pack) => `<label class="field"><span>${escapeHtml(pack.label)}</span>${moneyField(`package-${pack.id}`, pack.price, "required")}</label>`).join("")}</div><p class="product-note">Ukuran XXL otomatis menambah Rp15.000 per kaos dari harga paket di atas.</p><div class="builder-card"><div class="builder-head"><div><strong>Bahan stok per warna dan ukuran</strong><p>Satu bahan kaos berbeda untuk setiap kombinasi. Jumlah stok yang berkurang mengikuti jumlah pesanan.</p></div></div><div class="form-grid">${stockVariants.map((variant) => `<label class="field" data-shirt-stock-color="${escapeHtml(variant.color)}" data-shirt-stock-size="${escapeHtml(variant.size)}"><span>${escapeHtml(variant.color)} · ${escapeHtml(variant.size)}</span><select data-shirt-stock-material>${shirtMaterials.filter((item) => item.active !== false || item.id === variant.materialId).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === variant.materialId ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.sku)}</option>`).join("")}</select></label>`).join("")}</div></div><div class="toggle-group">${switchHtml("active", product.active !== false)}${switchHtml("featured", Boolean(product.featured), "Tampilkan di Semua")}</div><div class="form-footer sticky-form-footer">${deleteButtonHtml(product, "Produk")}<button type="button" class="secondary" id="cancel-master">Batal</button><button class="primary" type="submit">Simpan Produk</button></div></form>`);
  bindMoneyInputs(detail);
  bindDeleteRecord(detail, product, "products", "Produk", "products");
  detail.querySelector("#cancel-master").onclick = () => dialog.close();
  detail.querySelector("#dtf-master-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const packages = product.dtfPackages.map((pack) => ({ id: pack.id, price: parseMoney(form.elements[`package-${pack.id}`].value) }));
    const stockVariants = [...form.querySelectorAll("[data-shirt-stock-color]")].map((field) => ({ color: field.dataset.shirtStockColor, size: field.dataset.shirtStockSize, materialId: field.querySelector("[data-shirt-stock-material]").value }));
    try {
      await api(`/api/products/${product.id}/dtf-packages`, { method: "PUT", body: JSON.stringify({ packages, stockVariants, active: form.elements.active.checked, featured: form.elements.featured.checked }) });
      dialog.close(); await load(); state.view = "master"; state.masterTab = "products"; render(); toast("Harga Sablon Kaos disimpan");
    } catch (error) { toast(error.message, "error"); }
  };
}

function renderStock() {
  const categories = [...new Set(state.inventory.map((item) => item.category || "Lainnya"))].sort();
  root.innerHTML = `<div class="stock-grid"><section class="panel"><div class="panel-head stock-head"><div><h2>Stok Bahan</h2><span class="badge info">Berkurang saat Selesai</span></div><div class="stock-filters"><input id="stock-search" class="search" value="${escapeHtml(state.stockSearch)}" placeholder="Cari bahan atau SKU…"><select id="stock-category" class="filter-select"><option value="">Semua kategori</option>${categories.map((category) => `<option ${state.stockCategory === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></div></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Kategori</th><th>SKU</th><th>Stok</th><th>Minimum</th><th>Update</th>${can("stock.adjust") ? "<th></th>" : ""}</tr></thead><tbody>${state.inventory.map((item) => `<tr data-stock-row data-search="${escapeHtml(`${item.productName} ${item.sku}`.toLowerCase())}" data-category="${escapeHtml(item.category || "Lainnya")}"><td><strong>${escapeHtml(item.productName)}</strong></td><td><span class="mini-chip">${escapeHtml(item.category || "Lainnya")}</span></td><td>${escapeHtml(item.sku)}</td><td class="${Number(item.quantity) <= Number(item.minStock || 0) ? "stock-negative" : ""}">${Number(item.quantity).toLocaleString("id-ID")} ${escapeHtml(item.unit)}</td><td>${Number(item.minStock || 0).toLocaleString("id-ID")} ${escapeHtml(item.unit)}</td><td>${dateFormat.format(new Date(item.updatedAt))}</td>${can("stock.adjust") ? `<td><div class="stock-actions"><button class="primary" data-stock-in="${item.sku}">＋ Tambah Stok</button><button class="secondary" data-adjust="${item.sku}" title="Koreksi stok">Sesuaikan</button></div></td>` : ""}</tr>`).join("")}</tbody></table><div id="stock-empty" class="cart-empty hidden">Bahan tidak ditemukan.</div></div></section><aside class="panel"><div class="panel-head"><h2>Mutasi Terakhir</h2></div><div class="panel-body">${state.stockMovements.length ? state.stockMovements.slice(0, 15).map((move) => `<div class="movement"><div><strong>${escapeHtml(move.productName)}</strong><small>${escapeHtml(move.reason)}${move.orderCode ? ` · ${escapeHtml(move.orderCode)}` : ""}<br>${dateFormat.format(new Date(move.createdAt))}</small></div><em class="${move.change > 0 ? "plus" : "minus"}">${move.change > 0 ? "+" : ""}${move.change}</em></div>`).join("") : '<div class="cart-empty">Belum ada mutasi stok.</div>'}</div></aside></div>`;
  const applyStockFilter = () => { const query = document.querySelector("#stock-search").value.trim().toLowerCase(); const category = document.querySelector("#stock-category").value; let visible = 0; document.querySelectorAll("[data-stock-row]").forEach((row) => { const show = (!query || row.dataset.search.includes(query)) && (!category || row.dataset.category === category); row.classList.toggle("hidden", !show); if (show) visible += 1; }); document.querySelector("#stock-empty").classList.toggle("hidden", visible > 0); state.stockSearch = query; state.stockCategory = category; };
  document.querySelector("#stock-search").oninput = applyStockFilter; document.querySelector("#stock-category").onchange = applyStockFilter; applyStockFilter();
  document.querySelectorAll("[data-stock-in]").forEach((button) => button.onclick = () => openStockEntry(state.inventory.find((item) => item.sku === button.dataset.stockIn)));
  document.querySelectorAll("[data-adjust]").forEach((button) => button.onclick = async () => {
    const change = window.prompt("Masukkan perubahan stok. Contoh: 50 atau -2.5");
    if (!change) return;
    const reason = window.prompt("Alasan penyesuaian:", "Stok awal / stok masuk");
    try { await api(`/api/inventory/${button.dataset.adjust}`, { method: "PATCH", body: JSON.stringify({ change, reason }) }); await load(); toast("Stok diperbarui"); } catch (error) { toast(error.message, "error"); }
  });
}

function openStockEntry(item) {
  if (!item) return;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const detail = showMasterDialog("Tambah Stok Bahan", `<form id="stock-entry-form" class="master-form"><div class="stock-entry-summary"><span>${escapeHtml(item.productName)}</span><strong>Stok saat ini ${Number(item.quantity).toLocaleString("id-ID")} ${escapeHtml(item.unit)}</strong></div><div class="form-grid"><label class="field"><span>Jumlah stok masuk *</span><span class="input-with-unit"><input name="change" type="number" min="0.0001" step="0.0001" required><b>${escapeHtml(item.unit)}</b></span></label><label class="field"><span>Tanggal stok *</span><input name="movementDate" type="date" value="${today}" required></label><label class="field full"><span>Catatan</span><input name="reason" value="Stok masuk" placeholder="Contoh: Pembelian Supplier A"></label></div><div class="form-footer sticky-form-footer"><button type="button" class="secondary" id="cancel-stock-entry">Batal</button><button class="primary" type="submit">Simpan Stok Masuk</button></div></form>`);
  detail.querySelector("#cancel-stock-entry").onclick = () => dialog.close();
  detail.querySelector("#stock-entry-form").onsubmit = async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.target)); try { await api(`/api/inventory/${item.sku}`, { method: "PATCH", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "stock"; renderStock(); toast("Stok masuk berhasil dicatat"); } catch (error) { toast(error.message, "error"); } };
}

document.querySelectorAll(".nav-item").forEach((button) => button.onclick = () => { if (!canView(button.dataset.view)) return; if (state.view === "employees" && hasUnsavedPayroll()) { if (!window.confirm("Buang perubahan payroll yang belum disimpan?")) return; discardPayrollDrafts(); } state.view = button.dataset.view; render(); });
window.addEventListener("beforeunload", event => { if (hasUnsavedPayroll()) { event.preventDefault(); event.returnValue = ""; } });
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
  try { await api("/api/login", { method: "POST", body: JSON.stringify({ username: document.querySelector("#login-username").value, pin: document.querySelector("#login-pin").value }) }); showApp(); await load(); } catch (error) { toast(error.message, "error"); }
});
document.querySelector("#logout-btn").onclick = async () => { try { await api("/api/logout", { method: "POST" }); } finally { state.currentUser = null; showLogin(); document.querySelector("#login-pin").value = ""; } };

const session = await api("/api/session");
if (session.authenticated) { showApp(); await load(); } else showLogin();
