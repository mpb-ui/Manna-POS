import { createSecurityUI } from './security-ui.js';
import { createPrintHelperUI } from './print-helper-ui.js';
import { createReportsUI } from './reports-ui.js';
import { alignPageHeader } from './page-header.js';
import { openProductEditor } from './product-editor.js';
import { availableVariants } from './product-variants.js';
import { FINISHING_TYPES, finishingType, finishingTypeLabel, groupFinishingTypes } from './finishing-types.js';
import { normalizeSaleUnit, normalizeSaleUnitOptions, saleUnitBasis, productSaleUnit, defaultWholesaleBasis } from './sale-units.js';
import { invoiceDiscount, invoiceGross, settledOrder, discountPrintLines } from './order-discount.js';
import { paymentDiscountHtml, bindPaymentDiscount } from './payment-discount-ui.js';
import { createHomeCampaignUI } from './home-campaign-ui.js';
import { enhanceMaterialSelects } from './material-picker.js';
import { minimumQuantity, minimumError, purchaseUnit, wholesaleBasis, wholesaleUnits, wholesaleGroupKey, tierForUnits } from './product-pricing.js';
import { returnableRetailItem } from "./goods-return-rules.js";
import { openGoodsReturn, mountGoodsReturnHistory, closeGoodsReturns, goodsReturnReportHtml } from "./goods-returns-ui.js";
import { checkoutDeadlineHtml, bindCheckoutDeadline } from "./checkout-deadline.js";
import { mountPosSearch } from "./pos-search.js";
import { installDatePickers } from "./date-picker.js";
import { createCustomersUI } from "./customers-ui.js";
import { depositInvoiceLines } from "./customer-documents.js";
import { openSheetProfiles } from "./sheet-profile-ui.js";
import { effectivePriceTiers, updateWholesalePrices } from "./wholesale-prices.js";
import { sheetCalculatorHtml, bindSheetCalculator, sheetProfileOptions } from "./sheet-calculator-ui.js";
import { sheetSpecification } from "./sheet-calculator.js";
import { imageGeometry, supportsOutdoorAllowance, supportsAutoRollWidth, suggestedOutdoorWidth, outdoorCapacity } from "./outdoor-sizing.js";
import { supportsRollPlacement, supportsOutdoorPlacement, selectRollPlacement, rollPlacementNote } from "./roll-placement.js";
import { rollConfigurationHtml, syncRollConfigurator } from "./roll-configurator.js";
import { configurationSection, configurationFinishing, configurationDesign, configurationNotes, configurationActions, bindConfigurationNotes } from "./product-configurator.js";
import { bindShirtStockSelection } from "./dtf-stock-selection.js";
import { createOrderHistory } from "./order-history-ui.js";
import { paymentReceipts } from "./order-history.js";
import { paymentReceiptHtml } from "./payment-documents.js";
import { invoiceReceiptHtml, workOrderHtml } from "./thermal-documents.js";
import { prepareThermalPrint } from "./thermal-print.js";
import { projectJobs, itemQuantityLabel, nextItemStatus, roleCanAdvance, picColor } from "./item-workflow.js";
import { projectDeadlineInfo } from "./project-deadline.js";
import { PROJECT_STAGES, sortProjectDeadlines, projectPicTone } from "./project-management.js";
import { holdLabel } from "./hold-label.js";
import { ensureCartIds, addCartLine, editCartLine, plainRetailLine } from "./cart.js";
import { restoreCartEditor, cartSheetDraft } from "./cart-editor.js";
import { requiredPhone } from "./customer-validation.js";
import { openPurchaseOrder } from "./po-documents.js";
import { mountAssets, openAssetForm, openAssetDetail } from "./assets-ui.js";
import { createOrderAssistance, briefingProfileOptions } from "./order-assistance-ui.js";
import { needsFile, cancelled, paymentHistoryVisible } from "./order-rules.js";
import { finishingPriceForUnits, normalizeFinishingTiers, manualAreaFinishing, manualLfCutting } from "./finishing-pricing.js";
import { mountEmployees, hasUnsavedPayroll, discardPayrollDrafts, clearEmployeeSession } from "./employees-ui.js";
installDatePickers();
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
const projectDateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Makassar" });
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
  ["all", "Home"], ["outdoor", "Outdoor"], ["print-a3", "Print A3+"], ["lf-poster", "LF Poster"],
  ["lf-sticker", "LF Sticker"], ["display-banner", "Display & Banner"],
  ["merchandise", "Merchandise"], ["atk", "ATK"], ["akrilik", "Akrilik"], ["stempel", "Stempel"]
];
function slug(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function productCategories() {
  const labels = state.catalogOptions?.categories?.length ? state.catalogOptions.categories : defaultProductCategories.filter(([id]) => id !== "all").map(([, label]) => label);
  return [["all", "Home"], ...labels.map((label) => [categoryId(label), label])];
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
  currentUser: null, permissions: [], permissionCatalog: [], rolePresets: {}, users: [], auditLogs: [],
  cart: [], view: "pos", selectedProduct: null, selectedCategory: "all", a3Kind: "paper", atkGroup: "Semua", atkSearch: "", directSearch: { Akrilik: "", Stempel: "" }, editingOrderId: null,
  masterTab: "products", categorySettingsKind: "products", projectView: "list", projectSearch: "", projectStatus: "all", projectDeadlineSort: "nearest",
  stockSearch: "", stockCategory: "",
  projectCollapsed: new Set(["DIAMBIL"]),
  draft: { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK", fileReadiness: "UNCONFIRMED" }
};
let csrfToken='';
const securityUI=createSecurityUI({api,user:()=>state.currentUser,e:escapeHtml,toast,onSignOut:()=>showLogin(),onUnlocked:async()=>{await load();showApp();}});
const root = document.querySelector("#view-root");
const dialog = document.querySelector("#order-dialog");
const printDocument = document.querySelector("#print-document");
const printHelper=createPrintHelperUI({api,identity:()=>state.currentUser?.id,toast});
const customersUI=createCustomersUI({state,root,api,moneyField,bindMoneyInputs,parseMoney,e:escapeHtml,money:n=>rupiah.format(n),date:value=>dateFormat.format(new Date(value))+' WITA',toast,can,header:masterHeader,
  bindHeader:()=>{alignPageHeader(root);root.querySelectorAll('[data-master-tab]').forEach(b=>b.onclick=()=>{state.masterTab=b.dataset.masterTab;renderMaster();});},
  openOrder:async id=>{try{const order=await api('/api/order-history/'+id);const index=state.orders.findIndex(o=>o.id===id);if(index>=0)state.orders[index]=order;else state.orders.push(order);if(dialog.open)dialog.close();openOrder(id);}catch(error){toast(error.message,'error');}},
  print:html=>showPrintDocument(html,'payment-receipt')
});
window.addEventListener('customer-extra-payment',event=>openPaymentDialog(event.detail));
const orderHistory = createOrderHistory({ state, root, api, escapeHtml, rupiah, openOrder, toast,
  onAction:(action,order)=>{
    if(action==='edit')startEditOrder(order);
    else if(action==='payment')openPaymentDialog(order);
    else return printOrder(order,action==='invoice'?'invoice':action==='spk'?'spk':'receipt');
  }
});
const assistance = createOrderAssistance({
  state, root, dialog, api, toast, escapeHtml, rupiah, dateFormat, deadlineLabel: formatProjectDeadline, canAuto: () => !hasUnsavedPayroll(),
  openOrder: async id => { await load(); if (state.orders.some(o=>o.id===id)) openOrder(id); else toast("Pesanan tidak lagi tersedia untuk akun ini", "error"); },
  refreshProjects: () => { if (state.view === "projects") renderProjectContent(PROJECT_STAGES.map(([status]) => status)); },
  useRepeat: quote => {
    state.cart = quote.items.map(cartLineFromPricedItem); state.editingOrderId = null;
    state.draft = { customerId:quote.customerId || null,customerName: quote.customerName, phone: quote.phone, deadline: "", fileStatus: "SIAP_CETAK", fileReadiness: "UNCONFIRMED" };
    state.selectedProduct = state.cart[0]?.productId || null;
    state.selectedCategory = categoryKey(state.products.find(p=>p.id===state.selectedProduct) || {});
    state.view = "pos"; configurationDrafts.clear(); dialog.close(); render(); blinkCartTotal();
  }
});

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
  const requestUser=state.currentUser?.id;
  const response = await fetch(path, {...options,headers:{'Content-Type':'application/json',...(csrfToken?{'X-Manna-CSRF':csrfToken}:{}),...(options.headers||{})}});
  const body = await response.json().catch(() => ({}));
  if(requestUser&&requestUser!==state.currentUser?.id&&path!=='/api/login'&&path!=='/api/session')throw new Error('Akun telah berubah. Muat ulang data.');
  if(body.csrfToken)csrfToken=body.csrfToken;
  if(response.status===423){if(body.code==='PIN_CHANGE_REQUIRED')securityUI.changePin(true);else securityUI.showLock();}
  if (response.status === 401 && path !== "/api/login" && body.code!=='AUTH_FAILED') showLogin();
  if (!response.ok) throw Object.assign(new Error(body.error || "Permintaan gagal"), { code: body.code, matches: body.matches, retryAfter:body.retryAfter, status:response.status });
  return body;
}

function toast(message, type = "") {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.className = `toast show ${type}`;
  setTimeout(() => element.className = "toast", 2600);
}

function showLogin() {
  securityUI.reset();csrfToken='';loadSequence++;
  state.cart=[];state.editingOrderId=null;state.draft={customerName:'',phone:'',deadline:'',fileStatus:'SIAP_CETAK',fileReadiness:'UNCONFIRMED'};
  for(const name of ['products','allProducts','orders','materials','finishings','machines','users','auditLogs','inventory','stockMovements','shirtStock'])state[name]=[];
  printHelper.reset();
  closeNavigation();
  homeCampaignUI.reset(); orderHistory.reset(); customersUI.reset(); closeGoodsReturns();
  clearEmployeeSession(); reportsUI.reset();
  state.currentUser = null;
  assistance.resetSession();
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
const viewPermissions = { pos: "pos.view", "order-history": "orders.view", projects: "projects.orders", stock: "stock.view", reports: "reports.view", master: "master.view" };
function canView(view) { if(view==="master")return can("master.view")||can("customers.view");return view === "employees" ? canManageSettings() : can(viewPermissions[view]); }
function firstAllowedView() { return Object.keys(viewPermissions).find((view) => canView(view)) || "none"; }

let loadSequence = 0;
async function load() {
  state.cartCheck = null; customersUI.invalidate();
  const sequence = ++loadSequence;
  const data = await api(`/api/bootstrap?view=${encodeURIComponent(state.view)}`);
  if (sequence !== loadSequence) return;
  Object.assign(state, data);
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("hidden", !canView(button.dataset.view)));
  if (!canView(state.view)) state.view = firstAllowedView();
  document.querySelector("#current-user-name").textContent = state.currentUser?.name || "—";
  document.querySelector("#current-user-role").textContent = state.currentUser?.roleLabel || "—";
  document.querySelector("#active-count").textContent = state.orders.filter(o => ["DESAIN", "CETAK", "FINISHING"].includes(o.status)).length;
  render();
  assistance.onLoad();
}

let productSearchCleanup;
function render() {
  if (state.view !== "pos") {
    homeCampaignUI.stopHome();
    productSearchCleanup?.();
    productSearchCleanup = null;
  }
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  document.querySelector("#page-title").textContent = { pos: "Point of Sale", "order-history": "Status Order", projects: "Project Management", stock: "Stok Bahan", reports: "Laporan", master: "Master Data", employees: "Karyawan", none: "Akses Terbatas" }[state.view];
  if (state.view === "none") root.innerHTML = '<div class="category-empty"><strong>Belum ada menu yang dapat diakses</strong><p>Hubungi Admin atau Owner untuk mengatur permission akun ini.</p></div>';
  if (state.view === "pos") renderPos();
  if (state.view === "order-history") orderHistory.mount();
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
function productBase(product, width, length, quantity, fixedVariant = null, materialVariant = null, combination = null, pricingContext = null) {
  const billed = billedLength(length, product.billingIncrement);
  const units = fixedVariant ? Number(quantity) : product.priceBasis === "sqm" ? Number(width) * billed * Number(quantity) : billed * Number(quantity);
  const tierList = effectivePriceTiers(product, fixedVariant, materialVariant, combination);
  let pricingQuantity = wholesaleUnits(product,{width,billedLength:billed,quantity,sizeVariantId:fixedVariant?.id});
  if (pricingContext && !fixedVariant && wholesaleBasis(product)!=='quantity') {
    const key=wholesaleGroupKey(pricingContext);
    pricingQuantity=Number((pricingQuantity+state.cart.filter(line=>line.cartId!==configurationEditingLine?.cartId && wholesaleGroupKey(line)===key).reduce((sum,line)=>sum+wholesaleUnits(product,line),0)).toFixed(8));
  }
  const tier = tierForUnits(tierList,pricingQuantity);
  const originalUnitPrice = Number(tier?.price ?? combination?.price ?? materialVariant?.price ?? fixedVariant?.price ?? product.price);
  const unitPrice = promoPrice(product, originalUnitPrice);
  return { billed, units, wholesaleQuantity:pricingQuantity, total: units * unitPrice, unitPrice, originalUnitPrice, tier, discountApplied: unitPrice < originalUnitPrice };
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

function quantitySelectorHtml(unit = "Lembar") {
  if (/^lbr$/i.test(unit)) unit = "lembar";
  const min=minimumQuantity(selectedProduct());
  return `<div class="quantity-field"><span>Jumlah produk</span><div class="quantity-control"><div class="qty-stepper"><button type="button" data-product-minus aria-label="Kurangi jumlah produk">−</button><input id="quantity" type="number" min="${min}" step="1" value="${min}" aria-label="Jumlah produk"><button type="button" data-product-plus aria-label="Tambah jumlah produk">+</button></div><b>${escapeHtml(unit)}</b></div>${min>1?`<small class="minimum-help">Minimum pembelian ${min} ${escapeHtml(unit)}</small>`:""}<p class="minimum-error hidden" data-minimum-error role="status"></p></div>`;
}

function imageMeasurementHtml(product, includeQuantity = true) {
  const outdoor = supportsOutdoorAllowance(product);
  const width = `<label class="field"><span>Lebar gambar</span><span class="input-with-unit"><input id="image-width" type="number" min="0.01" step="any" value="${Number(product.widths[0] || 1) * 100}" required><b>cm</b></span></label>`;
  const length = '<label class="field"><span>Panjang gambar</span><span class="input-with-unit"><input id="image-length" type="number" min="0.01" step="any" value="100" required><b>cm</b></span></label>';
  const billed = '<div class="field billed-length-field"><span>Panjang ditagihkan</span><input id="billed-length" class="readonly-input" value="1 m" readonly aria-readonly="true"></div>';
  const material = `<div class="field material-width-field"><span>Lebar bahan</span><div class="chips" id="width-chips">${product.widths.map((width, index) => `<div class="chip"><input type="radio" name="width" id="w-${index}" value="${width}" ${index === 0 ? "checked" : ""}><label for="w-${index}">${width} m${supportsAutoRollWidth(product) ? `<small>${outdoorCapacity(product,width)} cm</small>` : ""}</label></div>`).join("")}</div></div>`;
  const rows = outdoor
    ? `<div class="measurement-row outdoor-width-row">${width}<label class="field allowance-field"><span>Lebihan / sisi</span><span class="input-with-unit"><input id="allowance" type="number" min="0" step="any" value="0" required aria-label="Lebihan per sisi"><b>cm</b></span></label>${material}</div><div class="measurement-row outdoor-length-row">${length}${billed}</div>`
    : `<div class="measurement-row image-dimension-row">${width}${length}${billed}</div><div class="measurement-row material-dimension-row">${material}</div>`;
  return `<div class="image-measurements${outdoor ? ' outdoor-measurements' : ''}">${rows}${includeQuantity ? quantitySelectorHtml() : ""}</div>`;
}

function posFinishingRowHtml(product, selected = null) {
  const finish = product.finishing.find(item => item.id === selected?.id);
  const options = `<option value="">Pilih finishing…</option>${product.finishing.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === finish?.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}`;
  return `<div class="finish-dropdown-row" data-finish-option="${escapeHtml(finish?.id || "")}"><div class="finish-dropdown-main"><select data-finish-select aria-label="Pilihan finishing">${options}</select>${finish ? `<input type="checkbox" id="f-${escapeHtml(finish.id)}" value="${escapeHtml(finish.id)}" checked hidden><small data-finishing-price="${escapeHtml(finish.id)}"></small><div class="qty-stepper" data-stepper="${escapeHtml(finish.id)}"><button type="button" data-minus="${escapeHtml(finish.id)}" ${finish.rule === "area" && !manualAreaFinishing(finish) ? "disabled" : ""}>−</button><input type="number" min="1" step="${manualAreaFinishing(finish) ? "0.1" : "1"}" data-finish-qty="${escapeHtml(finish.id)}" value="${Number(selected?.units || 1)}" aria-label="Jumlah ${escapeHtml(finish.name)}" ${finish.rule === "area" && !manualAreaFinishing(finish) ? "readonly" : ""}><button type="button" data-plus="${escapeHtml(finish.id)}" ${finish.rule === "area" && !manualAreaFinishing(finish) ? "disabled" : ""}>+</button></div><button type="button" class="finish-note-toggle" data-finish-note-toggle="${escapeHtml(finish.id)}">Catatan</button>` : ""}<button type="button" class="finish-remove" data-remove-finish aria-label="Hapus finishing">×</button></div>${finish ? `<div class="finish-note-row ${selected?.note ? "" : "hidden"}" data-finish-note-row="${escapeHtml(finish.id)}"><input type="text" data-finish-note="${escapeHtml(finish.id)}" value="${escapeHtml(selected?.note || "")}" placeholder="Catatan khusus ${escapeHtml(finish.name)}"></div>` : ""}</div>`;
}

function finishingHtml(product) {
  if (!product.finishing.length) return '<span class="note">Tidak ada finishing tambahan untuk bahan ini.</span>';
  return posFinishingRowHtml(product);
}

function bindFinishingDropdown(product) {
  const grid = document.querySelector("#finishing-grid");
  if (!grid) return;
  const syncOptions = () => {
    const selected = [...grid.querySelectorAll("[data-finish-select]")].map(select => select.value).filter(Boolean);
    grid.querySelectorAll("[data-finish-select]").forEach(select => [...select.options].forEach(option => { option.disabled = Boolean(option.value && option.value !== select.value && selected.includes(option.value)); }));
  };
  document.querySelector("#add-finishing")?.addEventListener("click", () => {
    const empty = grid.querySelector('[data-finish-option=""] select');
    if (empty) return empty.focus();
    if (grid.querySelectorAll("[data-finish-select]").length >= product.finishing.length) return;
    grid.insertAdjacentHTML("beforeend", posFinishingRowHtml(product)); syncOptions(); grid.lastElementChild.querySelector("select").focus();
  });
  grid.addEventListener("change", event => {
    const select = event.target.closest("[data-finish-select]");
    if (!select) return;
    const row = select.closest("[data-finish-option]");
    const duplicates = [...grid.querySelectorAll("[data-finish-select]")].filter(other => other !== select && other.value === select.value);
    if (select.value && duplicates.length) { select.value = row.dataset.finishOption; return; }
    row.outerHTML = posFinishingRowHtml(product, select.value ? { id: select.value } : null);
    if (select.value) toggleFinishing(document.getElementById(`f-${select.value}`));
    syncOptions(); updatePreview();
  });
  grid.addEventListener("input", updatePreview);
  grid.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    const row = button.closest("[data-finish-option]");
    if (button.hasAttribute("data-remove-finish")) { row.remove(); syncOptions(); updatePreview(); return; }
    if (button.hasAttribute("data-finish-note-toggle")) { const notes = row.querySelector(".finish-note-row"); notes.classList.toggle("hidden"); if (!notes.classList.contains("hidden")) notes.querySelector("input").focus(); return; }
    if (button.hasAttribute("data-minus") || button.hasAttribute("data-plus")) {
      const input = row.querySelector("[data-finish-qty]"); const step = Number(input.step || 1);
      input.value = Math.max(1, Number((Number(input.value || 1) + (button.hasAttribute("data-plus") ? step : -step)).toFixed(4))); updatePreview();
    }
  });
  syncOptions();
}

function fixedSizeMeasurementHtml(product) {
  const hasCustomSize = product.priceBasis !== "unit";
  const options = [
    ...(hasCustomSize ? [{ id: "custom", label: "Meteran", price: null }] : []),
    ...(product.fixedSizeVariants || [])
  ];
  const chips = options.map((variant, index) => `<div class="chip size-variant-chip"><input type="radio" name="size-variant" id="size-variant-${product.id}-${variant.id}" value="${variant.id}" ${index === 0 ? "checked" : ""}><label for="size-variant-${product.id}-${variant.id}"><strong>${escapeHtml(variant.label)}</strong>${variant.price ? `<small>${rupiah.format(variant.price)}</small>` : ""}</label></div>`).join("");
  const customFields = hasCustomSize ? `<div class="fixed-size-custom" data-size-custom>${imageMeasurementHtml(product, false)}</div>` : "";
  return `<div class="field full"><span>Pilih varian</span><div class="chips size-variant-options">${chips}</div></div>${customFields}${quantitySelectorHtml(product.groupedProduct ? product.unitName || "unit" : "Lembar")}`;
}

function choiceGroupsHtml(product) {
  return (product.choiceGroups || []).map((group) => `<div class="variant-choice-group"><span class="variant-label">${escapeHtml(group.label)}</span><div class="chips exclusive-choice-options">${(group.options || []).map((option, index) => `<div class="chip exclusive-choice"><input type="radio" name="choice-${group.id}" id="choice-${product.id}-${group.id}-${option.id}" value="${option.id}" ${index === 0 ? "checked" : ""}><label for="choice-${product.id}-${group.id}-${option.id}"><i aria-hidden="true"></i>${escapeHtml(option.label)}</label></div>`).join("")}</div><small>Hanya satu pilihan yang dapat dipilih.</small></div>`).join("");
}

function materialVariantOptionsHtml(product) {
  if (!product.hasMaterialVariants || !product.materialVariants?.length) return "";
  return `<div class="field full"><span>${escapeHtml(product.variantType || "Varian Bahan")} *</span><div class="chips">${availableVariants(product).map((variant, index) => `<div class="chip size-variant-chip"><input type="radio" name="material-variant" id="material-variant-${escapeHtml(product.id)}-${escapeHtml(variant.id)}" value="${escapeHtml(variant.id)}" ${index === 0 ? "checked" : ""}><label for="material-variant-${escapeHtml(product.id)}-${escapeHtml(variant.id)}"><strong>${escapeHtml(variant.label)}</strong>${variant.price != null ? `<small>${rupiah.format(variant.price)}</small>` : ""}</label></div>`).join("")}</div></div>`;
}

function subVariantOptionsHtml(product) {
  if (!product.hasMaterialVariants || !product.subVariants?.length) return "";
  return availableVariants(product).map((variant, variantIndex) => {
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
  const selectedOption = selected?.a3Family ? selected.a3Family : selected?.id ? selected.name : "";
  return `<div class="a3-kind-tabs" role="group" aria-label="Jenis bahan Print A3+">${[["paper", "Kertas"], ["sticker", "Sticker"], ["ready", "Produk Jadi"]].map(([id, label]) => `<button type="button" data-a3-kind="${id}" class="${kind === id ? "active" : ""}" aria-pressed="${kind === id}">${label}</button>`).join("")}</div>
    ${quickCards ? `<div class="a3-quick"><span>Sering dipilih</span><div class="a3-quick-list">${quickCards}</div></div>` : ""}
    <label class="field a3-picker"><span>Pilih bahan atau produk</span><select id="a3-product-select" ${kind === "ready" && !families.length ? "disabled" : ""}><option value="">${kind === "paper" ? "Pilih bahan kertas…" : kind === "sticker" ? "Pilih jenis sticker…" : families.length ? "Pilih produk jadi…" : "Belum ada produk jadi"}</option>${options}</select></label>
    ${kind === "ready" && !families.length ? '<div class="category-empty"><strong>Produk Jadi belum tersedia</strong><p>Produk dapat ditambahkan kemudian.</p></div>' : ""}
    ${selected ? `<button type="button" class="secondary a3-reconfigure" data-config-product="${escapeHtml(selected.id)}">Konfigurasi ${escapeHtml(selectedOption)}</button>` : ""}`;
}

function a3ConfigurationOptionsHtml(selected) {
  const curated = state.products.filter(item => item.active !== false && item.a3Kind === selected.a3Kind);
  const variants = selected?.a3Family ? [...new Set(curated.filter((item) => item.a3Family === selected.a3Family).map((item) => item.a3Variant))].sort((a, b) => a.localeCompare(b, "id", { numeric: true })) : [];
  const variantsHtml = variants.length > 1 ? `<div class="a3-field"><span>Varian bahan</span><div class="chips">${variants.map((variant) => `<button type="button" class="a3-option ${selected?.a3Variant === variant ? "active" : ""}" data-a3-variant="${escapeHtml(variant)}" aria-pressed="${selected?.a3Variant === variant}">${escapeHtml(variant)}</button>`).join("")}</div></div>` : "";
  const printModes = selected?.a3Family === "HVS" ? `<div class="a3-field"><span>Varian print</span><div class="chips">${[["BW", "Print BW"], ["Warna", "Print Warna"]].map(([mode, label]) => `<button type="button" class="a3-option ${selected.a3PrintMode === mode ? "active" : ""}" data-a3-print-mode="${mode}" aria-pressed="${selected.a3PrintMode === mode}">${label}</button>`).join("")}</div></div>` : "";
  const sides = selected?.a3Kind === "paper" ? `<div class="a3-field"><span>Sisi cetak</span><div class="chips">${["1S", "2S"].map((side) => {
    const option = curated.find((item) => item.a3Family === selected.a3Family && item.a3Variant === selected.a3Variant && item.a3PrintMode === selected.a3PrintMode && item.a3Side === side);
    return `<button type="button" class="a3-option ${selected.id === option?.id ? "active" : ""}" data-a3-side="${side}" aria-pressed="${selected.id === option?.id}" ${option ? "" : "disabled"}>Cetak ${side === "1S" ? "1 sisi" : "2 sisi"}${option ? ` · ${rupiah.format(option.price)}` : ""}</button>`;
  }).join("")}</div></div>` : selected?.a3Kind === "sticker" ? `<p class="a3-sticker-price">Sticker A3+ · ${rupiah.format(selected.price)}/lembar</p>` : "";
  return `${variantsHtml}${printModes}${sides}`;
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
    const line = (item.retailAtK || item.quickSale) && !item.hasMaterialVariants ? state.cart.find((entry) => entry.productId === item.id && plainRetailLine(entry)) : null;
    const control = line ? `<div class="atk-stepper" role="group" aria-label="Jumlah ${escapeHtml(item.name)}"><button type="button" data-flat-qty="-1" data-flat-product="${escapeHtml(item.id)}" aria-label="Kurangi ${escapeHtml(item.name)}" ${line.quantity<=minimumQuantity(item)?"disabled":""}>−</button><input type="text" inputmode="numeric" pattern="[0-9]*" data-flat-quantity="${escapeHtml(item.id)}" value="${line.quantity}" aria-label="Jumlah ${escapeHtml(item.name)}"><button type="button" data-flat-qty="1" data-flat-product="${escapeHtml(item.id)}" aria-label="Tambah ${escapeHtml(item.name)}">+</button></div>`
      : `<button type="button" class="atk-pick" data-flat-product="${escapeHtml(item.id)}"><b aria-hidden="true">+</b> Pilih</button>`;
    return `<div class="atk-row ${line ? "selected" : ""}"><button type="button" class="atk-name" data-flat-product="${escapeHtml(item.id)}">${escapeHtml(item.name)}${minimumQuantity(item)>1?`<small class="minimum-help">Minimum ${minimumQuantity(item)} ${escapeHtml(item.unitName || "pcs")}</small>`:""}</button><span class="atk-price">${rupiah.format(promoPrice(item, item.price))}</span>${control}</div>`;
  }).join("");
  return `<label class="field atk-search"><span>Cari produk ${escapeHtml(category)}</span><input id="flat-search" type="search" value="${escapeHtml(searchValue)}" placeholder="${isAtK ? "Nama, merek, warna, ukuran, atau barcode…" : "Cari nama atau ukuran produk…"}" autocomplete="off"></label>
    ${isAtK ? `<div class="atk-tabs" role="group" aria-label="Jenis produk ATK">${tabs}</div>` : ""}
    <div class="atk-count">${visible.length} produk${query ? " ditemukan" : ""}</div>
    <div class="atk-list ${["atk","akrilik"].includes(state.selectedCategory) ? "compact-retail-list" : ""}">${visible.length ? `<div class="atk-list-head"><span>Produk</span><span>Harga</span><span>Jumlah</span></div>${rows}` : '<p class="atk-empty">Produk tidak ditemukan. Coba kata lain atau pilih Semua.</p>'}</div>`;
}

function fileServicesHtml(product) {
  const selected = "DESIGN_A";
  const services = fileServices.filter(service => service.price > 0);
  const chip = service => `<div class="chip file-service-chip"><input type="radio" name="file-service" id="file-${service.id}" value="${service.id}" ${service.id === selected ? "checked" : ""}><label for="file-${service.id}"><strong>${service.name.replace(/^Biaya /, "")}</strong><small>${rupiah.format(service.price)}</small></label></div>`;
  const controls = service => `<div class="file-design-controls hidden" data-design-controls="${service.id}"><div class="file-design-actions"><button type="button" class="finish-note-toggle" data-design-note-toggle="${service.id}">Catatan</button><div class="qty-stepper"><button type="button" data-design-minus="${service.id}" aria-label="Kurangi jumlah ${service.name}">−</button><input data-design-qty="${service.id}" type="number" min="1" step="1" value="1" aria-label="Jumlah ${service.name}"><button type="button" data-design-plus="${service.id}" aria-label="Tambah jumlah ${service.name}">+</button></div></div><div class="finish-note-row hidden" data-design-note-row="${service.id}"><input data-design-note="${service.id}" maxlength="2000" value="" placeholder="Catatan ${service.name}" aria-label="Catatan ${service.name}"></div></div>`;
  const options = `<div id="design-options" class="config-design-options hidden"><div class="file-service-grid">${services.map(chip).join("")}</div>${services.map(controls).join("")}</div>`;
  return `<section class="design-service"><label class="design-toggle"><input id="design-enabled" type="checkbox" role="switch" aria-controls="design-options" aria-expanded="false" ><span class="design-switch" aria-hidden="true"></span><strong>Biaya Design</strong></label>${options}</section>`;
}

function templateOptionsHtml(product) {
  const sizes = (product.sizeVariants || []).map((size, index) => `<div class="chip"><input type="radio" name="template-size" id="size-${size.id}" value="${size.width}x${size.length}" ${index === 0 ? "checked" : ""}><label for="size-${size.id}">${escapeHtml(size.label)}</label></div>`).join("");
  const designs = (product.designTemplates || []).map((code, index) => `<div class="chip template-chip"><input type="radio" name="template-design" id="template-${code}" value="${code}" ${index === 0 ? "checked" : ""}><label for="template-${code}"><span class="template-thumb template-tone-${index % 5 + 1}" aria-hidden="true"><i>${code.split("-")[0]}</i></span><span><strong>${code}</strong><small>+ ${rupiah.format(product.templateDesignPrice || 35000)}</small></span></label></div>`).join("");
  return `<div class="template-variant-block"><span class="variant-label">A. Pilih Ukuran</span><div class="chips">${sizes}</div></div><div class="template-variant-block"><span class="variant-label">B. Pilih Design Template</span><div class="template-design-grid">${designs}</div></div>${quantitySelectorHtml()}<label class="field template-design-quantity"><span>Jumlah Design Template</span><input id="template-design-quantity" type="number" min="1" step="1" value="1"></label>`;
}

const catalogRocket = '<svg class="catalog-heading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 5c3-2 6-2 7-2 0 1 0 4-2 7l-6 6-5-5 6-6Z"/><circle cx="16" cy="8" r="1.5"/><path d="m8 11-4 1-2 4 6-1m5 1-1 4-4 2 1-6m-3 2-3 3"/></svg>';
function catalogCardHtml(product, promo = false) {
  return `<button type="button" class="catalog-card ${promo ? "promo-card" : ""}" data-config-product="${product.id}"><div class="catalog-card-title"><strong>${escapeHtml(product.name)}</strong></div><div class="catalog-price">${promo ? `<s>${rupiah.format(product.price)}</s><strong>${rupiah.format(promoPrice(product, product.price))}</strong><small>${escapeHtml(product.unitLabel)}</small><em>${escapeHtml(discountLabel(product))}</em>` : `<strong>${rupiah.format(product.price)}</strong><small>${escapeHtml(product.unitLabel)}</small>`}</div></button>`;
}

const homeCampaignUI=createHomeCampaignUI({state,root,api,e:escapeHtml,money:n=>rupiah.format(n),moneyField,bindMoneyInputs,parseMoney,toast,header:masterHeader,bindHeader:()=>{alignPageHeader(root);root.querySelectorAll('[data-master-tab]').forEach(b=>b.onclick=()=>{state.masterTab=b.dataset.masterTab;renderMaster();});},load,onProduct:openProductConfigurator,timeToInput:localDateTimeInput,timeToIso:makassarInputToIso});
function allCatalogHtml(){return `<div class="pos-home">${homeCampaignUI.homeHtml()}<section class="catalog-section"><div class="catalog-heading">${catalogRocket}<h3>Produk Terlaris</h3></div><div class="catalog-grid">${state.products.filter(p=>p.featured).map(p=>catalogCardHtml(p)).join('')}</div></section></div>`;}

function productConfigurationHtml(product) {
  if (product.dtfShirt) return dtfShirtConfigurationHtml(product);
  if (configurationEditingLine && plainRetailLine(configurationEditingLine) && (product.quickSale || product.retailAtK) && !product.hasMaterialVariants && !product.fixedSizeVariants?.length && !product.finishing.length) return `<div class="product-config">${configurationSection(1,"JUMLAH",quantitySelectorHtml(product.unitName || "pcs"))}${configurationNotes()}${configurationActions()}</div>`;
  if (supportsRollPlacement(product)) return rollConfigurationHtml(product, {escapeHtml, quantity:quantitySelectorHtml(), finishing:finishingHtml(product), files:fileServicesHtml(product), options:materialVariantOptionsHtml(product)+subVariantOptionsHtml(product)+choiceGroupsHtml(product)});
  const isUnit = product.priceBasis === "unit";
  const hasMaterialChoice = product.hasMaterialVariants && product.materialVariants?.length && !product.templateProduct && !product.fixedSizeVariants?.length;
  const unitQuantity = quantitySelectorHtml(product.unitName || "unit");
  const areaQuantity = quantitySelectorHtml();
  const measurement = product.templateProduct ? templateOptionsHtml(product) : product.fixedSizeVariants?.length
    ? fixedSizeMeasurementHtml(product) : isUnit ? hasMaterialChoice ? "" : unitQuantity : imageMeasurementHtml(product, !hasMaterialChoice);
  const measurementTitle = product.templateProduct ? "PILIHAN VARIAN" : "UKURAN & JUMLAH";
  const productNote = String(supportsOutdoorAllowance(product) ? String(product.note || "").replace(/Minimum\s+1\s*[×x]\s*1\s*m\.?\s*/gi, "") : product.note || "");
  const measurementContent = `${product.a3Kind ? a3ConfigurationOptionsHtml(product) : ""}${measurement}${materialVariantOptionsHtml(product)}${subVariantOptionsHtml(product)}${hasMaterialChoice ? isUnit ? unitQuantity : areaQuantity : ""}${choiceGroupsHtml(product)}${productNote ? `<p class="product-note" id="product-note">${escapeHtml(productNote)}</p>` : ""}`;
  let step = 1;
  const main = configurationSection(step++, measurementTitle, measurementContent + (product.sheetCalculatorEnabled ? sheetCalculatorHtml(product) : ''), {className:product.sheetCalculatorEnabled?'sheet-config-layout':''});
  const finishing = product.finishing.length ? configurationFinishing(step++, finishingHtml(product)) : "";
  const design = product.templateProduct || product.a3Kind === "ready" ? "" : configurationDesign(step++, fileServicesHtml(product));
  const content = `${main}${finishing}${design}${configurationNotes()}`;
  return `<div class="product-config">${content}${configurationActions()}</div>`;
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
  const packages = `<div class="dtf-packages" role="group" aria-label="Paket sablon">${product.dtfPackages.map((pack, index) => `<div class="chip"><input type="radio" name="dtf-package" id="dtf-package-${escapeHtml(pack.id)}" value="${escapeHtml(pack.id)}" ${index === 0 ? "checked" : ""}><label for="dtf-package-${escapeHtml(pack.id)}"><strong>${escapeHtml(pack.label)}</strong><small><span class="config-price">${rupiah.format(pack.price)}</span> / kaos</small></label></div>`).join("")}</div>`;
  const variants = `<div id="dtf-shirt-rows">${dtfShirtRowHtml(0)}</div><button id="add-shirt-row" type="button" class="secondary dtf-add-row">+ Tambah kombinasi warna/ukuran</button><p class="product-note">Ukuran XXL menambah Rp15.000 per kaos. Stok mengikuti kombinasi warna dan ukuran, bukan paket sablon.</p><div class="dtf-stock-feedback" data-dtf-stock-feedback hidden><span id="dtf-stock-feedback-message" data-dtf-stock-message role="status" aria-live="polite"></span><button type="button" class="text-button" data-dtf-stock-retry hidden>Cek ulang stok</button></div><p class="dtf-stock-help">Stok tersedia memperhitungkan pesanan aktif dan kaos di keranjang.</p>`;
  return `<div class="product-config">${configurationSection(1, "PILIH PAKET SABLON", packages)}${configurationSection(2, "WARNA, UKURAN & JUMLAH KAOS", variants)}${configurationNotes()}${configurationActions()}</div>`;
}

function renderPos() {
  state.cart = ensureCartIds(state.cart);
  let visibleProducts = productsForCategory(state.selectedCategory);
  if (!visibleProducts.some((product) => product.id === state.selectedProduct)) state.selectedProduct = null;
  const product = selectedProduct();
  if (product?.a3Kind) state.a3Kind = product.a3Kind;
  const categoryTabs = productCategories().map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.selectedCategory === id}" class="category-tab ${state.selectedCategory === id ? "active" : ""}" data-category="${id}">${escapeHtml(label)}</button>`).join("");
  const intro = `<p class="section-label">1 · ${state.selectedCategory === "display-banner" ? "Pilih produk" : "Pilih bahan"}</p>`;
  const productContent = state.selectedCategory === "all" ? allCatalogHtml() : state.selectedCategory === "print-a3" && visibleProducts.some((item) => item.a3Kind)
    ? a3CatalogHtml(visibleProducts, product) : ["atk", "akrilik", "stempel"].includes(state.selectedCategory)
    ? flatCatalogHtml(visibleProducts, productCategories().find(([id]) => id === state.selectedCategory)?.[1] || "ATK") : visibleProducts.length
    ? `${intro}<div class="product-grid">${productCardsHtml(visibleProducts)}</div>`
    : `<div class="category-empty"><div>＋</div><strong>Belum ada produk</strong><p>Produk untuk kategori ${escapeHtml(productCategories().find(([id]) => id === state.selectedCategory)?.[1] || "ini")} akan ditambahkan kemudian.</p></div>`;
  root.innerHTML = `<div class="view-grid pos-layout">
    <aside class="pos-categories" aria-label="Kategori produk"><div class="pos-category-heading"><strong>Kategori</strong>${canManageSettings() ? '<button class="category-settings-button" type="button" id="configure-category-tabs" aria-label="Atur urutan kategori" title="Atur urutan kategori">✎</button>' : ""}</div><button type="button" class="pos-category-toggle" aria-expanded="false" aria-controls="pos-category-list">Kategori: ${escapeHtml(productCategories().find(([id]) => id === state.selectedCategory)?.[1] || "Semua")} <span class="ui-chevron" aria-hidden="true"></span></button><div id="pos-category-list" class="category-tabs" role="tablist" aria-label="Kategori produk" aria-orientation="vertical">${categoryTabs}</div></aside>
    <section class="pos-workspace" aria-label="Pencarian dan katalog produk"><div class="pos-search-shell"><div class="pos-search-row"><span class="pos-search-icon" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5"/><path d="m12.5 12.5 4 4"/></svg></span><input id="product-search" type="search" placeholder="Cari nama produk..." aria-label="Cari nama produk di semua kategori" role="combobox" aria-autocomplete="list" aria-controls="pos-search-results" aria-expanded="false" autocomplete="off"><kbd>Ctrl K</kbd></div><div id="search-popover" class="search-popover" hidden><div id="pos-search-results" class="search-results" role="listbox" aria-label="Hasil pencarian produk"></div></div><span class="visually-hidden" data-search-status role="status" aria-live="polite"></span></div>${state.editingOrderId?'<p class="pos-editing-label">Edit Draft Pesanan</p>':''}<div class="panel pos-catalog-panel"><div class="panel-body"><div class="category-content">${productContent}</div></div></div></section>
    <aside><section class="panel sticky-summary"><div class="panel-head"><h2>Ringkasan Pesanan</h2><span>${state.cart.length} item</span></div><div class="panel-body"><div id="cart-list">${cartHtml()}</div>${checkoutHtml()}</div></section></aside>
  </div>`;
  bindPos();
  assistance.mountCheckout(state.cartCheck?.cart === state.cart && Date.now()-state.cartCheck.at < 5000 ? state.cartCheck.data : null);
  syncCartBusy();
  customersUI.mountCheckout();
  homeCampaignUI.mountHome();

}

