import { grossUpQuote, orderTaxRateBps, taxAdjustment } from './order-tax.js';
import { invoiceDiscount, invoiceGross, discountLocked } from './order-discount.js';

export function paymentReadout(amount, attributes = '') {
  return `<span class="payment-readout"><span>Rp</span><strong ${attributes}>${Number(amount || 0).toLocaleString('id-ID')}</strong></span>`;
}

export function paymentDiscountHtml(order, { moneyField }) {
  const amount = invoiceDiscount(order);
  const locked = discountLocked(order);
  return `<div class="payment-discount-summary">
    <div class="payment-summary-row">
      ${locked ? `<span>Diskon</span>${paymentReadout(-amount)}` : `
        <label class="design-toggle payment-toggle">
          <input type="checkbox" role="switch" data-invoice-discount-toggle ${amount ? 'checked' : ''} aria-controls="invoice-discount-field">
          <span class="design-switch" aria-hidden="true"></span><span>Diskon</span>
        </label>
        <span id="invoice-discount-field" ${amount ? '' : 'hidden'}>${moneyField('invoiceDiscountAmount', amount, 'aria-label="Diskon nominal pesanan"')}</span>
        <span class="payment-discount-dash" ${amount ? 'hidden' : ''}>—</span>
      `}
    </div>
    ${orderTaxRateBps(order) ? `
      <div class="payment-summary-row"><span>Penyesuaian Harga</span>${paymentReadout(taxAdjustment(order), 'data-invoice-tax-adjustment')}</div>
      <div class="payment-summary-row"><span>Total Tagihan</span>${paymentReadout(order.total, 'data-invoice-total')}</div>
    ` : ''}
  </div>`;
}

export function bindPaymentDiscount(form, section, original, { parseMoney, formatMoneyValue }) {
  // Keep previews local to this dialog: closing without payment changes nothing.
  const order = structuredClone(original);
  const savedAmount = invoiceDiscount(original);
  if (discountLocked(original)) return { order, amount: () => savedAmount };

  const toggle = section.querySelector('[data-invoice-discount-toggle]');
  const field = section.querySelector('[name=invoiceDiscountAmount]');
  const gross = invoiceGross(original);
  const rateBps = orderTaxRateBps(original);
  const amount = () => toggle.checked ? parseMoney(field.value) : 0;
  function sync() {
    const discount = amount();
    field.setCustomValidity(!Number.isSafeInteger(discount) || discount < 0 ? 'Diskon harus berupa nominal rupiah yang tidak negatif' : discount > gross ? 'Diskon tidak boleh melebihi Total Pesanan' : '');
    section.querySelector('#invoice-discount-field').hidden = !toggle.checked;
    section.querySelector('.payment-discount-dash').hidden = toggle.checked;
    field.disabled = !toggle.checked;
    const net = gross - Math.max(0, Math.min(gross, discount || 0));
    const quote = rateBps ? grossUpQuote(net, rateBps) : { total: net };
    order.total = quote.total;
    if (rateBps) {
      section.querySelector('[data-invoice-tax-adjustment]').textContent = formatMoneyValue(quote.adjustment);
      section.querySelector('[data-invoice-total]').textContent = formatMoneyValue(quote.total);
    }
    form.dispatchEvent(new CustomEvent('payment:totalchange'));
  }
  toggle.addEventListener('change', () => {
    sync();
    if (toggle.checked) field.focus();
  });
  field.addEventListener('moneychange', sync);
  sync();
  return { order, amount };
}
