import { productionDetail } from './project-item.js';
import { itemQuantityLabel, roleCanAdvance } from './item-workflow.js';
import { invoiceDiscount, invoiceGross, settledOrder } from './order-discount.js';
import { paymentReceipts } from './order-history.js';
import { historyActions } from './order-history-detail.js';
import { cancelled } from './order-rules.js';

export function invoiceWorkHistory(order) {
  return (order.timeline || []).map((event,index)=>({event,index}))
    .filter(({event})=>event.category !== 'PAYMENT' && (event.itemId || !/^(Pembayaran\b|Kelebihan pembayaran\b|Tagihan lunas melalui diskon\b|Diskon (?:pesanan|invoice)\b)/i.test(String(event.message || '').trim())))
    .sort((a,b)=>(Date.parse(b.event.createdAt)||0)-(Date.parse(a.event.createdAt)||0)||a.index-b.index)
    .map(({event})=>event);
}

export function invoicePickupAllowed(order,user) {
  return Boolean(!cancelled(order) && order.status==='SELESAI' && order.items?.length>0 && order.items.every(item=>item.status==='SELESAI') &&
    (user.permissions?.includes('projects.status') || user.permissions?.includes('orders.pickup')) && roleCanAdvance(user.role,'SELESAI','DIAMBIL'));
}

const dot='<img class="invoice-history-dot" src="/invoice-assets/dot.svg" alt="">';
const stamp=(value,c)=>value && Number.isFinite(Date.parse(value)) ? c.dateFormat.format(new Date(value))+' WITA' : 'Waktu belum tercatat';
const historyRow=(title,time,actor,action,c)=>`<li>${dot}<div class="invoice-history-copy">${title}<small>${c.escapeHtml(stamp(time,c))} · ${c.escapeHtml(actor || 'Riwayat lama')}</small></div>${action || ''}</li>`;

export function invoicePaymentHistoryHtml(order,c,cash=[]) {
  const h=c.escapeHtml;
  const receipts=paymentReceipts(order,cash);
  const paid=receipts.map(payment=>historyRow(`<strong>${h(c.rupiah.format(payment.amount))} · ${h(payment.method || '—')}</strong>${payment.depositUsed?`<span class="invoice-history-note">Termasuk deposit ${h(c.rupiah.format(payment.depositUsed))}</span>`:''}${payment.depositAmount?`<span class="invoice-history-note">Kelebihan masuk deposit ${h(c.rupiah.format(payment.depositAmount))}</span>`:''}`,payment.createdAt,payment.actor,`<button type="button" class="secondary" data-print-payment="${h(payment.id)}">Print Bukti #${payment.sequence}</button>`,c));
  const refunds=cash.filter(receipt=>receipt.kind==='REFUND').map(receipt=>historyRow(`<strong>Refund ${h(c.rupiah.format(Math.abs(receipt.amount)))} · ${h(receipt.method)}</strong>`,receipt.createdAt,receipt.actor,`<button type="button" class="secondary" data-print-refund="${h(receipt.id)}">Print Bukti Refund</button>`,c));
  const pos=(order.payments || []).filter(payment=>payment.type==='PO').map((payment,index)=>historyRow(`<strong>PO / Tempo · ${h(payment.poNumber || 'Tanpa nomor')}</strong><span class="invoice-history-note">Pencatatan tempo, belum merupakan uang masuk.</span>`,payment.createdAt,payment.actor,payment.poAttachment?`<button type="button" class="secondary" data-invoice-po="${index}">Lihat PO</button>`:'',c));
  const empty=invoiceDiscount(order)>0 && order.total===0 ? 'Lunas melalui diskon penuh; tidak ada uang masuk.' : 'Belum ada pembayaran diterima.';
  return `<h3>Riwayat Pembayaran</h3>${paid.length || refunds.length || pos.length?`<ol class="invoice-history-list">${[...paid,...pos,...refunds].join('')}</ol>`:`<p class="invoice-empty">${empty}</p>`}`;
}

