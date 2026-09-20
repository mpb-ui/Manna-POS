const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
const state = {
  products: [], orders: [], inventory: [], stockMovements: [], statusLabels: {},
  cart: [], view: "pos", selectedProduct: null, editingOrderId: null,
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
  state.selectedProduct ||= state.products[0]?.id;
  document.querySelector("#active-count").textContent = state.orders.filter((o) => !["SELESAI", "DIAMBIL"].includes(o.status)).length;
  render();
}

function render() {
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === state.view));
  document.querySelector("#page-title").textContent = { pos: "Point of Sale", projects: "Project Management", stock: "Stok Bahan" }[state.view];
  if (state.view === "pos") renderPos();
  if (state.view === "projects") renderProjects();
  if (state.view === "stock") renderStock();
}

function selectedProduct() { return state.products.find((p) => p.id === state.selectedProduct); }
function billedLength(value) { return Math.max(1, Math.ceil(Number(value || 1) * 2 - 1e-9) / 2); }
function productBase(product, width, length, quantity) {
  const billed = billedLength(length);
  const units = product.priceBasis === "sqm" ? Number(width) * billed * Number(quantity) : billed * Number(quantity);
  return { billed, total: units * product.price };
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
      <div class="qty-stepper hidden" data-stepper="${finish.id}">
        <button type="button" data-minus="${finish.id}">−</button>
        <input type="number" min="1" step="1" data-finish-qty="${finish.id}" value="1" aria-label="Jumlah ${finish.name}">
        <button type="button" data-plus="${finish.id}">+</button>
      </div>
    </div>`).join("");
}

function renderPos() {
  const product = selectedProduct();
  root.innerHTML = `<div class="view-grid">
    <section class="panel"><div class="panel-head"><h2>${state.editingOrderId ? "Edit Draft Pesanan" : "Konfigurasi Produk"}</h2><span class="badge info">Outdoor</span></div><div class="panel-body">
      <p class="section-label">1 · Pilih bahan</p><div class="product-grid">${state.products.map((p) => `<div class="choice-card"><input type="radio" id="p-${p.id}" name="product" value="${p.id}" ${p.id === state.selectedProduct ? "checked" : ""}><label for="p-${p.id}"><strong>${p.name}</strong><small>${rupiah.format(p.price)} ${p.unitLabel}</small></label></div>`).join("")}</div>
      <hr class="divider"><p class="section-label">2 · Ukuran & jumlah</p>
      <div class="form-grid three"><div class="field full"><span>Lebar bahan</span><div class="chips" id="width-chips">${product.widths.map((w, i) => `<div class="chip"><input type="radio" name="width" id="w-${i}" value="${w}" ${i === 0 ? "checked" : ""}><label for="w-${i}">${w} meter</label></div>`).join("")}</div></div>
      <label class="field"><span>Panjang aktual (m)</span><input id="length" type="number" min="0.1" step="0.1" value="1"></label><label class="field"><span>Jumlah produk</span><input id="quantity" type="number" min="1" step="1" value="1"></label><div class="field"><span>Panjang ditagihkan</span><input id="billed-length" value="1 m" disabled></div></div>
      <div class="note" id="product-note">${product.note}</div>
      <hr class="divider"><p class="section-label">3 · Finishing</p><div class="finishing-grid" id="finishing-grid">${finishingHtml(product)}</div>
      <hr class="divider"><label class="field"><span class="section-label">4 · Catatan produksi item</span><textarea id="production-note" placeholder="Contoh: file banner utama, warna mengikuti logo, ring setiap 50 cm…"></textarea></label>
      <div class="price-preview"><div><span>Estimasi item</span><p style="margin:4px 0 0" id="formula-text">—</p></div><strong id="item-price">Rp0</strong></div>
      <button id="add-item" class="primary full" style="margin-top:12px">+ Tambah ke Pesanan</button>
    </div></section>
    <aside><section class="panel sticky-summary"><div class="panel-head"><h2>Ringkasan Pesanan</h2><span>${state.cart.length} item</span></div><div class="panel-body"><div id="cart-list">${cartHtml()}</div>${checkoutHtml()}</div></section></aside>
  </div>`;
  bindPos();
  updatePreview();
}

function cartHtml() {
  if (!state.cart.length) return '<div class="cart-empty">Belum ada produk.<br><small>Data pelanggan dapat diisi terlebih dahulu.</small></div>';
  return state.cart.map((line, i) => `<div class="cart-item"><div><h4>${line.productName}</h4><p>${line.width} m × ${line.billedLength} m · ${line.quantity}x</p><p>${line.finishingNames || "Tanpa finishing tambahan"}</p><p class="item-note">Catatan: ${escapeHtml(line.productionNote || "—")}</p><strong>${rupiah.format(line.previewTotal)}</strong></div><button data-remove="${i}">Hapus</button></div>`).join("");
}

function checkoutHtml() {
  const total = state.cart.reduce((sum, item) => sum + item.previewTotal, 0);
  return `<div class="summary-row total"><span>Total</span><span>${rupiah.format(total)}</span></div><form id="checkout" class="order-form"><div class="form-grid">
    <label class="field full"><span>Nama pelanggan *</span><input name="customerName" value="${escapeHtml(state.draft.customerName)}" required></label>
    <label class="field"><span>No. WhatsApp</span><input name="phone" value="${escapeHtml(state.draft.phone)}"></label>
    <label class="field"><span>Deadline</span><input name="deadline" type="datetime-local" value="${escapeHtml(state.draft.deadline)}"></label>
    <label class="field full"><span>Status file</span><select name="fileStatus"><option value="SIAP_CETAK" ${state.draft.fileStatus === "SIAP_CETAK" ? "selected" : ""}>Siap cetak / preflight</option><option value="EDIT_RINGAN" ${state.draft.fileStatus === "EDIT_RINGAN" ? "selected" : ""}>Edit ringan</option><option value="EDIT_SEDANG" ${state.draft.fileStatus === "EDIT_SEDANG" ? "selected" : ""}>Edit sedang</option><option value="DESAIN_BARU" ${state.draft.fileStatus === "DESAIN_BARU" ? "selected" : ""}>Desain baru</option></select></label>
  </div><button class="primary full" type="submit" ${state.cart.length ? "" : "disabled"}>${state.editingOrderId ? "Simpan Perubahan Draft" : "Simpan Draft Pesanan"}</button>${state.editingOrderId ? '<button id="cancel-edit" class="secondary full" type="button" style="margin-top:8px">Batal Edit</button>' : ""}</form>`;
}

function readCurrentLine() {
  const product = selectedProduct();
  const width = Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
  const length = Number(document.querySelector("#length")?.value || 1);
  const quantity = Math.max(1, Number(document.querySelector("#quantity")?.value || 1));
  const base = productBase(product, width, length, quantity);
  let finishTotal = 0;
  const finishing = [...document.querySelectorAll('#finishing-grid input[type="checkbox"]:checked')].map((input) => {
    const finish = product.finishing.find((f) => f.id === input.value);
    const units = Math.max(1, Number(document.querySelector(`[data-finish-qty="${finish.id}"]`)?.value || 1));
    finishTotal += units * finish.price;
    return { id: finish.id, units };
  });
  return {
    productId: product.id, productName: product.name, width, length, billedLength: base.billed,
    quantity, finishing,
    finishingNames: finishing.map((f) => {
      const finish = product.finishing.find((x) => x.id === f.id);
      return `${finish?.name} × ${f.units}`;
    }).join(", "),
    productionNote: document.querySelector("#production-note")?.value.trim() || "",
    previewTotal: base.total + finishTotal
  };
}

function updatePreview() {
  const line = readCurrentLine();
  document.querySelector("#billed-length").value = `${line.billedLength} m`;
  document.querySelector("#item-price").textContent = rupiah.format(line.previewTotal);
  document.querySelector("#formula-text").textContent = `${line.width} m × ${line.billedLength} m × ${line.quantity}`;
}

function toggleFinishing(input) {
  const product = selectedProduct();
  const finish = product.finishing.find((item) => item.id === input.value);
  const stepper = document.querySelector(`[data-stepper="${finish.id}"]`);
  stepper?.classList.toggle("hidden", !input.checked);
  if (input.checked) {
    const width = Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
    const length = billedLength(document.querySelector("#length")?.value || 1);
    document.querySelector(`[data-finish-qty="${finish.id}"]`).value = suggestedFinishUnits(finish, width, length);
  }
  updatePreview();
}

function syncDraft(form) {
  const values = Object.fromEntries(new FormData(form));
  state.draft = { customerName: values.customerName || "", phone: values.phone || "", deadline: values.deadline || "", fileStatus: values.fileStatus || "SIAP_CETAK" };
}

function bindPos() {
  document.querySelectorAll('input[name="product"]').forEach((input) => input.addEventListener("change", () => { state.selectedProduct = input.value; renderPos(); }));
  document.querySelectorAll('#length,#quantity,input[name="width"],[data-finish-qty]').forEach((input) => {
    input.addEventListener("input", updatePreview); input.addEventListener("change", updatePreview);
  });
  document.querySelectorAll('#finishing-grid input[type="checkbox"]').forEach((input) => input.addEventListener("change", () => toggleFinishing(input)));
  document.querySelectorAll("[data-minus]").forEach((button) => button.onclick = () => {
    const input = document.querySelector(`[data-finish-qty="${button.dataset.minus}"]`);
    input.value = Math.max(1, Number(input.value || 1) - 1); updatePreview();
  });
  document.querySelectorAll("[data-plus]").forEach((button) => button.onclick = () => {
    const input = document.querySelector(`[data-finish-qty="${button.dataset.plus}"]`);
    input.value = Number(input.value || 0) + 1; updatePreview();
  });
  document.querySelector("#add-item").onclick = () => {
    const line = readCurrentLine(); state.cart.push(line);
    syncDraft(document.querySelector("#checkout")); renderPos(); toast("Produk ditambahkan");
  };
  document.querySelectorAll("[data-remove]").forEach((button) => button.onclick = () => {
    syncDraft(document.querySelector("#checkout")); state.cart.splice(Number(button.dataset.remove), 1); renderPos();
  });
  const checkout = document.querySelector("#checkout");
  checkout.addEventListener("input", () => syncDraft(checkout));
  checkout.addEventListener("change", () => syncDraft(checkout));
  checkout.addEventListener("submit", async (event) => {
    event.preventDefault(); syncDraft(checkout);
    try {
      const payload = { ...state.draft, items: state.cart };
      const order = state.editingOrderId
        ? await api(`/api/orders/${state.editingOrderId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/api/orders", { method: "POST", body: JSON.stringify(payload) });
      state.cart = []; state.editingOrderId = null;
      state.draft = { customerName: "", phone: "", deadline: "", fileStatus: "SIAP_CETAK" };
      await load(); toast(`${order.code} berhasil disimpan`);
      state.view = "projects"; render();
    } catch (error) { toast(error.message, "error"); }
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
  root.innerHTML = `<div class="toolbar-row"><input id="project-search" class="search" placeholder="Cari nomor atau pelanggan…"><button id="reload-projects" class="secondary">Muat ulang</button></div><div class="kanban-wrap"><div class="kanban">${statuses.map((status) => projectColumn(status)).join("")}</div></div>`;
  document.querySelectorAll("[data-order]").forEach((card) => card.onclick = () => openOrder(card.dataset.order));
  document.querySelector("#project-search").addEventListener("input", (event) => {
    const value = event.target.value.toLowerCase();
    document.querySelectorAll(".order-card").forEach((card) => card.classList.toggle("hidden", !card.textContent.toLowerCase().includes(value)));
  });
  document.querySelector("#reload-projects").onclick = load;
}