function imageSizeNote(item) {
  if (item.sheetCalculation) return sheetSpecification(item.sheetCalculation);
  const size = item.imageWidthCm > 0 && item.imageLengthCm > 0 ? `Ukuran gambar: ${Number(item.imageWidthCm).toLocaleString("id-ID")} × ${Number(item.imageLengthCm).toLocaleString("id-ID")} cm${item.allowanceCm > 0 ? ` · Lebihan ${Number(item.allowanceCm).toLocaleString("id-ID")} cm/sisi · Ukuran akhir ${Number(item.finalImageWidthCm).toLocaleString("id-ID")} × ${Number(item.finalImageLengthCm).toLocaleString("id-ID")} cm` : ""}` : "";
  return [size,rollPlacementNote(item)].filter(Boolean).join(' · ');
}

function cartHtml() {
  if (!state.cart.length) return '<div class="cart-empty">Belum ada produk.<br><small>Data pelanggan dapat diisi terlebih dahulu.</small></div>';
  return state.cart.map((line, i) => {
    const product = state.products.find(item => item.id === line.productId);
    const retail = (product?.retailAtK || product?.quickSale) && plainRetailLine(line);
    const dimensions = line.imageWidthCm > 0 && line.imageLengthCm > 0 ? `Ukuran gambar: ${Number(line.imageWidthCm).toLocaleString("id-ID")} × ${Number(line.imageLengthCm).toLocaleString("id-ID")} cm${line.allowanceCm > 0 ? ` · Lebihan ${Number(line.allowanceCm).toLocaleString("id-ID")} cm/sisi` : ""}` : line.sheetCalculation ? sheetSpecification(line.sheetCalculation) : "";
    const design = line.fileServicePrice ? `${line.fileServiceName} × ${line.fileServiceQuantity || 1}${line.fileServiceNote ? ` · ${line.fileServiceNote}` : ""}` : line.templateDesign ? `Design Template ${line.templateDesign} × ${line.templateDesignQuantity || 1}` : "";
    return `<article class="cart-item" data-cart-row="${line.cartId}"><span class="cart-item-number" aria-hidden="true">${i + 1}</span><div class="cart-item-content"><div class="cart-item-heading"><h4><button class="cart-edit-button" type="button" aria-label="Edit ${escapeHtml(line.productName)}">${escapeHtml(line.productName)}</button></h4><strong>${rupiah.format(line.previewTotal)}</strong></div><p>${escapeHtml(line.displaySize || `${line.quantity} ${product?.unitName || "unit"}`)}</p>${dimensions ? `<p class="image-size-note">${escapeHtml(dimensions)}</p>` : ""}${design ? `<p>${escapeHtml(design)}</p>` : ""}${line.productionNote ? `<p class="cart-production-note">Catatan: ${escapeHtml(line.productionNote)}</p>` : ""}<div class="cart-item-footer"><div class="cart-item-detail">${retail ? "" : `<p>${escapeHtml(line.finishingNames || "Tanpa finishing tambahan")}</p>`}</div><button type="button" data-remove="${line.cartId}" aria-label="Hapus ${escapeHtml(line.productName)}">Hapus</button></div></div></article>`;
  }).join("");
}

