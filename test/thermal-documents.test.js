import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentReceipts } from '../public/order-history.js';
import { invoiceReceiptHtml, receiptView, thermalItem, thermalDate, workOrderHtml } from '../public/thermal-documents.js';
import { paymentReceiptHtml } from '../public/payment-documents.js';
import { prepareThermalPrint } from '../public/thermal-print.js';
import { initializeCustomers, appendDeposit, allocateCustomerPayment } from '../lib/customer-deposits.js';
const user={id:'cashier',name:'Kasir Asal',role:'OWNER'};
const order=()=>({id:'o',code:'INV-101926-010',customerId:'c',customerName:'Smoke House',phone:'1172',createdByName:'Pembuat Pesanan',createdAt:'2026-10-19T01:49:00Z',deadline:'2026-10-20T01:00:00Z',confirmed:true,paymentConfirmed:true,status:'DESAIN',total:100000,grossTotal:125000,invoiceDiscount:{amount:25000},paidAmount:0,payments:[],items:[{productName:'Sablon Kaos',quantity:1,unitName:'pcs',priceBasis:'unit',subtotal:125000,productionNote:'Logo depan'}]});
function fixture() {const o=order(),s={customers:[{id:'c',name:o.customerName,phone:o.phone}],orders:[o]};initializeCustomers(s);return {o,s};}
const pay=(s,o,data)=>allocateCustomerPayment(s,o,{requestId:crypto.randomUUID(),method:'TUNAI',...data},user,{canUse:true});

test('one confirmation with deposit + cash has one receipt; totals, change and sequence reconcile without mutating ledger',()=>{
 const {o,s}=fixture();pay(s,o,{amount:10000});appendDeposit(s,'c',30000,'OPENING',user);pay(s,o,{depositAmount:30000,amount:70000,excessAction:'CHANGE'});
 assert.equal(o.payments.length,3);const before=structuredClone(s),[dp,last]=paymentReceipts(o);
 assert.equal(dp.sequence,1);assert.equal(last.sequence,2);assert.equal(last.memberIds.length,2);
 assert.deepEqual([last.amount,last.paidBefore,last.paidAfter,last.balanceAfter,last.depositUsed,last.amountReceived,last.changeAmount,last.depositAmount],[90000,10000,100000,0,30000,70000,10000,0]);
 assert.equal(last.method,'DEPOSIT + TUNAI');assert.equal(last.invoiceDiscountAmount,25000);assert.equal(last.orderGrossTotal,125000);
 assert.equal(last.tenderKnown,true);assert.deepEqual(s,before);
 const html=paymentReceiptHtml(o,last);assert.match(html,/Termasuk deposit/);assert.match(html,/Kembali/);assert.match(html,/Pembayaran ke: 2/);assert.match(html,/Kasir Asal/);
});

test('legacy cash receipts restore real tender/change; absence never fabricates zero change',()=>{
 const {o,s}=fixture();pay(s,o,{amount:120000,excessAction:'CHANGE'});
 const p=o.payments[0];delete p.amountReceived;delete p.changeAmount;delete p.depositAmount;
 const plain=paymentReceipts(o)[0],enriched=paymentReceipts(o,s.cashReceipts)[0];
 assert.equal(plain.tenderKnown,false);assert.doesNotMatch(paymentReceiptHtml(o,plain),/Kembali/);
 assert.equal(enriched.amountReceived,120000);assert.equal(enriched.changeAmount,20000);
 assert.match(paymentReceiptHtml(o,enriched),/Kembali/);
});

test('excess saved to deposit is distinct from cash change and does not increase invoice payment',()=>{
 const {o,s}=fixture();pay(s,o,{method:'TRANSFER',amount:127000,excessAction:'DEPOSIT',confirmDeposit:true});
 const p=paymentReceipts(o)[0];assert.equal(p.amount,100000);assert.equal(p.depositAmount,27000);assert.equal(p.changeAmount,0);
 assert.match(paymentReceiptHtml(o,p),/Disimpan ke deposit/);assert.equal(o.paidAmount,100000);
});

test('historical DP keeps its original balance, discount and receiving cashier; receipt date is order date',()=>{
 const {o,s}=fixture();pay(s,o,{amount:20000});const dp=paymentReceipts(o)[0];pay(s,o,{amount:80000,method:'QRIS'});
 o.payments[0].createdAt='2026-10-21T02:00:00Z';o.total=200000;o.invoiceDiscount.amount=15000;
 const v=receiptView(o,dp);assert.deepEqual([v.total,v.gross,v.discount,v.paid,v.balance,v.status],[100000,125000,25000,20000,80000,'Belum Lunas']);
 const html=paymentReceiptHtml(o,dp);assert.match(html,/19 Okt 2026/);assert.doesNotMatch(html,/21 Okt/);assert.match(html,/Sisa saat transaksi/);assert.match(html,/Kasir Asal/);
 assert.equal(receiptView(o).total,200000);
 delete dp.actor;assert.equal(receiptView(o,dp).cashier,'Tidak tercatat');
 o.status='BATAL';const cancelled=paymentReceiptHtml(o,dp);assert.match(cancelled,/PESANAN DIBATALKAN/);assert.match(cancelled,/Sisa saat transaksi/);assert.match(cancelled,/80.000/);
});

