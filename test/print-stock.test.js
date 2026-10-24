import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { commitOrderStock } from '../lib/item-workflow-routes.js';
import { migratePrintStock, confirmRetailStock } from '../lib/physical-stock.js';
const at='2026-10-24T04:00:00Z';
function fixture(){
 const store=new Store();
 store.memory.inventory=[{sku:'paper',productName:'Kertas',unit:'lembar',stockMethod:'UNIT',quantity:1000},{sku:'roll',productName:'Roll',unit:'roll',stockMethod:'ROLL',quantity:10},{sku:'pen',productName:'Bolpen',unit:'pcs',stockMethod:'UNIT',quantity:100}];
 store.memory.orders=[{id:'o',code:'INV',status:'DESAIN',paymentConfirmed:true,stockCommitted:false,total:500,paidAmount:100,payments:[{amount:100}],timeline:[],items:[{itemId:'a',productId:'a',status:'DESAIN',stockTiming:'PRODUCTION',materials:[{sku:'paper',units:50,unit:'lbr'}]},{itemId:'b',productId:'b',status:'DESAIN',stockTiming:'PRODUCTION',materials:[{sku:'paper',units:20,unit:'lembar'},{sku:'roll',units:70,unit:'m²'}]}]}];
 return store;
}
test('production consumes each line once on entering print; finishing, completion and cancellation add no deductions or restock',async()=>{
 const store=fixture();const transition=(id,status)=>store.mutate(state=>{const o=state.orders[0],i=o.items.find(i=>i.itemId===id);i.status=status;commitOrderStock(state,o,()=>at,{itemIds:[id],actor:'Operator'});});
 const before=await store.read();assert.equal(before.inventory.find(i=>i.sku==='paper').quantity,1000);
 await transition('a','CETAK');let s=await store.read();assert.equal(s.inventory.find(i=>i.sku==='paper').quantity,950);assert.equal(s.orders[0].items[1].stockCommitted,false);assert.equal(s.orders[0].stockCommitted,false);assert.equal(s.stockMovements.length,1);assert.equal(s.stockMovements[0].actor,'Operator');
 await Promise.all(Array.from({length:5},()=>transition('a','CETAK')));await transition('a','FINISHING');await transition('a','SELESAI');
 assert.equal((await store.read()).inventory.find(i=>i.sku==='paper').quantity,950);
 await transition('b','CETAK');await transition('b','FINISHING');await transition('b','SELESAI');s=await store.read();assert.equal(s.inventory.find(i=>i.sku==='paper').quantity,930);assert.equal(s.inventory.find(i=>i.sku==='roll').quantity,10);assert.equal(s.stockMovements.length,2);assert.equal(s.orders[0].stockCommitted,true);
 await store.mutate(state=>{state.orders[0].cancelledAt=at;commitOrderStock(state,state.orders[0],()=>at);});s=await store.read();assert.equal(s.inventory.find(i=>i.sku==='paper').quantity,930);assert.equal(s.orders[0].total,500);assert.equal(s.orders[0].paidAmount,100);
});
test('failed print stock validation rolls back both status and stock',async()=>{
 const store=fixture();await store.mutate(s=>{s.inventory.find(i=>i.sku==='paper').quantity=1;});const before=await store.read();
 await assert.rejects(store.mutate(s=>{s.orders[0].items[0].status='CETAK';commitOrderStock(s,s.orders[0],()=>at,{itemIds:['a']});}),/tidak cukup/);
 assert.deepEqual((await store.read()).orders,before.orders);assert.deepEqual((await store.read()).inventory,before.inventory);assert.equal((await store.read()).stockMovements.length,0);
});
test('print migration catches up open jobs, recognizes historical deductions and skips cancelled/closed jobs',()=>{
 const state=fixture().memory,order=state.orders[0];order.items[0].status='CETAK';order.items[1].status='FINISHING';state.stockMovements=[{id:'old',type:'AUTO_USE',orderId:'o',itemId:'b',change:-20,sku:'paper'}];
 state.orders.push({...structuredClone(order),id:'cancelled',cancelledAt:at},{...structuredClone(order),id:'closed',status:'DIAMBIL'});
 const before=structuredClone(order);migratePrintStock(state);assert.equal(state.inventory.find(i=>i.sku==='paper').quantity,950);assert.equal(state.stockMovements.length,2);assert.equal(order.stockCommitted,true);assert.equal(order.status,before.status);assert.deepEqual(order.payments,before.payments);assert.deepEqual(order.timeline,before.timeline);
 migratePrintStock(state);assert.equal(state.inventory.find(i=>i.sku==='paper').quantity,950);assert.equal(state.stockMovements.length,2);
});
test('retail still consumes stock at sale confirmation while production in design waits',()=>{
 const state=fixture().memory,order=state.orders[0];order.items.push({itemId:'sale',stockTiming:'SALE',status:'MENUNGGU_PEMBAYARAN',quantity:2,materials:[{sku:'pen',units:2,unit:'pcs'}]});
 confirmRetailStock(state,order,'Kasir',at);assert.equal(state.inventory.find(i=>i.sku==='pen').quantity,98);assert.equal(state.inventory.find(i=>i.sku==='paper').quantity,1000);
});