function checkoutHtml() {
  const total = state.cart.reduce((sum, item) => sum + item.previewTotal, 0);
  return `<form id="checkout" class="order-form"><div class="form-grid checkout-customer">
    <div class="field full checkout-customer-name"><div class="customer-name-heading"><label for="checkout-customer-name">Nama pelanggan *</label>${can("customers.view")?'<button type="button" class="customer-search-trigger" data-choose-customer aria-haspopup="dialog">Cari Pelanggan</button>':""}</div><input id="checkout-customer-name" name="customerName" value="${escapeHtml(state.draft.customerName)}" required></div>
    <label class="field"><span>No. WhatsApp *</span><input name="phone" type="text" autocomplete="tel" required value="${escapeHtml(state.draft.phone)}"></label>
    ${checkoutDeadlineHtml(state.draft.deadline, escapeHtml)}
  </div><div class="checkout-footer">${can("customers.view")?'<div class="checkout-deposit-balance deposit-balance" data-customer-deposit hidden></div>':""}<div class="summary-row total"><span>Total</span><span>${rupiah.format(total)}</span></div><div class="checkout-actions"><button class="secondary full" type="submit" ${state.cart.length ? "" : "disabled"}>${state.editingOrderId ? "Simpan Perubahan Draft" : "Simpan Draft"}</button><button id="pay-order" class="primary full" type="button" ${state.cart.length ? "" : "disabled"}>Pembayaran</button>${state.editingOrderId ? '<button id="cancel-edit" class="secondary full" type="button">Batal Edit</button>' : ""}</div></div></form>`;
}

let cartQueue = Promise.resolve(), cartPending = 0, configurationEditingLine = null;
function syncCartBusy() {
  root.querySelectorAll('#checkout .checkout-actions button,[data-remove]').forEach(button => { button.disabled = cartPending > 0 || (!state.cart.length && button.id !== 'cancel-edit'); });
  root.querySelector('.sticky-summary')?.setAttribute('aria-busy', String(cartPending > 0));
}

function mutateCart(plan, { guard = () => true, afterCommit, blink = true } = {}) {
  const uid = state.currentUser?.id, orderId = state.editingOrderId;
  cartPending += 1; syncCartBusy();
  const task = cartQueue.then(async () => {
    if (state.currentUser?.id !== uid || state.editingOrderId !== orderId || !guard()) return false;
    const before = state.cart, proposal = plan(before);
    const quote = await api('/api/orders/check', { method:'POST', signal:AbortSignal.timeout(10000), body:JSON.stringify({ items:proposal, editingOrderId:orderId, includeItems:true }) });
    if (state.currentUser?.id !== uid || state.editingOrderId !== orderId || state.cart !== before || !guard()) return false;
    const dtfIds = new Set(proposal.filter(line => state.products.find(p=>p.id===line.productId)?.dtfShirt).flatMap(line => line.shirtVariants || []).map(v=>v.materialId).filter(Boolean));
    const shirtRows = quote.items.filter(line => state.products.find(p=>p.id===line.productId)?.dtfShirt).flatMap(line=>line.materials || []);
    shirtRows.forEach(row=>dtfIds.add(row.materialId));
    const shortage = quote.stock.shortages.find(row=>dtfIds.has(row.materialId));
    if (shortage) throw new Error(`Stok ${shortage.name} tidak cukup untuk jumlah pesanan ini`);
    const scroll = root.querySelector('.sticky-summary>.panel-body')?.scrollTop || 0;
    state.cart = quote.items.map((item,index) => ({ ...cartLineFromPricedItem({ ...item, itemId:proposal[index].itemId }), cartId:proposal[index].cartId }));
    state.cartCheck = { cart:state.cart, data:quote, at:Date.now() };
    afterCommit?.();
    if (state.view === 'pos') {
      renderPos();
      const body=root.querySelector('.sticky-summary>.panel-body');if(body)body.scrollTop=scroll;
      if (typeof blink === 'function' ? blink(before,state.cart) : blink) blinkCartTotal();
    }
    return true;
  }).finally(() => { cartPending -= 1; syncCartBusy(); });
  cartQueue = task.catch(() => {});
  return task;
}

async function openCartEditor(cartId) {
  await cartQueue;
  if (state.view !== 'pos') return;
  const line = state.cart.find(line => line.cartId === cartId);
  if (!line) return;
  if (!state.products.some(p=>p.id===line.productId)) return toast('Produk tidak tersedia untuk diedit', 'error');
  openProductConfigurator(line.productId, null, cartId);
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
  let width = isUnit ? 1 : product.templateProduct ? Number(templateSize?.[0]) : Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
  let geometry = null;
  if (!isUnit && !product.templateProduct) {
    const input = { imageWidthCm: Number(document.querySelector("#image-width")?.value), imageLengthCm: Number(document.querySelector("#image-length")?.value), allowanceCm: Number(document.querySelector("#allowance")?.value || 0) };
    try { geometry = imageGeometry(product,input); } catch { geometry = { ...input, billingLength: NaN }; }
  }
  let length = isUnit ? 1 : product.templateProduct ? Number(templateSize?.[1]) : geometry.billingLength;
  let rollPlacement = null, placementError = '';
  const old = configurationEditingLine;
  const legacyPlacement = !isUnit && supportsRollPlacement(product) && old?.productId === product.id && !old.rollPlacement
    && Number(document.querySelector('#quantity')?.value) === Number(old.quantity)
    && geometry?.imageWidthCm === Number(old.imageWidthCm ?? Number(old.width)*100)
    && geometry?.imageLengthCm === Number(old.imageLengthCm ?? Number(old.length)*100)
    && geometry?.allowanceCm === Number(old.allowanceCm || 0);
  if (legacyPlacement) { width=old.width; length=old.length; }
  if (!isUnit && supportsRollPlacement(product) && !legacyPlacement) {
    try { rollPlacement = selectRollPlacement(product,geometry); width = rollPlacement.nominalWidth; length = rollPlacement.actualLength; }
    catch(error) { placementError=error.message; }
  }
  const quantity = Math.max(1, Number(document.querySelector("#quantity")?.value || 1));
  const pricingContext={productId:product.id,materialVariantId,subVariantId,sizeVariantId:fixedVariant?.id || '',choices:(product.choiceGroups || []).map(group=>({groupId:group.id,optionId:document.querySelector(`input[name="choice-${group.id}"]:checked`)?.value || ''})).filter(c=>c.optionId)};
  const base = productBase(product, width, length, quantity, fixedVariant, materialVariant, combination, pricingContext);
  if (supportsRollPlacement(product)) base.total = Math.round(base.total);
  const fileService = product.templateProduct || !document.querySelector("#design-enabled")?.checked ? fileServices[0] : fileServices.find((service) => service.id === document.querySelector('input[name="file-service"]:checked')?.value) || fileServices[0];
  const fileServiceQuantity = fileService.price ? Math.max(1, Math.floor(Number(document.querySelector(`[data-design-qty="${fileService.id}"]`)?.value || 1))) : 1;
  const fileServiceNote = fileService.price ? document.querySelector(`[data-design-note="${fileService.id}"]`)?.value.trim() || "" : "";
  const templateDesign = product.templateProduct ? document.querySelector('input[name="template-design"]:checked')?.value || "" : "";
  const templateDesignQuantity = product.templateProduct ? Math.max(1, Number(document.querySelector("#template-design-quantity")?.value || 1)) : 0;
  const templateDesignTotal = product.templateProduct ? Number(product.templateDesignPrice || 35000) * templateDesignQuantity : 0;
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
    if (finish.rule === "area" && !manualAreaFinishing(finish) && quantityInput) quantityInput.value = units;
    const unitPrice = finishingPriceForUnits(finish, units);
    finishTotal += Math.round(units * unitPrice);
    const priceLabel = [...document.querySelectorAll("[data-finishing-price]")].find((label) => label.dataset.finishingPrice === finish.id);
    if (priceLabel) priceLabel.textContent = `${rupiah.format(unitPrice)}${({ area: " /m²", point: " /titik" }[finish.rule] || " /unit")}${unitPrice !== Number(finish.price) ? " · Grosir" : ""}`;
    return { id: finish.id, units, note: document.querySelector(`[data-finish-note="${finish.id}"]`)?.value.trim() || "" };
  });
  const choices = (product.choiceGroups || []).map((group) => ({ groupId: group.id, optionId: document.querySelector(`input[name="choice-${group.id}"]:checked`)?.value || "" }));
  const choiceLabels = choices.map((choice) => product.choiceGroups.find((group) => group.id === choice.groupId)?.options.find((option) => option.id === choice.optionId)?.label).filter(Boolean);
  return {
    productId: product.id, productName: product.name, sheetCalculation: sheetController?.snapshot() || null, width, length, billedLength: base.billed, templateDesign,
    ...(supportsRollPlacement(product) ? {rollPlacement, ...(legacyPlacement ? {legacyPlacement:true} : {rollCalculationVersion:1}), placementError} : {}),
    imageWidthCm: legacyPlacement ? old.imageWidthCm ?? null : !isUnit && !product.templateProduct ? Number(document.querySelector("#image-width")?.value) : null,
    imageLengthCm: legacyPlacement ? old.imageLengthCm ?? null : geometry?.imageLengthCm ?? null,
    allowanceCm: geometry?.allowanceCm ?? 0, finalImageWidthCm: geometry?.finalImageWidthCm ?? null, finalImageLengthCm: geometry?.finalImageLengthCm ?? null,
    sizeVariantId: fixedVariant?.id || "", sizeVariantLabel: fixedVariant?.label || "", materialVariantId: materialVariant?.id || "", materialVariantLabel: materialVariant?.label || "", subVariantId: subVariant?.id || "", subVariantLabel: subVariant?.label || "", choices,
    baseTotal: base.total, templateDesignTotal, ...(product.templateProduct ? {templateDesignQuantity} : {}),
    fileServiceId: fileService.id, fileServiceName: fileService.name, fileServicePrice: fileService.price, fileServiceQuantity, fileServiceNote,
    quantity, wholesaleQuantity:base.wholesaleQuantity, unitPrice: base.unitPrice, originalUnitPrice: base.originalUnitPrice, discountApplied: base.discountApplied, finishing,
    finishingNames: finishing.map((f) => {
      const finish = product.finishing.find((x) => x.id === f.id);
      return `${finish?.name} × ${f.units}${f.note ? ` (${f.note})` : ""}`;
    }).join(", "),
    displaySize: `${isFixedSize ? `${fixedVariant.label} · ${quantity} ${product.groupedProduct ? product.unitName || "unit" : "Lembar"}` : isUnit ? `${quantity} ${product.unitName || "unit"}` : `${width} × ${base.billed} m · ${quantity} Lembar${templateDesign ? ` · ${templateDesign}` : ""}`}${materialVariant ? ` · ${materialVariant.label}` : ""}${subVariant ? ` · ${subVariant.label}` : ""}${choiceLabels.length ? ` · ${choiceLabels.join(" · ")}` : ""}`,
    productionNote: document.querySelector("#production-note")?.value.trim() || "",
    previewTotal: base.total + finishTotal + fileService.price * fileServiceQuantity + templateDesignTotal
  };
}

function updatePreview() {
  sheetController?.sync();
  const line = readCurrentLine();
  const product = selectedProduct();
  if (product?.dtfShirt) {
    document.querySelector("#item-price").textContent = rupiah.format(Number.isFinite(line.previewTotal) ? line.previewTotal : 0);
    document.querySelector("#formula-text").textContent = `${line.quantity} kaos · ${line.shirtVariants.filter((item) => item.size === "XXL").reduce((sum, item) => sum + item.quantity, 0)} XXL`;
    shirtStockController?.sync();
    return;
  }
  const fixedVariant = product.fixedSizeVariants?.find(item => item.id === line.sizeVariantId);
  if (supportsRollPlacement(product)) syncRollConfigurator(document.querySelector('#order-detail'),product,line);
  const quantityInput=document.querySelector('#quantity'), minimumMessage=minimumError(product,quantityInput?.value ?? line.quantity);
  const minimumTarget=document.querySelector('[data-minimum-error]');
  if(minimumTarget){minimumTarget.textContent=minimumMessage;minimumTarget.classList.toggle('hidden',!minimumMessage);}
  if(quantityInput){quantityInput.setCustomValidity(minimumMessage);document.querySelector('[data-product-minus]')?.toggleAttribute('disabled',Number(quantityInput.value)<=minimumQuantity(product));}
  if(!supportsRollPlacement(product))document.querySelector('#add-item').disabled=Boolean(minimumMessage);
  else if(minimumMessage)document.querySelector('#add-item').disabled=true;
  const materialVariant = product.materialVariants?.find(item => item.id === line.materialVariantId);
  const combination = materialVariant?.combinations?.find(item => item.subVariantId === line.subVariantId);
  updateWholesalePrices({ scope: document.querySelector('#order-detail'), product, line, fixedVariant, materialVariant, combination });
  const finalSize = document.querySelector("#final-image-size");
  if (finalSize) finalSize.textContent = Number.isFinite(line.finalImageWidthCm) ? `Ukuran termasuk lebihan: ${line.finalImageWidthCm.toLocaleString("id-ID")} × ${line.finalImageLengthCm.toLocaleString("id-ID")} cm${line.allowanceCm > 0 && line.allowanceCm <= 5 ? " · Lebihan tidak menambah panjang tagihan" : ""}` : "";
  const billedInput = document.querySelector("#billed-length");
  if (billedInput) billedInput.value = `${line.billedLength} m`;
  document.querySelector("#item-price").textContent = line.placementError ? '—' : rupiah.format(line.previewTotal);
  document.querySelector("#formula-text").textContent = line.sizeVariantId
    ? `${line.sizeVariantLabel} × ${line.quantity} ${product.groupedProduct ? product.unitName || "unit" : "Lembar"} · ${rupiah.format(line.unitPrice)}/${product.groupedProduct ? product.unitName || "unit" : "lembar"}`
    : product.priceBasis === "unit"
    ? `${line.quantity} ${product.unitName || "unit"}${line.originalUnitPrice !== product.price ? ` · Grosir ${rupiah.format(line.originalUnitPrice)}` : ""}${line.discountApplied ? ` · Promo ${rupiah.format(line.unitPrice)}` : ""}`
    : `${line.width} m × ${line.billedLength} m × ${line.quantity}${line.templateDesign ? ` · ${line.templateDesign} + ${rupiah.format(line.templateDesignTotal)}` : ""}${line.fileServicePrice ? ` · ${line.fileServiceName} × ${line.fileServiceQuantity || 1}` : ""}${line.originalUnitPrice !== product.price ? ` · Grosir ${rupiah.format(line.originalUnitPrice)}` : ""}${line.discountApplied ? ` · Promo ${rupiah.format(line.unitPrice)}` : ""}`;
  if (supportsRollPlacement(product) && !line.sizeVariantId) document.querySelector('#formula-text').textContent = `${line.quantity} Lembar · Perhitungan otomatis`;
}

function syncFixedSizeUi() {
  const selected = document.querySelector('input[name="size-variant"]:checked')?.value || "custom";
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
    const length = product.templateProduct ? Number(templateSize?.[1]) : billedLength(Number(document.querySelector("#image-length")?.value || 100) / 100, product.billingIncrement);
    const quantity = Math.max(1, Number(document.querySelector("#quantity")?.value || 1));
    const suggested = manualLfCutting(finish) ? 1 : finish.rule === "area"
      ? (fixedVariant ? Number(fixedVariant.area || 1) * quantity : product.priceBasis === "unit" ? Number(product.areaPerUnit || 1) * quantity : Number(width) * Number(length) * quantity)
      : finish.id === "fin-a3-card-rounded" ? 1 : suggestedFinishUnits(finish, width, length);
    document.querySelector(`[data-finish-qty="${finish.id}"]`).value = manualAreaFinishing(finish) ? Math.max(1, Number(suggested.toFixed?.(4) ?? suggested)) : Number(suggested.toFixed?.(4) ?? suggested);
  }
  updatePreview();
}

function syncDraft(form) {
  const values = Object.fromEntries(new FormData(form));
  state.draft = { ...state.draft, customerName: values.customerName || "", phone: values.phone || "", deadline: values.deadline || "", fileStatus: values.fileStatus || "SIAP_CETAK", fileReadiness: values.fileReadiness || state.draft.fileReadiness || "UNCONFIRMED" };
}

function selectSearchProduct(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  syncDraft(document.querySelector("#checkout"));
  state.selectedProduct = product.id;
  state.selectedCategory = categoryKey(product);
  renderPos();
  openProductConfigurator(product.id);
  if (dialog.open) {
    const identity = state.currentUser?.id;
    dialog.addEventListener('close', () => {
      if (!dialog.open && state.view === 'pos' && state.currentUser?.id === identity && window.matchMedia('(pointer:fine)').matches) {
        root.querySelector('#product-search')?.focus({ preventScroll: true });
      }
    }, { once: true });
  }
}

function bindProductSearch() {
  productSearchCleanup?.();
  productSearchCleanup = mountPosSearch({
    root, products: state.products, escapeHtml,
    price: product => rupiah.format(promoPrice(product, product.price)),
    onSelect: selectSearchProduct
  });
}