function projectColumn(status) {
  const orders = state.orders.filter((order) => order.status === status);
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
  const finishing = (item.finishing || []).map((finish) => `${escapeHtml(finish.name)} × ${finish.units}`).join(", ");
  return `<strong>${escapeHtml(item.productName)}</strong><small>${item.width} × ${item.billedLength} m · ${item.quantity}x</small>${finishing ? `<small>Finishing: ${finishing}</small>` : ""}<small>Catatan: ${escapeHtml(item.productionNote || "—")}</small>`;
}

function openOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  const isDesign = order.status === "DESAIN";
  const isWaiting = order.status === "MENUNGGU_PEMBAYARAN";
  const outstanding = Math.max(0, order.total - Number(order.paidAmount || 0));
  const detail = document.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head"><div><span class="order-code">${order.code}</span><h2 style="margin:5px 0 0">${escapeHtml(order.customerName)}</h2></div><button class="detail-close">×</button></div><div class="detail-body">
    <div class="detail-meta ${isDesign ? "design-meta" : ""}"><div class="meta-card"><span>Status</span><strong>${state.statusLabels[order.status]}</strong></div>${isDesign ? "" : `<div class="meta-card"><span>Pembayaran</span><strong>${paymentStatus(order).replaceAll("_", " ")}</strong></div>`}${isWaiting ? "" : `<div class="meta-card"><span>PIC Design</span><strong>${escapeHtml(order.designPic || "Belum diambil")}</strong></div>`}</div>
    <div class="order-items-detail">${order.items.map((item, index) => `<div class="detail-item"><span class="item-number">${index + 1}</span><div>${itemDetail(item)}</div>${isDesign ? "" : `<strong class="item-price">${rupiah.format(item.subtotal)}</strong>`}</div>`).join("")}</div>
    ${isDesign ? "" : `<div class="detail-total"><span>Total Pesanan</span><strong>${rupiah.format(order.total)}</strong></div>`}
    <p class="note" style="margin-top:12px"><strong>Deadline:</strong> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "Tidak ditentukan"}<br><strong>Status file:</strong> ${escapeHtml((order.fileStatus || "SIAP_CETAK").replaceAll("_", " "))}</p>
    ${isDesign ? `<div class="operator-box"><label class="field"><span>Nama Operator Design</span><input id="design-pic-input" value="${escapeHtml(order.designPic || "")}" placeholder="Ketik nama operator yang menangani"></label><button id="save-design-pic" class="secondary">Simpan PIC</button></div>` : ""}
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
      await api(`/api/orders/${order.id}/design-pic`, { method: "PATCH", body: JSON.stringify({ designPic: detail.querySelector("#design-pic-input").value }) });
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
    finishing: (item.finishing || []).map((finish) => ({ id: finish.id, units: finish.units })),
    finishingNames: (item.finishing || []).map((finish) => `${finish.name} × ${finish.units}`).join(", "),
    productionNote: item.productionNote || "", previewTotal: item.subtotal
  }));
  state.draft = { customerName: order.customerName || "", phone: order.phone || "", deadline: order.deadline || "", fileStatus: order.fileStatus || "SIAP_CETAK" };
  state.editingOrderId = order.id;
  state.selectedProduct = state.cart[0]?.productId || state.selectedProduct;
  state.view = "pos";
  dialog.close(); render(); window.scrollTo({ top: 0, behavior: "smooth" });
}

