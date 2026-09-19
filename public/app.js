const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });
const state = { products: [], orders: [], inventory: [], stockMovements: [], statusLabels: {}, cart: [], view: "pos", selectedProduct: null };
const root = document.querySelector("#view-root");
const dialog = document.querySelector("#order-dialog");

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
function productBase(product, width, length, quantity) {
  const billed = Math.max(1, Math.ceil(Number(length || 1) * 2 - 1e-9) / 2);
  const units = product.priceBasis === "sqm" ? Number(width) * billed * Number(quantity) : billed * Number(quantity);
  return { billed, total: units * product.price };
}

function renderPos() {
  const product = selectedProduct();
  root.innerHTML = `<div class="view-grid">
    <section class="panel"><div class="panel-head"><h2>Konfigurasi Produk</h2><span class="badge info">Outdoor</span></div><div class="panel-body">
      <p class="section-label">1 · Pilih bahan</p><div class="product-grid">${state.products.map((p) => `<div class="choice-card"><input type="radio" id="p-${p.id}" name="product" value="${p.id}" ${p.id === state.selectedProduct ? "checked" : ""}><label for="p-${p.id}"><strong>${p.name}</strong><small>${rupiah.format(p.price)} ${p.unitLabel}</small></label></div>`).join("")}</div>
      <hr class="divider"><p class="section-label">2 · Ukuran & jumlah</p>
      <div class="form-grid three"><div class="field full"><span>Lebar bahan</span><div class="chips" id="width-chips">${product.widths.map((w, i) => `<div class="chip"><input type="radio" name="width" id="w-${i}" value="${w}" ${i === 0 ? "checked" : ""}><label for="w-${i}">${w} meter</label></div>`).join("")}</div></div>
      <label class="field"><span>Panjang aktual (m)</span><input id="length" type="number" min="0.1" step="0.1" value="1"></label><label class="field"><span>Jumlah</span><input id="quantity" type="number" min="1" step="1" value="1"></label><div class="field"><span>Panjang ditagihkan</span><input id="billed-length" value="1 m" disabled></div></div>
      <div class="note" id="product-note">${product.note}</div>
      <hr class="divider"><p class="section-label">3 · Finishing relevan</p><div class="chips" id="finishing-chips">${product.finishing.length ? product.finishing.map((f) => `<div class="chip"><input type="checkbox" id="f-${f.id}" value="${f.id}" data-price="${f.price}" data-rule="${f.rule}"><label for="f-${f.id}">${f.name}${f.price ? ` · ${rupiah.format(f.price)}` : " · Gratis"}</label></div>`).join("") : `<span class="note">Tidak ada finishing tambahan untuk bahan ini.</span>`}</div>
      <div id="eyelet-field" class="field hidden" style="max-width:180px;margin-top:10px"><span>Jumlah titik mata ayam</span><input id="eyelet-units" type="number" min="1" value="4"></div>
      <div class="price-preview"><div><span>Estimasi item</span><p style="margin:4px 0 0" id="formula-text">—</p></div><strong id="item-price">Rp0</strong></div>
      <button id="add-item" class="primary full" style="margin-top:12px">+ Tambah ke Pesanan</button>
    </div></section>
    <aside><section class="panel"><div class="panel-head"><h2>Ringkasan Pesanan</h2><span>${state.cart.length} item</span></div><div class="panel-body"><div id="cart-list">${cartHtml()}</div>${checkoutHtml()}</div></section></aside>
  </div>`;
  bindPos();
  updatePreview();
}

function cartHtml() {
  if (!state.cart.length) return `<div class="cart-empty">Belum ada produk.<br><small>Konfigurasikan produk lalu tambahkan.</small></div>`;
  return state.cart.map((line, i) => `<div class="cart-item"><div><h4>${line.productName}</h4><p>${line.width} m × ${line.billedLength} m · ${line.quantity}x</p><p>${line.finishingNames || "Tanpa finishing tambahan"}</p><strong>${rupiah.format(line.previewTotal)}</strong></div><button data-remove="${i}">Hapus</button></div>`).join("");
}

function checkoutHtml() {
  if (!state.cart.length) return "";
  const total = state.cart.reduce((sum, item) => sum + item.previewTotal, 0);
  return `<div class="summary-row total"><span>Total</span><span>${rupiah.format(total)}</span></div><form id="checkout" class="order-form"><div class="form-grid">
    <label class="field full"><span>Nama pelanggan *</span><input name="customerName" required></label><label class="field"><span>No. WhatsApp</span><input name="phone"></label><label class="field"><span>Deadline</span><input name="deadline" type="datetime-local"></label>
    <label class="field"><span>Status file</span><select name="fileStatus"><option value="SIAP_CETAK">Siap cetak / preflight</option><option value="EDIT_RINGAN">Edit ringan</option><option value="EDIT_SEDANG">Edit sedang</option><option value="DESAIN_BARU">Desain baru</option></select></label><label class="field"><span>PIC Operator Design</span><input name="designPic" placeholder="Diisi sekarang / saat konfirmasi"></label>
    <label class="field"><span>Metode pembayaran</span><select name="paymentMethod"><option>TUNAI</option><option>TRANSFER</option><option>QRIS</option><option>PO / TEMPO</option></select></label><label class="field"><span>Nominal diterima</span><input name="paidAmount" type="number" min="0" value="0"></label>
    <label class="field full"><span>No. PO (opsional)</span><input name="poNumber"></label><label class="field full"><span>Catatan produksi</span><textarea name="notes"></textarea></label>
  </div><button class="primary full" type="submit">Simpan Pesanan</button></form>`;
}

