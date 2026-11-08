import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceDetailHtml,invoicePaymentHistoryHtml,invoiceWorkHistory,invoicePickupAllowed} from '../public/invoice-detail.js';
import {ROLE_PRESETS} from '../lib/access.js';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const c={escapeHtml,rupiah:new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}),dateFormat:new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'}),statusLabels:{DESAIN:'Operator Design',CETAK:'Proses Cetak',FINISHING:'Finishing',SELESAI:'Selesai',DIAMBIL:'Pesanan Diambil',MENUNGGU_PEMBAYARAN:'Menunggu Pembayaran',BATAL:'Dibatalkan'},user:{role:'OWNER',permissions:ROLE_PRESETS.OWNER.permissions},showMoney:true,showPayments:true,canReturn:false};
const fixture=()=>({id:'o',code:'INV-110826-001',customerName:'Meruorah',status:'DESAIN',total:200000,paidAmount:175000,paymentConfirmed:true,items:[{itemId:'a',productName:'X-Banner',sizeVariantLabel:'FL410 Glossy',priceBasis:'unit',quantity:1,unitName:'set',status:'DESAIN',productionNote:'Catatan rahasia',driveUrl:'https://drive.google.com/private',hold:{reason:'Kendala mesin'}},{itemId:'b',productName:'Kartu Nama AP260',subVariantLabel:'Cetak 1 Sisi',priceBasis:'unit',quantity:1,unitName:'produk',status:'CETAK'}],payments:[{id:'p1',type:'PAYMENT',method:'QRIS',amount:175000,createdAt:'2026-11-08T00:30:00Z',actor:'Kasir'}],timeline:[]});