function printOrder(order, type) {
  const isSpk = type === "spk";
  printDocument.className = `print-document ${type}`;
  printDocument.innerHTML = `<div class="print-brand">MANNA PRINT</div><div class="print-subtitle">${isSpk ? "SURAT PERINTAH KERJA" : "TANDA TERIMA PESANAN"}</div><hr>
    <div class="print-meta"><b>${order.code}</b><span>${dateFormat.format(new Date(order.createdAt))}</span></div>
    <p><b>Pelanggan:</b> ${escapeHtml(order.customerName)}<br><b>Deadline:</b> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "—"}${isSpk ? `<br><b>PIC Design:</b> ${escapeHtml(order.designPic || "—")}` : ""}</p><hr>
    ${order.items.map((item, index) => `<div class="print-item"><b>${index + 1}. ${escapeHtml(item.productName)}</b><br>${item.width} × ${item.billedLength} m · ${item.quantity}x${(item.finishing || []).length ? `<br>Finishing: ${item.finishing.map((f) => `${escapeHtml(f.name)} × ${f.units}`).join(", ")}` : ""}<br><b>Catatan:</b> ${escapeHtml(item.productionNote || "—")}${isSpk ? "" : `<br><span class="print-price">${rupiah.format(item.subtotal)}</span>`}</div>`).join("<hr>")}
    ${isSpk ? '<hr><div class="spk-checks">□ File dicek &nbsp; □ Cetak<br>□ Finishing &nbsp; □ QC</div>' : `<hr><div class="print-total"><span>Total</span><b>${rupiah.format(order.total)}</b></div><div class="print-total"><span>Dibayar</span><b>${rupiah.format(order.paidAmount || 0)}</b></div><div class="print-total"><span>Sisa</span><b>${rupiah.format(Math.max(0, order.total - (order.paidAmount || 0)))}</b></div>`}
    <hr><p class="print-footer">Manna Print · Labuan Bajo<br>Terima kasih</p>`;
  document.body.classList.add("printing");
  window.onafterprint = () => { document.body.classList.remove("printing"); printDocument.innerHTML = ""; };
  window.print();
}