function readCurrentLine() {
  const product = selectedProduct();
  const width = Number(document.querySelector('input[name="width"]:checked')?.value || product.widths[0]);
  const length = Number(document.querySelector("#length")?.value || 1);
  const quantity = Number(document.querySelector("#quantity")?.value || 1);
  const base = productBase(product, width, length, quantity);
  let finishTotal = 0;
  const finishing = [...document.querySelectorAll('#finishing-chips input:checked')].map((input) => {
    const finish = product.finishing.find((f) => f.id === input.value);
    let units = 0;
    if (finish.rule === "point") units = Number(document.querySelector("#eyelet-units")?.value || 4);
    if (finish.rule === "perimeter") units = Math.ceil((width + base.billed) * 2);
    if (finish.rule === "top_bottom") units = Math.ceil(width * 2);
    if (finish.rule === "left_right") units = Math.ceil(base.billed * 2);
    if (finish.rule === "length") units = Math.ceil(base.billed);
    finishTotal += units * finish.price * quantity;
    return { id: finish.id, units };
  });
  return { productId: product.id, productName: product.name, width, length, billedLength: base.billed, quantity, finishing, finishingNames: finishing.map((f) => product.finishing.find((x) => x.id === f.id)?.name).join(", "), previewTotal: base.total + finishTotal };
}

function updatePreview() {
  const line = readCurrentLine();
  document.querySelector("#billed-length").value = `${line.billedLength} m`;
  document.querySelector("#item-price").textContent = rupiah.format(line.previewTotal);
  document.querySelector("#formula-text").textContent = `${line.width} m × ${line.billedLength} m × ${line.quantity}`;
  const eyelets = document.querySelector("#f-eyelets");
  document.querySelector("#eyelet-field")?.classList.toggle("hidden", !eyelets?.checked);
}

function bindPos() {
  document.querySelectorAll('input[name="product"]').forEach((input) => input.addEventListener("change", () => { state.selectedProduct = input.value; renderPos(); }));
  document.querySelectorAll('#length,#quantity,#eyelet-units,input[name="width"],#finishing-chips input').forEach((input) => {
    input.addEventListener("input", updatePreview);
    input.addEventListener("change", updatePreview);
  });
  document.querySelector("#add-item").onclick = () => { state.cart.push(readCurrentLine()); renderPos(); toast("Produk ditambahkan"); };
  document.querySelectorAll("[data-remove]").forEach((button) => button.onclick = () => { state.cart.splice(Number(button.dataset.remove), 1); renderPos(); });
  document.querySelector("#checkout")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    try {
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ ...form, items: state.cart }) });
      state.cart = [];
      await load();
      toast(`${order.code} berhasil dibuat`);
      state.view = "projects"; render();
    } catch (error) { toast(error.message, "error"); }
  });
}

function renderProjects() {
  const statuses = ["MENUNGGU_PEMBAYARAN", "DESAIN", "CETAK", "FINISHING", "SELESAI", "DIAMBIL"];
  root.innerHTML = `<div class="toolbar-row"><input id="project-search" class="search" placeholder="Cari nomor atau pelanggan…"><button id="reload-projects" class="secondary">Muat ulang</button></div><div class="kanban-wrap"><div class="kanban">${statuses.map((status) => projectColumn(status)).join("")}</div></div>`;
  bindProjectCards();
  document.querySelector("#project-search").addEventListener("input", (event) => {
    const value = event.target.value.toLowerCase();
    document.querySelectorAll(".order-card").forEach((card) => card.classList.toggle("hidden", !card.textContent.toLowerCase().includes(value)));
  });
  document.querySelector("#reload-projects").onclick = load;
}

function projectColumn(status) {
  const orders = state.orders.filter((order) => order.status === status);
  return `<section class="kanban-column"><div class="column-head"><h3>${state.statusLabels[status]}</h3><span>${orders.length}</span></div>${orders.map((order) => `<article class="order-card" data-order="${order.id}"><div class="order-card-head"><span class="order-code">${order.code}</span><span class="badge ${order.paymentConfirmed ? "ok" : "warn"}">${order.paymentConfirmed ? order.paymentStatus : "Belum konfirmasi"}</span></div><h4>${escapeHtml(order.customerName)}</h4><p>${order.items.map((i) => i.productName).join(", ")}</p><p>PIC: ${escapeHtml(order.designPic || "Belum ditentukan")}</p><p style="margin-top:7px"><strong>${rupiah.format(order.total)}</strong></p></article>`).join("") || `<div class="cart-empty" style="padding:28px 5px">Kosong</div>`}</section>`;
}

