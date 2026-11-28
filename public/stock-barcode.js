import { SCAN_COMMANDS, SCAN_QUANTITIES } from "./stock-scan-rules.js";
import { createStockScanSession, escapeScanText as h } from "./stock-scan-session.js";

const get = id => document.getElementById(id);
const category = get("barcode-category");
const sizes = { a4: { page: "A4", width: 210, columns: 2 }, a3plus: { page: "329mm 483mm", width: 329, columns: 3 } };
const selected = new Set();
const selectedStaff = new Set();
const paper = get("barcode-paper");
const pageStyle = document.createElement("style");
document.head.append(pageStyle);
let materials = [];
let employees = [];

const session = createStockScanSession("print", {
  onReady: load, onReset: reset, onError: error => { get("barcode-message").textContent = error; }
});

function reset() {
  materials = [];
  employees = [];
  selected.clear();
  selectedStaff.clear();
  category.replaceChildren();
  get("barcode-materials").replaceChildren();
  get("barcode-staff").replaceChildren();
  paper.replaceChildren();
  get("barcode-print").disabled = true;
}

async function load(user) {
  const [catalog, staff] = await Promise.allSettled([
    session.api("/api/stock/scan/catalog"),
    session.api("/api/stock/scan/staff")
  ]);
  if (session.user()?.id !== user.id) return;
  materials = catalog.value?.materials || [];
  employees = staff.value?.staff || [];
  category.innerHTML = '<option value="">Semua kategori</option>' + [...new Set(materials.map(row => row.category))]
    .map(name => `<option value="${h(name)}">${h(name)}</option>`).join("");
  renderChoices();
  get("barcode-staff").innerHTML = employees.map(row => `<label class="barcode-checkbox">
    <input type="checkbox" value="${h(row.barcode)}" ${selectedStaff.has(row.barcode) ? "checked" : ""}>
    <span>${h(row.name)} <span class="muted">${h(row.code || "")}</span></span></label>`).join("")
    || `<p class="muted">${h(staff.reason?.message || "Belum ada karyawan aktif.")}</p>`;
  if (catalog.status === "rejected") get("barcode-materials").textContent = catalog.reason.message;
  renderPreview();
}

function inCategory() {
  return materials.filter(row => !category.value || row.category === category.value);
}

function renderChoices() {
  get("select-category").disabled = !category.value;
  get("select-all").disabled = !materials.length;
  get("select-none").disabled = !selected.size;
  get("barcode-materials").innerHTML = inCategory().map(row => `<label class="barcode-checkbox">
    <input type="checkbox" value="${h(row.materialId)}" ${selected.has(row.materialId) ? "checked" : ""}>
    <span>${h(row.name)} <span class="muted">${h(row.rollWidthCm)} cm · ${h(row.sku)}</span></span></label>`).join("")
    || '<p class="muted">Belum ada roll yang siap dicetak.</p>';
}

function labelNode({ code, name, info }, size) {
  const label = document.createElement("article");
  label.className = "barcode-label";
  label.innerHTML = `<strong>${h(name)}</strong>${info ? `<p>${h(info)}</p>` : ""}<code>${h(code)}</code>`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  window.JsBarcode(svg, code, {
    format: "CODE128", width: 1, height: 52, displayValue: false,
    margin: 0, marginLeft: 12, marginRight: 12, background: "#fff", lineColor: "#000"
  });
  const modules = Number.parseFloat(svg.getAttribute("width"));
  const usable = size.width - 24;
  const column = (usable - (size.columns - 1) * 3) / size.columns;
  const pitch = Math.min(0.33, (usable - 6.5) / modules);
  if (pitch < 0.25) throw new Error(`Barcode ${name} terlalu panjang untuk ukuran ini. Pilih kertas yang lebih besar atau pisahkan label tersebut.`);
  const width = modules * pitch;
  const span = Math.min(size.columns, Math.ceil((width + 9.5) / (column + 3)));
  label.style.setProperty("--label-span", span);
  svg.setAttribute("width", `${width.toFixed(3)}mm`);
  svg.setAttribute("height", `${(52 * pitch).toFixed(3)}mm`);
  svg.setAttribute("aria-hidden", "true");
  label.querySelector("code").before(svg);
  return label;
}

function renderPreview() {
  const size = sizes[get("paper-size").value];
  pageStyle.textContent = `@page { size: ${size.page}; margin: 12mm; }`;
  paper.style.setProperty("--paper-columns", size.columns);
  const groups = new Map();
  if (get("print-commands").checked) groups.set("Perintah", SCAN_COMMANDS.map(([code, name]) => ({ code, name })));
  if (get("print-quantities").checked) groups.set("Jumlah Roll", SCAN_QUANTITIES.map(quantity => ({ code: `QTY:${quantity}`, name: `×${quantity} roll` })));
  const staffLabels = employees.filter(row => selectedStaff.has(row.barcode)).map(row => ({
    code: row.barcode, name: row.name, info: row.code ? `Staff · ${row.code}` : "Staff"
  }));
  if (staffLabels.length) groups.set("Staff", staffLabels);
  for (const material of materials.filter(row => selected.has(row.materialId))) {
    const title = `Bahan · ${material.category}`;
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push({ code: `MAT:${material.materialId}`, name: material.name, info: `${material.rollWidthCm} cm · ${material.sku}` });
  }
  let rendered = 0;
  const errors = new Set();
  const fragment = document.createDocumentFragment();
  for (const [name, rows] of groups) {
    const group = document.createElement("section");
    group.className = "barcode-group";
    group.innerHTML = `<h3>${h(name)}</h3><div class="barcode-labels"></div>`;
    const rowList = group.lastElementChild;
    for (const row of rows) {
      try {
        rowList.append(labelNode(row, size));
        rendered++;
      } catch (error) { errors.add(error.message); }
    }
    if (rowList.childElementCount) fragment.append(group);
  }
  paper.replaceChildren(fragment);
  if (!rendered) paper.innerHTML = '<p class="scan-empty">Pilih barcode yang ingin dicetak.</p>';
  get("preview-count").textContent = `${rendered} label · ${get("paper-size").value === "a4" ? "A4" : "A3+"}`;
  get("barcode-message").textContent = [...errors].join(" ");
  get("barcode-print").disabled = !rendered || Boolean(errors.size);
}

category.onchange = renderChoices;
get("select-all").onclick = () => { materials.forEach(row => selected.add(row.materialId)); renderChoices(); renderPreview(); };
get("select-category").onclick = () => { inCategory().forEach(row => selected.add(row.materialId)); renderChoices(); renderPreview(); };
get("select-none").onclick = () => { selected.clear(); renderChoices(); renderPreview(); };
get("barcode-materials").onchange = event => {
  const checkbox = event.target;
  if (checkbox.checked) selected.add(checkbox.value);
  else selected.delete(checkbox.value);
  get("select-none").disabled = !selected.size;
  renderPreview();
};
get("barcode-staff").onchange = event => {
  const checkbox = event.target;
  if (checkbox.checked) selectedStaff.add(checkbox.value);
  else selectedStaff.delete(checkbox.value);
  renderPreview();
};
for (const id of ["paper-size", "print-commands", "print-quantities"]) get(id).onchange = renderPreview;
get("barcode-print").onclick = () => window.print();
session.refreshSession();
