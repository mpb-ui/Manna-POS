import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateReport } from '../lib/reports.js';
const owner = {role:'OWNER'};
const period = {from:'2026-10-01',to:'2026-10-02'};
const payment = (amount,method,date) => ({amount,method,createdAt:date});
const old = {id:'old',code:'OLD',customerName:'Maria',createdAt:'2026-09-20T03:00:00Z',total:100000,paidAmount:100000,paymentConfirmed:true,status:'DIAMBIL',items:[{productId:'p',productName:'Print',quantity:1,subtotal:100000}],payments:[payment(20000,'TUNAI','2026-09-20T03:00:00Z'),payment(30000,'QRIS','2026-10-01T03:00:00Z'),payment(50000,'TRANSFER','2026-10-03T03:00:00Z')]};
const data = () => ({orders:[structuredClone(old)],products:[{id:'p',category:'Print'}],materials:[],machines:[],inventory:[]});
test('uang masuk berdasarkan tanggal pembayaran dan piutang mencakup pesanan lama sampai tanggal akhir',()=>{
 const r=aggregateReport(data(),owner,period);assert.equal(r.summary.sales,0);assert.equal(r.summary.paid,30000);assert.equal(r.summary.outstanding,50000);assert.equal(r.receivables.length,1);assert.equal(r.receipts[0].method,'QRIS');
});
test('sumber hanya menjumlahkan pembayaran yang dipilih pada pesanan bermetode campuran',()=>{
 const state=data();state.orders[0].createdAt='2026-10-01T01:00:00Z';
 const qris=aggregateReport(state,owner,{...period,paymentMethod:'qris'});assert.equal(qris.summary.sales,100000);assert.equal(qris.summary.paid,30000);assert.equal(qris.summary.outstanding,50000);
 assert.equal(aggregateReport(state,owner,{...period,paymentMethod:'TUNAI'}).summary.paid,0);
 assert.equal(aggregateReport(state,owner,{...period,paymentMethod:'TRANSFER'}).summary.paid,0);
});
test('batas periode menggunakan WITA dan nilai pembayaran kategori dialokasikan proporsional',()=>{
 const state=data();state.orders[0].items.push({productId:'q',subtotal:100000,quantity:1});state.orders[0].total=200000;state.products.push({id:'q',category:'ATK'});
 state.orders[0].payments=[payment(20000,'Tunai','2026-09-30T16:00:00Z'),payment(40000,'QRIS','2026-10-02T15:59:59Z'),payment(70000,'QRIS','2026-10-02T16:00:00Z')];
 const r=aggregateReport(state,owner,{...period,category:'Print'});assert.equal(r.summary.paid,30000);assert.equal(r.summary.outstanding,70000);
});
test('scope sendiri dan izin nilai uang tetap membatasi semua data laporan baru',()=>{
 const state=data(); const own={role:'OWNER',id:'u',name:'Owner',reportScope:'own'};
 assert.equal(aggregateReport(state,own,period).receipts.length,0);
 state.orders[0].createdById='u';assert.equal(aggregateReport(state,own,period).summary.paid,30000);
 const hidden=aggregateReport(state,{role:'WAREHOUSE'},period);assert.equal(hidden.summary.paid,undefined);assert.deepEqual(hidden.receipts,[]);assert.deepEqual(hidden.receivables,[]);assert.ok(!hidden.attention.some(a=>a.tab==='receivables'));
});
test('PO bukan kas masuk, catatan lama tanpa tanggal tidak menciptakan penerimaan fiktif',()=>{
 const state=data();state.orders[0].payments=[];state.orders[0].paidAmount=20000;
 const r=aggregateReport(state,owner,period);assert.equal(r.summary.paid,0);assert.equal(r.summary.outstanding,80000);
 state.orders[0].payments=[{type:'PO',amount:0,createdAt:'2026-10-01T03:00:00Z'}];assert.equal(aggregateReport(state,owner,period).summary.paid,0);
});
test('filter tanggal dan metode tidak valid ditolak',()=>{
 assert.throws(()=>aggregateReport(data(),owner,{from:'invalid'}),/tanggal/);assert.throws(()=>aggregateReport(data(),owner,{from:'2026-10-02',to:'2026-10-01'}),/tanggal/);assert.throws(()=>aggregateReport(data(),owner,{...period,paymentMethod:'other'}),/Sumber/);
});

test('nota PO lengkap tanpa HPP, tetap terikat scope dan izin uang', () => {
 const state=data(); const order=state.orders[0]; order.createdAt='2026-10-01T03:00:00Z';
 order.payments=[{type:'PO',amount:0,poNumber:'PO-TEST',createdAt:order.createdAt,poAttachment:{type:'image/png',dataUrl:'data:image/png;base64,abc'}}];
 order.items[0].materials=[{cost:999}];order.items[0].baseCost=999;order.items[0].fileService={id:'DESIGN_A',name:'Biaya Design A',price:25000,quantity:2,note:'Dua logo'};
 const result=aggregateReport(state,owner,period);assert.equal(result.purchaseOrders.length,1);
 const row=result.purchaseOrders[0];assert.equal(row.nota.code,order.code);assert.equal(row.nota.total,100000);
 assert.equal(row.nota.items[0].fileService.note,'Dua logo');assert.ok(!('materials' in row.nota.items[0]));assert.ok(!('baseCost' in row.nota.items[0]));
 assert.deepEqual(aggregateReport(state,{role:'WAREHOUSE'},period).purchaseOrders,[]);
 assert.deepEqual(aggregateReport(state,{role:'OWNER',id:'other',name:'Other User',reportScope:'own'},period).purchaseOrders,[]);
});