function bindProductConfiguration(onAdd, sheetSaved = null) {
  document.querySelectorAll('.configurator-body .chip:has(input[type="radio"])>label,.configurator-body .a3-option').forEach(chip => {
    if(chip.querySelector('.radio-chip-copy'))return;
    const copy=document.createElement('span');copy.className='radio-chip-copy';
    copy.append(...chip.childNodes);chip.append(copy);
  });
  document.querySelectorAll('.configurator-body .a3-field .chips').forEach(group => {
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', group.previousElementSibling.textContent);
    const buttons = [...group.querySelectorAll('button[aria-pressed]')];
    buttons.forEach(button => { button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', button.getAttribute('aria-pressed')); });
    group.addEventListener('keydown', event => {
      if (!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key)) return;
      const choices = buttons.filter(button => !button.disabled), index = choices.indexOf(document.activeElement);
      if(index<0) return;
      event.preventDefault();
      const next=choices[(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+choices.length)%choices.length];
      const attribute=[...next.attributes].find(attr=>attr.name.startsWith('data-a3-'));
      next.click();
      if(attribute)document.querySelector(`.configurator-body [${attribute.name}="${CSS.escape(attribute.value)}"]`)?.focus();
    });
  });
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
    shirtStockController = bindShirtStockSelection({ scope: document.querySelector('#order-detail'), productId: selectedProduct().id,
      getStock: () => state.shirtStock, setStock: stock => { state.shirtStock = stock; }, getCart: () => state.cart.filter(line => line.cartId !== configurationEditingLine?.cartId),
      readLine: readCurrentLine, api, onAdd, toast, minimum:minimumQuantity(selectedProduct()) });
    return;
  }
  document.querySelectorAll("#image-width,#allowance").forEach(input => input.addEventListener("input", () => {
    const product = selectedProduct(); if (!supportsAutoRollWidth(product) || supportsRollPlacement(product)) return;
    const width = suggestedOutdoorWidth(product,document.querySelector("#image-width").value,document.querySelector("#allowance")?.value || 0);
    const radio = document.querySelector(`input[name="width"][value="${width}"]`); if (radio) radio.checked = true;
    updatePreview();
  }));
  document.querySelectorAll('#image-width,#image-length,#allowance,#quantity,input[name="width"],input[name="size-variant"],input[name="material-variant"],input[name="sub-variant"],input[name^="choice-"],input[name="template-size"],input[name="template-design"],input[name="file-service"],#template-design-quantity,[data-finish-qty]').forEach((input) => {
    input.addEventListener("input", updatePreview); input.addEventListener("change", updatePreview);
  });
  bindFinishingDropdown(selectedProduct());
  document.querySelectorAll("[data-product-minus],[data-product-plus]").forEach(button => button.onclick = () => { const input = document.querySelector("#quantity"); input.value = Math.max(minimumQuantity(selectedProduct()), Math.floor(Number(input.value) || minimumQuantity(selectedProduct())) + (button.hasAttribute("data-product-plus") ? 1 : -1)); updatePreview(); });
  document.querySelectorAll('input[name="size-variant"]').forEach((input) => input.addEventListener("change", syncFixedSizeUi));
  document.querySelectorAll('input[name="material-variant"]').forEach((input) => input.addEventListener("change", syncMaterialVariantUi));
  syncFixedSizeUi();
  syncMaterialVariantUi();
  sheetController = bindSheetCalculator({ scope: document.querySelector("#order-detail"), product: selectedProduct(), profiles: state.catalogOptions.sheetCalculatorProfiles, update: updatePreview, saved: sheetSaved });
  const syncDesignControls = () => {
    const toggle = document.querySelector("#design-enabled");
    const active = Boolean(toggle?.checked);
    toggle?.setAttribute("aria-expanded", String(active));
    document.querySelector("#design-options")?.classList.toggle("hidden", !active);
    const selected = document.querySelector('input[name="file-service"]:checked')?.value;
    if (!selected) return;
    document.querySelectorAll("[data-design-controls]").forEach((control) => control.classList.toggle("hidden", !active || control.dataset.designControls !== selected));
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
  document.querySelector("#design-enabled")?.addEventListener("change", syncDesignControls);
  syncDesignControls();
  let submitting = false;
  document.querySelector("#add-item")?.addEventListener("click", async event => {
    if (submitting) return;
    const calculationError = sheetController?.validate();
    if (calculationError) return toast(calculationError, "error");
    const line = readCurrentLine();
    if (line.placementError) return toast(line.placementError,"error");
    const minIssue=minimumError(selectedProduct(),document.querySelector("#quantity")?.value ?? line.quantity);if(minIssue)return toast(minIssue,"error");
    const controls = [...document.querySelectorAll(".configurator-body input:not([hidden])")].filter(input => !input.closest(".hidden"));
    if (controls.some(input => !input.reportValidity())) return;
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.previewTotal)) return toast("Jumlah produk atau ukuran tidak valid", "error");
    submitting=true; const addButton=event.currentTarget;addButton.disabled=true;
    try { await onAdd(line); } finally { submitting=false; if(dialog.open && addButton.isConnected) {addButton.disabled=false;updatePreview();} }
  });
}

const configurationDrafts = new Map();
let sheetController = null;
let shirtStockController = null;
let configurationNotesCleanup = null;
function blinkCartTotal() {
  const total = document.querySelector(".summary-row.total");
  if (!total) return;
  total.classList.remove("total-added"); void total.offsetWidth; total.classList.add("total-added");
  total.addEventListener("animationend", () => total.classList.remove("total-added"), { once: true });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setTimeout(() => total.classList.remove("total-added"), 600);
}
function openProductConfigurator(productId, carryDraft = null, editCartId = null) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  if (product.hasMaterialVariants && !availableVariants(product).length) return toast("Belum ada varian produk yang tersedia", "error");
  if (!dialog.open) syncDraft(document.querySelector("#checkout"));
  configurationEditingLine = editCartId ? state.cart.find(line=>line.cartId===editCartId) : null;
  const editingLine=configurationEditingLine, token={active:true};
  state.selectedProduct = product.id;
  sheetController = null;
  shirtStockController = null;
  configurationNotesCleanup?.(); configurationNotesCleanup = null;
  dialog.classList.add("configurator-dialog", "product-config-dialog");
  dialog.classList.toggle("automatic-roll-dialog",supportsRollPlacement(product));
  dialog.classList.toggle("outdoor-roll-dialog",supportsOutdoorPlacement(product));
  const detail = document.querySelector("#order-detail");
  const capture = () => ({
    line: readCurrentLine(),
    fields: [...detail.querySelectorAll("input,textarea,select")].map(input => {
      const attribute = [...input.attributes].find(attr => ["data-design-qty", "data-design-note", "data-finish-qty", "data-finish-note"].includes(attr.name));
      return { id: input.id, attribute: attribute?.name, key: attribute?.value, value: input.value, checked: input.checked };
    }).filter(field => field.id || field.attribute),
    sheetDraft: sheetController?.capture(),
    notesOpen: Boolean(detail.querySelector(".production-note-details")?.open)
  });
  detail.innerHTML = `<div class="detail-head configurator-head"><div><span class="product-category">${escapeHtml(product.category)}</span><h2>${escapeHtml(product.name)}</h2><p>${discountActive(product) ? `<span class="discount-badge">DISKON</span> ${escapeHtml(discountLabel(product))}` : `${rupiah.format(product.price)} ${escapeHtml(product.unitLabel)}`}</p></div><button class="detail-close" aria-label="Tutup konfigurasi">×</button></div><div class="detail-body configurator-body">${productConfigurationHtml(product)}</div>`;
  const saved = carryDraft || (editingLine ? {line:editingLine,fields:[],sheetDraft:cartSheetDraft(editingLine)} : configurationDrafts.get(product.id));
  if (saved) {
    if (product.dtfShirt) {
      detail.querySelector("#dtf-shirt-rows").innerHTML = saved.line.shirtVariants.map((variant, index) => dtfShirtRowHtml(index)).join("");
      detail.querySelectorAll("[data-shirt-row]").forEach((row, index) => { const variant = saved.line.shirtVariants[index]; row.querySelector("[data-shirt-color]").value = variant.color; row.querySelector("[data-shirt-size]").value = variant.size; row.querySelector("[data-shirt-quantity]").value = variant.quantity; });
      detail.querySelectorAll('input[name="dtf-package"]').forEach(input => { input.checked = input.value === saved.line.dtfPackageId; });
    } else if (detail.querySelector("#finishing-grid")) {
      detail.querySelector("#finishing-grid").innerHTML = saved.line.finishing.filter(finish => product.finishing.some(item => item.id === finish.id)).map(finish => posFinishingRowHtml(product, finish)).join("") || finishingHtml(product);
    }
    if(editingLine && !carryDraft) restoreCartEditor(detail,editingLine);
    (saved.fields || []).forEach(field => {
      const input = field.id ? document.getElementById(field.id) : detail.querySelector(`[${field.attribute}="${CSS.escape(field.key)}"]`);
      if (input && detail.contains(input)) { input.value = field.value; if (["checkbox", "radio"].includes(input.type)) input.checked = field.checked; }
    });
    detail.querySelectorAll("[data-design-note]").forEach(input => { if (input.value) input.closest(".finish-note-row").classList.remove("hidden"); });
    if (detail.querySelector(".production-note-details")) detail.querySelector(".production-note-details").open = saved.notesOpen;
  }
  const close = () => { token.active=false; if(!editCartId) configurationDrafts.set(product.id, capture()); dialog.close(); detail.replaceChildren(); };
  detail.querySelector(".detail-close").onclick = close;
  dialog.oncancel = event => { event.preventDefault(); close(); };
  let outsideDown = false;
  dialog.onpointerdown = event => { const rect = dialog.getBoundingClientRect(); outsideDown = event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom); };
  dialog.onclick = event => { const rect = dialog.getBoundingClientRect(); if (outsideDown && event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close(); outsideDown = false; };
  dialog.onclose = () => { if (dialog.open) return; configurationNotesCleanup?.(); configurationNotesCleanup = null; sheetController = null; shirtStockController = null; configurationEditingLine = null; dialog.classList.remove("configurator-dialog","automatic-roll-dialog","outdoor-roll-dialog","product-config-dialog"); dialog.onclose = dialog.oncancel = dialog.onclick = dialog.onpointerdown = null; };
  if(product.dtfShirt && !saved)detail.querySelector('[data-shirt-quantity]').value=minimumQuantity(product);
  if (!dialog.open) dialog.showModal();
  bindProductConfiguration(async line => {
    const body=detail.querySelector('.configurator-body');body.inert=true;
    try {
      const changed = await mutateCart(cart => editCartId ? editCartLine(cart,editCartId,line) : addCartLine(cart,line,product), {
        guard:()=>token.active && dialog.open && detail.contains(body),
        afterCommit:()=>{token.active=false;configurationDrafts.delete(product.id);if(product.a3Family)state.products.filter(p=>p.a3Family===product.a3Family&&p.a3Kind===product.a3Kind).forEach(p=>configurationDrafts.delete(p.id));if(needsFile(line,product))state.draft.fileReadiness='UNCONFIRMED';dialog.close();detail.replaceChildren();}
      });
      if(changed){toast(editCartId?'Perubahan produk disimpan':'Produk ditambahkan');if(editCartId)root.querySelector(`[data-cart-row="${CSS.escape(editCartId)}"] .cart-edit-button`)?.focus({preventScroll:true});}
    } catch(error) { if(token.active)toast(error.message,'error'); }
    finally { if(body.isConnected)body.inert=false; }
  }, saved?.sheetDraft);
  if(editCartId) detail.querySelector('#add-item').textContent='Simpan Perubahan';

  configurationNotesCleanup = bindConfigurationNotes(detail);
  const switchA3 = next => { if (next) { const draft = capture(); configurationDrafts.set(product.id, draft); openProductConfigurator(next.id, draft, editCartId); } };
  detail.querySelectorAll("[data-a3-variant],[data-a3-print-mode],[data-a3-side]").forEach(button => button.onclick = () => {
    const variants = state.products.filter(item => item.active !== false && item.a3Family === product.a3Family && item.a3Kind === product.a3Kind);
    const desired = { a3Variant: button.dataset.a3Variant || product.a3Variant, a3PrintMode: button.dataset.a3PrintMode || product.a3PrintMode, a3Side: button.dataset.a3Side || product.a3Side };
    switchA3(variants.find(item => Object.entries(desired).every(([key,value]) => item[key] === value)));
  });
  updatePreview();
}

function bindPos() {
  bindProductSearch();
  const tabs = document.querySelector(".category-tabs");
  tabs.addEventListener("keydown", event => {
    const buttons = [...tabs.querySelectorAll('[data-category]')], index = buttons.indexOf(document.activeElement);
    if (index < 0 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
  });
  document.querySelector('.pos-category-toggle').onclick = event => {
    const button = event.currentTarget, open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    button.closest('.pos-categories').classList.toggle('categories-open', open);
  };
  document.querySelector("#configure-category-tabs")?.addEventListener("click", openCategoryOrderForm);
  const setFlatQuantity = async (productId, change, absolute = false) => {
    const product = state.products.find(item=>item.id===productId && categoryKey(item)===state.selectedCategory && item.active!==false);
    if(!product)return;
    if(product.hasMaterialVariants || (!product.retailAtK && !product.quickSale))return openProductConfigurator(productId);
    syncDraft(document.querySelector('#checkout'));
    try {
      await mutateCart(cart=>{
        const existing=cart.find(line=>line.productId===productId&&plainRetailLine(line));
        const quantity=absolute?change:existing?Math.max(minimumQuantity(product),Number(existing.quantity)+change):change>0?minimumQuantity(product):0;
        if(!Number.isSafeInteger(quantity)||quantity<0)throw new Error('Jumlah harus bilangan bulat nol atau lebih');
        if(!quantity)return cart.filter(line=>line!==existing);
        const line={productId,productName:product.name,width:1,length:1,quantity,fileServiceId:'READY',finishing:[],productionNote:''};
        return existing?editCartLine(cart,existing.cartId,line):addCartLine(cart,line,product);
      },{blink:(before,after)=>Number(after.find(l=>l.productId===productId&&plainRetailLine(l))?.quantity || 0)>Number(before.find(l=>l.productId===productId&&plainRetailLine(l))?.quantity || 0)});
      if(state.atkSearch || state.directSearch[product.category])document.querySelector('#flat-search')?.focus();
    }catch(error){if(state.view==='pos')renderPos();toast(error.message,'error');}
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
      const dirty = input.value !== input.defaultValue;
      const next = Math.max(0, Number(input.value) + Number(button.dataset.flatQty));
      input.value = String(next); input.defaultValue = String(next);
      setFlatQuantity(button.dataset.flatProduct, dirty ? next : Number(button.dataset.flatQty), dirty);
    });
  });
  document.querySelectorAll("[data-flat-quantity]").forEach((input) => {
    input.addEventListener("focus", () => input.select());
    input.addEventListener("change", () => {
      if (!/^\d+$/.test(input.value.trim()) || !Number.isSafeInteger(Number(input.value))) {
        input.value = state.cart.find((line) => line.productId === input.dataset.flatQuantity && plainRetailLine(line))?.quantity || 1;
        return toast("Jumlah harus bilangan bulat nol atau lebih", "error");
      }
      setFlatQuantity(input.dataset.flatQuantity, Number(input.value), true);
    });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); input.blur(); } });
  });
  document.querySelectorAll(".atk-pick,.atk-name").forEach((button) => button.addEventListener("click", () => setFlatQuantity(button.dataset.flatProduct, state.cart.some((line) => line.productId === button.dataset.flatProduct && plainRetailLine(line)) ? 0 : 1, true)));
  const selectA3Family = (family) => {
    const candidates = state.products.filter((item) => item.active !== false && item.a3Kind === state.a3Kind && item.a3Family === family);
    state.selectedProduct = (candidates.find((item) => item.a3PrintMode === "BW" && item.a3Side === "1S")
      || candidates.find((item) => item.a3Side === "1S") || candidates[0])?.id || null;
    renderPos();
    if (state.selectedProduct) openProductConfigurator(state.selectedProduct);
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
    if (state.selectedProduct) openProductConfigurator(state.selectedProduct);
  });
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
      openProductConfigurator(label.dataset.selectProduct);
    };
    label.addEventListener("click", (event) => { event.preventDefault(); select(); });
    label.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(); } });
  });
  document.querySelectorAll('[data-cart-row]').forEach(row=>row.addEventListener('click',event=>{if(!event.target.closest('[data-remove]'))openCartEditor(row.dataset.cartRow);}));
  document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=async event=>{
    event.stopPropagation();syncDraft(document.querySelector('#checkout'));
    try{await mutateCart(cart=>cart.filter(line=>line.cartId!==button.dataset.remove),{blink:false});}catch(error){toast(error.message,'error');}
  });

  const checkout = document.querySelector("#checkout");
  bindCheckoutDeadline(checkout);
  checkout.addEventListener("input", () => syncDraft(checkout));
  checkout.addEventListener("change", () => syncDraft(checkout));
  const createRequestId = crypto.randomUUID();
  let savingOrder = false;
  async function savePosOrder(openPayment = false) {
    if (savingOrder || cartPending) return; savingOrder = true;
    syncDraft(checkout);
    try {
      state.draft.phone = requiredPhone(state.draft.phone);
      const payload = { ...state.draft, requestId: createRequestId, confirmed: openPayment, items: state.cart };
      const order = await customersUI.saveCheckout(payload => state.editingOrderId
        ? api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) })
        : api("/api/orders", { method: "POST", body: JSON.stringify(payload) }),payload);
      if(!order)return;
      state.cart = []; configurationDrafts.clear(); state.editingOrderId = null;
      state.draft = { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK", fileReadiness: "UNCONFIRMED" };
      await load(); toast(`${order.code} berhasil disimpan`);
      state.view = openPayment || !can("orders.view") ? "pos" : "order-history"; render();
      if (openPayment) openPaymentDialog(order);
    } catch (error) { toast(error.message, "error"); } finally { savingOrder = false; }
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
    state.cart = []; configurationDrafts.clear(); state.editingOrderId = null;
    state.draft = { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK" };
    renderPos();
  });
}

function paymentStatus(order) {
  if(cancelled(order))return "DIBATALKAN";
  if (settledOrder(order)) return "LUNAS";
  return "BELUM_LUNAS";
}

function renderProjects() {
  const statuses = PROJECT_STAGES.map(([status]) => status);
  root.innerHTML = `<section class="panel project-panel project-board project-single-category"><div class="project-toolbar">
    <div class="project-toolbar-main"><h2 class="project-toolbar-title">Project Management</h2>
    <div class="project-controls"><label class="project-search-field"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="project-search" class="search" aria-label="Cari customer atau produk" value="${escapeHtml(state.projectSearch)}" placeholder="Cari pesanan…"></label>
    <div class="project-dropdowns"><select id="project-status" class="project-filter" aria-label="Filter status"><option value="all">Semua Status</option>${PROJECT_STAGES.map(([status, label]) => `<option value="${status}" ${state.projectStatus === status ? "selected" : ""}>${label}</option>`).join("")}</select>
    <select id="project-deadline-sort" class="project-filter" aria-label="Urutkan deadline"><option value="nearest" ${state.projectDeadlineSort === "nearest" ? "selected" : ""}>Deadline terdekat</option><option value="farthest" ${state.projectDeadlineSort === "farthest" ? "selected" : ""}>Deadline terjauh</option></select></div>
    <div class="project-view-toggle" role="group" aria-label="Tampilan Project Management"><button type="button" data-project-view="list" aria-pressed="${state.projectView === "list"}" class="${state.projectView === "list" ? "active" : ""}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 6h14M7 12h14M7 18h14M3 6h1M3 12h1M3 18h1"/></svg>List View</button><button type="button" data-project-view="kanban" aria-pressed="${state.projectView === "kanban"}" class="${state.projectView === "kanban" ? "active" : ""}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M15 4v16"/></svg>Kanban</button></div></div></div>
    </div><div id="project-content"></div></section>`;
  const refresh = () => renderProjectContent(statuses);
  document.querySelectorAll("[data-project-view]").forEach(button => button.onclick = () => { state.projectView = button.dataset.projectView; renderProjects(); });
  document.querySelector("#project-status").addEventListener("change", event => { state.projectStatus = event.target.value; refresh(); });
  document.querySelector("#project-deadline-sort").addEventListener("change", event => { state.projectDeadlineSort = event.target.value; refresh(); });
  document.querySelector("#project-search").addEventListener("input", event => { state.projectSearch = event.target.value; refresh(); });
  refresh();
}

