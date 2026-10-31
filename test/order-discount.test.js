import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInvoiceDiscount } from '../lib/order-discount.js';
import { discountedItemTotals, invoiceGross, invoiceDiscount, settledOrder } from '../public/order-discount.js';
import { aggregateReport } from '../lib/reports.js';
import { paymentReceiptHtml } from '../public/payment-documents.js';
const user={id:'u',name:'Kasir',role:'OWNER'};
const sample=()=>({id:'o',code:'INV-102826-001',customerName:'Customer',createdAt:'2026-10-28T01:00:00Z',status:'MENUNGGU_PEMBAYARAN',total:10000,paidAmount:0,payments:[],items:[{productId:'a',productName:'A',quantity:1,subtotal:6000},{productId:'b',productName:'B',quantity:1,subtotal:4000}]});
test('invoice nominal discount preserves promotion/wholesale snapshots and is locked at the first DP or PO',()=>{
 const o=sample(),items=structuredClone(o.items);assert.equal(applyInvoiceDiscount(o,2000,user),true);assert.equal(o.total,8000);assert.equal(invoiceGross(o),10000);assert.equal(invoiceDiscount(o),2000);assert.deepEqual(o.items,items);assert.deepEqual(discountedItemTotals(o),[4800,3200]);
 for (const lock of [{paymentConfirmed:true},{paidAmount:1},{payments:[{type:'PO',amount:0}]},{payments:[{amount:1}]}]) { const locked={...o,...lock};assert.throws(()=>applyInvoiceDiscount(locked,1000,user),/terkunci/);assert.equal(applyInvoiceDiscount(locked,2000,user),false); }
 for(const invalid of [-1,10001,1.5,NaN,Infinity,'2000',null,true])assert.throws(()=>applyInvoiceDiscount(sample(),invalid,user));
 assert.equal(applyInvoiceDiscount(sample(),undefined,user),false);
});
test('one-rupiah allocation reconciles exactly; zero lines, free invoice, and large safe integers do not lose rupiah',()=>{
 for (const [values,discount,expected] of [[[1,1,1],1,[0,1,1]],[[0,3,7],1,[0,3,6]],[[6000,4000],10000,[0,0]],[[4000000000000,2000000000000],2000000000001,[2666666666666,1333333333333]]]) {
  const o={total:values.reduce((a,b)=>a+b,0),items:values.map(subtotal=>({subtotal}))};applyInvoiceDiscount(o,discount,user);const net=discountedItemTotals(o);assert.deepEqual(net,expected);assert.equal(net.reduce((a,b)=>a+b,0),o.total);
 }
 const free=sample();applyInvoiceDiscount(free,10000,user);assert(!settledOrder(free));free.paymentConfirmed=true;assert(settledOrder(free));
});
test('net category/product sales, cash allocation, receivables and profit reconcile without discounting HPP',()=>{
 const o=sample();applyInvoiceDiscount(o,2000,user,o.createdAt);o.paymentConfirmed=true;o.paidAmount=4000;o.payments=[{amount:4000,method:'TUNAI',createdAt:o.createdAt}];
 const state={orders:[o],products:[{id:'a',category:'Print',baseCost:1000},{id:'b',category:'ATK',baseCost:500}],materials:[],machines:[],inventory:[]},range={from:'2026-10-28',to:'2026-10-28'};
 const all=aggregateReport(state,user,range),a=aggregateReport(state,user,{...range,category:'Print'}),b=aggregateReport(state,user,{...range,category:'ATK'});
 assert.equal(all.summary.sales,8000);assert.equal(all.summary.paid,4000);assert.equal(all.summary.outstanding,4000);assert.equal(all.summary.cost,1500);assert.equal(all.summary.profit,6500);assert.equal(a.summary.sales,4800);assert.equal(a.summary.paid,2400);assert.equal(a.summary.outstanding,2400);assert.equal(b.summary.sales,3200);assert.equal(b.summary.paid,1600);assert.equal(all.products.reduce((n,p)=>n+p.sales,0),8000);
 state.cashReceipts=[{orderId:o.id,amount:4000,allocatedAmount:4000,method:'TUNAI',createdAt:o.createdAt}];o.payments[0].cashReceiptId='r';assert.equal(aggregateReport(state,user,{...range,category:'Print'}).summary.paid,2400);
});
test('new payment receipt prints immutable gross, discount, and net snapshots',()=>{
 const payment={id:'p',sequence:1,createdAt:'2026-10-28T01:00:00Z',amount:4000,orderGrossTotal:10000,invoiceDiscountAmount:2000,orderTotal:8000,paidBefore:0,paidAfter:4000,balanceAfter:4000};
 const html=paymentReceiptHtml({...sample(),total:123456},payment);assert.match(html,/Diskon pesanan/);assert.match(html,/10\.000/);assert.match(html,/8\.000/);assert.doesNotMatch(html,/123\.456/);
});
