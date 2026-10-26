import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { calculateLine, calculateOrder } from '../lib/domain.js';
import { albatrosPlacements, selectAlbatrosPlacement, supportsAlbatrosPlacement, albatrosPlacementNote } from '../public/albatros-sizing.js';
import { repeatQuote } from '../lib/order-assistance.js';
import { ROLE_PRESETS } from '../lib/access.js';
import { commitPhysicalStock } from '../lib/physical-stock.js';
const state=await new Store().read(),product=state.products.find(p=>p.id==='poster-albatros');
const input=(w,h,extra={})=>({productId:product.id,imageWidthCm:w,imageLengthCm:h,quantity:1,finishing:[],...extra});

test('Albatros chooses minimum actual material in either orientation and ignores a client roll/placement override',()=>{
 const a=calculateLine(product,input(91,101,{width:1.5,rollPlacement:{nominalWidth:.9,acrossCm:1}}));
 assert.equal(a.width,1.2);assert.equal(a.actualLength,.91);assert.equal(a.billedLength,1);assert.equal(a.baseTotal,180000);
 assert.equal(a.imageWidthCm,91);assert.equal(a.imageLengthCm,101);assert.equal(a.rollPlacement.acrossCm,101);
 assert.equal(a.materials[0].materialId,'mat-lf-albatros-125');assert.equal(a.materials[0].unitCost,product.materialSources[0].cost);
 const materialFirst=calculateLine(product,input(70,100));assert.equal(materialFirst.width,1.2);assert.equal(materialFirst.baseTotal,180000);
 const plans=albatrosPlacements(product,input(70,100));assert(plans[0].usedArea<plans.find(p=>p.nominalWidth===.9).usedArea);assert(plans[0].billingUnits>plans.find(p=>p.nominalWidth===.9).billingUnits);
 assert.match(albatrosPlacementNote(a),/101 × 91 cm/);
});

test('swapped dimensions, ties, all widths and small/decimal lengths give identical billing and physical usage',()=>{
 let count=0;
 for(const w of [.01,70,88,90,90.01,91,100,101,125,125.01,126,152,152.01,200])for(const h of [50,88,90,100,101,125,150,152,210]){
  const candidates=albatrosPlacements(product,input(w,h)),swapped=albatrosPlacements(product,input(h,w));
  assert.equal(candidates.length,swapped.length);
  if(candidates.length){const a=calculateLine(product,input(w,h)),b=calculateLine(product,input(h,w));for(const k of ['width','actualLength','billedLength','baseTotal'])assert.equal(a[k],b[k]);assert.equal(a.rollPlacement.usedArea,b.rollPlacement.usedArea);assert(a.rollPlacement.acrossCm<=a.rollPlacement.capacityCm);assert.equal(a.rollPlacement.usedArea,Math.min(...candidates.map(p=>p.usedArea)));}
  count++;
 }
 assert.equal(count,126);
 const tie=selectAlbatrosPlacement(product,input(90,125));assert.equal(tie.nominalWidth,.9);assert.equal(tie.billedLength,1.3);
 assert.equal(selectAlbatrosPlacement(product,input(88,101)).billedLength,1.1);
 assert.equal(selectAlbatrosPlacement({...product,widths:[1.5,1.2,.9]},input(90,125)).nominalWidth,.9);
});

test('invalid dimensions and no-fit are blocked; legacy length-only input and unrelated products retain old behavior',()=>{
 for(const dims of [[0,100],[-1,100],[100,NaN],[Infinity,100]])assert.throws(()=>calculateLine(product,input(...dims)),/Ukuran/);
 assert.throws(()=>calculateLine(product,input(153,200)),/tidak muat/);
 for(const quantity of [0,-1,1.5,Infinity])assert.throws(()=>calculateLine(product,input(90,100,{quantity})),/Jumlah/);
 assert.throws(()=>calculateLine(product,{width:.9,length:1,quantity:1,rollCalculationVersion:1,finishing:[]}),/Ukuran/);
 assert.throws(()=>calculateLine(product,input(90,1e100)),/terlalu besar/);
 const old=calculateLine(product,{width:1.5,length:1.1,quantity:1,finishing:[]});assert.equal(old.width,1.5);assert.equal(old.baseTotal,247500);assert.equal(old.rollPlacement,undefined);
 const fixedPoster=state.products.find(p=>p.id==='poster-backlite-film');assert.equal(supportsAlbatrosPlacement(fixedPoster),false);assert.equal(calculateLine(fixedPoster,{sizeVariantId:'a1',quantity:1}).baseTotal,175000);
});

test('A1 price, discounts, finishing, design, HPP and original roll stock workflow stay independent',()=>{
 const fixed=calculateLine(product,{sizeVariantId:'a1',quantity:3,finishing:[]});assert.equal(fixed.baseTotal,300000);assert.equal(fixed.rollPlacement,undefined);
 const p=structuredClone(product);p.price=200000;p.wholesaleEnabled=true;p.priceTiers=[{min:2,max:null,price:180000}];p.discount={enabled:true,type:'percent',value:10};p.finishing=[{id:'lam',name:'Laminasi',price:25000,rule:'area'}];
 const line=calculateLine(p,input(91,101,{quantity:2,fileServiceId:'DESIGN_A',fileServiceQuantity:2,finishing:[{id:'lam',units:9}]}));
 assert.equal(line.unitPrice,162000);assert.equal(line.baseTotal,388800);assert.equal(line.finishing[0].units,2.4);assert.equal(line.fileServiceTotal,50000);assert.equal(line.subtotal,498800);
 const s=structuredClone(state),before=structuredClone(s.inventory);const order={id:'roll-order',code:'TEST',items:[{...line,itemId:'x',status:'SELESAI'}]};commitPhysicalStock(s,order);commitPhysicalStock(s,order);assert.deepEqual(s.inventory,before);
});

test('editing an unchanged legacy draft preserves its old placement; explicit new configuration and repeat use new rules',()=>{
 const old=calculateLine(product,{width:1.5,length:1.1,quantity:1,finishing:[]});Object.assign(old,{itemId:'old-line',imageWidthCm:88,imageLengthCm:101,finalImageWidthCm:88,finalImageLengthCm:101,actualLength:1.01});
 const before=structuredClone(old),lineInput={...old,fileServiceId:'READY'};
 const saved=calculateOrder([product],[lineInput],[],[old]).items[0];assert.equal(saved.width,1.5);assert.equal(saved.baseTotal,old.baseTotal);assert.equal(saved.rollPlacement,undefined);
 const updated=calculateOrder([product],[{...lineInput,rollCalculationVersion:1}],[],[old]).items[0];assert.equal(updated.width,.9);assert(updated.rollPlacement);
 const renamed=calculateOrder([product],[{...lineInput,imageWidthCm:91}],[],[old]).items[0];assert(renamed.rollPlacement);
 const user={id:'cashier',role:'CASHIER',permissions:ROLE_PRESETS.CASHIER.permissions};const quote=repeatQuote(state,{id:'o',code:'OLD',customerName:'Tes',phone:'8988',total:old.subtotal,items:[old]},user);assert(quote.canRepeat);assert.equal(quote.items[0].width,.9);
 assert.deepEqual(old,before);
});
