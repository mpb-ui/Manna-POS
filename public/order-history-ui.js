import { historyActions, historyProductRows } from "./order-history-detail.js";
import { holdLabel } from "./hold-label.js";
import { historyDraft, historyPaymentStatus, historyStatusSummary } from "./order-history.js";
import { projectDeadlineInfo } from "./project-deadline.js";

const timestampFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Makassar" });
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? timestampFormat.format(new Date(value)).replace(/(\d{2})\.(\d{2})$/, "$1:$2") : "—";
const methodLabels = { TUNAI: "Tunai", QRIS: "QRIS", TRANSFER: "Transfer", DEPOSIT: "Deposit" };

export function createOrderHistory({ state, root, api, escapeHtml: e, rupiah, openOrder, toast, onAction }) {
  const defaults = { q: "", from: "", to: "", status: "", payment: "", method: "", page: 1 };
  const filters = { ...defaults };
  let generation = 0, timer, selectionGeneration = 0, selectedId = null, selectedOrder = null, actionBusy = false;
  const active = () => state.view === "order-history" && state.permissions.includes("orders.view");
  function reset() { generation++; selectionGeneration++; selectedId = selectedOrder = null; clearTimeout(timer); Object.assign(filters, defaults); }
  function mount() {
    if (!active()) return;
    generation++; selectionGeneration++; selectedOrder = null; actionBusy = false;
    const money = state.permissions.includes("projects.money");
    root.innerHTML = `<section class="order-history"><div class="history-toolbar"><div class="history-heading"><h2>Status Order</h2><span id="history-count" aria-live="polite"></span></div>
      <form class="history-filters" id="history-filters">
        <label class="history-search"><span>Cari pesanan</span><input name="q" type="search" autocomplete="off" placeholder="${money ? "Invoice, pelanggan, nomor WA, nominal…" : "Invoice, pelanggan, nomor WA…"}" value="${e(filters.q)}"></label>
        <div class="history-date-filters">
          <label class="history-date ${filters.from ? "has-value" : ""}"><span>Dari tanggal (WITA)</span><input type="date" name="from" value="${e(filters.from)}"><span class="history-date-placeholder" aria-hidden="true">Dari tanggal</span></label>
          <label class="history-date ${filters.to ? "has-value" : ""}"><span>Sampai tanggal (WITA)</span><input type="date" name="to" value="${e(filters.to)}"><span class="history-date-placeholder" aria-hidden="true">Sampai tanggal</span></label>
        </div>
        <div class="history-filter-options ${money ? "" : "without-money"}">
          <label><span>Status pesanan / produk</span><select name="status"><option value="">Semua status</option><option value="DRAFT">Draft</option>${Object.entries(state.statusLabels).map(([value, label]) => `<option value="${e(value)}">${e(label)}</option>`).join("")}</select></label>
          ${money ? `<label><span>Pembayaran</span><select name="payment"><option value="">Semua pembayaran</option><option value="BELUM_LUNAS">Belum Lunas</option><option value="LUNAS">Lunas</option></select></label>
          <label><span>Metode Pembayaran</span><select name="method"><option value="">Semua metode</option>${Object.entries(methodLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>` : ""}
        </div>
      </form></div><div class="history-content"><div id="history-results" aria-live="polite"></div><div id="history-pages" class="history-pages"></div></div>
      <section class="history-selection" aria-label="Rincian pesanan terpilih">
        <div class="history-selection-products"><div class="history-product-wrap"><table class="history-product-table" aria-label="Produk pesanan terpilih"><colgroup><col class="selection-product"><col class="selection-variant"><col class="selection-size"><col class="selection-quantity"><col class="selection-finishing"><col class="selection-note"></colgroup><thead><tr>${["PRODUK","VARIAN","UKURAN","JUMLAH","FINISHING","CATATAN"].map(label=>`<th scope="col">${label}</th>`).join("")}</tr></thead><tbody id="history-selected-products"></tbody></table></div><p id="history-selection-status" role="status">Pilih pesanan untuk melihat rincian.</p></div>
        <div class="history-selection-actions"><div class="history-actions-left">${actionButton("detail","Detail")}${actionButton("edit","Edit Pesanan")}</div><div class="history-actions-right">${actionButton("invoice","Nota Ulang")}${actionButton("spk","Print SPK")}${actionButton("receipt","Print Tanda Terima")}${actionButton("payment","Konfirmasi Pembayaran")}</div></div>
      </section></section>`;
    const form = root.querySelector("#history-filters");
    for (const name of ["status", "payment", "method"]) if (form.elements[name]) form.elements[name].value = filters[name];
    root.querySelectorAll("[data-history-action]").forEach(button=>button.onclick=()=>runAction(button.dataset.historyAction));
    form.onsubmit = event => event.preventDefault();
    form.oninput = event => {
      if (event.target.type === "date") event.target.closest("label").classList.toggle("has-value", Boolean(event.target.value));
      Object.assign(filters, Object.fromEntries(new FormData(form)), { page: 1 });
      clearSelection(); generation++; clearTimeout(timer);
      root.querySelector("#history-results").setAttribute("aria-busy", "true");
      timer = setTimeout(fetchRows, event.target.name === "q" ? 250 : 0);
    };
    fetchRows();
  }
  function actionButton(action,label) { return `<button type="button" class="secondary" data-history-action="${action}" disabled>${label}</button>`; }
  function controls() {
    const allowed=historyActions(selectedOrder,state.permissions);
    root.querySelectorAll('[data-history-action]').forEach(button=>{button.disabled=actionBusy || !allowed[button.dataset.historyAction];});
  }
  function clearSelection() {
    selectionGeneration++; selectedId=selectedOrder=null; actionBusy=false;
    root.querySelectorAll('[data-history-order]').forEach(row=>row.setAttribute('aria-selected','false'));
    root.querySelector('#history-selected-products')?.replaceChildren();
    const status=root.querySelector('#history-selection-status');if(status)status.textContent='Pilih pesanan untuk melihat rincian.';
    controls();
  }
  function saveOrder(order) {
    const index=state.orders.findIndex(entry=>entry.id===order.id);
    if(index<0)state.orders.push(order);else state.orders[index]=order;
  }
  function drawSelection(order) {
    root.querySelector('#history-selected-products').innerHTML=historyProductRows(order).map(row=>`<tr>${['product','variant','size','quantity','finishing','note'].map(key=>`<td>${e(row[key])}</td>`).join('')}</tr>`).join('');
    root.querySelector('#history-selection-status').textContent=`${order.code} · ${order.customerName}`;
    controls();
  }
  async function selectOrder(id) {
    const token=++selectionGeneration, rowsToken=generation, identity=state.currentUser?.id;
    const valid=()=>token===selectionGeneration && rowsToken===generation && active() && identity===state.currentUser?.id;
    selectedId=id;selectedOrder=null;actionBusy=false;
    root.querySelectorAll('[data-history-order]').forEach(row=>row.setAttribute('aria-selected',String(row.dataset.historyOrder===id)));
    root.querySelector('#history-selected-products').replaceChildren();
    root.querySelector('#history-selection-status').textContent='Memuat rincian pesanan…';controls();
    try {
      const order=await api(`/api/order-history/${encodeURIComponent(id)}`);
      if(!valid())return;
      selectedOrder=order;saveOrder(order);drawSelection(order);
    } catch(error) {if(valid()){root.querySelector('#history-selection-status').textContent=error.message;controls();}}
  }
  async function runAction(action) {
    if(actionBusy || !selectedOrder || !historyActions(selectedOrder,state.permissions)[action])return;
    const token=selectionGeneration, id=selectedId, identity=state.currentUser?.id, rowsToken=generation;
    const valid=()=>active() && token===selectionGeneration && rowsToken===generation && id===selectedId && identity===state.currentUser?.id;
    actionBusy=true;controls();
    try {
      const order=await api(`/api/order-history/${encodeURIComponent(id)}`);
      if(!valid())return;
      selectedOrder=order;saveOrder(order);drawSelection(order);
      if(!historyActions(order,state.permissions)[action])throw new Error('Tindakan tidak lagi tersedia untuk status pesanan ini');
      if(action==='detail')openOrder(order.id);else await onAction(action,order);
    } catch(error) {if(valid())toast(error.message,'error');}
    finally {if(valid()){actionBusy=false;controls();}}
  }
  async function fetchRows() {
    const token = ++generation, identity = state.currentUser?.id;
    const valid = () => token === generation && active() && identity === state.currentUser?.id;
    if (!active()) return;
    try {
      const data = await api(`/api/order-history?${new URLSearchParams(filters)}`);
      if (!valid()) return;
      filters.page = data.page;
      root.querySelector("#history-count").textContent = `${data.summary.orders} pesanan`;
      const columns = ["TANGGAL", "INVOICE", "PELANGGAN", "NOMOR WA", "DEADLINE", "STATUS PESANAN", ...(data.money ? ["PEMBAYARAN", "TOTAL", "METODE"] : [])];
      const colNames = ["date", "invoice", "customer", "phone", "deadline", "status", ...(data.money ? ["payment", "total", "method"] : [])];
      const cells = order => {
        const pay = historyPaymentStatus(order), status = historyStatusSummary(order, state.statusLabels);
        if (status.tone === "finishing") status.label = "Finishing";
        if (historyDraft(order)) { status.label = state.statusLabels.MENUNGGU_PEMBAYARAN || "Menunggu Pembayaran"; status.tone = "menunggu_pembayaran"; }
        const deadline = projectDeadlineInfo(order);
        const label = /^(Hari ini|Besok|Terlambat)/.test(deadline.label) ? deadline.label.replace(/(\d{2})\.(\d{2})$/, "$1:$2") : order.deadline ? timestamp(order.deadline) : "—";
        return `<td data-label="Tanggal">${e(timestamp(order.createdAt))}</td>
          <td data-label="Invoice"><strong>${e(order.code)}</strong></td>
          <td data-label="Pelanggan"><strong>${e(order.customerName)}</strong></td>
          <td data-label="Nomor WA">${e(order.phone || "—")}</td>
          <td data-label="Deadline" class="history-deadline ${deadline.state}" title="${e(timestamp(order.deadline))} WITA"><strong>${e(label)}${deadline.state === "late" ? ' <span aria-label="Terlambat">⚠️</span>' : ""}</strong></td>
          <td data-label="Status pesanan"><span class="history-status status-${e(status.tone)}" title="${e(status.title)}" aria-label="${e(status.title)}">${e(status.label)}</span>${order.hold ? `<small class="history-held">Tertahan · ${e(holdLabel(order.hold.reason || "Menunggu ACC"))}</small>` : ""}</td>
          ${data.money ? `<td data-label="Pembayaran" class="${["BELUM_LUNAS","BELUM_BAYAR"].includes(pay)?"history-unpaid":""}">${pay==="LUNAS"?"Lunas":pay==="DIBATALKAN"?"—":"Belum Lunas"}</td>
          <td data-label="Total" class="history-total">${rupiah.format(order.total)}</td>
          <td data-label="Metode bayar">${e(methodLabels[order.lastPaymentMethod] || order.lastPaymentMethod || "—")}</td>` : ""}`;
      };
      root.querySelector("#history-results").innerHTML = `<div class="history-table-wrap"><table class="history-table ${data.money ? "" : "without-money"}" aria-label="Status Order"><colgroup>${colNames.map(name => `<col class="history-col-${name}">`).join("")}</colgroup><thead><tr>${columns.map((label, index) => `<th scope="col"${colNames[index] === "total" ? ' class="history-total"' : ""}>${label}</th>`).join("")}</tr></thead><tbody>${data.orders.map(order => `<tr tabindex="0" data-history-order="${e(order.id)}" aria-label="Pilih pesanan ${e(order.code)} untuk ${e(order.customerName)}">${cells(order)}</tr>`).join("") || `<tr class="history-empty"><td colspan="${columns.length}">Tidak ada pesanan sesuai pencarian dan filter.</td></tr>`}</tbody></table></div>`;
      root.querySelector("#history-results").removeAttribute("aria-busy");
      root.querySelectorAll("[data-history-order]").forEach(row => {
        row.setAttribute("aria-selected",String(row.dataset.historyOrder===selectedId));
        const select=()=>{if(valid())selectOrder(row.dataset.historyOrder);};
        row.onclick = select;
        row.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); select(); } };
      });
      if (selectedId && data.orders.some(order=>order.id===selectedId)) selectOrder(selectedId);
      else clearSelection();
      root.querySelector("#history-pages").innerHTML = `<button class="secondary" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Sebelumnya</button><span>Halaman ${data.page} / ${data.pages}</span><button class="secondary" data-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Berikutnya</button>`;
      root.querySelectorAll("[data-page]").forEach(button => button.onclick = () => { clearSelection(); filters.page = Number(button.dataset.page); fetchRows(); });
    } catch (error) {
      if (valid()) { clearSelection(); root.querySelector("#history-results").textContent = error.message; root.querySelector("#history-results").removeAttribute("aria-busy"); root.querySelector("#history-pages").replaceChildren(); root.querySelector("#history-count").textContent = ""; }
    }
  }
  return { mount, reset };
}
