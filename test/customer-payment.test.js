import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentDepositAmounts, mountCustomerPayment } from '../public/customer-payment.js';
import { paymentDialogHtml } from '../public/payment-dialog.js';
import { bindPaymentDiscount } from '../public/payment-discount-ui.js';

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

test('Ringkasan precedes the payment form and keeps long orders expandable', () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    productName: `Produk ${index + 1}`, displaySize: '2 pcs', subtotal: 10000
  }));
  const html = renderPayment({ items, total: 50000 });
  const layout = html.slice(html.indexOf('class="detail-body payment-layout"'));
  assert.match(layout, /payment-layout">\s*<aside[\s\S]*<\/aside><form id="payment-form"/);
  assert.equal((html.split('<details class="payment-more-items">')[0].match(/class="payment-item"/g) || []).length, 3);
  assert.match(html, /Lihat 2 item lainnya[\s\S]*Produk 5/);
  assert.match(html, /<form id="payment-form"[\s\S]*Total Pesanan<\/span><span class="payment-readout"><span>Rp<\/span><strong\s*>50\.000/);
  assert.match(html, /<form id="payment-form"[\s\S]*name="invoiceDiscountAmount"/);
  assert.doesNotMatch(renderPayment({ items: items.slice(0, 1), total: 10000 }), /payment-more-items/);
});

const installment = {
  total: 485000,
  paidAmount: 242500,
  invoiceDiscount: { amount: 50000 },
  customerId: 'customer-1',
  customerName: 'The Nest',
  items: [
    { productName: 'Sablon Kaos', subtotal: 95000 },
    { productName: 'X-Banner', subtotal: 220000 },
    { productName: 'X-Banner', subtotal: 220000 }
  ]
};

test('Pelunasan DP carries the saved discount as a readout and leaves it locked during binding', () => {
  const html = renderPayment(installment);
  assert.match(html, /Total Pesanan<\/span><span class="payment-readout"><span>Rp<\/span><strong\s*>535\.000/);
  assert.match(html, /Diskon<\/span><span class="payment-readout"><span>Rp<\/span><strong\s*>-50\.000/);
  assert.match(html, /Sudah Bayar<\/span><span class="payment-readout"><span>Rp<\/span><strong\s*>-242\.500/);
  assert.match(html, /data-payment-due>242\.500/);
  assert.doesNotMatch(html, /data-invoice-discount-toggle|name="invoiceDiscountAmount"/);
  const section = { querySelector: () => assert.fail('Locked discount should have no editable fields') };
  const bound = bindPaymentDiscount({}, section, installment, {});
  assert.equal(bound.amount(), 50000);
  assert.equal(bound.order.total, 485000);
});

test('Potongan Pajak Aktual requires a saved gross-up rate', () => {
  const order = { total: 1000000, items: [{ productName: 'Spanduk', subtotal: 1000000 }] };
  for (const taxGrossUp of [undefined, {}, { rateBps: 0 }, { rateBps: 10000 }]) {
    const html = renderPayment({ ...order, taxGrossUp });
    assert.doesNotMatch(html, /Potongan Pajak Aktual|name="taxWithheld"|Penyesuaian Harga/);
  }
  const html = renderPayment({ ...order, total: 1025641, taxGrossUp: { rateBps: 250, adjustment: 25641 } });
  assert.match(html, /data-invoice-tax-adjustment>25\.641/);
  assert.match(html, /id="payment-fields"[\s\S]*name="taxWithheld" value="25641"[\s\S]*id="po-fields"/);
});

async function mountPayment(order, { depositBalance = 0, withholding = false } = {}) {
  const amount = Object.assign(new EventTarget(), { value: '' });
  const taxField = withholding ? Object.assign(new EventTarget(), { value: '', setCustomValidity() {} }) : undefined;
  const method = { value: '' };
  const type = { value: 'PAYMENT' };
  const nodes = new Map();
  const nodeFor = selector => {
    if (!nodes.has(selector)) {
      nodes.set(selector, Object.assign(new EventTarget(), {
        hidden: false, dataset: {}, textContent: '', querySelector: child => nodeFor(selector + child)
      }));
    }
    return nodes.get(selector);
  };
  const ownerDialog = { open: true, querySelector: nodeFor };
  const form = Object.assign(new EventTarget(), {
    elements: { amount, method, taxWithheld: taxField },
    isConnected: true,
    closest: () => ownerDialog,
    querySelector: selector => selector === '[name=type]:checked' ? type : nodeFor(selector),
    querySelectorAll: () => []
  });
  const confirmations = [];
  const modal = (title, html) => {
    const buttons = { '[data-check-payment]': { focus() {} }, '[data-confirm-excess]': {} };
    const dialog = Object.assign(new EventTarget(), {
      classList: { add() {} },
      setAttribute() {},
      querySelector: selector => buttons[selector],
      close() { dialog.dispatchEvent(new Event('close')); }
    });
    confirmations.push({
      title, html,
      cancel: () => buttons['[data-check-payment]'].onclick(),
      accept: () => buttons['[data-confirm-excess]'].onclick()
    });
    return dialog;
  };
  const controller = await mountCustomerPayment({
    form, order, initial: {},
    api: async () => ({ customer: { id: order.customerId, depositBalance } }),
    can: () => true, uid: () => 'cashier', modal, e: value => value,
    money: value => `Rp ${value.toLocaleString('id-ID')}`,
    parseMoney: value => Number(String(value ?? '').replace(/\D/g, ''))
  });
  return { amount, taxField, form, method, type, nodeFor, controller, confirmations };
}