let projectRefreshPending = false;
function canRefreshProjects() {
  return Boolean(state.currentUser && state.view === "projects" && document.visibilityState === "visible"
    && !document.querySelector("dialog[open]") && !root.querySelector("select:disabled")
    && !(root.contains(document.activeElement) && document.activeElement.matches("input, select, textarea, [contenteditable]")));
}
async function refreshProjectData() {
  if (projectRefreshPending || !canRefreshProjects()) return;
  const user = state.currentUser;
  projectRefreshPending = true;
  try {
    const data = await api("/api/bootstrap?view=projects");
    if (state.view !== "projects") return;
    if (state.currentUser !== user || !canRefreshProjects()) return;
    const permissionsChanged = JSON.stringify(state.permissions) !== JSON.stringify(data.permissions);
    const focused = document.activeElement;
    const focusedItem = focused?.dataset.projectRowItem;
    const focusedGroup = focused?.dataset.projectGroup;
    Object.assign(state, data);
    document.querySelector("#active-count").textContent = state.orders.filter(order => ["DESAIN", "CETAK", "FINISHING"].includes(order.status)).length;
    if (!canView("projects")) { state.view = firstAllowedView(); render(); return; }
    if (permissionsChanged) render();
    else {
      renderProjectContent(PROJECT_STAGES.map(([status]) => status));
      if (focusedItem) root.querySelector(`[data-project-row-item="${CSS.escape(focusedItem)}"]`)?.focus({ preventScroll: true });
      else if (focusedGroup) root.querySelector(`[data-project-group="${CSS.escape(focusedGroup)}"]`)?.focus({ preventScroll: true });
    }
  } catch { /* Retry on the next refresh; api() handles an expired session. */ }
  finally { projectRefreshPending = false; }
}
setInterval(refreshProjectData, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshProjectData(); });

function witaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function projectDeadlineState(order) {
  return projectDeadlineInfo(order).state;
}

function formatProjectDeadline(order) {
  return projectDeadlineInfo(order).label;
}

function projectDeadlineHtml(order) {
  const { label, state } = projectDeadlineInfo(order);
  const tooltip = state === "late" ? ` title="Deadline: ${escapeHtml(dateFormat.format(new Date(order.deadline)))} WITA"` : "";
  const warning = state === "late" ? '<svg class="project-deadline-warning" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18.5a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></svg>' : "";
  const words = label.split(" ");
  const lastWord = words.pop();
  const content = warning ? `${escapeHtml(words.join(" "))} <span class="project-deadline-tail">${escapeHtml(lastWord)}${warning}</span>` : escapeHtml(label);
  return `<span class="project-deadline-label"${tooltip}>${content}</span>`;
}

function filteredProjectOrders() {
  const query = state.projectSearch.trim().toLowerCase();
  const categoryStatuses = PROJECT_STAGES.map(([status]) => status);
  return sortProjectDeadlines(projectJobs(state.orders).filter((order) => {
    if (!categoryStatuses.includes(order.status) || order.items[0]?.stockTiming === "SALE") return false;
    const searchText = `${order.code} ${order.customerName} ${order.phone || ""} ${order.designPic || ""} ${holdLabel(order.hold?.reason)} ${(order.items || []).map((item) => `${item.productName} ${item.displaySize || ""} ${projectProductSpecification(item)} ${item.productionNote || ""}`).join(" ")}`.toLowerCase();
    if (query && !searchText.includes(query)) return false;
    if (state.projectStatus !== "all" && order.status !== state.projectStatus) return false;
    return true;
  }), state.projectDeadlineSort);
}

function renderProjectContent(statuses) {
  const content = document.querySelector("#project-content");
  if (!content) return;
  const orders = filteredProjectOrders();
  content.innerHTML = state.projectView === "kanban"
    ? `<div class="kanban-wrap"><div class="kanban">${statuses.map((status) => projectColumn(status, orders)).join("")}</div></div>`
    : projectListHtml(statuses, orders);
  content.querySelectorAll("[data-project-row-order]").forEach((row) => {
    const openRow = (event) => {
      if (event.target.closest("button, select, input, a")) return;
      openOrder(row.dataset.projectRowOrder, false, row.dataset.projectRowItem);
    };
    row.addEventListener("click", openRow);
    row.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key) && !event.target.closest("button, select, input, a")) {
        event.preventDefault(); openOrder(row.dataset.projectRowOrder, false, row.dataset.projectRowItem);
      }
    });
  });
  content.querySelectorAll("[data-project-pic-order]").forEach((select) => select.addEventListener("change", async () => {
    const order = state.orders.find((item) => item.id === select.dataset.projectPicOrder);
    const previousPic = order?.items.find(item => item.itemId === select.dataset.projectPicItem)?.designPic || "";
    select.disabled = true;
    try {
      const designPic = select.value;
      const updated = await api(`/api/orders/${select.dataset.projectPicOrder}/items/${select.dataset.projectPicItem}/design-pic`, { method: "PATCH", body: JSON.stringify({ designPic }) });
      if (order) Object.assign(order, updated);
      renderProjectContent(statuses);
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
    content.querySelector(`[data-project-group="${CSS.escape(status)}"]`)?.focus({ preventScroll: true });
  });
}

function projectListHtml(statuses, orders) {
  if (!orders.length) return '<div class="project-empty">Tidak ada pesanan yang sesuai dengan filter.</div>';
  const groups = statuses.map(status => ({ status, label: PROJECT_STAGES.find(([id]) => id === status)?.[1] || state.statusLabels[status], orders: orders.filter(o => o.status === status) }));
  return `<div class="project-table-wrap"><table aria-label="Daftar produk pesanan" class="project-table"><colgroup><col><col><col><col><col></colgroup><thead class="project-accessible-head"><tr><th scope="col">Order</th><th scope="col">PIC</th><th scope="col">Produk</th><th scope="col">Jumlah</th><th scope="col">Deadline</th></tr></thead>${groups.filter(group => group.orders.length).map(group => {
    const { status, label, orders: grouped } = group, collapsed = state.projectCollapsed.has(status);
    return `<tbody class="project-status-group status-${status.toLowerCase()}${collapsed ? " collapsed" : ""}"><tr class="project-group-row status-${status.toLowerCase()}"><td colspan="5"><button type="button" class="project-stage-toggle" data-project-group="${status}" aria-expanded="${!collapsed}" aria-label="${collapsed ? "Buka" : "Tutup"} kelompok ${escapeHtml(label)}, ${grouped.length} produk"><span class="project-stage-label"><span class="ui-chevron" aria-hidden="true"></span><strong>${escapeHtml(label)}</strong></span></button></td></tr>${collapsed ? "" : grouped.map((job, index) => projectListRow(job, index + 1)).join("")}</tbody>`;
  }).join("")}</table></div><div class="project-list-footer"><span>Menampilkan ${orders.length} produk dari ${new Set(orders.map(job => job.id)).size} pesanan</span><span>Diperbarui otomatis setiap menit</span></div>`;
}

function projectSignifier(order) {
  const label = holdLabel(order.hold?.reason);
  return order.hold ? `<span class="assist-order-signifier" title="${escapeHtml(label)}">Ⅱ ${escapeHtml(label)}</span>` : order.status === "DESAIN" && order.fileReadiness === "READY" ? '<span class="assist-order-signifier ready">✓ File siap cetak</span>' : "";
}

function projectPicHtml(job) {
  const color = job.designPic ? `project-pic-${projectPicTone(job.items?.[0] || job)}` : "unassigned";
  return can("projects.assign") && ["DESAIN", "CETAK", "FINISHING", "SELESAI"].includes(job.status)
    ? `<select class="project-pic-select ${color}" data-project-pic-order="${job.id}" data-project-pic-item="${job.itemId}" aria-label="Pilih PIC untuk ${escapeHtml(job.items[0].productName)}"><option value="" disabled ${job.designPic ? "" : "selected"}>-</option>${picSelectOptions(job)}</select>`
    : `<span class="project-pic-static ${color}">${escapeHtml(job.designPic || "-")}</span>`;
}

function projectListRow(order, position) {
  const item = order.items[0], product = item.productName || "—", specification = projectProductSpecification(item);
  const waitingApproval = Boolean(order.hold && holdLabel(order.hold.reason) === "Menunggu ACC");
  const approvalBadge = waitingApproval ? `<span class="project-deadline-divider" aria-hidden="true"></span><span class="project-approval-badge" title="${escapeHtml(order.hold.note || "Menunggu ACC")}">Menunggu ACC</span>` : "";
  return `<tr class="project-order-row status-${order.status.toLowerCase()}" data-project-row-order="${order.id}" data-project-row-item="${order.itemId}" tabindex="0" aria-label="Buka ${escapeHtml(product)} untuk ${escapeHtml(order.customerName)}"><td class="project-order-identity"><span class="project-row-number" aria-hidden="true">${position}</span><div class="project-customer"><strong title="${escapeHtml(order.customerName)}">${escapeHtml(order.customerName)}</strong><b class="project-phone">${escapeHtml(order.phone || "Walk-in")}</b></div></td><td class="project-pic-cell" data-label="PIC">${projectPicHtml(order)}</td><td class="project-product-cell" data-label="Produk"><strong title="${escapeHtml(product)}">${escapeHtml(product)}</strong><small class="project-product-summary"><span title="${escapeHtml(specification)}">${escapeHtml(specification)}</span></small>${waitingApproval ? "" : projectSignifier(order)}</td><td class="project-quantity" data-label="Jumlah">${escapeHtml(itemQuantityLabel(item))}</td><td class="project-deadline ${projectDeadlineState(order)}" data-label="Deadline"><div class="project-deadline-content">${projectDeadlineHtml(order)}${approvalBadge}</div></td></tr>`;
}

function projectProductSpecification(item) {
  if (item.sheetCalculation) return sheetSpecification(item.sheetCalculation);
  const size = item.imageWidthCm > 0 && item.imageLengthCm > 0
    ? `${Number(item.imageWidthCm).toLocaleString("id-ID")} × ${Number(item.imageLengthCm).toLocaleString("id-ID")} cm${item.allowanceCm > 0 ? ` · Lebihan ${Number(item.allowanceCm).toLocaleString("id-ID")} cm/sisi` : ""}`
    : item.displaySize || "";
  const finishes = (item.finishing || []).map(finish => finish.name).filter(Boolean);
  return [size, ...finishes.filter(name => !size.toLocaleLowerCase("id-ID").includes(name.toLocaleLowerCase("id-ID")))].filter(Boolean).join(" · ");
}

function projectColumn(status, source = projectJobs(state.orders)) {
  const jobs = source.filter(job => job.status === status);
  return `<section class="kanban-column status-${status.toLowerCase()}"><div class="column-head"><h3>${state.statusLabels[status]}</h3><span>${jobs.length}</span></div>${jobs.map(job => `<article class="order-card status-${status.toLowerCase()}" data-project-row-order="${job.id}" data-project-row-item="${job.itemId}" tabindex="0" aria-label="Buka ${escapeHtml(job.items[0].productName)}"><div class="order-card-head">${projectSignifier(job)}<span class="project-pic-static project-pic-${projectPicTone(job.items[0])}">${escapeHtml(job.designPic || "Belum ada PIC")}</span></div><h4>${escapeHtml(job.customerName)}</h4><b class="project-phone">${escapeHtml(job.phone || "Walk-in")}</b><p class="project-card-product">${escapeHtml(job.items[0].productName)}</p><p class="project-card-specification">${escapeHtml(projectProductSpecification(job.items[0]))}</p><strong class="project-card-quantity">${escapeHtml(itemQuantityLabel(job.items[0]))}</strong><p class="project-deadline ${projectDeadlineState(job)}">${projectDeadlineHtml(job)}</p></article>`).join("") || '<div class="cart-empty" style="padding:28px 5px">Kosong</div>'}</section>`;
}

function nextAction(order) {
  return { DESAIN: "Lanjut ke Proses Cetak", CETAK: "Lanjut ke Finishing", FINISHING: "Selesaikan Pesanan", SELESAI: "Pesanan Diterima" }[order.status];
}

function itemDetail(item) {
  const finishing = (item.finishing || []).map((finish) => `${escapeHtml(finish.name)} × ${finish.units}${finish.note ? ` — ${escapeHtml(finish.note)}` : ""}`).join(", ");
  const templateParts = item.templateDesign ? (can("projects.money") ? `<small>Harga spanduk: ${rupiah.format(item.baseTotal)}</small><small>Design Template ${escapeHtml(item.templateDesign)}: ${rupiah.format(item.templateDesignTotal || 35000)}</small>` : `<small>Template: ${escapeHtml(item.templateDesign)}</small>`) : "";
  return `<strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.displaySize || `${item.width} × ${item.billedLength} m · ${item.quantity}x`)}</small>${templateParts}${item.templateDesign ? "" : `<small>File: ${escapeHtml(item.fileService?.name || "File Siap Cetak") + (item.fileService?.id && item.fileService.id !== "READY" ? ` × ${item.fileService.quantity || 1}${item.fileService.note ? ` (${escapeHtml(item.fileService.note)})` : ""}` : "")}</small>`}${finishing ? `<small>Finishing: ${finishing}</small>` : ""}${imageSizeNote(item) ? `<small class="image-size-note">${escapeHtml(imageSizeNote(item))}</small>` : ""}<small>Catatan: ${escapeHtml(item.productionNote || "—")}</small>`;
}

function itemWorkflowHtml(order, item) {
  if (item.stockTiming === "SALE") return `<div class="item-workflow"><strong class="item-status">Barang Dagangan · ${escapeHtml(state.statusLabels[item.status] || item.status)}</strong></div>`;
  const editableDeadline = ["OWNER", "CASHIER"].includes(state.currentUser.role) || state.currentUser.role === "MANAGER" && can("pos.edit");
  const active = ["DESAIN", "CETAK", "FINISHING", "SELESAI"].includes(item.status);
  const canAdvance = (can("projects.status") || state.currentUser.role === "CASHIER" && can("orders.pickup") && item.status === "FINISHING") && ["DESAIN", "CETAK", "FINISHING"].includes(item.status) && roleCanAdvance(state.currentUser.role, item.status, nextItemStatus(item));
  return `<div class="item-workflow"><strong class="item-status">${escapeHtml(state.statusLabels[item.status])}</strong><label class="item-pic-field"><span>PIC</span>${can("projects.assign") && active ? `<select class="project-pic-select pic-${picColor(item)}" data-item-pic="${item.itemId}" aria-label="PIC ${escapeHtml(item.productName)}"><option value="" disabled ${item.designPic ? "" : "selected"}>-</option>${picSelectOptions(item)}</select>` : `<b class="project-pic-static pic-${picColor(item)}">${escapeHtml(item.designPic || "-")}</b>`}</label><div class="item-deadline"><span>Deadline</span>${editableDeadline ? `<form data-item-deadline="${item.itemId}"><input type="datetime-local" name="deadline" aria-label="Deadline ${escapeHtml(item.productName)} (WITA)" value="${localDateTimeInput(item.deadline)}"><button type="submit" class="secondary">Simpan</button></form>` : `<b>${item.deadline ? dateFormat.format(new Date(item.deadline)) + " WITA" : "-"}</b>`}</div>${canAdvance ? `<button type="button" class="primary item-advance" data-item-advance="${item.itemId}">${item.status === "FINISHING" ? "Selesaikan Produk" : nextAction(item)}</button>` : ""}</div>`;
}

function confirmUnpaidPickup(order) {
  return new Promise((resolve) => {
    const modal = document.createElement("dialog"); modal.className = "delete-confirm unpaid-confirm";
    modal.innerHTML = `<div class="delete-confirm-body"><h3>Pesanan belum lunas</h3>${can("projects.money") && order ? `<p class="assist-payment-reminder">Masih ada sisa pembayaran <strong>${rupiah.format(order.outstanding ?? Math.max(0, Number(order.total || 0) - Number(order.paidAmount || 0)))}</strong></p>` : ""}<p>Cek kembali status pembayaran. Apakah Anda yakin mau menyelesaikan pesanan?</p><div class="delete-confirm-actions"><button type="button" class="primary" data-confirm>Ya, Selesaikan Pesanan</button><button type="button" class="secondary" data-cancel>Cek Kembali</button></div></div>`;
    document.body.append(modal);
    const close = (accepted) => { modal.close(); modal.remove(); resolve(accepted); };
    modal.querySelector("[data-confirm]").onclick = () => close(true);
    modal.querySelector("[data-cancel]").onclick = () => close(false);
    modal.oncancel = (event) => { event.preventDefault(); close(false); };
    modal.showModal(); modal.querySelector("[data-cancel]").focus();
  });
}

function openOrder(id, showPayment = false, focusedItemId = null) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return toast("Pesanan tidak ditemukan", "error");
  const showMoney = can("projects.money");
  const isDesign = order.status === "DESAIN" && state.view !== "order-history";
  const isWaiting = order.status === "MENUNGGU_PEMBAYARAN";
  const outstanding = showMoney && !cancelled(order) ? Math.max(0, order.total - Number(order.paidAmount || 0)) : 0;
  const detail = document.querySelector("#order-detail");
  const paymentForm = can("pos.payment") && outstanding > 0 ? `<div id="payment-form-wrap" class="payment-form-wrap">${paymentFormHtml(order, outstanding)}</div>` : "";
  detail.innerHTML = `<div class="detail-head"><div><span class="order-code">${order.code}</span><h2 style="margin:5px 0 0">${escapeHtml(order.customerName)}</h2></div><button class="detail-close">×</button></div><div class="detail-body">
    ${isWaiting ? paymentForm : ""}
    <div class="detail-meta ${isDesign ? "design-meta" : ""}"><div class="meta-card"><span>Status</span><strong>${state.statusLabels[order.status]}</strong></div>${showMoney && !isDesign ? `<div class="meta-card"><span>Pembayaran</span><strong class="${paymentStatus(order)==="BELUM_LUNAS"?"payment-unpaid":""}">${paymentStatus(order).replaceAll("_", " ")}</strong></div>` : ""}${isWaiting ? "" : `<div class="meta-card"><span>PIC Design</span><strong>${escapeHtml(order.designPic || "Belum diambil")}</strong></div>`}</div>
    <div class="order-items-detail">${order.items.map((item,index) => `<div class="detail-item status-${item.status.toLowerCase()}" data-detail-item="${item.itemId}" tabindex="-1"><span class="item-number">${index+1}</span><div class="detail-item-content">${itemDetail(item)}${itemWorkflowHtml(order,item)}</div>${showMoney && !isDesign ? `<strong class="item-price">${rupiah.format(item.subtotal)}</strong>` : ""}</div>`).join("")}</div>
    ${showMoney && !isDesign ? `<div class="order-discount-totals">${invoiceDiscount(order) ? `<div class="detail-total discount-line"><span>Total Pesanan</span><strong>${rupiah.format(invoiceGross(order))}</strong></div><div class="detail-total discount-line"><span>Diskon Pesanan</span><strong>− ${rupiah.format(invoiceDiscount(order))}</strong></div>` : ""}<div class="detail-total"><span>${invoiceDiscount(order) ? "Total Tagihan" : "Total Pesanan"}</span><strong>${rupiah.format(order.total)}</strong></div></div>` : ""}
    <div id="order-assistance" class="order-assistance"></div>
    ${showMoney && can("orders.view") && paymentHistoryVisible(state.currentUser.role) ? `<section class="payment-ledger"><h3>Riwayat pembayaran</h3>${paymentReceipts(order).map(payment => `<div class="payment-ledger-row"><div><strong>${rupiah.format(payment.amount)} · ${escapeHtml(payment.method)}</strong><small>${dateFormat.format(new Date(payment.createdAt))} WITA · ${escapeHtml(payment.actor || "Riwayat lama")}</small></div><button class="secondary" data-print-payment="${escapeHtml(payment.id)}">Cetak Bukti #${payment.sequence}</button></div>`).join("") || (order.total === 0 && invoiceDiscount(order) ? '<p>Tagihan lunas melalui diskon penuh; tidak ada uang masuk.</p>' : '<p>Belum ada pembayaran diterima.</p>')}${(order.payments || []).filter(payment => payment.type === "PO").map(payment => `<p>PO / Tempo · ${escapeHtml(payment.poNumber)} · ${dateFormat.format(new Date(payment.createdAt))} WITA</p>`).join("")}</section>` : ""}
    ${!isWaiting ? paymentForm : ""}
    <p class="section-label" style="margin-top:18px">Riwayat pekerjaan</p><div class="timeline">${(order.timeline || []).map((item) => `<div class="timeline-item"><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.actor)} · ${dateFormat.format(new Date(item.createdAt))}</small></div>`).join("")}</div>
  </div><div class="detail-actions">
      ${can("orders.return") && can("orders.view") && order.items.some(item => returnableRetailItem(order,item)) ? '<button id="return-goods" type="button" class="secondary detail-return">Retur Barang</button>' : ""}
      ${isWaiting && can("pos.edit") ? '<button id="edit-order" class="secondary">Edit Pesanan</button>' : ""}
      ${!isWaiting && can("pos.payment") && outstanding > 0 ? '<button id="confirm-payment" type="submit" form="payment-form" class="secondary">Konfirmasi Pembayaran</button>' : ""}
      ${!isWaiting ? '<button id="print-spk" class="secondary">Print SPK</button>' : ""}
      ${showMoney && can("orders.view") ? '<button id="print-invoice" class="secondary">Nota Ulang</button>' : ""}
      ${showMoney && ["SELESAI", "DIAMBIL"].includes(order.status) ? '<button id="print-receipt" class="secondary">Print Tanda Terima</button>' : ""}
      ${isWaiting && can("pos.payment") && outstanding > 0 ? '<button id="confirm-payment" type="submit" form="payment-form" class="primary">Konfirmasi Pembayaran</button>' : ""}
      ${(can("projects.status") || can("orders.pickup")) && order.status === "SELESAI" && roleCanAdvance(state.currentUser.role, order.status, "DIAMBIL") ? `<button id="advance-order" class="primary">${nextAction(order)}</button>` : ""}
    </div>`;
  detail.querySelector(".detail-close").onclick = () => dialog.close();
  detail.querySelector("#edit-order")?.addEventListener("click", () => startEditOrder(order));
  bindPaymentForm(order, outstanding);
  const returnUserId = state.currentUser.id;
  const validReturn = () => state.currentUser?.id === returnUserId && dialog.open && detail.isConnected;
  detail.querySelector("#return-goods")?.addEventListener("click", () => openGoodsReturn({ order, api, escapeHtml, valid:validReturn, toast,
    onSaved:async record => {
      dialog.close();
      try {
        await load();
        const updated = await api(`/api/order-history/${order.id}`);
        if(state.currentUser?.id !== returnUserId)return;
        const index = state.orders.findIndex(o=>o.id===order.id);
        if(index>=0)state.orders[index]=updated;else state.orders.push(updated);
        openOrder(order.id);
        toast(`${record.code} berhasil dicatat`);
      } catch(error){toast(`Retur berhasil dicatat. ${error.message}`,"error");}
    }
  }));
  if(can("orders.view"))mountGoodsReturnHistory({scope:detail,order,api,escapeHtml,valid:validReturn}).catch(error=>{if(validReturn())toast(error.message,"error");});
  const updateItem = async (itemId, field, body, control) => {
    const related = [...detail.querySelectorAll("[data-item-advance]")].filter(button => button.dataset.itemAdvance === itemId);
    control.disabled = true; related.forEach(button => { button.disabled = true; });
    try {
      await api(`/api/orders/${order.id}/items/${itemId}/${field}`, { method: "PATCH", body: JSON.stringify(body) });
      dialog.close(); await load(); openOrder(order.id, false, itemId); toast("Produk diperbarui dan dicatat di riwayat");
    } catch (error) {
      if (control.tagName === "SELECT") control.value = order.items.find(item => item.itemId === itemId)?.designPic || "";
      toast(error.message, "error"); control.disabled = false; related.forEach(button => { button.disabled = false; });
    }
  };
  detail.querySelectorAll("[data-item-pic]").forEach(select => select.onchange = () => updateItem(select.dataset.itemPic, "design-pic", { designPic: select.value }, select));
  detail.querySelectorAll("[data-item-deadline]").forEach(form => form.onsubmit = event => {
    event.preventDefault(); updateItem(form.dataset.itemDeadline, "deadline", { deadline: makassarInputToIso(form.elements.deadline.value) || null }, form.querySelector("button"));
  });
  detail.querySelectorAll("[data-item-advance]").forEach(button => button.onclick = () => {
    const item = order.items.find(item => item.itemId === button.dataset.itemAdvance);
    updateItem(item.itemId, "status", { status: nextItemStatus(item), expectedStatus: item.status }, button);
  });
  const advance = async (confirmUnpaid = false) => {
    const button = detail.querySelector("#advance-order"); button.disabled = true;
    try {
      const sequence = ["MENUNGGU_PEMBAYARAN", "DESAIN", "CETAK", "FINISHING", "SELESAI", "DIAMBIL"];
      await api(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: sequence[sequence.indexOf(order.status) + 1], confirmUnpaid, actor: order.designPic || "Tim Produksi" }) });
      dialog.close(); await load(); toast("Status pesanan diperbarui");
    } catch (error) {
      if (error.code === "UNPAID_PICKUP_CONFIRMATION" && !confirmUnpaid) { if (await confirmUnpaidPickup(order)) await advance(true); }
      else toast(error.message, "error");
    } finally { button.disabled = false; }
  };
  detail.querySelector("#advance-order")?.addEventListener("click", async event => {
    const button = event.currentTarget; if (button.disabled) return; button.disabled = true;
    try {
      const checked = await assistance.checkBeforeAdvance(order.id);
      if (!checked.allow) return;
      if (checked.outstanding != null) order.outstanding = checked.outstanding;
      if (order.status === "SELESAI" && showMoney && (checked.outstanding ?? Math.max(0, order.total - Number(order.paidAmount || 0))) > 0) { if (await confirmUnpaidPickup(order)) await advance(true); }
      else await advance();
    } finally { button.disabled = false; }
  });
  detail.querySelector("#print-spk")?.addEventListener("click", () => printOrder(order, "spk"));
  detail.querySelector("#print-invoice")?.addEventListener("click", () => printOrder(order, "invoice"));
  detail.querySelectorAll("[data-print-payment]").forEach(button => button.onclick = async () => {
    if (!can("orders.view") || !can("projects.money") || !paymentHistoryVisible(state.currentUser.role)) return;
    const userId = state.currentUser.id;
    button.disabled = true;
    try {
      const [freshOrder,result] = await Promise.all([api(`/api/order-history/${encodeURIComponent(order.id)}`),api(`/api/order-history/${encodeURIComponent(order.id)}/payments/${encodeURIComponent(button.dataset.printPayment)}`)]);
      if (state.currentUser?.id !== userId) return;
      await printHelper.open({orderId:order.id,kind:'payment',paymentId:button.dataset.printPayment,browserPrint:()=>showPrintDocument(paymentReceiptHtml(freshOrder,result.payment),'thermal-print payment-receipt')});
    } catch (error) { toast(error.message,'error'); }
    finally { button.disabled = false; }
  });
  detail.querySelector("#print-receipt")?.addEventListener("click", () => printOrder(order, "receipt"));
  dialog.showModal();
  customersUI.mountOrder(detail,order).catch(error=>toast(error.message,"error"));
  assistance.mountOrder(order, detail.querySelector("#order-assistance"));
  if (focusedItemId && !(isWaiting && paymentForm)) {
    const target = [...detail.querySelectorAll("[data-detail-item]")].find(element => element.dataset.detailItem === focusedItemId);
    target?.classList.add("focused-item"); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center" });
  }
  if (showPayment) detail.querySelector("#payment-form-wrap")?.classList.remove("hidden");
}

