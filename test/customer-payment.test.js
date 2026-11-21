import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentDepositAmounts, halfPaymentAmount } from '../public/customer-payment.js';
import { paymentDialogHtml } from '../public/payment-dialog.js';

const renderPayment = order => paymentDialogHtml(order, {
  escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
  money: value => `Rp ${Number(value).toLocaleString('id-ID')}`,
  moneyField: (name, value, attributes) => `<input name="${name}" value="${value}" ${attributes}>`,
  imageSizeNote: () => ''
});

test('compact payment summary applies available deposit without changing invoice total', () => {
  assert.deepEqual(paymentDepositAmounts({ total: 8000, balance: 5000, received: 3000 }), { outstanding: 8000, available: 5000, used: 5000, due: 3000, remaining: 0, excess: 0 });
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 5000, use: false }).due, 8000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 10000 }).used, 8000);
  assert.equal(paymentDepositAmounts({ total: 8000, paid: 2000, balance: 5000 }).due, 1000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 5000, planned: 2000 }).used, 2000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 0 }).available, 0);
});

test('overpayment confirmation uses remaining invoice after deposit, and excludes PO', () => {
  assert.equal(paymentDepositAmounts({ total: 125000, received: 152000 }).excess, 27000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 5000, received: 10000 }).excess, 7000);
  assert.equal(paymentDepositAmounts({ total: 8000, paid: 8000, received: 8000 }).excess, 8000);
  const po = paymentDepositAmounts({ total: 8000, balance: 5000, received: 10000, po: true });
  assert.equal(po.used, 0);
  assert.equal(po.excess, 0);
  assert.equal(po.remaining, 8000);
});

test('DP 50% targets the net invoice and includes existing payments and deposit',()=>{
 assert.equal(halfPaymentAmount(8000,0,0,8000),4000);
 assert.equal(halfPaymentAmount(8000,0,3000,5000),1000);
 assert.equal(halfPaymentAmount(8000,2000,1000,5000),1000);
 assert.equal(halfPaymentAmount(8000,5000,0,3000),0);
 assert.equal(halfPaymentAmount(0,0,0,0),0);
});

test('Ringkasan precedes the payment form and keeps long orders expandable', () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    productName: `Produk ${index + 1}`, displaySize: '2 pcs', subtotal: 10000
  }));
  const html = renderPayment({ items, total: 50000 });
  const layout = html.slice(html.indexOf('class="detail-body payment-layout"'));
  assert.match(layout, /payment-layout">\s*<aside[\s\S]*<\/aside><form id="payment-form"/);
  assert.match(html, />5 item<\/span>/);
  assert.equal((html.split('<details class="payment-more-items">')[0].match(/class="payment-item"/g) || []).length, 3);
  assert.match(html, /Lihat 2 item lainnya[\s\S]*Produk 5/);
  assert.match(html, /Total Pesanan<\/span><strong>Rp 50\.000/);
  assert.match(html, /name="invoiceDiscountAmount"[^>]*form="payment-form"/);
  assert.doesNotMatch(renderPayment({ items: items.slice(0, 1), total: 10000 }), /payment-more-items/);
});

test('Potongan Pajak Aktual requires a saved gross-up rate', () => {
  const order = { total: 1000000, items: [{ productName: 'Spanduk', subtotal: 1000000 }] };
  for (const taxGrossUp of [undefined, {}, { rateBps: 0 }, { rateBps: 10000 }]) {
    const html = renderPayment({ ...order, taxGrossUp });
    assert.doesNotMatch(html, /Potongan Pajak Aktual|name="taxWithheld"|Penyesuaian Harga/);
  }
  const html = renderPayment({ ...order, total: 1025641, taxGrossUp: { rateBps: 250, adjustment: 25641 } });
  assert.match(html, /data-invoice-tax-adjustment>\+ Rp 25\.641/);
  assert.match(html, /id="payment-fields"[\s\S]*name="taxWithheld" value="25641"[\s\S]*id="po-fields"/);
});
