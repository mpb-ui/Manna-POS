import { historyDraft, paymentReceipts } from './order-history.js';
import { historyProductRows } from './order-history-detail.js';
import { itemQuantityLabel } from './item-workflow.js';
import { invoiceDiscount, invoiceGross, settledOrder } from './order-discount.js';
import { cancelled } from './order-rules.js';
import { sheetSpecification } from './sheet-calculator.js';
import { rollPlacementNote } from './roll-placement.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const n = value => Number(value || 0).toLocaleString('id-ID', {maximumFractionDigits:4});
const money = value => `<span class="thermal-money"><span>Rp</span><span>${n(value)}</span></span>`;
export function thermalDate(value, short = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('id-ID', {day:'numeric',month:'short',...(!short ? {year:'numeric'} : {}),hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Makassar'}).format(new Date(value));
}
const meta = (label, value, bold = false) => `<div class="thermal-meta-row"><span>${e(label)}</span><${bold ? 'strong' : 'span'}>${e(value || '—')}</${bold ? 'strong' : 'span'}></div>`;
const totalRow = (label, value, extra = '') => `<div class="thermal-total-row ${extra}"><span>${e(label)}</span>${money(value)}</div>`;
const unique = values => [...new Set(values.filter(Boolean))];

// Only stored specifications: rounded billable lengths are never cut sizes.
export function thermalItem(item, {work = false, deadline} = {}) {
  const row = historyProductRows({items:[item]})[0], detail = [];
  if (item.shirtVariants?.length) {
    if (item.dtfPackageLabel) detail.push(item.dtfPackageLabel);
    detail.push(...item.shirtVariants.map(v => `${v.color} · ${v.size} × ${n(v.quantity)} pcs`));
  } else {
    if (row.variant !== '—') detail.push(...row.variant.split(' | '));
    if (['sqm','linear_m'].includes(item.priceBasis) && !item.sizeVariantLabel && !(Number(item.imageLengthCm) > 0 || Number(item.actualLength ?? item.length) > 0)) detail.push('Ukuran gambar belum tercatat');
    else if (row.size !== '—') detail.push(`${item.priceBasis !== 'unit' ? 'Ukuran gambar: ' : 'Ukuran: '}${row.size}`);
  }
  if (Number(item.allowanceCm) > 0) {
    detail.push(`Lebihan ${n(item.allowanceCm)} cm/sisi`);
    if (Number(item.finalImageWidthCm) > 0 && Number(item.finalImageLengthCm) > 0) detail.push(`Ukuran akhir: ${n(item.finalImageWidthCm)} × ${n(item.finalImageLengthCm)} cm`);
  }
  const placement = rollPlacementNote(item);
  if (placement) detail.push(placement);
  if (item.sheetCalculation) detail.push(sheetSpecification(item.sheetCalculation));
  for (const f of item.finishing || []) detail.push(`${f.name}${Number(f.units) > 1 ? ` × ${n(f.units)}` : ''}${f.note ? ` (${f.note})` : ''}`);
  if (item.templateDesign) detail.push(`Design Template ${item.templateDesign}`);
  else if (item.fileService?.id && item.fileService.id !== 'READY') detail.push(`${work ? String(item.fileService.name).replace(/^Biaya\s+/i,'') : item.fileService.name}${Number(item.fileService.quantity) > 1 ? ` × ${n(item.fileService.quantity)}` : ''}${item.fileService.note ? ` (${item.fileService.note})` : ''}`);
  if (work && item.deadline && item.deadline !== deadline) detail.push(`Deadline: ${thermalDate(item.deadline, true)} WITA`);
  const lines = unique(detail).map(value => `<div>${e(value)}</div>`).join('');
  const note = item.productionNote ? `<div class="thermal-note">Catatan: ${e(item.productionNote)}</div>` : '';
  const title = `<strong>${e(row.product)}</strong>`, quantity = e(itemQuantityLabel(item).replace(/ Lembar$/,' lbr').replace(/ (Pcs|Kaos)$/,' pcs').replace(/ Unit$/,' unit'));
  return work
    ? `<section class="thermal-work-item"><strong class="thermal-quantity">${quantity}</strong><div>${title}<div class="thermal-item-detail">${lines}${note}</div></div></section>`
    : `<section class="thermal-invoice-item"><div class="thermal-item-heading">${title}<span class="thermal-quantity">${quantity}</span>${money(item.subtotal)}</div><div class="thermal-item-detail">${lines}${note}</div></section>`;
}

export function receiptView(order, payment = null, latestPayment = null) {
  const historical = Boolean(payment), latest = payment || latestPayment || paymentReceipts(order).at(-1);
  const total = Number(historical ? payment.orderTotal : order.total || 0);
  const discount = Number(historical ? payment.invoiceDiscountAmount || 0 : invoiceDiscount(order));
  const gross = Number(historical ? payment.orderGrossTotal ?? total + discount : invoiceGross(order));
  const paid = Number(historical ? payment.paidAfter : order.paidAmount || 0);
  const balance = Number(historical ? payment.balanceAfter : Math.max(0,total - paid));
  const isCancelled = cancelled(order), draft = !isCancelled && !historical && historyDraft(order);
  const settled = !isCancelled && (historical ? balance === 0 : settledOrder(order));
  return {total,discount,gross,paid,balance,isCancelled,draft,settled,latest,historical,
    cashier:latest ? latest.actor || 'Tidak tercatat' : order.createdByName || 'Tidak tercatat',
    status:isCancelled ? 'Dibatalkan' : settled ? 'Lunas' : 'Belum Lunas'};
}

export function invoiceReceiptHtml(order, payment = null, latestPayment = null) {
  const v = receiptView(order,payment,latestPayment), p = v.latest;
  const warning = v.isCancelled ? 'PESANAN DIBATALKAN' : v.draft ? 'DRAFT · BELUM DIKONFIRMASI' : '';
  const paymentRows = p ? totalRow('Sudah Bayar (sebelumnya)',p.paidBefore)
    + totalRow('Bayar (pembayaran ini)',p.amount)
    + (p.depositUsed ? totalRow('Termasuk deposit',p.depositUsed) : '')
    + (p.tenderKnown ? totalRow('Uang diterima',p.amountReceived) + totalRow('Kembali',p.changeAmount || 0) : '')
    + (p.depositAmount ? totalRow('Disimpan ke deposit',p.depositAmount) : '')
    + meta('Metode',p.method || '—') : meta('Metode','—');
  return `<article class="thermal-slip thermal-invoice">
    <header class="thermal-shop"><img class="thermal-logo" src="/manna-receipt-logo.png" alt="Manna" width="210" height="34"><strong>Manna Print</strong><div>Jl. Mangga Golek, Labuan Bajo | WA: 082247299578</div></header>
    ${warning ? `<div class="thermal-warning">${e(warning)}</div>` : ''}
    <div class="thermal-rule"></div><div class="thermal-meta">${meta('Nota',order.code)}${meta('Tanggal',thermalDate(order.createdAt)+' WITA')}${meta('Telp',order.phone)}${meta('Customer',order.customerName)}</div><div class="thermal-rule"></div>
    <div class="thermal-items">${(order.items || []).map(item=>thermalItem(item)).join('')}</div>
    <div class="thermal-rule dashed"></div><section class="thermal-summary">
    ${v.discount ? totalRow('Total Pesanan',v.gross)+totalRow('Diskon pesanan',-v.discount) : ''}
    ${totalRow('Grand Total',v.total,'thermal-grand-total')}
    ${paymentRows}${totalRow(v.historical ? 'Total dibayar saat transaksi' : 'Total dibayar',v.paid)}
    ${v.historical || !v.isCancelled ? totalRow(v.historical ? 'Sisa saat transaksi' : 'Sisa Tagihan',v.balance) : ''}
    ${v.isCancelled ? '<p>Tagihan dibatalkan; penyelesaian dana mengikuti bukti refund / deposit.</p>' : ''}
    ${!p && v.total === 0 && v.settled && v.discount ? '<p>Lunas melalui diskon penuh. Tidak ada uang masuk.</p>' : ''}
    </section><div class="thermal-rule"></div>
    <div class="thermal-receipt-bottom"><div class="thermal-status">${p ? `<span>Pembayaran ke: ${e(p.sequence)}</span>` : ''}<strong>${e(v.status)}</strong></div><span>Cashier: ${e(v.cashier)}</span></div>
    ${v.historical ? `<div class="thermal-reference">BUKTI PEMBAYARAN${v.settled ? ' / PELUNASAN' : ''} · ${e(p.id)}${v.isCancelled ? ' · Riwayat sebelum pembatalan' : ''}</div>` : ''}
    ${p?.note ? `<p class="thermal-note">Catatan pembayaran: ${e(p.note)}</p>` : ''}
    ${p?.reconstructed ? '<p class="thermal-reference">Saldo direkonstruksi dari riwayat pembayaran yang tersedia.</p>' : ''}
    <footer class="thermal-footer"><p>Harap bawa nota ini saat pengambilan barang.<br>Retur barang defect mengikuti ketentuan toko.</p><strong>Print apa saja, di Manna aja!</strong></footer>
  </article>`;
}

export function workOrderHtml(order) {
  return `<article class="thermal-slip thermal-work-order"><header><div class="thermal-work-title"><span>${e(order.code)}</span><span>WORK ORDER</span></div><h1>${e(order.customerName || '—')}</h1></header>
    ${cancelled(order) || historyDraft(order) ? `<div class="thermal-warning">${cancelled(order) ? 'PESANAN DIBATALKAN' : 'DRAFT · BELUM DIKONFIRMASI'}</div>` : ''}
    <div class="thermal-rule"></div><div class="thermal-meta">${meta('Tgl Order',thermalDate(order.createdAt,true)+' WITA')}${meta('Deadline',order.deadline ? thermalDate(order.deadline,true)+' WITA' : '—',true)}${meta('Telp',order.phone)}</div><div class="thermal-rule"></div>
    ${(order.items || []).map(item=>thermalItem(item,{work:true,deadline:order.deadline})).join('')}
  </article>`;
}
