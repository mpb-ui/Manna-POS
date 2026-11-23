import { itemQuantityLabel } from './item-workflow.js';
import { invoiceGross } from './order-discount.js';
import { orderTaxRateBps, taxAdjustment, taxWithheld } from './order-tax.js';
import { paymentDiscountHtml, paymentReadout } from './payment-discount-ui.js';

function paymentSummaryHtml(order, { escapeHtml, money, imageSizeNote }) {
  const rows = (order.items || []).map((item, index) => {
    const sizeNote = imageSizeNote(item);
    return `<li class="payment-item">
      <span class="payment-item-number" aria-hidden="true">${index + 1}</span>
      <div><strong>${escapeHtml(item.productName)}</strong><small>${escapeHtml(item.displaySize || itemQuantityLabel(item))}</small>${sizeNote ? `<small>${escapeHtml(sizeNote)}</small>` : ''}</div>
      <strong>${money(item.subtotal)}</strong>
    </li>`;
  });
  const extra = rows.slice(3);
  return `<aside class="payment-order-summary" aria-labelledby="payment-summary-title">
    <h3 id="payment-summary-title">Ringkasan</h3>
    <ul class="payment-item-list" role="list" aria-label="Item pesanan">${rows.slice(0, 3).join('')}</ul>
    ${extra.length ? `<details class="payment-more-items">
      <summary><span>Lihat ${extra.length} item lainnya</span><span>Sembunyikan item lainnya</span></summary>
      <ul class="payment-item-list" role="list" aria-label="Item pesanan lainnya">${extra.join('')}</ul>
    </details>` : ''}
  </aside>`;
}

function paymentFormHtml(order, { moneyField }) {
  const paid = Number(order.paidAmount || 0);
  const outstanding = Math.max(0, Number(order.total) - paid);
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
    <div class="payment-totals">
      <div class="payment-summary-row"><span>Total Pesanan</span>${paymentReadout(invoiceGross(order))}</div>
      ${paymentDiscountHtml(order, { moneyField })}
      ${paid > 0 ? `<div class="payment-summary-row"><span>Sudah Bayar</span>${paymentReadout(-paid)}</div>` : ''}
      <div class="payment-summary-row" data-payment-deposit hidden>
        <label class="design-toggle payment-toggle">
          <input type="checkbox" role="switch" aria-label="Gunakan deposit" aria-describedby="payment-deposit-balance" data-payment-use>
          <span class="design-switch" aria-hidden="true"></span><span>Deposit</span>
        </label>
        ${paymentReadout(0, 'data-payment-deposit-used')}
      </div>
      <p class="payment-deposit-after" data-payment-deposit-after hidden>Saldo deposit setelah konfirmasi <strong></strong></p>
    </div>
    <div class="payment-tender">
      <div class="payment-summary-row"><span data-payment-due-label>Perlu Dibayar</span>${paymentReadout(outstanding, 'data-payment-due')}</div>
      <div id="payment-fields" class="payment-tab-panel">
        <p class="payment-deposit-covered" data-payment-deposit-covered hidden>Tagihan tertutup oleh deposit.</p>
        <label class="field payment-summary-row payment-received">
          <span>Uang Diterima</span>${moneyField('amount', outstanding, 'required')}
        </label>
        <div class="payment-summary-row"><span data-payment-excess-label>Kembali</span>${paymentReadout(0, 'data-payment-excess-amount')}</div>
        <div class="payment-dp-options">
          <label class="design-toggle payment-toggle"><input id="payment-dp" type="checkbox" role="switch" aria-controls="payment-half" aria-expanded="false"><span class="design-switch" aria-hidden="true"></span><span>Pembayaran DP</span></label>
          <button type="button" id="payment-half" class="payment-half hidden">50%</button>
        </div>
        ${taxFields}
        <div class="payment-methods" role="group" aria-labelledby="payment-method-label">
          <span id="payment-method-label">Metode</span>
          <div class="chips payment-method-chips">
            ${[['TUNAI', 'Tunai'], ['QRIS', 'QRIS'], ['TRANSFER', 'Transfer']].map(([value, label]) => `<div class="chip"><input type="radio" name="method" id="pay-method-${value}" value="${value}" required><label for="pay-method-${value}">${label}</label></div>`).join('')}
          </div>
        </div>
        <p class="payment-excess" data-payment-excess role="status" hidden></p>
      </div>
      <div id="po-fields" class="payment-tab-panel hidden">
        <label class="field"><span>Nomor PO *</span><input name="poNumber" placeholder="Contoh PO/0924/001"></label>
        <label class="field"><span>Lampiran PO <small>(opsional)</small></span><input name="poFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <div id="po-preview" class="po-preview hidden"></div>
      </div>
    </div>
  </form>`;
}

export function paymentDialogHtml(order, options) {
  const { escapeHtml, money } = options;
  const outstanding = Math.max(0, Number(order.total) - Number(order.paidAmount || 0));
  return `<header class="detail-head">
    <div>
      <h2 id="payment-title">Pembayaran</h2>
      <p class="payment-context"><b>${escapeHtml(order.code)}</b><span>${escapeHtml(order.customerName)}</span><span class="payment-deposit-badge" data-payment-deposit-badge hidden><span id="payment-deposit-balance">Deposit Tersedia <strong>${money(0)}</strong></span></span></p>
    </div>
    <button type="button" class="detail-close" aria-label="Tutup pembayaran"><img src="/assets/print-config/imgX.svg" alt=""></button>
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
