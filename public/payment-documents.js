import { invoiceReceiptHtml } from './thermal-documents.js';

// Nota Ulang and payment proofs share the full invoice receipt layout.
export function paymentReceiptHtml(order, payment) {
  return invoiceReceiptHtml(order, payment);
}
