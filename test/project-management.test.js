import test from 'node:test';
import assert from 'node:assert/strict';
import { sortProjectDeadlines, projectPicTone } from '../public/project-management.js';
import { holdLabel } from '../public/hold-label.js';
import { projectJobs, initializeOrderItems } from '../public/item-workflow.js';
import { initializeCatalogSettings, savePic, deletePic } from '../lib/catalog-settings.js';

test('deadline sorting compares full timestamps, keeps ties stable and leaves missing deadlines last in both directions', () => {
  const jobs = [{id:'none'}, {id:'later',deadline:'2026-10-20T10:00:00+08:00'},
    {id:'early',deadline:'2026-10-18T09:00:00+08:00'}, {id:'tie',deadline:'2026-10-18T01:00:00Z'},
    {id:'bad',deadline:'invalid'}, {id:'mid',deadline:'2026-10-18T10:00:00+08:00'}];
  const before = structuredClone(jobs);
  assert.deepEqual(sortProjectDeadlines(jobs).map(j=>j.id), ['early','tie','mid','later','none','bad']);
  assert.deepEqual(sortProjectDeadlines(jobs,'farthest').map(j=>j.id), ['later','mid','early','tie','none','bad']);
  assert.deepEqual(jobs,before);
  assert.deepEqual(sortProjectDeadlines([]),[]);
});

test('sorting duplicate products remains per item and does not change invoice, amounts, status or stored item order', () => {
  const order = {id:'o',code:'INV',status:'DESAIN',total:300,paidAmount:10,payments:[{amount:10}],items:[
    {productId:'p',productName:'Albatros',status:'DESAIN',deadline:'2026-10-20T00:00:00Z',quantity:2,subtotal:100},
    {productId:'p',productName:'Albatros',status:'CETAK',deadline:'2026-10-18T00:00:00Z',quantity:3,subtotal:200}
  ]};
  initializeOrderItems(order);const before=structuredClone(order);
  const jobs = sortProjectDeadlines(projectJobs([order]));
  assert.deepEqual(jobs.map(j=>j.itemId),[order.items[1].itemId,order.items[0].itemId]);
  assert.equal(new Set(jobs.map(j=>j.id)).size,1);
  assert.deepEqual(jobs.map(j=>j.status),['CETAK','DESAIN']);
  assert.deepEqual(order,before);
});

test('new PIC presentation palette retains identities and colors through rename/delete without historical mutation', () => {
  const state={catalogOptions:{categories:[],materialCategories:[]},products:[],materials:[],inventory:[],pics:[{id:'q',name:'Qori',color:'green'}],orders:[{id:'o',status:'DESAIN',timeline:[{message:'PIC Qori'}],items:[{status:'DESAIN',designPic:'Qori',designPicId:'q',designPicColor:'green'}]}]};
  initializeCatalogSettings(state);const item=state.orders[0].items[0];
  assert.equal(projectPicTone(item),'pink');
  savePic(state,'Qori Baru','q');assert.equal(item.designPic,'Qori Baru');assert.equal(projectPicTone(item),'pink');
  deletePic(state,'q');assert.equal(projectPicTone(item),'pink');assert.equal(item.designPicColor,'green');assert.equal(state.orders[0].timeline[0].message,'PIC Qori');
  assert.equal(projectPicTone({designPic:'Gema'}),'yellow');assert.equal(projectPicTone({designPic:'Cc/Ko'}),'gray');
});

test('Menunggu ACC aliases old approval reasons while preserving other hold text and historical reason values', () => {
  const hold={reason:'Menunggu approval customer',note:'Proof kedua'},before=structuredClone(hold);
  for (const reason of [hold.reason,'Menunggu Approval','Menunggu ACC','menunggu acc customer']) assert.equal(holdLabel(reason),'Menunggu ACC');
  assert.equal(holdLabel('Menunggu file customer'),'Menunggu file customer');
  assert.equal(holdLabel('Menunggu approval internal lanjutan'),'Menunggu approval internal lanjutan');
  assert.equal(holdLabel(null),'');assert.deepEqual(hold,before);
});
