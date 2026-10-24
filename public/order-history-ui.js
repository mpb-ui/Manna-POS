import { holdLabel } from "./hold-label.js";
import { historyDraft, historyPaymentStatus, historyStatusSummary } from "./order-history.js";
import { projectDeadlineInfo } from "./project-deadline.js";

const timestampFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Makassar" });
const timestamp = value => value && Number.isFinite(Date.parse(value)) ? timestampFormat.format(new Date(value)).replace(/(\d{2})\.(\d{2})$/, "$1:$2") : "—";
const methodLabels = { TUNAI: "Tunai", QRIS: "QRIS", TRANSFER: "Transfer", DEPOSIT: "Deposit" };

export function createOrderHistory({ state, root, api, escapeHtml: e, rupiah, openOrder, toast }) {
  const defaults = { q: "", from: "", to: "", status: "", payment: "", method: "", page: 1 };
  const filters = { ...defaults };
  let generation = 0, timer;
  const active = () => state.view === "order-history" && state.permissions.includes("orders.view");
  function reset() { generation++; clearTimeout(timer); Object.assign(filters, defaults); }
  function mount() {
    if (!active()) return;
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
          ${money ? `<label><span>Pembayaran</span><select name="payment"><option value="">Semua pembayaran</option><option value="BELUM_BAYAR">Belum bayar</option><option value="BELUM_LUNAS">Belum lunas / PO</option><option value="LUNAS">Lunas</option><option value="DIBATALKAN">Dibatalkan</option></select></label>
          <label><span>Metode Pembayaran</span><select name="method"><option value="">Semua metode</option>${Object.entries(methodLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>` : ""}
        </div>
      </form></div><div class="history-content"><div id="history-results" aria-live="polite"></div><div id="history-pages" class="history-pages"></div></div></section>`;
    const form = root.querySelector("#history-filters");
    for (const name of ["status", "payment", "method"]) if (form.elements[name]) form.elements[name].value = filters[name];
    form.onsubmit = event => event.preventDefault();
    form.oninput = event => {
      if (event.target.type === "date") event.target.closest("label").classList.toggle("has-value", Boolean(event.target.value));
      Object.assign(filters, Object.fromEntries(new FormData(form)), { page: 1 });
      generation++; clearTimeout(timer);
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
      const columns = ["INVOICE", "TANGGAL", "PELANGGAN", "NOMOR WA", "DEADLINE", "STATUS PESANAN", ...(data.money ? ["PEMBAYARAN", "TOTAL", "METODE"] : [])];
      const colNames = ["invoice", "date", "customer", "phone", "deadline", "status", ...(data.money ? ["payment", "total", "method"] : [])];
      const cells = order => {
        const pay = historyPaymentStatus(order), status = historyStatusSummary(order, state.statusLabels);
        const deadline = projectDeadlineInfo(order);
        const label = /^(Hari ini|Besok|Terlambat)/.test(deadline.label) ? deadline.label.replace(/(\d{2})\.(\d{2})$/, "$1:$2") : order.deadline ? timestamp(order.deadline) : "—";
        return `<td data-label="Invoice"><strong>${e(order.code)}</strong>${historyDraft(order) ? '<small class="history-draft">Draft</small>' : ""}</td>
          <td data-label="Tanggal">${e(timestamp(order.createdAt))}</td>
          <td data-label="Pelanggan"><strong>${e(order.customerName)}</strong></td>
          <td data-label="Nomor WA">${e(order.phone || "—")}</td>
          <td data-label="Deadline" class="history-deadline ${deadline.state}" title="${e(timestamp(order.deadline))} WITA"><strong>${e(label)}${deadline.state === "late" ? ' <span aria-label="Terlambat">⚠️</span>' : ""}</strong></td>
          <td data-label="Status pesanan"><span class="history-status status-${e(status.tone)}" title="${e(status.title)}" aria-label="${e(status.title)}">${e(status.label)}</span>${order.hold ? `<small class="history-held">Tertahan · ${e(holdLabel(order.hold.reason || "Menunggu ACC"))}</small>` : ""}</td>
          ${data.money ? `<td data-label="Pembayaran">${{ LUNAS: "Lunas", BELUM_LUNAS: "Belum lunas", BELUM_BAYAR: "Belum bayar", DIBATALKAN: "Dibatalkan" }[pay]}</td>
          <td data-label="Total" class="history-total">${rupiah.format(order.total)}</td>
          <td data-label="Metode bayar">${e((order.paymentMethods || []).map(method => methodLabels[method] || method).join(" + ") || "—")}</td>` : ""}`;
      };
      root.querySelector("#history-results").innerHTML = `<div class="history-table-wrap"><table class="history-table ${data.money ? "" : "without-money"}" aria-label="Status Order"><colgroup>${colNames.map(name => `<col class="history-col-${name}">`).join("")}</colgroup><thead><tr>${columns.map((label, index) => `<th scope="col"${colNames[index] === "total" ? ' class="history-total"' : ""}>${label}</th>`).join("")}</tr></thead><tbody>${data.orders.map(order => `<tr tabindex="0" data-history-order="${e(order.id)}" aria-label="Buka pesanan ${e(order.code)} untuk ${e(order.customerName)}">${cells(order)}</tr>`).join("") || `<tr class="history-empty"><td colspan="${columns.length}">Tidak ada pesanan sesuai pencarian dan filter.</td></tr>`}</tbody></table></div>`;
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
      if (valid()) { root.querySelector("#history-results").textContent = error.message; root.querySelector("#history-results").removeAttribute("aria-busy"); root.querySelector("#history-pages").replaceChildren(); root.querySelector("#history-count").textContent = ""; }
    }
  }
  return { mount, reset };
}
