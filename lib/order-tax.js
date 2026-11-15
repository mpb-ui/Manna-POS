import { grossUpQuote } from '../public/order-tax.js';

export function applyDraftTax(order, subtotal, rateBps) {
  const rate = rateBps === undefined ? order.taxGrossUp?.rateBps ?? 0 : rateBps;
  const q = rate === 0 ? {total:subtotal} : grossUpQuote(subtotal, rate);
  if (rate) {
    order.grossTotal = subtotal;
    order.taxGrossUp = { rateBps: rate, adjustment: q.adjustment };
  } else {
    delete order.taxGrossUp;
    delete order.grossTotal;
  }
  order.total = q.total;
}
