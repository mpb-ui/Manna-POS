import { discountLocked, invoiceDiscount, invoiceGross, discountedItemTotals } from '../public/order-discount.js';

// Called only inside the payment/stock Store transaction. Failed payments leave
// no saved discount, price change, audit entry, or stock/deposit movement.
export function applyInvoiceDiscount(order, amount, user, at = new Date().toISOString()) {
  if (amount === undefined) return false;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Diskon harus berupa nominal rupiah bulat yang tidak negatif');
  const previous = invoiceDiscount(order);
  if (discountLocked(order) && amount !== previous) throw new Error('Diskon terkunci setelah konfirmasi pembayaran pertama, termasuk DP atau PO');
  if (amount === previous) return false;
  const gross = invoiceGross(order);
  if (!Number.isSafeInteger(gross) || amount > gross) throw new Error('Diskon tidak boleh melebihi Total Pesanan');
  const lineGross = (order.items || []).reduce((sum,item) => sum + Number(item.subtotal || 0),0);
  if (lineGross !== gross) throw new Error('Rincian harga pesanan tidak sesuai; periksa ulang pesanan');
  order.grossTotal = gross;
  order.invoiceDiscount = { amount, appliedAt: at, actorId: user.id, actor: user.name };
  order.total = gross - amount;
  discountedItemTotals(order); // Validate the exact report allocation before committing.
  return true;
}