function openPaymentDialog(order, initial={}) {
  if(cancelled(order))return toast("Pesanan dibatalkan tidak dapat menerima pembayaran","error");
  const outstanding = Math.max(0, Number(order.total) - Number(order.paidAmount || 0));
  const detail = document.querySelector("#order-detail");
  dialog.classList.add("payment-dialog");
  detail.innerHTML = `<div class="detail-head"><div><span class="order-code">${escapeHtml(order.code)}</span><h2>Pembayaran</h2><p>${escapeHtml(order.customerName)}</p></div><button class="detail-close" aria-label="Tutup pembayaran">×</button></div><div class="detail-body"><div class="payment-order-summary">${order.items.map(item => `<div><strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.displaySize)}</small>${imageSizeNote(item) ? `<small>${escapeHtml(imageSizeNote(item))}</small>` : ""}</div>`).join("")}<div class="summary-row total"><span>Total Pesanan</span><strong>${rupiah.format(invoiceGross(order))}</strong></div></div>${paymentFormHtml(order,outstanding)}</div><div class="detail-actions"><button id="confirm-payment" type="submit" form="payment-form" class="primary">Konfirmasi Pembayaran</button></div>`;
  detail.querySelector(".detail-close").onclick = () => dialog.close();
  dialog.onclose = () => { if(dialog.open)return;dialog.classList.remove("payment-dialog"); dialog.onclose = null; detail.replaceChildren(); };
  bindPaymentForm(order,outstanding,initial); dialog.showModal();
}

function paymentFormHtml(order, outstanding) {
  return `${paymentDiscountHtml(order, {moneyField, money:n=>rupiah.format(n)})}<form id="payment-form"><h3>Form Pembayaran</h3><div class="form-grid">
    <div class="field full"><span>Jenis pembayaran</span><div class="payment-tabs"><label><input type="radio" name="type" value="PAYMENT" checked><span>Pembayaran</span></label><label><input type="radio" name="type" value="PO"><span>Pembayaran PO</span></label></div></div>
    <div id="payment-fields" class="payment-tab-panel full"><div class="field"><span>Metode</span><div class="chips payment-method-chips">${[["TUNAI","Tunai"],["QRIS","QRIS"],["TRANSFER","Transfer"]].map(([value,label]) => `<div class="chip"><input type="radio" name="method" id="pay-method-${value}" value="${value}" required><label for="pay-method-${value}">${label}</label></div>`).join("")}</div></div>
    <label class="field"><span>Nominal diterima</span><div class="payment-amount-field">${moneyField("amount", outstanding, "required")}</div></label>
    <div class="payment-dp-options"><label class="design-toggle"><input id="payment-dp" type="checkbox" role="switch" aria-controls="payment-half" aria-expanded="false"><span class="design-switch" aria-hidden="true"></span><strong>Pembayaran DP</strong></label><button type="button" id="payment-half" class="payment-half hidden">50%</button></div></div>
    <div id="po-fields" class="payment-tab-panel full hidden"><label class="field"><span>Nomor PO *</span><input name="poNumber" placeholder="Contoh: PO/0924/001"></label><label class="field"><span>Upload PO <small>(opsional)</small></span><input name="poFile" type="file" accept="image/png,image/jpeg,image/webp"></label><div id="po-preview" class="po-preview hidden"></div></div>
  </div><div class="payment-balance"><span>Sudah dibayar: ${rupiah.format(order.paidAmount || 0)}</span><strong>Sisa: ${rupiah.format(outstanding)}</strong></div></form>`;
}

function bindPaymentForm(order, outstanding, initial={}) {
  const paymentRequestId = crypto.randomUUID();
  const form = document.querySelector("#payment-form");
  if (!form) return;
  const halfButton = form.querySelector("#payment-half");
  const methods = [...form.querySelectorAll('input[name="method"]')];
  bindMoneyInputs(form);
  bindMoneyInputs(form.previousElementSibling);
  const discountController = bindPaymentDiscount(form,order,{parseMoney,money:n=>rupiah.format(n)});
  const paymentOrder = discountController.order;
  form.querySelectorAll('input[name="type"]').forEach(input => input.addEventListener("change", () => {
    if (!input.checked) return;
    const po = input.value === "PO";
    form.querySelector("#payment-fields").classList.toggle("hidden", po);
    form.querySelector("#po-fields").classList.toggle("hidden", !po);
    methods.forEach(method => { method.required = !po; method.disabled = po; });
    form.elements.amount.required = !po; form.elements.amount.disabled = po; form.elements.poNumber.required = po;
  }));
  form.querySelector("#payment-dp").onchange = event => {
    halfButton.classList.toggle("hidden",!event.target.checked);
    event.target.setAttribute("aria-expanded",String(event.target.checked));
  };
  const confirmButton = document.querySelector('#confirm-payment');
  if (confirmButton) confirmButton.disabled = true;
  let depositError;
  const depositReady=customersUI.mountPayment(form,paymentOrder,initial).catch(error=>{depositError=error;toast(error.message,"error");return null;}).finally(()=>{if(form.isConnected&&confirmButton)confirmButton.disabled=false;});
  let previewUrl;
  dialog.addEventListener("close", () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, { once: true });
  form.elements.poFile.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const file = form.elements.poFile.files[0], preview = form.querySelector("#po-preview");
    if (!file) return preview.classList.add("hidden");
    previewUrl = URL.createObjectURL(file); preview.innerHTML = `<img src="${previewUrl}" alt="Preview PO"><span>${escapeHtml(file.name)}</span>`; preview.classList.remove("hidden");
  });
  let submitting = false;
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (submitting) return;
    if (!form.reportValidity()) return;
    submitting = true;
    const discountSection = document.querySelector(".payment-discount-summary");
    form.inert = true; if (discountSection) discountSection.inert = true;
    const button = document.querySelector('#confirm-payment'); if (button) button.disabled = true;
    try {
      const depositController=await depositReady;
      if(!form.isConnected)return;
      if(depositError)throw depositError;
      const depositValues=await depositController.confirm();
      if(!depositValues||!form.isConnected||!form.reportValidity())return;
      const values = {...Object.fromEntries(new FormData(form)),...depositValues,invoiceDiscountAmount:discountController.amount()}; values.amount = values.type === "PO" ? 0 : parseMoney(values.amount); delete values.poFile;
      const file = form.elements.poFile.files[0];
      if (values.type === "PO" && file) values.poAttachment = await readPoAttachment(file);
      const paidOrder = await api(`/api/orders/${order.id}/payments`, { method: "POST", body: JSON.stringify({ ...values, requestId: paymentRequestId }) });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      dialog.close(); await load(); if (can("orders.view")) { if (!state.orders.some(item => item.id === paidOrder.id)) state.orders.push(paidOrder); openOrder(order.id); } toast("Pembayaran berhasil dicatat");
    } catch (error) { toast(error.message, "error"); }
    finally { submitting = false; form.inert = false; if (discountSection) discountSection.inert = false; if (button) button.disabled = false; }
  });
}

function readPoAttachment(file) {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return Promise.reject(new Error("File PO harus berupa gambar JPG, PNG, atau WebP"));
  if (file.size > 2_500_000) return Promise.reject(new Error("Ukuran gambar PO maksimal 2,5 MB"));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Gambar PO tidak dapat dibaca")); reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result }); reader.readAsDataURL(file); });
}

function cartLineFromPricedItem(item) {
  const line = {
    itemId: item.itemId, productId: item.productId, productName: item.productName, sheetCalculation: item.sheetCalculation || null, width: item.width,
    ...(item.rollPlacement ? {rollPlacement:structuredClone(item.rollPlacement), rollCalculationVersion:item.rollCalculationVersion || 1} : {}),
    dtfPackageId: item.dtfPackageId || "", shirtVariants: (item.shirtVariants || []).map((variant) => ({ ...variant })),
    length: item.actualLength, imageWidthCm: item.imageWidthCm ?? null, imageLengthCm: item.imageLengthCm ?? null, allowanceCm: item.allowanceCm || 0, finalImageWidthCm: item.finalImageWidthCm ?? null, finalImageLengthCm: item.finalImageLengthCm ?? null, billedLength: item.billedLength, quantity: item.quantity,
    sizeVariantId: item.sizeVariantId || "", sizeVariantLabel: item.sizeVariantLabel || "",
    materialVariantId: item.materialVariantId || "", materialVariantLabel: item.materialVariantLabel || "",
    subVariantId: item.subVariantId || "", subVariantLabel: item.subVariantLabel || "",
    choices: (item.choices || []).map((choice) => ({ groupId: choice.groupId, optionId: choice.optionId })),
    finishing: (item.finishing || []).map((finish) => ({ id: finish.id, units: finish.units, note: finish.note || "" })),
    finishingNames: (item.finishing || []).map((finish) => `${finish.name} × ${finish.units}${finish.note ? ` (${finish.note})` : ""}`).join(", "),
    displaySize: item.displaySize, templateDesign: item.templateDesign || "", fileServiceId: item.fileService?.id || "READY",
    fileServiceName: item.fileService?.name || "File Siap Cetak", fileServicePrice: item.fileService?.price || 0, fileServiceQuantity: item.fileService?.quantity || 1, fileServiceNote: item.fileService?.note || "",
    baseTotal: item.baseTotal, templateDesignTotal: item.templateDesignTotal || 0, templateDesignQuantity:item.templateDesignQuantity || 1,
    wholesaleQuantity:item.wholesaleQuantity, unitPrice:item.unitPrice, originalUnitPrice:item.originalUnitPrice, discountApplied:item.discountApplied, priceBasis:item.priceBasis,
    productionNote: item.productionNote || "", previewTotal: item.subtotal
  };
  const product = state.products.find(product => product.id === item.productId);
  if (product && !item.sizeVariantId && supportsAutoRollWidth(product) && !product.widths.includes(item.width)) {
    line.width = suggestedOutdoorWidth(product, item.imageWidthCm || Number(item.width) * 100, item.allowanceCm || 0);
    const materialVariant = product.materialVariants?.find(variant => variant.id === item.materialVariantId);
    const combination = materialVariant?.combinations?.find(combination => combination.subVariantId === item.subVariantId);
    const base = productBase(product, line.width, line.length, line.quantity, null, materialVariant, combination);
    line.baseTotal = base.total; line.billedLength = base.billed;
    line.previewTotal = base.total + Number(item.subtotal) - Number(item.baseTotal);
    line.displaySize = `${line.width} × ${base.billed} m · ${line.quantity} ${product.unitName || "Lembar"}`;
  }
  return line;
}

function startEditOrder(order) {
  state.cart = order.items.map(cartLineFromPricedItem);
  state.draft = { customerId:order.customerId || null, customerName: order.customerName || "", phone: order.phone || "", deadline: localDateTimeInput(order.deadline), fileStatus: order.fileStatus || "SIAP_CETAK", fileReadiness: order.fileReadiness || "UNCONFIRMED" };
  state.editingOrderId = order.id;
  state.selectedProduct = state.cart[0]?.productId || state.selectedProduct;
  state.selectedCategory = categoryKey(state.products.find((product) => product.id === state.selectedProduct) || {});
  state.view = "pos";
  dialog.close(); render(); window.scrollTo({ top: 0, behavior: "smooth" });
}

async function printOrder(order, type) {
  const isSpk = type === "spk";
  if (!isSpk && !can("projects.money")) return;
  const userId = state.currentUser?.id;
  try {
    // A project row may contain one item; print the complete invoice snapshot.
    order = can('orders.view') ? await api(`/api/order-history/${encodeURIComponent(order.id)}`)
      : (await api('/api/bootstrap?view=projects')).orders.find(full=>full.id===order.id);
    if (!order) throw new Error('Pesanan tidak ditemukan');
    if (state.currentUser?.id !== userId) return;
    if (isSpk) { await printHelper.open({orderId:order.id,kind:'work-order',browserPrint:()=>showPrintDocument(workOrderHtml(order),'thermal-print spk')}); return; }
    if (type === 'invoice') {
      const latest = paymentReceipts(order).at(-1);
      const receipt = latest && paymentHistoryVisible(state.currentUser.role)
        ? (await api(`/api/order-history/${encodeURIComponent(order.id)}/payments/${encodeURIComponent(latest.id)}`)).payment : null;
      if (state.currentUser?.id !== userId) return;
      await printHelper.open({orderId:order.id,kind:'invoice',browserPrint:()=>showPrintDocument(invoiceReceiptHtml(order,null,receipt),'thermal-print invoice')}); return;
    }
    const html = `<div class="print-brand">MANNA PRINT</div><div class="print-subtitle">TANDA TERIMA PESANAN</div><hr>
      <div class="print-meta"><b>${escapeHtml(order.code)}</b><span>${dateFormat.format(new Date(order.createdAt))} WITA</span></div>
      <p><b>Pelanggan:</b> ${escapeHtml(order.customerName)}<br><b>Deadline:</b> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "—"}</p><hr>
      ${order.items.map((item,index)=>`<div class="print-item"><b>${index+1}. ${escapeHtml(item.productName)}</b><br>${escapeHtml(item.displaySize || `${item.width} × ${item.billedLength} m · ${item.quantity}x`)}${imageSizeNote(item)?`<br>${escapeHtml(imageSizeNote(item))}`:''}<br>${escapeHtml(itemQuantityLabel(item))}<br>Status: ${escapeHtml(state.statusLabels[item.status] || item.status)} · PIC: ${escapeHtml(item.designPic || '—')}<br>Deadline: ${item.deadline?dateFormat.format(new Date(item.deadline))+' WITA':'—'}${item.templateDesign?`<br>Harga spanduk: ${rupiah.format(item.baseTotal)}<br>Design Template ${escapeHtml(item.templateDesign)}: ${rupiah.format(item.templateDesignTotal || 35000)}`:`<br>File: ${escapeHtml(item.fileService?.name || 'File Siap Cetak') + (item.fileService?.id && item.fileService.id !== 'READY' ? ` × ${item.fileService.quantity || 1}${item.fileService.note ? ` (${escapeHtml(item.fileService.note)})` : ''}` : '')}`}${(item.finishing || []).length?`<br>Finishing: ${item.finishing.map(f=>`${escapeHtml(f.name)} × ${f.units}${f.note?` (${escapeHtml(f.note)})`:''}`).join(', ')}`:''}<br><b>Catatan:</b> ${escapeHtml(item.productionNote || '—')}<br><span class="print-price">${rupiah.format(item.subtotal)}</span></div>`).join('<hr>')}
      <hr>${discountPrintLines(order,n=>rupiah.format(n))}<div class="print-total"><span>Total Tagihan</span><b>${rupiah.format(order.total)}</b></div>${depositInvoiceLines(order)}<div class="print-total"><span>Dibayar</span><b>${rupiah.format(order.paidAmount || 0)}</b></div><div class="print-total"><span>Sisa</span><b>${rupiah.format(cancelled(order)?0:Math.max(0,order.total-(order.paidAmount || 0)))}</b></div>
      <p><b>Status pembayaran: ${escapeHtml(paymentStatus(order).replaceAll('_',' '))}</b><br>WhatsApp: ${escapeHtml(order.phone || '—')}</p><hr><p class="print-footer">Manna Print · Labuan Bajo<br>Terima kasih</p>`;
    await showPrintDocument(html,type);
  } catch (error) { toast(error.message,'error'); }
}