test('invoice detail shows all read-only item states and payment summary without production controls or payment form',()=>{
 const order=fixture(),before=structuredClone(order),html=invoiceDetailHtml(order,c);
 for(const label of ['X-Banner','FL410 Glossy','1 set','Kartu Nama AP260','Cetak 1 Sisi','Operator Design','Proses Cetak','Sisa Pembayaran','25.000','Print SPK','Nota Ulang','Print Bukti #1'])assert.ok(html.includes(label),label);
 assert.equal((html.match(/class="invoice-item"/g)||[]).length,2);
 for(const forbidden of ['<form','<input','<textarea','<select','Catatan rahasia','https://drive.google.com/private','Tandai Tertahan','Catat Transfer Tambahan','data-item-advance','data-item-pic','data-item-deadline','Ukuran: FL410'])assert.ok(!html.includes(forbidden),forbidden);
 assert.match(html,/<details class="invoice-work-history">/);assert.ok(!/<details[^>]*\sopen/.test(html));assert.deepEqual(order,before);
});
test('work history merges items, sorts latest first and excludes payments while retaining order and pickup events',()=>{
 const order=fixture();order.timeline=[{message:'Pembayaran QRIS dicatat',createdAt:'2026-11-08T01:00:00Z'},{message:'Pembayaran PO 01 dicatat'},{message:'Kelebihan pembayaran disimpan sebagai deposit pelanggan'},{message:'Tagihan lunas melalui diskon penuh; tidak ada uang masuk'},{message:'Pembayaran melalui deposit dicatat'},{itemId:'b',message:'Status berubah',createdAt:'2026-11-08T03:00:00Z'},{itemId:'a',message:'PIC diperbarui',createdAt:'2026-11-08T02:00:00Z'},{message:'Penerimaan pesanan belum lunas dikonfirmasi; sisa pembayaran tetap tercatat',createdAt:'2026-11-08T04:00:00Z'},{message:'Pesanan dibuat di POS',createdAt:'2026-11-08T00:00:00Z'},{category:'PAYMENT',itemId:'a',message:'Financial metadata'}];
 const before=structuredClone(order),events=invoiceWorkHistory(order);assert.deepEqual(events.map(e=>e.message),['Penerimaan pesanan belum lunas dikonfirmasi; sisa pembayaran tetap tercatat','Status berubah','PIC diperbarui','Pesanan dibuat di POS']);
 const html=invoiceDetailHtml(order,c);assert.ok(html.includes('Kartu Nama AP260 (item 2): Status berubah'));assert.ok(html.includes('X-Banner (item 1): PIC diperbarui'));assert.deepEqual(order,before);
});
test('completed unpaid pickup is invoice-wide and respects access without changing receivables',()=>{
 const order=fixture();order.status='SELESAI';order.items.forEach(i=>i.status='SELESAI');const before=structuredClone(order);
 for(const role of ['OWNER','MANAGER','CASHIER'])assert.equal(invoicePickupAllowed(order,{role,permissions:ROLE_PRESETS[role].permissions}),true);
 assert.equal(invoicePickupAllowed(order,{role:'CASHIER',permissions:['orders.view']}),false);
 assert.equal(invoicePickupAllowed({...order,items:[{status:'SELESAI'},{status:'FINISHING'}]},c.user),false);
 assert.ok(invoiceDetailHtml(order,c).includes('Pesanan Diterima'));assert.deepEqual(order,before);
 assert.equal(invoicePickupAllowed({...order,status:'DIAMBIL'},c.user),false);assert.equal(invoicePickupAllowed({...order,cancelledAt:'now'},c.user),false);
});
test('conditional summary handles invoice discount, full discount, picked-up and cancelled states',()=>{
 const order=fixture();order.grossTotal=220000;order.invoiceDiscount={amount:20000};let html=invoiceDetailHtml(order,c);assert.ok(html.includes('Diskon'));assert.ok(html.includes('Total Tagihan'));assert.ok(html.includes('220.000'));assert.ok(html.includes('25.000'));
 order.paidAmount=200000;html=invoiceDetailHtml(order,c);assert.ok(html.includes('LUNAS'));assert.ok(!html.includes('Sisa Pembayaran'));
 order.total=0;order.paidAmount=0;order.invoiceDiscount.amount=220000;order.payments=[];html=invoiceDetailHtml(order,c);assert.ok(html.includes('Lunas melalui diskon penuh'));assert.ok(!html.includes('Print Bukti #'));
 order.status='DIAMBIL';order.pickedUpAt='2026-11-08T09:00:00Z';html=invoiceDetailHtml(order,c);assert.ok(html.includes('Pesanan Diambil'));assert.ok(html.includes('Print Tanda Terima'));assert.ok(!html.includes('id="advance-order"'));
 order.status='BATAL';order.cancelReason='Customer batal';html=invoiceDetailHtml(order,c);assert.ok(html.includes('DIBATALKAN'));assert.ok(!html.includes('Sisa Pembayaran'));assert.ok(!html.includes('id="advance-order"'));assert.ok(!html.includes('id="print-spk"'));
});
test('payment history preserves receipt numbers and mixed deposit allocation, PO and refund evidence',()=>{
 const order=fixture();order.payments=[{id:'deposit',transactionId:'t1',type:'DEPOSIT',method:'DEPOSIT',amount:75000,createdAt:'2026-11-08T01:00:00Z'},{id:'cash',transactionId:'t1',type:'PAYMENT',method:'TUNAI',amount:100000,createdAt:'2026-11-08T01:00:00Z'},{id:'po',type:'PO',poNumber:'PO-01',amount:0,poAttachment:{dataUrl:'image'}},{id:'p2',type:'PAYMENT',method:'QRIS',amount:25000,createdAt:'2026-11-08T02:00:00Z'}];
 const html=invoicePaymentHistoryHtml(order,c,[{id:'refund',kind:'REFUND',amount:-25000,method:'TRANSFER',createdAt:'2026-11-08T03:00:00Z'}]);assert.equal((html.match(/Print Bukti #1/g)||[]).length,1);assert.equal((html.match(/Print Bukti #2/g)||[]).length,1);assert.ok(!html.includes('Print Bukti #3'));assert.ok(html.includes('Termasuk deposit'));assert.ok(html.includes('PO / Tempo'));assert.ok(html.includes('Lihat PO'));assert.ok(html.includes('Print Bukti Refund'));
});
test('permission-limited detail and user supplied text remain safe',()=>{
 const order=fixture();order.customerName='<script>steal()</script>';order.items[0].sizeVariantLabel='<img onerror=steal()>';let html=invoiceDetailHtml(order,{...c,showMoney:false,showPayments:false,user:{role:'DESIGN',permissions:['orders.view']}});
 for(const hidden of ['Status Pembayaran','Sisa Pembayaran','175.000','Print Bukti','Riwayat Pembayaran','Nota Ulang'])assert.ok(!html.includes(hidden),hidden);
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror'));
});
