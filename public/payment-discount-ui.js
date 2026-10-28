import { invoiceDiscount, invoiceGross, discountLocked } from './order-discount.js';

export function paymentDiscountHtml(order, { moneyField, money }) {
  const amount = invoiceDiscount(order), locked = discountLocked(order);
  return `<section class="payment-discount-summary" aria-label="Diskon pesanan"><div class="payment-discount-option"><label class="deposit-check"><input type="checkbox" data-invoice-discount-toggle ${amount ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-controls="invoice-discount-field"> Diskon</label><span id="invoice-discount-field" ${amount ? '' : 'hidden'}>${moneyField('invoiceDiscountAmount', amount, `form="payment-form" aria-label="Diskon nominal pesanan" ${locked ? 'disabled' : ''}`)}</span><span class="payment-discount-dash" ${amount ? 'hidden' : ''}>−</span></div><div class="payment-total-due"><span>Total Tagihan</span><strong data-invoice-total>${money(order.total)}</strong></div>${locked && amount ? '<p class="payment-discount-note">Diskon terkunci setelah konfirmasi pembayaran pertama.</p>' : ''}</section>`;
}

export function bindPaymentDiscount(form, original, { parseMoney, money }) {
  // Keep previews local to this dialog: closing without payment changes nothing.
  const order = structuredClone(original), section = form.previousElementSibling;
  const toggle = section.querySelector('[data-invoice-discount-toggle]'), field = section.querySelector('[name=invoiceDiscountAmount]');
  const gross = invoiceGross(original), locked = discountLocked(original);
  function sync() {
    const amount = toggle.checked ? parseMoney(field.value) : 0;
    field.setCustomValidity(!Number.isSafeInteger(amount) || amount < 0 ? 'Diskon harus berupa nominal rupiah yang tidak negatif' : amount > gross ? 'Diskon tidak boleh melebihi Total Pesanan' : '');
    section.querySelector('#invoice-discount-field').hidden = !toggle.checked;
    section.querySelector('.payment-discount-dash').hidden = toggle.checked;
    field.disabled = locked || !toggle.checked;
    order.total = gross - Math.max(0, Math.min(gross, amount || 0));
    section.querySelector('[data-invoice-total]').textContent = money(order.total);
    form.dispatchEvent(new CustomEvent('payment:totalchange'));
  }
  toggle.addEventListener('change', () => { sync(); if (toggle.checked && !locked) field.focus(); });
  field.addEventListener('moneychange', sync);
  sync();
  return { order, amount: () => toggle.checked ? parseMoney(field.value) : 0 };
}
