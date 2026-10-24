import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { exchangeDefectiveGoods, goodsReturnOptions, publicGoodsReturn } from '../lib/goods-returns.js';
import { aggregateReport } from '../lib/reports.js';
import { migrateGoodsReturnAccess, ROLE_PRESETS } from '../lib/access.js';
const user={id:'owner',name:'Owner',role:'OWNER'},at='2026-10-24T04:00:00Z';
function fixture(){const store=new Store();Object.assign(store.memory,{products:[{id:'pen',sku:'PEN-BLUE',name:'Bolpen Faster C600 Biru',category:'ATK',retailAtK:true,baseCost:2000,saleUnit:'pcs'}],materials:[],inventory:[{sku:'PEN-BLUE',productId:'pen',productName:'Bolpen Faster C600 Biru',unit:'pcs',stockMethod:'UNIT',quantity:97}],stockMovements:[],orders:[{id:'o',code:'INV-102326-001',customerName:'Customer',createdAt:'2026-10-23T04:00:00Z',createdById:'owner',total:15000,paidAmount:15000,payments:[{amount:15000,method:'TUNAI',createdAt:'2026-10-23T04:00:00Z'}],paymentConfirmed:true,status:'DIAMBIL',stockCommitted:true,items:[{itemId:'line',productId:'pen',productName:'Bolpen Faster C600 Biru',priceBasis:'unit',quantity:3,subtotal:15000,stockTiming:'SALE',stockCommitted:true,status:'DIAMBIL',retailStockSku:'PEN-BLUE',unitName:'pcs'}]}]});return store;}
const body=(requestId,quantity=1,parentLineId=null)=>({requestId,reason:'DEFECT',note:'Tinta macet',defectReceived:true,replacementDelivered:true,lines:[{itemId:'line',quantity,parentLineId}]});
const exchange=(store,payload,time=at)=>store.mutate(s=>exchangeDefectiveGoods(s,s.orders[0],payload,user,time));
test('defect exchange uses one replacement, preserves the sale and supports linked replacement defects',async()=>{
 const store=fixture(),before=structuredClone((await store.read()).orders[0]);const first=await exchange(store,body('first',2));let s=await store.read();assert.equal(s.inventory.find(i=>i.sku==='PEN-BLUE').quantity,95);assert.equal(first.record.cost,4000);assert.equal(first.record.lines[0].sku,'PEN-BLUE');assert.equal(s.goodsReturns.length,1);assert.equal(s.stockMovements.length,1);assert.equal(s.stockMovements[0].type,'DEFECT_EXCHANGE');assert.equal(s.stockMovements[0].change,-2);
 const copy=structuredClone(s.orders[0]);delete copy.updatedAt;assert.deepEqual(copy,before);
 const options=goodsReturnOptions(s,s.orders[0]);assert.equal(options.find(o=>!o.parentLineId).remaining,1);assert.equal(options.find(o=>o.parentLineId).remaining,2);
 await exchange(store,body('chain',1,first.record.lines[0].id));await exchange(store,body('remaining',1));s=await store.read();assert.equal(s.inventory.find(i=>i.sku==='PEN-BLUE').quantity,93);assert.equal(s.orders[0].total,15000);assert.equal(s.orders[0].paidAmount,15000);assert.equal(s.orders[0].items[0].quantity,3);
 assert.equal(publicGoodsReturn(first.record).cost,undefined);assert.equal(publicGoodsReturn(first.record).lines[0].cost,undefined);assert.equal(publicGoodsReturn(first.record,true).cost,4000);
 const onlyToday=aggregateReport(s,user,{from:'2026-10-24',to:'2026-10-24'});assert.equal(onlyToday.summary.sales,0);assert.equal(onlyToday.summary.paid,0);assert.equal(onlyToday.summary.items,0);assert.equal(onlyToday.summary.returnQuantity,4);assert.equal(onlyToday.summary.returnCost,8000);assert.equal(onlyToday.summary.profit,-8000);assert.equal(onlyToday.goodsReturns.rows.length,3);
 const all=aggregateReport(s,user,{from:'2026-10-23',to:'2026-10-24'});assert.equal(all.summary.sales,15000);assert.equal(all.summary.paid,15000);assert.equal(all.summary.items,3);assert.equal(all.summary.profit,1000);assert.equal(all.products[0].quantity,3);
 const hidden=aggregateReport(s,{role:'CASHIER'},{from:'2026-10-24',to:'2026-10-24'});assert.equal(hidden.summary.returnCost,undefined);assert.equal(hidden.goodsReturns.cost,undefined);assert(hidden.goodsReturns.rows.every(r=>r.cost===undefined));
});
test('idempotency and concurrent exchanges cannot over-return or double deduct stock',async()=>{
 const store=fixture();const responses=await Promise.all(Array.from({length:8},()=>exchange(store,body('retry',2))));assert.equal(new Set(responses.map(r=>r.record.id)).size,1);assert.equal((await store.read()).stockMovements.length,1);
 await assert.rejects(exchange(store,body('retry',1)),/data berbeda/);
 const result=await Promise.allSettled([exchange(store,body('a',1)),exchange(store,body('b',1))]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await store.read()).inventory.find(i=>i.sku==='PEN-BLUE').quantity,94);assert.equal((await store.read()).goodsReturns.length,2);
});
test('invalid quantities, wrong invoice line, unavailable stock and draft/production items roll back',async()=>{
 for(const change of [{quantity:0},{quantity:-1},{quantity:1.5},{quantity:4},{itemId:'spoof'},{parentLineId:'other-invoice'}]){const store=fixture(),payload=body('bad');Object.assign(payload.lines[0],change);await assert.rejects(exchange(store,payload));assert.equal((await store.read()).goodsReturns.length,0);assert.equal((await store.read()).inventory.find(i=>i.sku==='PEN-BLUE').quantity,97);}
 for(const patch of [{status:'SELESAI'},{stockTiming:'PRODUCTION'},{stockCommitted:false}]){const store=fixture();Object.assign(store.memory.orders[0].items[0],patch);await assert.rejects(exchange(store,body('bad')));}
 const store=fixture();await store.mutate(s=>{s.inventory.find(i=>i.sku==='PEN-BLUE').quantity=0;});assert.equal(goodsReturnOptions(await store.read(),(await store.read()).orders[0])[0].maxQuantity,0);await assert.rejects(exchange(store,body('empty')),/tidak mencukupi/);assert.equal((await store.read()).goodsReturns.length,0);
 await assert.rejects(exchange(fixture(),{...body('unchecked'),defectReceived:false}),/Konfirmasi/);
 for(const quantity of [NaN,Infinity]){const store=fixture(),s=store.memory;s.inventory[0].quantity=quantity;assert.throws(()=>exchangeDefectiveGoods(s,s.orders[0],body('invalid-balance'),user,at),/belum siap/);assert.equal(s.goodsReturns.length,0);}
});
test('return access upgrades unchanged operational presets and preserves explicit restrictions',()=>{
 const users=['OWNER','ADMIN','CASHIER','MANAGER'].map(role=>({role,permissions:ROLE_PRESETS[role].permissions.filter(p=>p!=='orders.return')}));users.push({role:'CASHIER',permissions:['orders.view']});const s={users};migrateGoodsReturnAccess(s);for(const u of users.slice(0,4))assert(u.permissions.includes('orders.return'));assert.deepEqual(users[4].permissions,['orders.view']);
});
