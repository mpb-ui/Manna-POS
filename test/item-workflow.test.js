import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeOrderItems, refreshOrderWorkflow, projectJobs, itemQuantityLabel } from '../public/item-workflow.js';
import { initializeCatalogSettings, savePic, deletePic } from '../lib/catalog-settings.js';
import { aggregateReport } from '../lib/reports.js';
import { briefingForUser } from '../lib/order-assistance.js';
import { ROLE_PRESETS } from '../lib/access.js';
import { Store } from '../lib/store.js';
import { commitOrderStock } from '../lib/item-workflow-routes.js';

test('legacy item IDs and inheritance are stable without repricing, stock, or historical edits', () => {
  for (const status of ['MENUNGGU_PEMBAYARAN','DESAIN','CETAK','FINISHING','SELESAI','DIAMBIL']) {
    const order = { id:'old', status, designPic:'Gema', deadline:'2026-10-08T02:00:00Z', total:1234, paidAmount:234, stockCommitted:status==='SELESAI', timeline:[{message:'old'}], items:[{productId:'p',subtotal:600},{productId:'p',subtotal:634}] };
    const before = structuredClone(order);
    initializeOrderItems(order);
    assert.deepEqual(order.items.map(i=>i.itemId),['old-item-1','old-item-2']);
    assert.ok(order.items.every(i=>i.status===status && i.designPic==='Gema' && i.deadline===order.deadline));
    const migrated = structuredClone(order);initializeOrderItems(order);assert.deepEqual(order,migrated);
    assert.deepEqual({...order,items:before.items},before);
  }
  const collision={id:'old',status:'DESAIN',items:[{itemId:'old-item-2'},{}]};initializeOrderItems(collision);assert.equal(new Set(collision.items.map(i=>i.itemId)).size,2);
});

test('item aggregation, PIC rename/delete, briefing, and operational reports keep one invoice', () => {
  const state={catalogOptions:{categories:["Outdoor"],materialCategories:[]},products:[{id:'p',category:'Outdoor'}],materials:[],inventory:[],machines:[],pics:[{id:'gema',name:'Gema'},{id:'qori',name:'Qori'}],orders:[{id:'o',code:'INV',customerName:'Test',phone:'0812',createdAt:'2026-10-08T02:00:00Z',status:'DESAIN',confirmed:true,paymentConfirmed:true,total:300,paidAmount:50,payments:[{amount:50,method:'TUNAI',createdAt:'2026-10-08T02:00:00Z'}],timeline:[{message:'PIC Gema'}],items:[{productId:'p',productName:'Spanduk',status:'DESAIN',designPic:'Gema',quantity:2,unitName:'Lembar',subtotal:100,deadline:'2026-10-08T04:00:00Z'},{productId:'p',productName:'Spanduk',status:'FINISHING',designPic:'Qori',quantity:3,unitName:'Box',subtotal:200,deadline:'2026-10-09T04:00:00Z'}]}]};
  initializeOrderItems(state.orders[0]);initializeCatalogSettings(state);refreshOrderWorkflow(state.orders[0],'2026-10-08T02:00:00Z');
  const jobs=projectJobs(state.orders);assert.equal(jobs.length,2);assert.deepEqual(jobs.map(i=>i.status),['DESAIN','FINISHING']);assert.equal(itemQuantityLabel(jobs[1].items[0]),'3 Box');
  const report=aggregateReport(state,{role:'OWNER'},{from:'2026-10-08',to:'2026-10-09'});
  assert.equal(report.summary.orders,1);assert.equal(report.summary.sales,300);assert.equal(report.summary.paid,50);assert.equal(report.summary.outstanding,250);assert.equal(report.products[0].orders,1);assert.equal(report.categories[0].orders,1);
  assert.deepEqual(report.statuses.map(s=>[s.id,s.orders,s.items]),[['DESAIN',1,2],['FINISHING',1,3]]);
  const design=briefingForUser(state,{role:'DESIGN',name:'Gema'},new Date('2026-10-08T02:30:00Z'));assert.equal(design.count,1);assert.match(design.orders[0].summary,/Spanduk/);assert.equal(design.orders[0].deadline,state.orders[0].items[0].deadline);assert.equal(design.orders[0].pic,'Gema');assert.equal(design.orders[0].outstanding,undefined);
  const owner=briefingForUser(state,{role:'OWNER'},new Date('2026-10-08T02:30:00Z'));assert.equal(owner.count,1);assert.equal(owner.orders[0].outstanding,250);assert.deepEqual(owner.orders[0].jobs.map(job=>job.status),["DESAIN","FINISHING"]);assert.equal(owner.orders[0].jobs[1].pic,"Qori");assert.equal(owner.orders[0].jobs[1].quantityLabel,"3 Box");
  savePic(state,'Gema Baru','gema');assert.equal(state.orders[0].items[0].designPic,'Gema Baru');assert.equal(state.orders[0].items[0].designPicColor,'yellow');assert.equal(state.orders[0].timeline[0].message,'PIC Gema');deletePic(state,'gema');assert.equal(state.orders[0].items[0].designPic,'Gema Baru');
});

test('concurrent completion is serialized and commits inventory once, including rollback', async () => {
  const store=new Store();store.memory.orders=[{id:'o',status:'FINISHING',items:[{productId:'p',status:'FINISHING',stockSku:'s',stockConsumption:2},{productId:'p',status:'FINISHING',stockSku:'s',stockConsumption:3}]}];store.memory.inventory=[{sku:'s',quantity:20}];
  await assert.rejects(store.mutate(state=>{state.inventory[0].quantity=0;throw new Error('rollback');}));
  await Promise.all([0,1,0,1].map(index=>store.mutate(async state=>{
    state.orders[0].items[index].status='SELESAI';refreshOrderWorkflow(state.orders[0],'now');commitOrderStock(state,state.orders[0],()=> 'now');
  })));
  const state=await store.read();assert.equal(state.inventory[0].quantity,15);assert.equal(state.stockMovements.length,2);assert.equal(state.orders[0].status,'SELESAI');assert.equal(state.orders[0].stockCommitted,true);
});

test('legacy PIC identity and color survive repeated reads before persistence', () => {
  const fixture = {catalogOptions:{categories:[],materialCategories:[]},orders:[{id:'o',status:'DESAIN',designPic:'Mira',items:[]}]};
  const first=structuredClone(fixture),second=structuredClone(fixture);
  initializeCatalogSettings(first);initializeCatalogSettings(second);
  assert.deepEqual(first.pics,second.pics);
  assert.equal(first.orders[0].designPicId,second.orders[0].designPicId);
  assert.equal(first.orders[0].designPicColor,second.orders[0].designPicColor);
});
