import { holdLabel } from "./hold-label.js";
import { historyStatus, historyDraft, historyPaymentStatus } from "./order-history.js";
import { itemQuantityLabel } from "./item-workflow.js";

export function createOrderHistory({ state, root, api, escapeHtml: e, rupiah, dateFormat, openOrder, toast }) {
  const filters = { q: "", from: "", to: "", status: "", payment: "", page: 1 };
  let generation = 0, timer;
  const active = () => state.view === "order-history" && state.permissions.includes("orders.view");
  function reset() { generation++; clearTimeout(timer); Object.assign(filters, { q: "", from: "", to: "", status: "", payment: "", page: 1 }); }
  function mount() {
    if (!active()) return;
    const money = state.permissions.includes("projects.money");
    root.innerHTML = `<section class="order-history"><div class="history-heading"><div><h2>Status Order</h2><p>Seluruh pesanan dan riwayat transaksi</p></div><span id="history-count" aria-live="polite"></span></div><form class="history-filters" id="history-filters"><label class="history-search"><span>Cari pesanan</span><input name="q" placeholder="Invoice, pelanggan, WhatsApp, produk…" value="${e(filters.q)}"></label><label><span>Dari tanggal · WITA</span><input type="date" name="from" value="${e(filters.from)}"></label><label><span>Sampai tanggal · WITA</span><input type="date" name="to" value="${e(filters.to)}"></label><label><span>Status pesanan / produk</span><select name="status"><option value="">Semua status</option><option value="DRAFT">Draft</option>${Object.entries(state.statusLabels).map(([value, label]) => `<option value="${e(value)}">${e(label)}</option>`).join("")}</select></label>${money ? `<label><span>Pembayaran</span><select name="payment"><option value="">Semua pembayaran</option><option value="BELUM_BAYAR">Belum bayar</option><option value="BELUM_LUNAS">Belum lunas / PO</option><option value="LUNAS">Lunas</option></select></label>` : ""}</form><div id="history-summary"></div><div id="history-results" aria-live="polite"></div><div id="history-pages" class="history-pages"></div></section>`;
    const form = root.querySelector("#history-filters");
    form.elements.status.value = filters.status;
    if (money) form.elements.payment.value = filters.payment;
    form.onsubmit = event => event.preventDefault();
    form.oninput = event => {
      Object.assign(filters, Object.fromEntries(new FormData(form)), { page: 1 });
      generation++; clearTimeout(timer);
      // Invalidates the displayed rows immediately while a search is debouncing.
      root.querySelector("#history-results").setAttribute("aria-busy", "true");
      timer = setTimeout(fetchRows, event.target.name === "q" ? 250 : 0);
    };
    fetchRows();
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
      root.querySelector("#history-summary").innerHTML = data.money ? `<div class="history-balance"><span>Sisa tagihan pada hasil filter <small>Draft belum dikonfirmasi tidak termasuk</small></span><strong>${rupiah.format(data.summary.outstanding)}</strong></div>` : "";
      const cells = order => {
        const pay = historyPaymentStatus(order);
        return `<td data-label="Tanggal">${e(dateFormat.format(new Date(order.createdAt)))}</td><td data-label="Invoice"><strong>${e(order.code)}</strong>${historyDraft(order) ? '<small>Draft</small>' : ""}</td><td data-label="Pelanggan"><strong>${e(order.customerName)}</strong><small><b>${e(order.phone || "—")}</b></small></td><td data-label="Produk">${order.items.map(item => `<span class="history-product">${e(item.productName)} <small>${e(itemQuantityLabel(item))}</small></span>`).join("")}</td><td data-label="Status"><span class="history-status status-${e(order.status.toLowerCase())}">${e(historyStatus(order, state.statusLabels))}</span>${order.hold ? `<small class="history-held">Tertahan · ${e(holdLabel(order.hold.reason || "Menunggu ACC"))}</small>` : ""}</td>${data.money ? `<td data-label="Pembayaran">${{ LUNAS: "Lunas", BELUM_LUNAS: "Belum lunas", BELUM_BAYAR: "Belum bayar" }[pay]}</td><td data-label="Total">${rupiah.format(order.total)}</td><td data-label="Sisa tagihan"><strong>${rupiah.format(Math.max(0, Number(order.total) - Number(order.paidAmount || 0)))}</strong></td>` : ""}<td data-label="Deadline">${order.deadline ? e(dateFormat.format(new Date(order.deadline))) : "—"}</td>`;
      };
      root.querySelector("#history-results").innerHTML = data.orders.length ? `<table class="history-table"><thead><tr>${["TANGGAL", "INVOICE", "PELANGGAN", "PRODUK", "STATUS PESANAN", ...(data.money ? ["PEMBAYARAN", "TOTAL", "SISA TAGIHAN"] : []), "DEADLINE"].map(label => `<th>${label}</th>`).join("")}</tr></thead><tbody>${data.orders.map(order => `<tr tabindex="0" data-history-order="${e(order.id)}" aria-label="Buka pesanan ${e(order.code)} untuk ${e(order.customerName)}">${cells(order)}</tr>`).join("")}</tbody></table>` : '<div class="category-empty">Tidak ada pesanan sesuai pencarian dan filter.</div>';
      root.querySelector("#history-results").removeAttribute("aria-busy");
      root.querySelectorAll("[data-history-order]").forEach(row => {
        let opening = false;
        const open = async () => {
          if (opening || !valid()) return;
          opening = true;
          try {
            const order = await api(`/api/order-history/${row.dataset.historyOrder}`);
            if (!valid()) return;
            const index = state.orders.findIndex(entry => entry.id === order.id);
            if (index < 0) state.orders.push(order); else state.orders[index] = order;
            openOrder(order.id);
          } catch (error) { if (valid()) toast(error.message, "error"); }
          finally { opening = false; }
        };
        row.onclick = open;
        row.onkeydown = event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); open(); } };
      });
      root.querySelector("#history-pages").innerHTML = `<button class="secondary" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Sebelumnya</button><span>Halaman ${data.page} / ${data.pages}</span><button class="secondary" data-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Berikutnya</button>`;
      root.querySelectorAll("[data-page]").forEach(button => button.onclick = () => { filters.page = Number(button.dataset.page); fetchRows(); });
    } catch (error) {
      if (valid()) { root.querySelector("#history-results").textContent = error.message; root.querySelector("#history-results").removeAttribute("aria-busy"); root.querySelector("#history-pages").replaceChildren(); root.querySelector("#history-summary").replaceChildren(); root.querySelector("#history-count").textContent = ""; }
    }
  }
  return { mount, reset };
}
