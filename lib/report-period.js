import {cancelled} from '../public/order-rules.js';
// Report cutoffs are inclusive WITA days. This module never mutates stored orders.
export const dated = value => { const n = Date.parse(value); return Number.isFinite(n) ? n : null; };
export function cancellationDate(order) {
  return order.cancelledAt || order.canceledAt || (cancelled(order) ? order.updatedAt || order.createdAt : null);
}
export function orderAtPeriodEnd(order, end) {
  const cutoff = +end;
  if (order.invoiceDiscount?.appliedAt && dated(order.invoiceDiscount.appliedAt)>cutoff) order={...order,total:Number(order.grossTotal ?? Number(order.total || 0)+Number(order.invoiceDiscount.amount || 0)),invoiceDiscount:undefined};
  const cancelAt = dated(cancellationDate(order));
  const isCancelled = cancelAt != null && cancelAt <= cutoff;
  // Cancellation reversals clear the operational balance. Payment status on the
  // original sale/correction describes its settlement immediately before cancel.
  const payments = (order.payments || []).filter(p => dated(p.createdAt) != null && dated(p.createdAt) <= cutoff && (!isCancelled || dated(p.createdAt) <= cancelAt) && p.type !== 'REVERSAL');
  const paid = payments.filter(p => p.type !== 'PO').reduce((sum,p) => sum + Number(p.amount || 0),0);
  const legacyPaid = (order.payments || []).length ? paid : Number(order.paidAmount || 0);
  const confirmationAt = order.paymentConfirmedAt || order.confirmedAt || order.createdAt;
  const confirmed = payments.length > 0 || order.paymentConfirmed && dated(confirmationAt) <= cutoff;
  const paymentStatus = legacyPaid >= Number(order.total || 0) && (Number(order.total) > 0 || confirmed) ? 'LUNAS' : 'BELUM_LUNAS';
  return {...order, items:order.items || [], payments, paidAmount:legacyPaid, paymentStatus, isCancelled, cancelAt, outstanding:isCancelled ? 0 : Math.max(0, Number(order.total || 0)-legacyPaid)};
}
export function reportItemQuantity(item, product) {
  const quantity = Number(item.quantity ?? 1);
  if (item.priceBasis === 'sqm') return {unit:'m²',quantity:Number(item.width || 0)*Number(item.billedLength || 0)*quantity};
  if (item.priceBasis === 'linear_m') return {unit:'m lari',quantity:Number(item.billedLength || 0)*quantity};
  return {unit:item.saleUnit || item.unitName || product?.saleUnit || product?.unitName || 'pcs',quantity};
}
