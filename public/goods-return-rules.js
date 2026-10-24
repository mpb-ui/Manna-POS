import { cancelled } from './order-rules.js';
export function returnableRetailItem(order, item) {
  return !cancelled(order) && item.stockTiming === 'SALE' && item.stockCommitted === true && item.status === 'DIAMBIL' && Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0;
}