function renderStock() {
  root.innerHTML = `<div class="stock-grid"><section class="panel"><div class="panel-head"><h2>Stok per Lebar Roll</h2><span class="badge info">Berkurang saat Selesai</span></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Lebar</th><th>Stok</th><th>Update</th><th></th></tr></thead><tbody>${state.inventory.map((item) => `<tr><td><strong>${item.productName}</strong></td><td>${item.width} m</td><td class="${item.quantity < 0 ? "stock-negative" : ""}">${item.quantity.toLocaleString("id-ID")} ${item.unit}</td><td>${dateFormat.format(new Date(item.updatedAt))}</td><td><button class="secondary" data-adjust="${item.sku}">Sesuaikan</button></td></tr>`).join("")}</tbody></table></div></section><aside class="panel"><div class="panel-head"><h2>Mutasi Terakhir</h2></div><div class="panel-body">${state.stockMovements.length ? state.stockMovements.slice(0, 15).map((move) => `<div class="movement"><div><strong>${move.productName}</strong><small>${escapeHtml(move.reason)}${move.orderCode ? ` · ${move.orderCode}` : ""}<br>${dateFormat.format(new Date(move.createdAt))}</small></div><em class="${move.change > 0 ? "plus" : "minus"}">${move.change > 0 ? "+" : ""}${move.change}</em></div>`).join("") : '<div class="cart-empty">Belum ada mutasi stok.</div>'}</div></aside></div>`;
  document.querySelectorAll("[data-adjust]").forEach((button) => button.onclick = async () => {
    const change = window.prompt("Masukkan perubahan stok meter lari. Contoh: 50 atau -2.5");
    if (!change) return;
    const reason = window.prompt("Alasan penyesuaian:", "Stok awal / stok masuk");
    try { await api(`/api/inventory/${button.dataset.adjust}`, { method: "PATCH", body: JSON.stringify({ change, reason }) }); await load(); toast("Stok diperbarui"); } catch (error) { toast(error.message, "error"); }
  });
}

document.querySelectorAll(".nav-item").forEach((button) => button.onclick = () => { state.view = button.dataset.view; render(); });
document.querySelector("#refresh-btn").onclick = load;
document.querySelector("#today").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }).format(new Date());
document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await api("/api/login", { method: "POST", body: JSON.stringify({ pin: document.querySelector("#login-pin").value }) }); showApp(); await load(); } catch (error) { toast(error.message, "error"); }
});

const session = await api("/api/session");
if (session.authenticated) { showApp(); await load(); } else showLogin();