function bindProjectCards() { document.querySelectorAll("[data-order]").forEach((card) => card.onclick = () => openOrder(card.dataset.order)); }
function nextAction(order) {
  return {
    MENUNGGU_PEMBAYARAN: "Konfirmasi Pembayaran",
    DESAIN: "File Siap Cetak",
    CETAK: "Cetak Selesai",
    FINISHING: "Finishing Selesai",
    SELESAI: "Pesanan Diambil"
  }[order.status];
}

function openOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  const detail = document.querySelector("#order-detail");
  detail.innerHTML = `<div class="detail-head"><div><span class="order-code">${order.code}</span><h2 style="margin:5px 0 0">${escapeHtml(order.customerName)}</h2></div><button class="detail-close">×</button></div><div class="detail-body print-receipt">
    <div class="detail-meta"><div class="meta-card"><span>Status</span><strong>${state.statusLabels[order.status]}</strong></div><div class="meta-card"><span>Pembayaran</span><strong>${order.paymentStatus.replaceAll("_", " ")}</strong></div><div class="meta-card"><span>PIC Design</span><strong>${escapeHtml(order.designPic || "—")}</strong></div></div>
    <table><thead><tr><th>Produk</th><th>Ukuran</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>${order.items.map((item) => `<tr><td>${item.productName}</td><td>${item.width} × ${item.billedLength} m</td><td>${item.quantity}</td><td>${rupiah.format(item.subtotal)}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="3">Total</th><th>${rupiah.format(order.total)}</th></tr></tfoot></table>
    <p class="note" style="margin-top:12px"><strong>Catatan:</strong> ${escapeHtml(order.notes || "Tidak ada catatan")}<br><strong>Deadline:</strong> ${order.deadline ? dateFormat.format(new Date(order.deadline)) : "Tidak ditentukan"}</p>
    <p class="section-label" style="margin-top:18px">Riwayat pekerjaan</p><div class="timeline">${order.timeline.map((item) => `<div class="timeline-item"><p>${escapeHtml(item.message)}</p><small>${escapeHtml(item.actor)} · ${dateFormat.format(new Date(item.createdAt))}</small></div>`).join("")}</div>
    <div class="detail-actions">${nextAction(order) ? `<button id="advance-order" class="primary">${nextAction(order)}</button>` : ""}${["SELESAI", "DIAMBIL"].includes(order.status) ? `<button id="print-receipt" class="secondary">Print Tanda Terima</button>` : ""}</div>
  </div>`;
  detail.querySelector(".detail-close").onclick = () => dialog.close();
  detail.querySelector("#print-receipt")?.addEventListener("click", () => window.print());
  detail.querySelector("#advance-order")?.addEventListener("click", async () => {
    try {
      if (order.status === "MENUNGGU_PEMBAYARAN") {
        const designPic = window.prompt("Nama PIC Operator Design:", order.designPic || "");
        if (!designPic) return;
        const paidAmount = window.prompt("Nominal pembayaran yang dikonfirmasi:", String(order.paidAmount || order.total));
        await api(`/api/orders/${order.id}/payment`, { method: "PATCH", body: JSON.stringify({ designPic, paidAmount }) });
      } else {
        const sequence = ["MENUNGGU_PEMBAYARAN", "DESAIN", "CETAK", "FINISHING", "SELESAI", "DIAMBIL"];
        await api(`/api/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status: sequence[sequence.indexOf(order.status) + 1] }) });
      }
      dialog.close(); await load(); toast("Status pesanan diperbarui");
    } catch (error) { toast(error.message, "error"); }
  });
  dialog.showModal();
}

function renderStock() {
  root.innerHTML = `<div class="stock-grid"><section class="panel"><div class="panel-head"><h2>Stok per Lebar Roll</h2><span class="badge info">Berkurang saat Selesai</span></div><div class="table-wrap"><table><thead><tr><th>Bahan</th><th>Lebar</th><th>Stok</th><th>Update</th><th></th></tr></thead><tbody>${state.inventory.map((item) => `<tr><td><strong>${item.productName}</strong></td><td>${item.width} m</td><td class="${item.quantity < 0 ? "stock-negative" : ""}">${item.quantity.toLocaleString("id-ID")} ${item.unit}</td><td>${dateFormat.format(new Date(item.updatedAt))}</td><td><button class="secondary" data-adjust="${item.sku}">Sesuaikan</button></td></tr>`).join("")}</tbody></table></div></section><aside class="panel"><div class="panel-head"><h2>Mutasi Terakhir</h2></div><div class="panel-body">${state.stockMovements.length ? state.stockMovements.slice(0, 15).map((move) => `<div class="movement"><div><strong>${move.productName}</strong><small>${escapeHtml(move.reason)}${move.orderCode ? ` · ${move.orderCode}` : ""}<br>${dateFormat.format(new Date(move.createdAt))}</small></div><em class="${move.change > 0 ? "plus" : "minus"}">${move.change > 0 ? "+" : ""}${move.change}</em></div>`).join("") : `<div class="cart-empty">Belum ada mutasi stok.</div>`}</div></aside></div>`;
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
