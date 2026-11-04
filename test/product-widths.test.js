import test from 'node:test';
import assert from 'node:assert/strict';
import {CATEGORY_WIDTHS,categoryWidthChoices,normalizeProductWidths,productWidthSettings} from '../public/product-widths.js';
import {outdoorCapacity} from '../public/outdoor-sizing.js';
import {supportsRollPlacement} from '../public/roll-placement.js';
import {Store} from '../lib/store.js';
import {calculateLine} from '../lib/domain.js';

test('category chips include Outdoor 1.5 m; legacy widths belong only to their existing product',()=>{
 assert.deepEqual(categoryWidthChoices('outdoor'),[1,1.5,2,3]);assert.deepEqual(categoryWidthChoices('lf-poster'),[.9,1.2,1.5]);assert.deepEqual(categoryWidthChoices('lf-sticker'),[1,1.5]);
 assert.deepEqual(categoryWidthChoices('lf-sticker',[.8,1.5]),[.8,1,1.5]);assert.deepEqual(CATEGORY_WIDTHS['lf-sticker'],[1,1.5]);assert.equal(categoryWidthChoices('custom'),null);
 assert.throws(()=>productWidthSettings('lf-sticker',[.8]),/kategori/);
 const existing={widths:[.8],rollCapacities:{.8:85}};assert.deepEqual(productWidthSettings('lf-sticker',[.8],existing),{widths:[.8]});assert.throws(()=>productWidthSettings('lf-poster',[.8],existing,'lf-sticker'),/kategori/);
 assert.deepEqual(normalizeProductWidths(['1',1,1.5,'2']),[1,1.5,2]);
 for(const widths of [[0],[-1],['NaN'],[Infinity],'1,2'])assert.throws(()=>normalizeProductWidths(widths),/lebar|Lebar/);
});
test('new widths use category capacity; enabling widths preserves every existing physical capacity',()=>{
 assert.deepEqual(productWidthSettings('lf-poster',[1.2,1.5]).rollCapacities,{1.2:125,1.5:152});assert.deepEqual(productWidthSettings('lf-sticker',[1]).rollCapacities,{1:102});
 const cloth={id:'cloth-banner',category:'Outdoor',widths:[1,1.5]};const updated={...cloth,...productWidthSettings('outdoor',[1,1.5,2],cloth)};
 assert.equal(outdoorCapacity(updated,1),100);assert.equal(outdoorCapacity(updated,1.5),150);assert.equal(outdoorCapacity(updated,2),220);assert.deepEqual(cloth.widths,[1,1.5]);
 const custom={widths:[1.2],rollCapacities:{1.2:130}},extended={...custom,...productWidthSettings('lf-poster',[.9,1.2,1.5],custom)};assert.equal(outdoorCapacity(extended,1.2),130);assert.equal(outdoorCapacity(extended,1.5),152);
 const changed=productWidthSettings('lf-sticker',[1,1.5],{widths:[1,2,3],outdoorCapacities:{1:110,2:220,3:320}},'outdoor');assert.deepEqual(changed.rollCapacities,{1:102,1.5:152});
});
test('unchanged Outdoor, Cloth, Albatros, Luster, Canvas and LF Sticker configurations preserve automatic dimensions, rotation, rounding and price',async()=>{
 const store=new Store();await store.init();const state=await store.read(),products=state.products.filter(supportsRollPlacement);assert(products.some(p=>p.id==='cloth-banner'));
 for(const p of products){
  const category=p.category==='Outdoor'?'outdoor':p.category==='LF Poster'?'lf-poster':'lf-sticker',copy={...p,...productWidthSettings(category,p.widths,p)};
  for(const w of [90,102,110,125,152,200,320])for(const h of [50,100,125,210])for(const allowanceCm of [0,5,10]){
   const input={imageWidthCm:w,imageLengthCm:h,allowanceCm,quantity:2,finishing:[]};let original;
   try{original=calculateLine(p,input);}catch(error){assert.throws(()=>calculateLine(copy,input),new RegExp(error.message.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));continue;}
   assert.deepEqual(calculateLine(copy,input),original,p.id+' '+w+'x'+h);
  }
 }
});