test('Tunai records change directly while QRIS and Transfer require an explicit deposit confirmation', async () => {
  const { amount, form, method, type, nodeFor, controller, confirmations } = await mountPayment(installment);
  assert.equal(amount.value, '242.500');
  amount.value = '310.000';
  amount.dispatchEvent(new Event('input'));
  const select = value => {
    method.value = value;
    form.dispatchEvent(new Event('change'));
  };
  select('TUNAI');
  assert.equal(nodeFor('[data-payment-excess-label]').textContent, 'Kembali');
  assert.equal(nodeFor('[data-payment-excess-amount]').textContent, '67.500');
  assert.equal(nodeFor('[data-payment-excess]').hidden, true);
  assert.equal(nodeFor('[data-payment-status]').textContent, 'Lunas');
  const cash = await controller.confirm();
  assert.equal(cash.excessAction, 'CHANGE');
  assert.equal(cash.expectedExcess, 67500);
  assert.equal(cash.confirmDeposit, false);
  assert.equal(confirmations.length, 0);

  for (const noncash of ['QRIS', 'TRANSFER']) {
    select(noncash);
    assert.equal(nodeFor('[data-payment-status]').textContent, 'Lebih Bayar');
    assert.equal(nodeFor('[data-payment-excess]').hidden, false);
    assert.equal(nodeFor('[data-payment-excess]').textContent, 'Kelebihan Pembayaran Rp 67.500');
    const cancelled = controller.confirm();
    assert.match(confirmations.at(-1).html, /Simpan ke Deposit/);
    confirmations.at(-1).cancel();
    assert.equal(await cancelled, null);
    const accepted = controller.confirm();
    confirmations.at(-1).accept();
    const deposit = await accepted;
    assert.equal(deposit.excessAction, 'DEPOSIT');
    assert.equal(deposit.expectedExcess, 67500);
    assert.equal(deposit.confirmDeposit, true);
  }
  type.value = 'PO';
  form.dispatchEvent(new Event('payment:totalchange'));
  assert.equal(nodeFor('[data-payment-excess]').hidden, true);
  assert.equal(nodeFor('[data-payment-status]').textContent, 'PO / Tempo');
  assert.equal((await controller.confirm()).excessAction, undefined);
});

test('A cashier can enter a partial payment without a DP control or a presumed withholding', async () => {
  const order = {
    customerId: installment.customerId,
    items: [{ productName: 'Spanduk', subtotal: 1000000 }],
    total: 1025641,
    taxGrossUp: { rateBps: 250, adjustment: 25641 }
  };
  const html = renderPayment(order);
  assert.doesNotMatch(html, /Pembayaran DP|payment-half|payment-dp/);
  assert.match(html, /Uang Diterima[\s\S]*name="amount"/);
  const { amount, taxField, form, method, nodeFor, controller } = await mountPayment(order, {
    depositBalance: 100000, withholding: true
  });
  assert.equal(amount.value, '900.000');
  assert.equal(taxField.value, '25.641');

  method.value = 'TRANSFER';
  form.dispatchEvent(new Event('change'));
  amount.value = '200.000';
  amount.dispatchEvent(new Event('input'));
  assert.equal(amount.value, '200.000');
  assert.equal(taxField.value, '0');
  assert.equal(nodeFor('[data-payment-remaining]').textContent, 'Rp 725.641');
  assert.equal((await controller.confirm()).depositAmount, 100000);

  amount.value = '900.000';
  amount.dispatchEvent(new Event('input'));
  assert.equal(taxField.value, '25.641');
  assert.equal(nodeFor('[data-payment-remaining]').textContent, 'Rp 0');

  taxField.value = '5.000';
  taxField.dispatchEvent(new Event('moneychange'));
  amount.value = '200.000';
  amount.dispatchEvent(new Event('input'));
  assert.equal(taxField.value, '5.000');
  assert.equal(nodeFor('[data-payment-remaining]').textContent, 'Rp 720.641');
});
