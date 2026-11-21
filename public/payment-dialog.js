import { itemQuantityLabel } from './item-workflow.js';
import { invoiceGross } from './order-discount.js';
import { orderTaxRateBps, taxAdjustment, taxWithheld } from './order-tax.js';
import { paymentDiscountHtml } from './payment-discount-ui.js';

function paymentSummaryHtml(order, { escapeHtml, money, moneyField, imageSizeNote }) {
  const rows = (order.items || []).map(item => {
    const sizeNote = imageSizeNote(item);
    return `<li class="payment-item">
      <div><strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.displaySize || itemQuantityLabel(item))}</small>${sizeNote ? `<small>${escapeHtml(sizeNote)}</small>` : ''}</div>
      <strong>${money(item.subtotal)}</strong>
    </li>`;
  });
  const extra = rows.slice(3);
  const paid = Number(order.paidAmount || 0);
  const due = Math.max(0, Number(order.total) - paid);
  return `<aside class="payment-order-summary" aria-labelledby="payment-summary-title">
    <div class="payment-summary-heading"><h3 id="payment-summary-title">Ringkasan</h3><span>${rows.length} item</span></div>
    <ul class="payment-item-list" role="list" aria-label="Item pesanan">${rows.slice(0, 3).join('')}</ul>
    ${extra.length ? `<details class="payment-more-items">
      <summary><span>Lihat ${extra.length} item lainnya</span><span>Sembunyikan item lainnya</span></summary>
      <ul class="payment-item-list" role="list" aria-label="Item pesanan lainnya">${extra.join('')}</ul>
    </details>` : ''}
    <div class="payment-summary-totals">
      <div class="payment-summary-row"><span>Total Pesanan</span><strong>${money(invoiceGross(order))}</strong></div>
      ${paymentDiscountHtml(order, { moneyField, money })}
      ${paid > 0 ? `<div class="payment-summary-row"><span>Sudah dibayar</span><strong>− ${money(paid)}</strong></div>` : ''}
      ${orderTaxRateBps(order) ? '<div class="payment-summary-row" data-payment-tax-row hidden><span>Potongan Pajak Aktual</span><strong></strong></div>' : ''}
      <div class="payment-summary-row" data-payment-deposit-row hidden><span>Deposit digunakan</span><strong></strong></div>
      <div class="payment-summary-row payment-due"><span data-payment-due-label>Perlu dibayar</span><strong data-payment-due>${money(due)}</strong></div>
    </div>
    <div class="payment-summary-row payment-deposit-after" data-payment-deposit-after hidden><span>Saldo deposit setelah konfirmasi</span><strong></strong></div>
  </aside>`;
}

function paymentFormHtml(order, { money, moneyField }) {
  const outstanding = Math.max(0, Number(order.total) - Number(order.paidAmount || 0));
  const expectedTax = Math.min(outstanding, Math.max(0, taxAdjustment(order) - taxWithheld(order)));
  const taxFields = orderTaxRateBps(order) ? `<details class="payment-tax-details">
    <summary><span>Potongan Pajak Aktual</span><small data-payment-tax-hint>Opsional</small></summary>
    <label class="field">${moneyField('taxWithheld', expectedTax, 'aria-label="Nominal Potongan Pajak Aktual" data-optional-money')}</label>
  </details>` : '';
  return `<form id="payment-form" aria-label="Form pembayaran">
    <fieldset class="payment-tabs">
      <legend class="payment-sr-only">Jenis pembayaran</legend>
      <label><input class="payment-sr-only" type="radio" name="type" value="PAYMENT" checked><span>Pembayaran</span></label>
      <label><input class="payment-sr-only" type="radio" name="type" value="PO"><span>Pembayaran PO</span></label>
    </fieldset>
    <div id="payment-fields" class="payment-tab-panel">
      <label class="payment-deposit-option design-toggle" data-payment-deposit hidden>
        <span><strong>Gunakan deposit</strong><small>Saldo tersedia <b id="payment-deposit-balance">${money(0)}</b></small></span>
        <input type="checkbox" role="switch" aria-label="Gunakan deposit" aria-describedby="payment-deposit-balance" data-payment-use><span class="design-switch" aria-hidden="true"></span>
      </label>
      <p class="payment-deposit-covered" data-payment-deposit-covered hidden>Tagihan tertutup oleh deposit.</p>
      <fieldset class="payment-methods">
        <legend>Metode pembayaran</legend>
        <div class="chips payment-method-chips">
          ${[['TUNAI', 'Tunai'], ['QRIS', 'QRIS'], ['TRANSFER', 'Transfer']].map(([value, label]) => `<div class="chip"><input type="radio" name="method" id="pay-method-${value}" value="${value}" required><label for="pay-method-${value}">${label}</label></div>`).join('')}
        </div>
      </fieldset>
      <label class="field"><span>Nominal diterima</span>${moneyField('amount', outstanding, 'required')}</label>
      <div class="payment-dp-options">
        <label class="design-toggle"><input id="payment-dp" type="checkbox" role="switch" aria-controls="payment-half" aria-expanded="false"><span class="design-switch" aria-hidden="true"></span><strong>Pembayaran DP</strong></label>
        <button type="button" id="payment-half" class="payment-half hidden">50%</button>
      </div>
      ${taxFields}
      <p class="payment-excess" data-payment-excess hidden></p>
    </div>
    <div id="po-fields" class="payment-tab-panel hidden">
      <label class="field"><span>Nomor PO *</span><input name="poNumber" placeholder="Contoh PO/0924/001"></label>
      <label class="field"><span>Lampiran PO <small>(opsional)</small></span><input name="poFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <div id="po-preview" class="po-preview hidden"></div>
    </div>
  </form>`;
}

export function paymentDialogHtml(order, options) {
  const { escapeHtml, money } = options;
  const outstanding = Math.max(0, Number(order.total) - Number(order.paidAmount || 0));
  return `<header class="detail-head">
    <div><h2 id="payment-title">Pembayaran</h2><p class="payment-context"><b>${escapeHtml(order.code)}</b><span aria-hidden="true">·</span>${escapeHtml(order.customerName)}</p></div>
    <button type="button" class="detail-close" aria-label="Tutup pembayaran">×</button>
  </header>
  <div class="detail-body payment-layout">${paymentSummaryHtml(order, options)}${paymentFormHtml(order, options)}</div>
  <footer class="detail-actions">
    <div class="payment-footer-summary" aria-live="polite" aria-atomic="true">
      <span class="payment-status" data-payment-status>Belum Lunas</span>
      <div><span>Sisa tagihan</span><strong data-payment-remaining>${money(outstanding)}</strong></div>
    </div>
    <button id="confirm-payment" type="submit" form="payment-form" class="primary">Konfirmasi Pembayaran</button>
  </footer>`;
}