export function invoiceDetailHtml(order,c) {
  const h=c.escapeHtml, money=value=>h(c.rupiah.format(Number(value || 0))), actions=historyActions(order,c.user.permissions), isCancelled=cancelled(order), settled=settledOrder(order);
  const summary=c.showMoney?`<section class="invoice-summary" aria-label="Ringkasan pembayaran"><div><span>Status Pembayaran</span><strong class="${isCancelled?'invoice-cancelled':settled?'invoice-paid':'invoice-unpaid'}">${isCancelled?'DIBATALKAN':settled?'LUNAS':'BELUM LUNAS'}</strong></div><div><span>Total Pesanan</span><strong>${money(invoiceGross(order))}</strong></div>${invoiceDiscount(order)?`<div><span>Diskon</span><strong>− ${money(invoiceDiscount(order))}</strong></div><div><span>Total Tagihan</span><strong>${money(order.total)}</strong></div>`:''}${!isCancelled && !settled?`<div><span>Sisa Pembayaran</span><strong>${money(Math.max(0,Number(order.total)-Number(order.paidAmount || 0)))}</strong></div>`:''}</section>`:'';
  const items=(order.items || []).map((item,index)=>{
    const data=productionDetail(order,item).item, status=item.status || order.status;
    const statusName=c.statusLabels[status] || status || '—';
    const circle=status==='DESAIN'?'<img src="/invoice-assets/design.svg" alt="">':status==='CETAK'?'<img src="/invoice-assets/print.svg" alt="">':'<i aria-hidden="true"></i>';
    const file=data.templateDesign || data.fileService?.name || 'File Siap Cetak';
    const fileQuantity=item.fileService?.id && item.fileService.id!=='READY' && Number(data.fileService?.quantity)>1 ? ` × ${Number(data.fileService.quantity)}` : '';
    const finishing=(data.finishing || []).map(f=>`${f.name}${f.units>1?` × ${f.units}`:''}`).join(', ');
    return `<article class="invoice-item" data-detail-item="${h(item.itemId || '')}"><div class="invoice-item-heading"><h3><span class="invoice-item-number">${index+1}</span>${h(item.productName)}</h3><span class="invoice-item-status status-${h(String(status).toLowerCase())}">${circle}${h(statusName)}</span></div><div class="invoice-item-specs"><div><strong>${h(data.variantSummary || '—')}</strong><strong>${h(itemQuantityLabel(item))}</strong></div>${data.details.map(line=>`<p>${h(line)}</p>`).join('')}${finishing?`<div><span>Finishing</span><span>${h(finishing)}</span></div>`:''}${item.needsFile===false && !item.fileService && !item.templateDesign?'':`<div><span>File</span><span>${h(file+fileQuantity)}</span></div>`}</div></article>`;
  }).join('');
  const events=invoiceWorkHistory(order);
  const work=`<details class="invoice-work-history"><summary><span>Riwayat Pekerjaan</span><img src="/invoice-assets/chevron.svg" alt=""></summary>${events.length?`<ol class="invoice-history-list">${events.map(event=>{
    const index=order.items.findIndex(item=>item.itemId===event.itemId),prefix=index>=0 && !/\(item \d+\)/i.test(event.message || '')?`${order.items[index].productName} (item ${index+1}): `:'';
    return historyRow(`<p>${h(prefix+String(event.message || 'Perubahan pesanan'))}</p>`,event.createdAt,event.actor,'',c);
  }).join('')}</ol>`:'<p class="invoice-empty">Belum ada riwayat pekerjaan.</p>'}</details>`;
  const pickup=invoicePickupAllowed(order,c.user);
  return `<section class="invoice-detail"><header class="invoice-detail-head"><div><span>${h(order.code)}</span><h2>${h(order.customerName)}</h2></div><button type="button" class="invoice-detail-close" aria-label="Tutup detail order"><img src="/invoice-assets/close.svg" alt=""></button></header><div class="detail-body invoice-detail-body">${summary}${isCancelled?`<p class="invoice-state-note invoice-cancelled">Transaksi dibatalkan${order.cancelReason?`: ${h(order.cancelReason)}`:''}</p>`:''}${order.status==='DIAMBIL'?`<p class="invoice-state-note">Pesanan Diambil${order.pickedUpAt?` · ${h(stamp(order.pickedUpAt,c))}`:''}</p>`:''}<div class="invoice-items">${items}</div><section class="invoice-histories">${c.showPayments?`<section data-invoice-payments>${invoicePaymentHistoryHtml(order,c)}</section>`:''}${work}</section><div data-invoice-secondary></div></div><footer class="invoice-detail-footer">${actions.edit?'<button id="edit-order" type="button" class="secondary">Edit Pesanan</button>':''}${c.canReturn?'<button id="return-goods" type="button" class="secondary">Retur Barang</button>':''}${actions.spk?'<button id="print-spk" type="button" class="secondary">Print SPK</button>':''}${actions.invoice?'<button id="print-invoice" type="button" class="secondary">Nota Ulang</button>':''}${actions.receipt?'<button id="print-receipt" type="button" class="secondary">Print Tanda Terima</button>':''}${pickup?'<button id="advance-order" type="button" class="primary">Pesanan Diterima</button>':''}</footer></section>`;
}
