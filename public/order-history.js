export const historyPaymentStatus = order => ["BATAL","CANCELLED","CANCELED"].includes(order.status)?"DIBATALKAN":Number(order.total) > 0 && Number(order.paidAmount || 0) >= Number(order.total) ? "LUNAS" : order.paymentConfirmed || Number(order.paidAmount || 0) > 0 ? "BELUM_LUNAS" : "BELUM_BAYAR";
export const historyDraft = order => order.status === "DRAFT" || !order.confirmed && !order.confirmedAt && !order.paymentConfirmed && Number(order.paidAmount || 0) === 0 && order.status === "MENUNGGU_PEMBAYARAN";
export const historyDay = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10) : "";
export function historyStatus(order, labels) {
  if (historyDraft(order)) return "Draft";
  const counts = new Map();
  for (const item of order.items || []) { const status = item.status || order.status; counts.set(status, (counts.get(status) || 0) + 1); }
  return counts.size > 1 ? `Sedang diproses · ${[...counts].map(([status, count]) => `${count} ${labels[status] || status}`).join(" · ")}` : labels[order.status] || order.status;
}
export function filterOrderHistory(orders, filters = {}) {
  const query = String(filters.q || "").trim().toLocaleLowerCase("id-ID");
  return orders.filter(order => {
    const day = historyDay(order.createdAt);
    if (filters.from && day < filters.from || filters.to && day > filters.to) return false;
    if (filters.status === "DRAFT" ? !historyDraft(order) : filters.status && !(order.items || []).some(item => (item.status || order.status) === filters.status) && order.status !== filters.status) return false;
    if (filters.payment && historyPaymentStatus(order) !== filters.payment) return false;
    return !query || [order.code, order.customerName, order.phone, ...(order.items || []).map(item => `${item.productName} ${item.displaySize || ""}`)].join(" ").toLocaleLowerCase("id-ID").includes(query);
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