let printBusy = false;
async function showPrintDocument(html, type) {
  if (printBusy) { toast('Tunggu proses cetak sebelumnya selesai.'); return; }
  printBusy = true;
  const printUserId = state.currentUser?.id;
  const cleanup = () => {
    document.body.classList.remove('printing'); printDocument.innerHTML = ''; printBusy = false;
    window.removeEventListener('afterprint',cleanup);
  };
  try {
    printDocument.className = `print-document ${type}`;
    printDocument.innerHTML = html;
    if (printDocument.classList.contains('thermal-print')) await prepareThermalPrint(printDocument);
    if (state.currentUser?.id !== printUserId) { cleanup(); return; }
    document.body.classList.add('printing');
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
  } catch (error) { cleanup(); toast(error.message,'error'); }
}

const reportsUI = createReportsUI({root,api,escapeHtml,money:n=>rupiah.format(n),toast,
  identity:()=>state.currentUser?.id,isActive:()=>state.view==='reports',
  canOpenOrder:()=>can('orders.view'),canAssets:()=>canManageSettings() && can('reports.cost'),
  openAssets:()=>{state.view='master';state.masterTab='assets';render();},
  openOrder:async id=>{try{const order=await api('/api/order-history/'+encodeURIComponent(id));const index=state.orders.findIndex(o=>o.id===id);if(index<0)state.orders.push(order);else state.orders[index]=order;openOrder(id);}catch(error){toast(error.message,'error');}},
  print:html=>showPrintDocument(html,'report-print')
});
function renderReports(){return reportsUI.mount();}

function masterHeader(title, includeSummary = true) {
  const labels = { campaigns:"Campaign",customers:"Pelanggan",products: "Produk", materials: "Bahan", categories: "Kategori", finishings: "Finishing", machines: "Mesin", assets: "Aset", users: "User & Akses", pics: "PIC" };
  const allowed = { campaigns:state.currentUser?.role==="OWNER"&&can("master.products"),customers:can("customers.view"),products: can("master.products"), materials: can("master.materials"), categories: canManageSettings(), finishings: can("master.finishings"), machines: can("master.machines"), assets: canManageSettings(), users: can("users.manage"), pics: canManageSettings() };
  return `<div class="master-top page-toolbar"><div><h1>Master Data</h1><p>Kelola katalog, komposisi bahan, mesin, harga, serta akses user.</p></div><button id="add-master" class="primary">+ Tambah ${title}</button></div>
    ${includeSummary ? `<div class="master-summary"><div><span>Produk aktif</span><strong>${state.allProducts.filter((item) => item.active !== false).length}</strong></div><div><span>Bahan aktif</span><strong>${state.materials.filter((item) => item.active !== false).length}</strong></div><div><span>Mesin aktif</span><strong>${state.machines.filter((item) => item.active !== false).length}</strong></div><div><span>Stok menipis</span><strong>${state.inventory.filter((item) => !item.stockNeedsCount && Number(item.quantity) <= Number(item.minStock || 0)).length}</strong></div></div>` : ""}
    <div class="master-tabs">${Object.entries(labels).filter(([id]) => allowed[id]).map(([id, label]) => `<button class="${state.masterTab === id ? "active" : ""}" data-master-tab="${id}">${label}</button>`).join("")}</div>`;
}

function assetContext() {
  return { root, dialog, printDocument, api, toast, escapeHtml, moneyField, parseMoney, bindMoneyInputs, rupiah, machines: state.machines,
    header: masterHeader("Aset", false), showDialog: showMasterDialog,
    isActive: () => state.view === "master" && state.masterTab === "assets" && canManageSettings(),
    isReportActive: () => false,
    bindHeader: () => { alignPageHeader(root); root.querySelectorAll("[data-master-tab]").forEach(button => button.onclick = () => { state.masterTab = button.dataset.masterTab; renderMaster(); }); root.querySelector("#add-master")?.addEventListener("click", () => openAssetForm(assetContext())); },
    afterSave: async () => { state.view = "master"; state.masterTab = "assets"; await load(); },
    manageAssets: () => { state.view = "master"; state.masterTab = "assets"; render(); }
  };
}

