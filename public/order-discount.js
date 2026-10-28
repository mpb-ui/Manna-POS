// Invoice discount is separate from product promotions; line price snapshots stay intact.
export const invoiceDiscount = order => Number(order.invoiceDiscount?.amount || 0);
export const invoiceGross = order => Number(order.grossTotal ?? Number(order.total || 0) + invoiceDiscount(order));
export function discountLocked(order) {
  return Boolean(order.paymentConfirmed || Number(order.paidAmount) > 0 || (order.payments || []).some(p => p.type === 'PO' || Number(p.amount) > 0));
}
export function settledOrder(order) {
  return Number(order.paidAmount || 0) >= Number(order.total || 0) && (Number(order.total) > 0 || order.paymentConfirmed);
}
// Largest remainder, in integer rupiah. Ties follow invoice line order, and even
// a one-rupiah discount reconciles exactly across product/category reports.
export function discountedItemTotals(order) {
  const values = (order.items || []).map(item => Number(item.subtotal || 0));
  const discount = invoiceDiscount(order);
  if (!discount) return values;
  const gross = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(gross) || gross <= 0 || discount > gross || !Number.isSafeInteger(discount) || values.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Nilai diskon pesanan tidak valid');
  const denominator = BigInt(gross), cut = BigInt(discount);
  const shares = values.map((value, index) => { const numerator = BigInt(value) * cut; return { index, amount: Number(numerator / denominator), remainder: numerator % denominator }; });
  let remaining = discount - shares.reduce((sum, share) => sum + share.amount, 0);
  const ranked = [...shares].sort((a,b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of ranked) { if (!remaining) break; share.amount++; remaining--; }
  return values.map((value,index) => value - shares[index].amount);
}
export function discountPrintLines(order, money) {
  if (!invoiceDiscount(order)) return '';
  return `<div class="print-total"><span>Total Pesanan</span><b>${money(invoiceGross(order))}</b></div><div class="print-total"><span>Diskon Pesanan</span><b>− ${money(invoiceDiscount(order))}</b></div>`;
}
