import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { LF_CAPACITIES, outdoorCapacity, suggestedOutdoorWidth, supportsAutoRollWidth, supportsOutdoorAllowance } from '../public/outdoor-sizing.js';
import { calculateLine } from '../lib/domain.js';
import { commitPhysicalStock, adjustPhysicalStock } from '../lib/physical-stock.js';
import { initializeLfRolls } from '../lib/lf-rolls.js';

const state = await new Store().read();
const product = id => state.products.find(p=>p.id===id);
const input = (width,cm=88) => ({width,imageWidthCm:cm,imageLengthCm:101,allowanceCm:20,quantity:1,finishing:[]});

test('LF capacities select smallest fitting nominal roll at all boundaries without introducing allowance',()=>{
 for(const [id,capacities] of Object.entries(LF_CAPACITIES)){
  const p=product(id);assert(supportsAutoRollWidth(p));assert.equal(supportsOutdoorAllowance(p),false);
  const widths=[...p.widths].sort((a,b)=>outdoorCapacity(p,a)-outdoorCapacity(p,b));
  assert.deepEqual(widths.map(w=>outdoorCapacity(p,w)),widths.map(w=>capacities[w]));
  widths.forEach((w,i)=>{assert.equal(suggestedOutdoorWidth(p,capacities[w]),w);if(i<widths.length-1)assert.equal(suggestedOutdoorWidth(p,capacities[w]+.01),widths[i+1]);});
  assert.equal(suggestedOutdoorWidth(p,999),widths.at(-1));
 }
 const p=product('poster-albatros');for(const [cm,w] of [[88,.9],[90,.9],[91,1.2],[125,1.2],[126,1.5],[152,1.5]])assert.equal(suggestedOutdoorWidth(p,cm),w);
 assert.equal(supportsAutoRollWidth(product('poster-backlite-film')),false);
});

test('LF pricing keeps nominal billing; Albatros rotates automatically while other LF manual widths remain allowed',()=>{
 const p=product('poster-albatros'),line=calculateLine(p,input(1.2,91));
 assert.equal(line.width,1.2);assert.equal(line.allowanceCm,0);assert.equal(line.actualLength,.91);assert.equal(line.billedLength,1);assert.equal(line.baseTotal,Math.round(1.2*p.price));
 assert.equal(calculateLine(p,{...input(undefined,91)}).width,1.2);
 assert.equal(calculateLine(p,input(1.5,88)).width,.9);
 assert.equal(calculateLine(product('poster-luster'),input(1.5,88)).width,1.5);
 assert.equal(calculateLine(p,input(1.5,180)).finalImageWidthCm,180);
 const fixed=calculateLine(p,{sizeVariantId:'a1',quantity:1,finishing:[]});assert.equal(fixed.baseTotal,100000);
});

test('16 physical roll SKUs are distinct, empty, with matching width and shared Oneway/Sandblast bindings',()=>{
 const materials=state.materials.filter(m=>m.lfRollGroup);assert.equal(materials.length,16);assert.equal(new Set(materials.map(m=>m.sku)).size,16);
 for(const m of materials){const row=state.inventory.find(r=>r.materialId===m.id);assert.equal(row.quantity,0);assert.equal(row.unit,'roll');assert.equal(row.stockMethod,'ROLL');assert.equal(row.rollWidthCm,m.rollWidthCm);assert.equal(m.unit,'m²');}
 for(const width of [1,1.5]){
  const a=calculateLine(product('lf-sticker-oneway-outdoor'),input(width)),b=calculateLine(product('lf-sticker-oneway-hires'),input(width));assert.equal(a.materials[0].materialId,b.materials[0].materialId);
  const c=calculateLine(product('lf-sticker-sandblast-print'),input(width)),d=calculateLine(product('lf-sticker-sandblast-plain'),input(width));assert.equal(c.materials[0].materialId,d.materials[0].materialId);
 }
 assert.notEqual(calculateLine(product('poster-albatros'),input(.9)).materials[0].materialId,calculateLine(product('poster-albatros'),input(1.2,91)).materials[0].materialId);
});

test('HPP and unrelated BOM consumption remain unchanged while roll snapshot references selected physical SKU',async()=>{
 const store=new Store();store.memory.materials.find(m=>m.id==='mat-sticker-oneway-outdoor').cost=111;store.memory.materials.find(m=>m.id==='mat-sticker-oneway-hires').cost=222;
 const s=await store.read();const a=calculateLine(s.products.find(p=>p.id==='lf-sticker-oneway-outdoor'),input(1));const b=calculateLine(s.products.find(p=>p.id==='lf-sticker-oneway-hires'),input(1));
 assert.equal(a.materials[0].unitCost,111);assert.equal(b.materials[0].unitCost,222);assert.equal(a.materials[0].materialId,b.materials[0].materialId);
 const p=structuredClone(product('poster-albatros'));p.materialSources.push({materialId:'extra',sku:'EXTRA',quantity:2,wastePercent:0,unit:'pcs',cost:50});const line=calculateLine(p,input(1.2));assert.equal(line.materials[1].materialId,'extra');assert.equal(line.materials[1].unitCost,50);
});

test('LF roll completion never deducts physical rolls; manual out affects only selected width',()=>{
 const s=structuredClone(state),p=product('poster-albatros');const a=calculateLine(p,input(.9)),b=calculateLine(p,input(1.2,91));
 const ra=s.inventory.find(r=>r.materialId===a.materials[0].materialId),rb=s.inventory.find(r=>r.materialId===b.materials[0].materialId);ra.quantity=10;rb.quantity=20;
 const order={id:'o',code:'INV',items:[{...a,itemId:'a',status:'SELESAI'},{...b,itemId:'b',status:'SELESAI'}]};commitPhysicalStock(s,order);commitPhysicalStock(s,order);assert.equal(ra.quantity,10);assert.equal(rb.quantity,20);
 adjustPhysicalStock(s,ra,{change:-1,reason:'Roll 90 cm dibuka',requestId:'r'},'Staf');assert.equal(ra.quantity,9);assert.equal(rb.quantity,20);
});

test('LF migration preserves generic balances, payments, history, prices and BOM, and is idempotent',async()=>{
 const store=new Store(),s=store.memory;s.inventory.find(r=>r.materialId==='mat-albatros').quantity=321;
 const p=s.products.find(p=>p.id==='poster-albatros');p.price=123456;p.materialSources[0].quantity=2;p.materialSources[0].wastePercent=7;
 s.orders=[{id:'old',status:'DIAMBIL',stockCommitted:true,total:123,paidAmount:123,payments:[{id:'pay',amount:123}],timeline:[{message:'Historic'}],items:[{productId:p.id,width:1.2,subtotal:123,materials:[{materialId:'mat-albatros',units:1,unitCost:42}]}]}];const before=structuredClone(s);
 initializeLfRolls(s);assert.deepEqual(s.orders,before.orders);assert.equal(s.inventory.find(r=>r.materialId==='mat-albatros').quantity,321);assert.equal(p.price,123456);assert.deepEqual(p.materialSources,before.products.find(old=>old.id===p.id).materialSources);
 const snapshot=structuredClone(s);initializeLfRolls(s);assert.deepEqual(s,snapshot);
});