test('unpaid, PO, zero-discount invoice, draft and cancelled order cannot invent payment receipts',()=>{
 const o=order();o.paymentConfirmed=false;o.confirmed=false;o.status='MENUNGGU_PEMBAYARAN';
 const draft=invoiceReceiptHtml(o);assert.match(draft,/DRAFT/);assert.match(draft,/Belum Lunas/);assert.doesNotMatch(draft,/Pembayaran ke/);
 o.confirmed=true;o.payments=[{id:'po',type:'PO',method:'PO / TEMPO',amount:0,poNumber:'PO-SHOULD-NOT-PRINT'}];assert.equal(paymentReceipts(o).length,0);assert.match(invoiceReceiptHtml(o),/Belum Lunas/);assert.doesNotMatch(invoiceReceiptHtml(o),/PO-SHOULD-NOT-PRINT/);
 o.total=0;o.invoiceDiscount.amount=125000;o.paymentConfirmed=true;
 assert.match(invoiceReceiptHtml(o),/Lunas melalui diskon penuh/);assert.doesNotMatch(invoiceReceiptHtml(o),/Pembayaran ke/);
 o.status='BATAL';const cancelled=invoiceReceiptHtml(o);assert.match(cancelled,/PESANAN DIBATALKAN/);assert.doesNotMatch(cancelled,/thermal-status"><strong>Lunas/);
});

test('work order prints all items and physical dimensions, variants, finishes, notes and distinct deadlines without any money',()=>{
 const o=order();o.paidAmount=44444;o.payments=[{id:'p',amount:44444,method:'QRIS',type:'PAYMENT',poNumber:'PO-SECRET'}];
 o.items.push({productName:'Outdoor',quantity:2,unitName:'Lembar',priceBasis:'sqm',imageWidthCm:80,imageLengthCm:85,width:.9,actualLength:.85,billedLength:1.5,allowanceCm:5,finalImageWidthCm:90,finalImageLengthCm:95,materialVariantLabel:'Cream',subVariantLabel:'Cetak 1 Sisi',unitPrice:77777,subtotal:88888,finishing:[{name:'Laminasi Doff',units:2,subtotal:99999}],fileService:{id:'DESIGN_A',name:'Biaya Design A',price:25000},productionNote:'Jangan lipat',deadline:'2026-10-21T02:00:00Z'});
 const before=structuredClone(o),html=workOrderHtml(o);
 for(const value of ['WORK ORDER','Sablon Kaos','Outdoor','1172','80 × 85 cm','90 × 95 cm','Cream','Cetak 1 Sisi','Laminasi Doff','Jangan lipat','21 Okt'])assert.ok(html.includes(value),value);
 assert.doesNotMatch(html,/Rp|44444|77777|88888|99999|PO-SECRET|Grand Total|Bayar|Tagihan|1,5 m|Biaya/);assert.deepEqual(o,before);
 const old={...o.items[1],imageWidthCm:undefined,imageLengthCm:undefined,actualLength:undefined};assert.match(thermalItem(old,{work:true}),/Ukuran gambar belum tercatat/);assert.doesNotMatch(thermalItem(old,{work:true}),/150 cm/);
});

test('DTF combinations keep individual quantities and one invoice line subtotal',()=>{
 const o=order();o.items[0].shirtVariants=[{color:'Hitam',size:'M',quantity:2},{color:'Putih',size:'XXL',quantity:3}];o.items[0].dtfPackageLabel='Logo';o.items[0].quantity=5;
 const html=invoiceReceiptHtml(o);assert.match(html,/Hitam · M × 2 pcs/);assert.match(html,/Putih · XXL × 3 pcs/);assert.equal((html.match(/thermal-item-heading/g)||[]).length,1);
});

test('stored text is escaped in both templates and dates use WITA across midnight',()=>{
 const o=order();o.customerName='<script>alert(1)</script>';o.items[0].productName='<img onerror=evil>';o.items[0].productionNote='<svg onload=evil>';
 for(const html of [invoiceReceiptHtml(o),workOrderHtml(o)]){assert.doesNotMatch(html,/<script>|<img onerror|<svg/);assert.match(html,/&lt;script&gt;/);}
 assert.match(thermalDate('2026-10-18T17:00:00Z'),/19 Okt 2026/);
});

test('thermal print preparation waits for font faces and decoded logo, rejects failed assets',async()=>{
 const calls=[],fonts={load:async v=>{calls.push(v);return [{}];},ready:Promise.resolve(),check:()=>true};let decoded=false;
 await prepareThermalPrint({querySelectorAll:()=>[{decode:async()=>{decoded=true;},naturalWidth:1398}]},fonts);
 assert.equal(calls.length,4);assert.ok(decoded);assert.ok(calls.some(v=>v.startsWith('italic')));
 await assert.rejects(prepareThermalPrint({querySelectorAll:()=>[]},{...fonts,check:()=>false}),/Font struk/);
 await assert.rejects(prepareThermalPrint({querySelectorAll:()=>[]},{...fonts,load:async()=>[]}),/Font struk/);
 await assert.rejects(prepareThermalPrint({querySelectorAll:()=>[{decode:async()=>{throw new Error('logo failed');}}]},fonts),/logo failed/);
});
