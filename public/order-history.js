export const historyPaymentStatus = order => ["BATAL","CANCELLED","CANCELED"].includes(order.status)?"DIBATALKAN":Number(order.total) > 0 && Number(order.paidAmount || 0) >= Number(order.total) ? "LUNAS" : order.paymentConfirmed || Number(order.paidAmount || 0) > 0 ? "BELUM_LUNAS" : "BELUM_BAYAR";
export const historyDraft = order => order.status === "DRAFT" || !order.confirmed && !order.confirmedAt && !order.paymentConfirmed && Number(order.paidAmount || 0) === 0 && order.status === "MENUNGGU_PEMBAYARAN";
export const historyDay = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10) : "";
export function historyStatus(order, labels) {
  if (historyDraft(order)) return "Draft";
  const counts = new Map();
  for (const item of order.items || []) { const status = item.status || order.status; counts.set(status, (counts.get(status) || 0) + 1); }
  return counts.size > 1 ? `Sedang diproses · ${[...counts].map(([status, count]) => `${count} ${labels[status] || status}`).join(" · ")}` : labels[order.status] || order.status;
}
export function historyPaymentMethods(order) {
  return [...new Set((order.payments || []).filter(payment => payment.type !== "PO" && Number(payment.amount) > 0)
    .map(payment => String(payment.method || "").trim().toUpperCase()).filter(Boolean))];
}

export function historyStatusSummary(order, labels) {
  const title = historyStatus(order, labels);
  const statuses = new Set((order.items || []).map(item => item.status || order.status));
  const mixed = !historyDraft(order) && statuses.size > 1;
  return { label: mixed ? `${statuses.size} status` : title, title, tone: historyDraft(order) ? "draft" : mixed ? "mixed" : String(order.status).toLowerCase() };
}

function phoneDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9 && digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

export function historySearchMatch(order, value, money = true) {
  const query = String(value || "").trim().toLocaleLowerCase("id-ID");
  if (!query) return true;
  const nominal = query.match(/^(rp\.?\s*)?(\d+|\d{1,3}(?:[.,]\d{3})+)$/i);
  const amount = nominal ? Number(nominal[2].replace(/[.,]/g, "")) : null;
  const amountMatches = money && amount !== null && Number.isSafeInteger(amount) && Number(order.total) === amount;
  // A currency prefix or grouped amount explicitly selects Total.
  if (nominal && (nominal[1] || /[.,]/.test(nominal[2]) && !nominal[2].startsWith("0"))) return amountMatches;
  const invoiceMatches = [order.code, ...(order.invoiceAliases || [])].some(code => String(code || "").toLocaleLowerCase("id-ID").includes(query));
  if (/^(?:inv|mp)-/i.test(query) || /^\d{6}-\d{3,}$/.test(query)) return invoiceMatches;
  const nameMatches = String(order.customerName || "").toLocaleLowerCase("id-ID").includes(query);
  const phoneQuery = /^\+?[\d\s().-]+$/.test(query) ? phoneDigits(query) : "";
  const phoneMatches = phoneQuery && phoneDigits(order.phone).endsWith(phoneQuery);
  return Boolean(invoiceMatches || nameMatches || phoneMatches || amountMatches);
}

export function filterOrderHistory(orders, filters = {}, { money = true } = {}) {
  const query = String(filters.q || "").trim().toLocaleLowerCase("id-ID");
  return orders.filter(order => {
    const day = historyDay(order.createdAt);
    if (filters.from && day < filters.from || filters.to && day > filters.to) return false;
    if (filters.status === "DRAFT" ? !historyDraft(order) : filters.status && !(order.items || []).some(item => (item.status || order.status) === filters.status) && order.status !== filters.status) return false;
    if (filters.payment && historyPaymentStatus(order) !== filters.payment) return false;
    if (filters.method && !historyPaymentMethods(order).includes(filters.method)) return false;
    return historySearchMatch(order, query, money);
  }).sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(b.id).localeCompare(String(a.id)));
}
// Receipts use immutable snapshots for new payments; reconstruct old ledgers
// without rewriting historical records or using today's balance for an old DP.
export function paymentReceipts(order) {
  const entries = (order.payments || []).map((payment, index) => ({ payment, index })).filter(({ payment }) => payment.type !== "PO" && Number(payment.amount) > 0);
  let cumulative = Math.max(0, Number(order.paidAmount || 0) - entries.reduce((sum, { payment }) => sum + Number(payment.amount), 0));
  return entries.map(({ payment, index }, sequence) => {
    const before = Number(payment.paidBefore ?? cumulative);
    cumulative = Number(payment.paidAfter ?? before + Number(payment.amount));
    const total = Number(payment.orderTotal ?? order.total);
    return { ...payment, id: payment.id || `${order.id}-payment-${index + 1}`, sequence: payment.sequence || sequence + 1, orderTotal: total, paidBefore: before, paidAfter: cumulative, balanceAfter: Number(payment.balanceAfter ?? Math.max(0, total - cumulative)), reconstructed: payment.balanceAfter == null };
  });
}
