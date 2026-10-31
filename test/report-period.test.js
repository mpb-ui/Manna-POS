import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateReport} from '../lib/reports.js';
import {orderAtPeriodEnd} from '../lib/report-period.js';
import {workflowSnapshot} from '../lib/order-assistance.js';
const owner={role:'OWNER',id:'owner',name:'Owner'},oct={from:'2026-10-01',to:'2026-10-31'},sep={from:'2026-09-01',to:'2026-09-30'};
const payment=(id,amount,at,method='TUNAI',extra={})=>({id,amount,createdAt:at,method,type:'PAYMENT',...extra});
const fixture=()=>({orders:[{id:'o',code:'INV-093026-001',customerName:'Baccala',createdById:'owner',createdAt:'2026-09-30T03:00:00Z',total:100000,paidAmount:100000,paymentConfirmed:true,status:'SELESAI',items:[{productId:'p',productName:'Print',quantity:1,subtotal:100000,priceBasis:'unit',saleUnit:'lbr'}],payments:[payment('dp',50000,'2026-09-30T03:00:00Z'),payment('settle',50000,'2026-10-02T03:00:00Z','TRANSFER')]}],products:[{id:'p',category:'Print A3+',machineIds:['m'],saleUnit:'lbr'}],machines:[{id:'m',name:'Mesin A3'}],materials:[],inventory:[],cashReceipts:[]});
const cancel=(s,refund=true)=>{const o=s.orders[0];o.status='BATAL';o.paidAmount=0;o.cancelledAt='2026-10-04T03:00:00Z';o.payments.push(payment('rev',-100000,o.cancelledAt,'TRANSFER',{type:'REVERSAL'}));if(refund)s.cashReceipts.push({id:'refund',orderId:'o',orderCode:o.code,customerName:o.customerName,method:'TRANSFER',amount:-100000,kind:'REFUND',createdAt:o.cancelledAt});};
test('historical status, receivable and method exclude a settlement after period end',()=>{
 const s=fixture(),before=JSON.stringify(s),r=aggregateReport(s,owner,sep);
 assert.equal(r.rows[0].paymentStatus,'BELUM_LUNAS');assert.equal(r.rows[0].outstanding,50000);assert.equal(r.summary.sales,100000);assert.equal(r.summary.paid,50000);assert.deepEqual(r.rows[0].methods,['TUNAI']);
 assert.equal(aggregateReport(s,owner,{...sep,paymentStatus:'BELUM_LUNAS'}).rows.length,1);assert.equal(aggregateReport(s,owner,{...sep,paymentStatus:'LUNAS'}).rows.length,0);assert.equal(aggregateReport(s,owner,{...sep,paymentMethod:'TRANSFER'}).rows.length,0);
 const after=aggregateReport(s,owner,oct);assert.equal(after.summary.sales,0);assert.equal(after.summary.paid,50000);assert.equal(after.summary.outstanding,0);assert.equal(after.receipts.length,1);assert.equal(JSON.stringify(s),before);
});
test('mixed methods select the entire invoice and only the matching cash events',()=>{
 const s=fixture();s.orders[0].createdAt='2026-10-01T03:00:00Z';s.orders[0].payments[0].createdAt=s.orders[0].createdAt;
 const r=aggregateReport(s,owner,{...oct,paymentMethod:'TUNAI'});assert.equal(r.summary.sales,100000);assert.equal(r.summary.paid,50000);assert.equal(r.rows.length,1);assert.deepEqual(r.rows[0].methods,['TUNAI','TRANSFER']);
});
test('cross-month refund retains September and records one negative October sale and refund',()=>{
 const s=fixture();cancel(s);const r=aggregateReport(s,owner,sep);assert.equal(r.summary.sales,100000);assert.equal(r.summary.paid,50000);assert.equal(r.summary.outstanding,50000);assert.equal(r.rows[0].cancelled,false);
 const after=aggregateReport(s,owner,oct);assert.equal(after.summary.sales,-100000);assert.equal(after.summary.paid,-50000);assert.equal(after.summary.outstanding,0);assert.equal(after.rows[0].kind,'CANCELLATION');assert.equal(after.rows[0].sales,-100000);assert.equal(after.categories[0].sales,-100000);assert.equal(after.products[0].quantity,-1);assert.equal(after.machines[0].sales,-100000);assert.equal(after.receipts.length,2);
 const all=aggregateReport(s,owner,{from:sep.from,to:oct.to});assert.equal(all.summary.sales,0);assert.equal(all.summary.paid,0);assert.equal(all.rows.length,2);assert.equal(all.products[0].sales,0);
});
test('deposit cancellation corrects sales while received money remains cash; receivables are cleared',()=>{
 const s=fixture();cancel(s,false);const r=aggregateReport(s,owner,{from:sep.from,to:oct.to});assert.equal(r.summary.sales,0);assert.equal(r.summary.paid,100000);assert.equal(r.summary.outstanding,0);assert.equal(r.receipts.filter(p=>p.paid<0).length,0);
});
test('unpaid cancellation and exact WITA boundary stay in their own dates',()=>{
 const s=fixture(),o=s.orders[0];o.payments=[];o.paidAmount=0;o.paymentConfirmed=false;o.cancelledAt='2026-09-30T16:00:00Z';o.status='BATAL';
 const r=aggregateReport(s,owner,sep);assert.equal(r.summary.sales,100000);assert.equal(r.summary.outstanding,100000);assert.equal(r.rows[0].paymentStatus,'BELUM_LUNAS');const after=aggregateReport(s,owner,oct);assert.equal(after.summary.sales,-100000);assert.equal(after.summary.paid,0);assert.equal(after.summary.outstanding,0);
});
test('PO is unpaid until real receipts; deposit usage never creates a second receipt',()=>{
 const s=fixture(),o=s.orders[0];o.createdAt='2026-10-01T03:00:00Z';o.payments=[{type:'PO',amount:0,createdAt:o.createdAt,poNumber:'PO-1'}];o.paidAmount=0;
 let r=aggregateReport(s,owner,oct);assert.equal(r.summary.paid,0);assert.equal(r.rows[0].paymentStatus,'BELUM_LUNAS');assert.equal(r.rows[0].method,'-');assert.equal(r.purchaseOrders.length,1);
 o.payments.push(payment('wallet',100000,'2026-10-02T03:00:00Z','DEPOSIT',{type:'DEPOSIT'}));o.paidAmount=100000;
 r=aggregateReport(s,owner,{...oct,paymentMethod:'DEPOSIT'});assert.equal(r.summary.sales,100000);assert.equal(r.summary.paid,0);assert.equal(r.rows[0].paymentStatus,'LUNAS');
 s.cashReceipts.push({id:'topup',customerName:'Baccala',createdAt:o.createdAt,method:'TUNAI',amount:100000,kind:'TOPUP'});
 assert.equal(aggregateReport(s,owner,oct).summary.paid,100000);assert.equal(aggregateReport(s,owner,{...oct,paymentStatus:'LUNAS'}).receipts.length,0);
});
test('new line classification snapshots survive catalog edits, rankings use sale units and never duplicate machine revenue',()=>{
 const s=fixture(),o=s.orders[0];o.items=workflowSnapshot(o.items,s.products,s.machines);s.products[0].category='Outdoor';s.products[0].machineIds=[];s.machines[0].name='Nama Baru';
 const r=aggregateReport(s,owner,sep);assert.equal(r.categories[0].label,'Print A3+');assert.equal(r.machines[0].label,'Mesin A3');assert.deepEqual(r.products[0].quantities,[{unit:'lbr',quantity:1}]);
 delete o.items[0].reportMachines;s.products[0].machineIds=['m','n'];s.machines.push({id:'n',name:'Mesin 2'});const split=aggregateReport(s,owner,sep);assert.equal(split.machines.reduce((n,m)=>n+m.sales,0),100000);
 o.items[0].priceBasis='sqm';o.items[0].width=1.5;o.items[0].billedLength=2;o.items[0].quantity=2;assert.deepEqual(aggregateReport(s,owner,sep).products[0].quantities,[{unit:'m²',quantity:6}]);
});
test('free invoice confirms only on its confirmation date and invalid calendars are rejected',()=>{
 const o={...fixture().orders[0],total:0,paidAmount:0,payments:[],paymentConfirmed:true,paymentConfirmedAt:'2026-10-01T03:00:00Z'};
 assert.equal(orderAtPeriodEnd(o,new Date('2026-09-30T23:59:59+08:00')).paymentStatus,'BELUM_LUNAS');assert.equal(orderAtPeriodEnd(o,new Date('2026-10-01T23:59:59+08:00')).paymentStatus,'LUNAS');
 assert.throws(()=>aggregateReport(fixture(),owner,{from:'2026-02-31',to:oct.to}),/tanggal/);assert.throws(()=>aggregateReport(fixture(),owner,{...oct,paymentStatus:'other'}),/Status/);
});
test('report scope and money/cost permissions apply to corrections and receipts as well as sales',()=>{
 const s=fixture();cancel(s);const own=aggregateReport(s,{...owner,id:'other',name:'Other',reportScope:'own'},oct);assert.equal(own.rows.length,0);assert.equal(own.receipts.length,0);
 const r=aggregateReport(s,{role:'WAREHOUSE'},oct);assert.equal(r.summary.sales,undefined);assert.equal(r.summary.cost,undefined);assert.deepEqual(r.receipts,[]);assert(r.rows.every(r=>r.sales===undefined && r.cost===undefined && r.methods===undefined));assert.equal(r.capabilities.delete,false);
 assert.throws(()=>aggregateReport(s,{role:'WAREHOUSE'},{...oct,paymentStatus:'LUNAS'}),/Akses/);
});

test('discount applied in a later period is a dated correction and does not rewrite earlier receivables',()=>{
 const s=fixture(),o=s.orders[0];o.grossTotal=100000;o.invoiceDiscount={amount:10000,appliedAt:'2026-10-02T03:00:00Z'};o.total=90000;o.payments=[payment('settle',90000,'2026-10-02T03:00:00Z','TRANSFER')];o.paidAmount=90000;
 const before=aggregateReport(s,owner,sep);assert.equal(before.summary.sales,100000);assert.equal(before.summary.outstanding,100000);assert.equal(before.rows[0].paymentStatus,'BELUM_LUNAS');
 const after=aggregateReport(s,owner,oct);assert.equal(after.summary.sales,-10000);assert.equal(after.summary.paid,90000);assert.equal(after.summary.outstanding,0);assert.equal(after.rows[0].kind,'DISCOUNT');assert.equal(after.products[0].quantity,0);
 cancel(s);s.cashReceipts[0].amount=-90000;const combined=aggregateReport(s,owner,{from:sep.from,to:oct.to});assert.equal(combined.summary.sales,0);assert.equal(combined.summary.paid,0);assert.equal(combined.products[0].sales,0);assert.equal(combined.machines.reduce((n,r)=>n+r.sales,0),0);
});