function renderMaster() {
  const allowedTabs = [["customers","customers.view"],["products", "master.products"], ["materials", "master.materials"], ["finishings", "master.finishings"], ["machines", "master.machines"], ["users", "users.manage"]].filter(([, permission]) => can(permission)).map(([id]) => id);
  if (canManageSettings()) allowedTabs.push("categories", "pics", "assets");
  if(state.currentUser?.role==="OWNER"&&can("master.products"))allowedTabs.push("campaigns");
  if (!allowedTabs.includes(state.masterTab)) state.masterTab = allowedTabs[0] || "users";
  if(state.masterTab==="campaigns")return homeCampaignUI.mountSettings();
  if (state.masterTab === "customers")return customersUI.mountMaster();
  if (state.masterTab === "assets") return mountAssets(assetContext());
  if (["categories", "pics"].includes(state.masterTab)) return renderSettingsMaster();
  const title = { products: "Produk", materials: "Bahan", finishings: "Finishing", machines: "Mesin", users: "User" }[state.masterTab];
  const productRows = state.allProducts.map((product) => {
    const materials = (product.materialSources || []).map((source) => source.name).filter(Boolean).join(", ") || "—";
    const machines = (product.machineIds || []).map((id) => state.machines.find((item) => item.id === id)?.name).filter(Boolean).join(", ") || "—";
    return `<tr data-master-row data-category="${escapeHtml(product.category)}" data-machines="${escapeHtml((product.machineIds || []).join(","))}" data-promo="${discountActive(product)}"><td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku || "—")}</small></td><td>${escapeHtml(product.category)}</td><td>${escapeHtml(product.saleUnit || product.unitName || "—")}</td><td class="compact-cell">${escapeHtml(materials)}</td><td class="compact-cell">${escapeHtml(machines)}</td><td><strong>${rupiah.format(product.price)}</strong>${product.wholesaleEnabled ? '<small class="blue-text">Harga grosir aktif</small>' : ""}${discountActive(product) ? `<small class="promo-text">DISKON · ${escapeHtml(discountLabel(product))}</small>` : ""}</td><td><span class="badge ${product.active === false ? "warn" : "ok"}">${product.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-product="${product.id}">Edit</button></td></tr>`;
  }).join("");
  const materialRows = state.materials.map((material) => {
    const stock = state.inventory.find((item) => item.materialId === material.id || item.sku === material.sku);
    return `<tr data-category="${escapeHtml(material.category)}" data-sort-category="${escapeHtml(material.category)}"><td><strong>${escapeHtml(material.name)}</strong><small>${escapeHtml(material.sku)}</small>${material.lfLegacyGroup?'<small>Bahan generik lama · saldo belum dibagi</small>':""}</td><td>${escapeHtml(material.category)}</td><td>${escapeHtml(material.unit)}<small>${material.stockMethod === "ROLL" ? "Per Roll" : "Per Satuan"}</small></td><td class="${!stock?.stockNeedsCount && Number(stock?.quantity || 0) <= Number(material.minStock || 0) ? "stock-negative" : ""}">${Number(stock?.quantity || 0).toLocaleString("id-ID")} ${escapeHtml(stock?.unit || material.stockUnit || material.unit)}${stock?.stockNeedsCount ? "<small>Saldo lama · perlu stok opname roll</small>" : ""}</td><td>${rupiah.format(material.cost)}</td><td>${escapeHtml(material.supplier || "—")}</td><td><span class="badge ${material.active === false ? "warn" : "ok"}">${material.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-material="${material.id}">Edit</button></td></tr>`;
  }).join("");
  const machineRows = state.machines.map((machine) => `<tr><td><strong>${escapeHtml(machine.name)}</strong><small>${escapeHtml(machine.code)}</small></td><td>${escapeHtml(machine.type)}</td><td>${escapeHtml(machine.capacity || "—")}</td><td>${rupiah.format(machine.costPerHour)}/jam</td><td><span class="badge ${machine.status === "AKTIF" ? "ok" : "warn"}">${escapeHtml(machine.status)}</span></td><td><button class="secondary" data-edit-machine="${machine.id}">Edit</button></td></tr>`).join("");
  const finishingRows = state.finishings.map((finishing) => `<tr data-finishing-type="${finishingType(finishing)}" data-categories="${escapeHtml(JSON.stringify(finishing.categories || []))}" data-sort-category="${escapeHtml([...(finishing.categories || [])].sort((a, b) => a.localeCompare(b, "id"))[0] || "")}"><td><strong>${escapeHtml(finishing.name)}</strong><small>${escapeHtml(finishing.code)}</small></td><td>${finishingTypeLabel(finishing)}</td><td class="compact-cell">${(finishing.categories || []).map((category) => `<span class="mini-chip">${escapeHtml(category)}</span>`).join(" ")}</td><td>${rupiah.format(finishing.price)}</td><td>${escapeHtml({ free: "Per unit", area: "Per m²", point: "Per titik", perimeter: "Keliling", top_bottom: "Atas–bawah", left_right: "Kanan–kiri", length: "Meter lari" }[finishing.rule] || finishing.rule)}</td><td><span class="badge ${finishing.active === false ? "warn" : "ok"}">${finishing.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-finishing="${finishing.id}">Edit</button></td></tr>`).join("");
  const userRows = state.users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong><small>@${escapeHtml(user.username)}</small></td><td><span class="role-badge role-${user.role.toLowerCase()}">${escapeHtml(user.roleLabel)}</span></td><td>${user.permissions.length} permission</td><td>${escapeHtml({ all: "Semua periode", today: "Hari ini", own: "Pekerjaan sendiri" }[user.reportScope] || user.reportScope)}</td><td>${user.lastLoginAt ? dateFormat.format(new Date(user.lastLoginAt)) : "Belum pernah"}</td><td><span class="badge ${user.active === false ? "warn" : "ok"}">${user.active === false ? "NONAKTIF" : "AKTIF"}</span></td><td><button class="secondary" data-edit-user="${user.id}">Atur Akses</button></td></tr>`).join("");
  const tables = {
    products: `<table><thead><tr><th>Produk</th><th>Kategori</th><th>Satuan</th><th>Bahan terkait</th><th>Mesin</th><th>Harga jual</th><th>Status</th><th></th></tr></thead><tbody>${productRows}</tbody></table>`,
    materials: `<table><thead><tr><th>Bahan</th><th>Kategori</th><th>Satuan</th><th>Stok</th><th>Harga dasar</th><th>Supplier</th><th>Status</th><th></th></tr></thead><tbody>${materialRows}</tbody></table>`,
    finishings: `<table><thead><tr><th>Finishing</th><th>Tipe</th><th>Kategori sesuai</th><th>Harga</th><th>Perhitungan</th><th>Status</th><th></th></tr></thead><tbody>${finishingRows}</tbody></table>`,
    machines: `<table><thead><tr><th>Mesin</th><th>Jenis</th><th>Kapasitas</th><th>Biaya</th><th>Status</th><th></th></tr></thead><tbody>${machineRows}</tbody></table>`,
    users: `<table><thead><tr><th>User</th><th>Role</th><th>Akses</th><th>Scope Laporan</th><th>Login Terakhir</th><th>Status</th><th></th></tr></thead><tbody>${userRows}</tbody></table>`
  };
  const productFilters = ["materials", "finishings"].includes(state.masterTab) ? `<select id="filter-category" class="filter-select"><option value="">Semua kategori</option>${[...(state.masterTab === "materials" ? state.catalogOptions.materialCategories : state.catalogOptions.categories)].sort((a, b) => a.localeCompare(b, "id")).map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select><select id="sort-master" class="filter-select"><option value="category-asc">Kategori A–Z</option><option value="category-desc">Kategori Z–A</option><option value="name">Nama A–Z</option></select>` : state.masterTab === "products" ? `<select id="filter-category" class="filter-select"><option value="">Semua kategori</option>${productCategories().filter(([id]) => id !== "all").map(([, label]) => `<option>${escapeHtml(label)}</option>`).join("")}</select><select id="filter-machine" class="filter-select"><option value="">Semua mesin</option>${state.machines.map((machine) => `<option value="${machine.id}">${escapeHtml(machine.name)}</option>`).join("")}</select><button id="filter-promo" class="filter-chip" type="button">✦ Diskon</button>` : "";
  const audit = state.masterTab === "users" && can("audit.view") ? `<section class="panel audit-panel"><div class="panel-head"><h2>Audit Log Terakhir</h2><span>${state.auditLogs.length} aktivitas</span></div><div class="audit-list">${state.auditLogs.slice(0, 30).map((item) => `<div><span>${escapeHtml(item.action)}</span><p><strong>${escapeHtml(item.userName)}</strong> · ${escapeHtml(item.description)}</p><small>${dateFormat.format(new Date(item.createdAt))}</small></div>`).join("") || '<p class="note">Belum ada aktivitas.</p>'}</div></section>` : "";
  root.innerHTML = `<div class="master-page">${masterHeader(title)}<section class="panel"><div class="panel-head master-list-head"><h2>Daftar ${title}</h2><div class="master-filters"><input id="master-search" class="search" placeholder="Cari ${title.toLowerCase()}…">${productFilters}${state.masterTab === "finishings" ? `<select id="filter-finishing-type" class="filter-select" aria-label="Filter tipe finishing"><option value="">Semua tipe</option>${FINISHING_TYPES.map(type=>`<option value="${type.id}">${type.label}</option>`).join("")}</select>` : ""}</div></div><div class="table-wrap master-table">${tables[state.masterTab]}</div></section>${audit}</div>`;
  document.querySelectorAll("[data-master-tab]").forEach((button) => button.onclick = () => { state.masterTab = button.dataset.masterTab; renderMaster(); });
  document.querySelector("#add-master").onclick = () => state.masterTab === "products" ? openProductForm() : state.masterTab === "materials" ? openMaterialForm() : state.masterTab === "finishings" ? openFinishingForm() : state.masterTab === "machines" ? openMachineForm() : openUserForm();
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.onclick = () => openProductForm(state.allProducts.find((item) => item.id === button.dataset.editProduct)));
  document.querySelectorAll("[data-edit-material]").forEach((button) => button.onclick = () => openMaterialForm(state.materials.find((item) => item.id === button.dataset.editMaterial)));
  document.querySelectorAll("[data-edit-finishing]").forEach((button) => button.onclick = () => openFinishingForm(state.finishings.find((item) => item.id === button.dataset.editFinishing)));
  document.querySelectorAll("[data-edit-machine]").forEach((button) => button.onclick = () => openMachineForm(state.machines.find((item) => item.id === button.dataset.editMachine)));
  document.querySelectorAll("[data-edit-user]").forEach((button) => button.onclick = () => openUserForm(state.users.find((item) => item.id === button.dataset.editUser)));
  let promoOnly = false;
  const applyFilters = () => { const query = document.querySelector("#master-search").value.toLowerCase(); const category = document.querySelector("#filter-category")?.value || ""; const machine = document.querySelector("#filter-machine")?.value || ""; const type = document.querySelector("#filter-finishing-type")?.value || ""; document.querySelectorAll(".master-table tbody tr").forEach((row) => { const matches = row.textContent.toLowerCase().includes(query) && (!category || row.dataset.category === category || JSON.parse(row.dataset.categories || "[]").includes(category)) && (!machine || (row.dataset.machines || "").split(",").includes(machine)) && (!promoOnly || row.dataset.promo === "true") && (!type || row.dataset.finishingType === type); row.classList.toggle("hidden", !matches); }); };
  alignPageHeader(root);
  document.querySelector("#master-search").oninput = applyFilters;
  document.querySelector("#filter-finishing-type")?.addEventListener("change", applyFilters);
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
    return `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${count} ${kind === "products" ? "produk" : "bahan"}</td><td><button class="secondary" data-edit-category-name="${escapeHtml(name)}">Edit</button>${kind === "products" && categoryId(name) === "print-a3" && canManageSettings() ? ' <button class="secondary" data-sheet-profiles>Profil Kalkulator</button>' : ""}</td></tr>`;
  }).join("") : activePics().map((pic) => `<tr><td><strong>${escapeHtml(pic.name)}</strong></td><td>${projectJobs(state.orders).filter(job => job.designPicId === pic.id && !["SELESAI", "DIAMBIL"].includes(job.status)).length} produk berjalan</td><td><button class="secondary" data-edit-pic="${escapeHtml(pic.id)}">Edit</button></td></tr>`).join("");
  root.innerHTML = `<div class="master-page">${masterHeader(categories ? "Kategori" : "PIC")}${categories ? `<div class="settings-kind-tabs">${[["products", "Kategori Produk"], ["materials", "Kategori Bahan"]].map(([id, name]) => `<button class="secondary ${kind === id ? "active" : ""}" data-settings-category-kind="${id}">${name}</button>`).join("")}</div>` : '<p class="product-note">PIC adalah daftar nama mandiri untuk kolom PIC pesanan, terpisah dari akun User.</p>'}<section class="panel"><div class="panel-head master-list-head"><h2>${categories ? kind === "products" ? "Kategori Produk" : "Kategori Bahan" : "Daftar PIC"}</h2><input id="settings-search" class="search" type="search" placeholder="Cari ${categories ? "kategori" : "PIC"}…"></div><div class="table-wrap master-table"><table><thead><tr><th>Nama</th><th>Penggunaan</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3">Belum ada data.</td></tr>'}</tbody></table></div></section></div>`;
  document.querySelectorAll("[data-master-tab]").forEach((button) => button.onclick = () => { state.masterTab = button.dataset.masterTab; renderMaster(); });
  document.querySelectorAll("[data-settings-category-kind]").forEach((button) => button.onclick = () => { state.categorySettingsKind = button.dataset.settingsCategoryKind; renderSettingsMaster(); });
  document.querySelector("#add-master").onclick = () => categories ? openCategoryForm(kind) : openPicForm();
  document.querySelectorAll("[data-edit-category-name]").forEach((button) => button.onclick = () => openCategoryForm(kind, button.dataset.editCategoryName));
  document.querySelectorAll("[data-sheet-profiles]").forEach(button => button.onclick = () => openSheetProfiles({ getProfiles: () => state.catalogOptions.sheetCalculatorProfiles || [], showDialog: showMasterDialog, api, refresh: load, toast, escapeHtml }));
  document.querySelectorAll("[data-edit-pic]").forEach((button) => button.onclick = () => openPicForm(activePics().find((pic) => pic.id === button.dataset.editPic)));
  alignPageHeader(root);
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

let stockUiPromise;
function getStockUi() { return stockUiPromise ||= import("./stock-ui.js").then(({ createStockUi }) => createStockUi({ state, root, dialog, api, escapeHtml, dateFormat, showMasterDialog, switchHtml, deleteButtonHtml, bindDeleteRecord, can, load, render, toast })); }
function openMaterialForm(material = null) { return getStockUi().then(ui => ui.openMaterialForm(material)); }

function finishingTierRowHtml(tier = {}) {
  return `<div class="builder-row" data-finishing-tier><label class="field"><span>Jumlah minimum</span><input data-finishing-min type="number" min="0.0001" step="any" value="${tier.min ?? ""}" required></label><label class="field"><span>Jumlah maksimum</span><input data-finishing-max type="number" min="0.0001" step="any" value="${tier.max ?? ""}" placeholder="Tanpa batas"></label><label class="field"><span>Harga / unit</span><span class="money-input"><b>Rp</b><input data-finishing-tier-price type="text" inputmode="numeric" value="${tier.price == null ? "" : formatMoneyValue(tier.price)}" required></span></label><button type="button" class="text-button" data-remove-finishing-tier aria-label="Hapus tingkat grosir">×</button></div>`;
}

function openFinishingForm(finishing = null) {
  const categories = productCategories().filter(([id]) => id !== "all").map(([, label]) => label);
  const rules = [["free", "Per unit"], ["area", "Per m²"], ["point", "Per titik"], ["perimeter", "Keliling"], ["top_bottom", "Atas–bawah"], ["left_right", "Kanan–kiri"], ["length", "Meter lari"]];
  const detail = showMasterDialog(finishing ? "Edit Finishing" : "Tambah Finishing", `<form id="finishing-form" class="master-form"><div class="form-grid">
    <label class="field"><span>Nama finishing *</span><input name="name" value="${escapeHtml(finishing?.name || "")}" required></label><label class="field"><span>Kode finishing *</span><input name="code" value="${escapeHtml(finishing?.code || "")}" required></label>
    <label class="field full"><span>Tipe finishing *</span><select name="type" required><option value="" disabled ${finishing ? "" : "selected"}>Pilih tipe finishing</option>${FINISHING_TYPES.map(type => `<option value="${type.id}" ${finishing && finishingType(finishing) === type.id ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
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
  if (machine && canManageSettings()) {
    const linked = (state.assetLinks || []).filter(row => row.machineId === machine.id);
    detail.querySelector("#machine-form .form-footer").insertAdjacentHTML("beforebegin", `<section class="builder-card machine-asset-summary"><div class="builder-head"><strong>Aset & Penyusutan</strong><button class="text-button" type="button" data-machine-asset>${linked.some(row => !row.disposedAt) ? "Lihat Aset" : "+ Catat sebagai Aset"}</button></div>${linked.map(row => `<p><strong>${escapeHtml(row.name)}</strong>${row.disposedAt ? " · Sudah dilepas" : ""}</p><div class="detail-meta"><div class="meta-card"><span>Harga Perolehan</span><strong>${rupiah.format(row.acquisitionCost)}</strong></div><div class="meta-card"><span>Penyusutan Bulan Ini</span><strong>${rupiah.format(row.depreciation)}</strong></div><div class="meta-card"><span>Nilai Buku</span><strong>${rupiah.format(row.bookValue)}</strong></div></div>`).join("") || '<p class="product-note">Belum ada catatan aset. Harga perolehan dan tanggal penggunaan diisi melalui Daftar Aset.</p>'}</section>`);
    detail.querySelector("[data-machine-asset]").onclick = () => { const active = linked.find(row => !row.disposedAt); if (active) openAssetDetail(assetContext(), active.id); else openAssetForm(assetContext(), null, machine); };
  }
  bindDeleteRecord(detail, machine, "machines", "Mesin", "machines");
  detail.querySelector("#machine-form").onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.target)); values.active = event.target.elements.active.checked; try { await api(machine ? `/api/machines/${machine.id}` : "/api/machines", { method: machine ? "PUT" : "POST", body: JSON.stringify(values) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "machines"; render(); toast("Mesin berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function openUserForm(user = null) {
  const role = user?.role || "CASHIER";
  const selected = new Set(user?.permissions || state.rolePresets[role]?.permissions || []);
  const groups = state.permissionCatalog.reduce((map, permission) => { (map[permission.group] ||= []).push(permission); return map; }, {});
  const permissionHtml = Object.entries(groups).map(([group, permissions]) => `<section class="permission-group"><div><strong>${escapeHtml(group)}</strong><button type="button" data-check-group="${escapeHtml(group)}">Pilih semua</button></div>${permissions.map((permission) => `<label><input type="checkbox" name="permission" value="${permission.id}" ${selected.has(permission.id) ? "checked" : ""}><span><b>${escapeHtml(permission.label)}</b><small>${escapeHtml(permission.id)}</small></span></label>`).join("")}</section>`).join("");
  const detail = showMasterDialog(user ? "Atur User & Permission" : "Tambah User", `<form id="user-form" class="master-form user-form"><div class="form-grid"><label class="field"><span>Nama lengkap *</span><input name="name" value="${escapeHtml(user?.name || "")}" required></label><label class="field"><span>Username *</span><input name="username" value="${escapeHtml(user?.username || "")}" required></label><label class="field"><span>Role *</span><select name="role">${Object.entries(state.rolePresets).map(([id, preset]) => `<option value="${id}" ${role === id ? "selected" : ""}>${escapeHtml(preset.label)}</option>`).join("")}</select></label><label class="field"><span>${user ? "PIN baru (kosongkan jika tetap)" : "PIN *"}</span><input name="pin" type="password" inputmode="numeric" minlength="6" ${user ? "" : "required"}></label><label class="field"><span>Scope laporan</span><select name="reportScope"><option value="all" ${user?.reportScope === "all" ? "selected" : ""}>Semua periode</option><option value="today" ${user?.reportScope === "today" ? "selected" : ""}>Hari ini saja</option><option value="own" ${user?.reportScope === "own" ? "selected" : ""}>Pekerjaan sendiri</option></select></label></div><div class="permission-heading"><div><h3>Permission Khusus</h3><p>Role memberikan template awal. Permission dapat disesuaikan untuk user ini.</p></div><button id="reset-role-permissions" class="secondary" type="button">Gunakan Template Role</button></div><div class="permission-grid">${permissionHtml}</div><div class="form-footer">${switchHtml("active", user?.active !== false)}${deleteButtonHtml(user, "User")}<button type="button" class="secondary" id="cancel-master">Batal</button><button class="primary" type="submit">Simpan User</button></div></form>`);
  const form = detail.querySelector("#user-form");
  form.querySelector(".form-grid").insertAdjacentHTML("beforeend", `<label class="field"><span>Profil Briefing Pagi</span><select name="briefingProfile">${briefingProfileOptions.map(([value,label])=>`<option value="${value}" ${(user?.briefingProfile || "auto")===value?"selected":""}>${escapeHtml(label)}</option>`).join("")}</select><small>Isi briefing tetap dibatasi permission akun. Tim Finishing dapat memakai profil ini pada akun produksi.</small></label>`);
  bindDeleteRecord(detail, user, "users", "User", "users");
  const applyRole = () => { const preset = state.rolePresets[form.elements.role.value]; const allowed = new Set(preset?.permissions || []); form.querySelectorAll('input[name="permission"]').forEach((input) => input.checked = allowed.has(input.value)); form.elements.reportScope.value = preset?.reportScope || "all"; };
  form.elements.role.onchange = applyRole;
  detail.querySelector("#reset-role-permissions").onclick = applyRole;
  detail.querySelectorAll("[data-check-group]").forEach((button) => button.onclick = () => { const section = button.closest(".permission-group"); const inputs = [...section.querySelectorAll('input[name="permission"]')]; const select = inputs.some((input) => !input.checked); inputs.forEach((input) => input.checked = select); button.textContent = select ? "Batalkan semua" : "Pilih semua"; });
  detail.querySelector("#cancel-master").onclick = () => dialog.close();
  form.onsubmit = async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const payload = { ...values, active: form.elements.active.checked, permissions: [...form.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value) }; try { await api(user ? `/api/users/${user.id}` : "/api/users", { method: user ? "PUT" : "POST", body: JSON.stringify(payload) }); dialog.close(); await load(); state.view = "master"; state.masterTab = "users"; render(); toast("User dan permission berhasil disimpan"); } catch (error) { toast(error.message, "error"); } };
}

function referenceField(label, name, options, selected, kind, valueFor = (item) => item, labelFor = (item) => item) {
  return `<div class="field reference-field"><span>${label} *</span><div class="reference-control"><select name="${name}">${options.map((item) => `<option value="${escapeHtml(valueFor(item))}" ${valueFor(item) === selected ? "selected" : ""}>${escapeHtml(labelFor(item))}</option>`).join("")}</select><button type="button" class="secondary add-reference" data-reference-kind="${kind}" aria-label="Tambah ${label}">＋</button></div><div class="reference-editor hidden" data-reference-editor="${kind}"><input data-reference-label placeholder="Nama ${label.toLowerCase()}">${kind === "priceBases" ? '<select data-reference-mode><option value="unit">Per unit</option><option value="sqm">Luas m²</option><option value="linear_m">Meter lari</option></select>' : ""}<button type="button" class="primary" data-save-reference>Simpan</button><button type="button" class="secondary" data-cancel-reference>×</button></div></div>`;
}

function materialRowHtml(source = {}) {
  return `<div class="builder-row" data-material-row><select data-material-id><option value="">Pilih bahan</option>${state.materials.filter((item) => item.active !== false || item.id === source.materialId).map((item) => `<option value="${item.id}" ${item.id === source.materialId ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.unit)}</option>`).join("")}</select><input data-material-qty type="number" min="0.0001" step="0.0001" value="${source.quantity || 1}" placeholder="Jumlah"><input data-material-waste type="hidden" value="${source.wastePercent || 0}" placeholder="Waste %"><button type="button" data-remove-builder>×</button></div>`;
}

function variantSourcesHtml(product) {
  if (!product) return "";
  const variants = [...(product.fixedSizeVariants || []).map((item) => ({ ...item, kind: "fixed" })), ...(product.sizeVariants || []).map((item) => ({ ...item, kind: "template" }))];
  const optionHtml = (selected) => `<option value="">Pilih bahan</option>${state.materials.filter((item) => item.active !== false || item.id === selected).map((item) => `<option value="${escapeHtml(item.id)}" ${selected === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.unit)}</option>`).join("")}`;
  if (!variants.length && !(product.choiceGroups || []).length) return "";
  return `<div class="builder-card" id="variant-materials"><div class="builder-head"><div><strong>Sumber bahan per varian</strong><p>Roll dikeluarkan manual; bahan satuan berkurang saat mulai Proses Cetak. Bahan varian menggantikan bahan umum; kosong berarti memakai bahan umum. Bahan dari pilihan ditambahkan di luar bahan varian.</p></div></div>
    ${variants.map((variant) => `<div class="variant-material-group" data-variant-kind="${variant.kind}" data-variant-id="${escapeHtml(variant.id)}"><div class="builder-head"><strong>${escapeHtml(variant.label)}</strong><button type="button" class="text-button" data-add-variant-material>+ Tambah Bahan</button></div><div data-variant-material-rows>${(variant.materialSources || []).map(materialRowHtml).join("")}</div><small>${variant.materialSources?.length ? "Jumlah per satu produk varian." : "Mengikuti bahan umum dan luas varian jika kosong."}</small></div>`).join("")}
    ${(product.choiceGroups || []).map((group) => `<div class="variant-material-group" data-choice-group="${escapeHtml(group.id)}"><strong>${escapeHtml(group.label)} · bahan sesuai pilihan kasir</strong>${group.options.map((option) => `<div class="builder-row choice-material-row" data-choice-option="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span><select data-choice-material aria-label="Bahan ${escapeHtml(option.label)}">${optionHtml(option.materialId)}</select><input data-choice-quantity type="number" min="0.0001" step="0.0001" value="${Number(option.quantity || 1)}" aria-label="Jumlah bahan ${escapeHtml(option.label)}"><span>${escapeHtml(option.unit || "")}</span></div>`).join("")}</div>`).join("")}</div>`;
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
  return options.length ? groupFinishingTypes(options).map(group => `<fieldset class="finishing-type-group" data-finishing-type="${group.id}"><legend>${group.label}</legend><div class="finishing-type-grid">${group.items.map((item) => `<label class="finishing-master-option"><input type="checkbox" name="finishingId" value="${item.id}" ${selectedIds.includes(item.id) ? "checked" : ""}><span><strong>${escapeHtml(item.name)}</strong><small>${item.price ? rupiah.format(item.price) : "Gratis"} · ${escapeHtml({ free: "per unit", area: "per m²", point: "per titik", perimeter: "keliling", top_bottom: "atas–bawah", left_right: "kanan–kiri", length: "meter lari" }[item.rule] || item.rule)}</small></span></label>`).join("")}</div></fieldset>`).join("") : '<p class="empty-inline">Belum ada finishing aktif untuk kategori ini. Tambahkan melalui tab Finishing.</p>';
}

function minimumSettingsHtml(product) {
  return `<section class="builder-card minimum-settings"><div class="builder-head"><strong>Minimum Pembelian</strong>${switchHtml("minimumEnabled",Boolean(product?.minimumEnabled),"Aktif")}</div><div data-minimum-fields class="${product?.minimumEnabled?'':'hidden'}"><label class="field"><span>Jumlah minimum <small data-minimum-unit>${escapeHtml(purchaseUnit(product))}</small></span><input name="minimumQuantity" type="number" min="1" step="1" value="${minimumQuantity(product)}" ${product?.minimumEnabled?'required':'disabled'}></label><small>Jumlah berikutnya bertambah satu per satu. Minimum berlaku per item pesanan.</small></div></section>`;
}
function bindMinimumSettings(form) {
  const toggle=form.elements.minimumEnabled,input=form.elements.minimumQuantity;
  const sync=()=>{form.querySelector('[data-minimum-fields]').classList.toggle('hidden',!toggle.checked);input.disabled=!toggle.checked;input.required=toggle.checked;const mode=saleUnitBasis(form.elements.saleUnit?.value);form.querySelector('[data-minimum-unit]').textContent=mode==='unit'?(form.elements.saleUnit?.value || 'pcs'):'lembar';};
  toggle.onchange=sync;form.elements.saleUnit?.addEventListener('change',sync);sync();
}

function openProductForm(product = null) {
  if (product?.dtfShirt) return openDtfProductForm(product);
  return openProductEditor({state,dialog,api,e:escapeHtml,toast,showDialog:showMasterDialog,finishingOptionsHtml,materialRowHtml,readMaterialRows,variantSourcesHtml,deleteButtonHtml,bindDeleteRecord,parseMoney,load,render,atkGroups,categoryId,categories:()=>productCategories().filter(([id])=>id!=="all").map(([,label])=>label)},product);
}

function openDtfProductForm(product) {
  const stockVariants = product.dtfStockVariants || ["Hitam", "Putih"].flatMap((color) => ["S", "M", "L", "XL", "XXL"].map((size) => ({ color, size, materialId: state.materials.find((item) => item.name === `Kaos Polos ${color} ${size}`)?.id || "" })));
  const shirtMaterials = state.materials.filter((item) => categoryId(item.category, "materials") === "kaos-polos-dtf");
  const detail = showMasterDialog("Edit Sablon Kaos", `<form id="dtf-master-form" class="master-form"><p class="product-note">Satu produk di POS. Stok kaos Hitam/Putih per ukuran dikelola melalui Stok Bahan → Kaos Polos DTF.</p><p class="section-label">Harga paket sablon / kaos</p><div class="form-grid">${product.dtfPackages.map((pack) => `<label class="field"><span>${escapeHtml(pack.label)}</span>${moneyField(`package-${pack.id}`, pack.price, "required")}</label>`).join("")}</div><p class="product-note">Ukuran XXL otomatis menambah Rp15.000 per kaos dari harga paket di atas.</p><div class="builder-card"><div class="builder-head"><div><strong>Bahan stok per warna dan ukuran</strong><p>Satu bahan kaos berbeda untuk setiap kombinasi. Jumlah stok yang berkurang mengikuti jumlah pesanan.</p></div></div><div class="form-grid">${stockVariants.map((variant) => `<label class="field" data-shirt-stock-color="${escapeHtml(variant.color)}" data-shirt-stock-size="${escapeHtml(variant.size)}"><span>${escapeHtml(variant.color)} · ${escapeHtml(variant.size)}</span><select data-shirt-stock-material>${shirtMaterials.filter((item) => item.active !== false || item.id === variant.materialId).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === variant.materialId ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(item.sku)}</option>`).join("")}</select></label>`).join("")}</div></div><div class="toggle-group">${switchHtml("active", product.active !== false)}${switchHtml("featured", Boolean(product.featured), "Tampilkan di Home")}</div>${minimumSettingsHtml(product)}<div class="form-footer sticky-form-footer">${deleteButtonHtml(product, "Produk")}<button type="button" class="secondary" id="cancel-master">Batal</button><button class="primary" type="submit">Simpan Produk</button></div></form>`);
  bindMoneyInputs(detail);
  bindDeleteRecord(detail, product, "products", "Produk", "products");
  detail.querySelector("#cancel-master").onclick = () => dialog.close();
  enhanceMaterialSelects(detail,state.materials);
  bindMinimumSettings(detail.querySelector("#dtf-master-form"));
  detail.querySelector("#dtf-master-form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const packages = product.dtfPackages.map((pack) => ({ id: pack.id, price: parseMoney(form.elements[`package-${pack.id}`].value) }));
    const stockVariants = [...form.querySelectorAll("[data-shirt-stock-color]")].map((field) => ({ color: field.dataset.shirtStockColor, size: field.dataset.shirtStockSize, materialId: field.querySelector("[data-shirt-stock-material]").value }));
    try {
      await api(`/api/products/${product.id}/dtf-packages`, { method: "PUT", body: JSON.stringify({ packages, stockVariants, minimumEnabled:form.elements.minimumEnabled.checked, minimumQuantity:Number(form.elements.minimumQuantity.value), active: form.elements.active.checked, featured: form.elements.featured.checked }) });
      dialog.close(); await load(); state.view = "master"; state.masterTab = "products"; render(); toast("Harga Sablon Kaos disimpan");
    } catch (error) { toast(error.message, "error"); }
  };
}

function renderStock() { return getStockUi().then(ui => { if (state.view === "stock") ui.renderStock(); }); }
function openStockEntry(item) { return getStockUi().then(ui => ui.openStockEntry(item)); }

document.querySelectorAll(".nav-item").forEach((button) => button.onclick = async () => { if (!canView(button.dataset.view)) return; if (state.view === "employees" && hasUnsavedPayroll()) { if (!window.confirm("Buang perubahan payroll yang belum disimpan?")) return; discardPayrollDrafts(); } closeNavigation(); state.view = button.dataset.view; try { await load(); } catch (error) { toast(error.message, "error"); } });
window.addEventListener("beforeunload", event => { if (hasUnsavedPayroll()) { event.preventDefault(); event.returnValue = ""; } });
function closeNavigation() {
  document.querySelector('#primary-navigation').classList.remove('navigation-open');
  document.querySelector('#nav-toggle').setAttribute('aria-expanded', 'false');
  document.querySelector('#account-menu').open = false;
}
document.querySelector('#nav-toggle').onclick = () => {
  const button = document.querySelector('#nav-toggle'), open = button.getAttribute('aria-expanded') !== 'true';
  document.querySelector('#account-menu').open = false;
  button.setAttribute('aria-expanded', String(open));
  document.querySelector('#primary-navigation').classList.toggle('navigation-open', open);
};
document.querySelector('#account-menu').addEventListener('toggle', event => {
  if (event.currentTarget.open) {
    document.querySelector('#primary-navigation').classList.remove('navigation-open');
    document.querySelector('#nav-toggle').setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('click', event => { if (!event.target.closest('.top-navigation')) closeNavigation(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && (document.querySelector('#account-menu').open || document.querySelector('#primary-navigation').classList.contains('navigation-open'))) { const target = document.querySelector('#account-menu').open ? document.querySelector('#account-menu summary') : document.querySelector('#nav-toggle'); closeNavigation(); target.focus(); } });
document.querySelector('.top-brand').onclick = event => { event.preventDefault(); document.querySelector(`.nav-item[data-view="${firstAllowedView()}"]`)?.click(); };
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
document.querySelector('#login-username').addEventListener('input',()=>{const form=document.querySelector('#login-form');clearInterval(form._countdown);form._countdown=null;form.querySelector('[type=submit]').disabled=false;form.querySelector('[data-security-error]').textContent='';});
document.querySelector('#login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;form.querySelector('[data-security-error]').textContent='';
  try{const session=await api('/api/login',{method:'POST',body:JSON.stringify({username:document.querySelector('#login-username').value,pin:document.querySelector('#login-pin').value})});state.currentUser=session.user;document.querySelector('#login-pin').value='';securityUI.accept(session,{announce:true});if(!session.pinChangeRequired){await load();showApp();}}
  catch(error){document.querySelector('#login-pin').value='';securityUI.countdown(form,error);}
  finally{if(!form._countdown)button.disabled=false;}
});
document.querySelector('#logout-btn').onclick=()=>securityUI.signOut();
document.querySelector('#lock-btn').onclick=()=>securityUI.lock();
document.querySelector('#security-btn').onclick=()=>securityUI.open();

const session=await api('/api/session');
if(session.authenticated){state.currentUser=session.user;securityUI.accept(session);if(!session.locked&&!session.pinChangeRequired){await load();showApp();}}
else showLogin();
