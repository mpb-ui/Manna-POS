import { grossUpQuote, taxAdjustment } from './order-tax.js';

// Invoice discount is separate from product promotions; line price snapshots stay intact.
export const invoiceDiscount = order => Number(order.invoiceDiscount?.amount || 0);
export const invoiceGross = order => Number(order.grossTotal ?? Number(order.total || 0) + invoiceDiscount(order) - taxAdjustment(order));
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
export function chargedItemTotals(order, { beforeDiscount = false } = {}) {
  const values = beforeDiscount ? (order.items || []).map(item => Number(item.subtotal || 0)) : discountedItemTotals(order);
  const net = values.reduce((sum, value) => sum + value, 0);
  const adjustment = beforeDiscount && order.taxGrossUp ? grossUpQuote(net, order.taxGrossUp.rateBps).adjustment : taxAdjustment(order);
  if (!adjustment || !net) return values;
  const denominator = BigInt(net), uplift = BigInt(adjustment);
  const parts = values.map((value, index) => {
    const numerator = BigInt(value) * uplift;
    return { index, amount: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let remaining = adjustment - parts.reduce((sum, part) => sum + part.amount, 0);
  for (const part of [...parts].sort((a,b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)) {
    if (!remaining) break;
    part.amount++; remaining--;
  }
  return values.map((value,index) => value + parts[index].amount);
}

export function discountPrintLines(order, money) {
  const discount = invoiceDiscount(order), adjustment = taxAdjustment(order);
  if (!discount && !adjustment) return '';
  return `<div class="print-total"><span>Total Pesanan</span><b>${money(invoiceGross(order))}</b></div>${discount ? `<div class="print-total"><span>Diskon Pesanan</span><b>− ${money(discount)}</b></div>` : ''}${adjustment ? `<div class="print-total"><span>Penyesuaian Harga</span><b>+ ${money(adjustment)}</b></div>` : ''}`;
}
