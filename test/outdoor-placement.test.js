import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { calculateLine, calculateOrder } from '../lib/domain.js';
import { supportsOutdoorPlacement, supportsRollPlacement, rollPlacements, selectRollPlacement, rollPlacementNote } from '../public/roll-placement.js';
import { repeatQuote } from '../lib/order-assistance.js';
import { ROLE_PRESETS } from '../lib/access.js';
import { commitPhysicalStock } from '../lib/physical-stock.js';

const state=await new Store().read(), outdoor=state.products.filter(supportsOutdoorPlacement);
const product=id=>state.products.find(p=>p.id===id);
const input=(w,h,a=0,extra={})=>({imageWidthCm:w,imageLengthCm:h,allowanceCm:a,quantity:1,finishing:[],...extra});

test('all six free-size Outdoor products use automatic placement; fixed templates and other LF products keep their rules',()=>{
  assert.deepEqual(outdoor.map(p=>p.id).sort(),['fl-280-glossy','fl-380-matte','fl-410-glossy','fl-440-matte','cloth-banner','nb-backlite-510'].sort());
  assert(supportsRollPlacement(product('poster-albatros')));
  for(const id of ['spanduk-template','poster-luster','poster-canvas','lf-sticker-white-glossy','poster-backlite-film','dtf-sablon-kaos'])assert.equal(supportsOutdoorPlacement(product(id)),false);
  assert(supportsOutdoorPlacement({...product('fl-280-glossy'),id:'new-outdoor',outdoorCapacities:undefined}));
  assert.equal(supportsOutdoorPlacement({...product('fl-280-glossy'),priceBasis:'unit'}),false);
});

test('Outdoor compares both orientations, ignores client width/snapshot, and preserves the original image/allowance',()=>{
  const p=product('fl-280-glossy');
  const a=calculateLine(p,input(200,100,5,{width:3,rollPlacement:{nominalWidth:3,usedArea:0}}));
  assert.equal(a.width,1);assert.equal(a.actualLength,2);assert.equal(a.billedLength,2);assert.equal(a.baseTotal,60000);
  assert.equal(a.imageWidthCm,200);assert.equal(a.imageLengthCm,100);assert.equal(a.finalImageWidthCm,210);assert.equal(a.finalImageLengthCm,110);
  assert.equal(a.rollPlacement.acrossCm,110);assert.equal(a.rollPlacement.alongCm,210);assert.equal(a.rollPlacement.usedArea,2.31);assert(a.rollPlacement.rotated);
  assert.equal(a.rollPlacement.baseTotal,undefined);assert.match(rollPlacementNote(a),/110 × 210 cm.*Roll 1 m/);
  const fit=calculateLine(p,input(115,200));assert.equal(fit.width,2);assert.equal(fit.billedLength,1.5);assert.equal(fit.baseTotal,90000);
  const saving=calculateLine(p,input(50,120));assert.equal(saving.width,2);assert.equal(saving.baseTotal,60000);assert.equal(saving.rollPlacement.usedArea,1.1);
  assert(saving.rollPlacement.usedArea<rollPlacements(p,input(50,120)).find(c=>c.nominalWidth===1).usedArea, 'material first can differ from cheapest rounded retail bill');
});

test('swapping dimensions gives consistent billing, roll and usage across capacities and the free allowance boundary',()=>{
  let compared=0;
  for(const p of outdoor)for(const [w,h] of [[.01,1],[50,120],[100,200],[110,320],[111,220],[220,221],[320,321],[350,400],[125.5,99.9]])for(const a of [0,3,5,5.01,10]){
    const candidates=rollPlacements(p,input(w,h,a)),swapped=rollPlacements(p,input(h,w,a));assert.equal(candidates.length,swapped.length);
    if(candidates.length){
      const one=calculateLine(p,input(w,h,a)),two=calculateLine(p,input(h,w,a));
      for(const key of ['width','actualLength','billedLength','baseTotal'])assert.equal(one[key],two[key],`${p.id} ${w}x${h}+${a} ${key}`);
      assert.equal(one.rollPlacement.usedArea,two.rollPlacement.usedArea);assert.equal(one.rollPlacement.usedArea,Math.min(...candidates.map(c=>c.usedArea)));
      assert(one.rollPlacement.acrossCm<=one.rollPlacement.capacityCm+1e-9);
      assert.equal(one.rollPlacement.actualLength,(one.rollPlacement.imageAlongCm+(a>5?2*a:0))/100);
    }else assert.throws(()=>selectRollPlacement(p,input(w,h,a)),/tidak muat/);
    compared++;
  }
  assert.equal(compared,270);
  const p=product('fl-280-glossy'),free=calculateLine(p,input(100,200,5)),charged=calculateLine(p,input(100,200,5.01));
  assert.equal(free.baseTotal,60000);assert.equal(free.rollPlacement.capacityCm,110);
  assert.equal(charged.width,2);assert.equal(charged.actualLength,1.1002);assert.equal(charged.billedLength,1.5);assert.equal(charged.baseTotal,90000);
  assert.deepEqual(rollPlacements({...p,widths:[3,2,1]},input(100,200,5)),rollPlacements(p,input(100,200,5)));
});

test('single roll products still rotate, meter-lari pricing stays linear, and physical roll balances stay manual',()=>{
  for(const id of ['fl-410-glossy','fl-440-matte','nb-backlite-510']){
    const p=product(id),line=calculateLine(p,input(100,200));
    assert(line.rollPlacement.rotated);assert.equal(line.billedLength,1);
    assert.equal(line.baseTotal,p.price*(p.priceBasis==='sqm'?p.widths[0]:1));
  }
  const cloth=calculateLine(product('cloth-banner'),input(90,140));assert.equal(cloth.width,1.5);assert.equal(cloth.baseTotal,75000);assert.equal(cloth.materials[0].units,1.05);
  const s=structuredClone(state),before=structuredClone(s.inventory);const items=outdoor.map((p,i)=>({...calculateLine(p,input(90,100)),itemId:`out-${i}`,status:'SELESAI'}));
  commitPhysicalStock(s,{id:'automatic-outdoor',items});commitPhysicalStock(s,{id:'automatic-outdoor',items});assert.deepEqual(s.inventory,before);
});

test('invalid dimensions/quantity and no-fit are rejected; pricing, finishing, HPP, templates and existing Albatros stay compatible',()=>{
  const p=product('fl-280-glossy');
  for(const dims of [[0,100],[-1,100],[100,NaN],[Infinity,100]])assert.throws(()=>calculateLine(p,input(...dims)),/Ukuran/);
  for(const a of [-1,NaN,Infinity])assert.throws(()=>calculateLine(p,input(100,200,a)),/Lebihan/);
  for(const quantity of [0,-1,1.1,Infinity])assert.throws(()=>calculateLine(p,input(100,200,0,{quantity})),/Jumlah/);
  assert.throws(()=>calculateLine(p,input(400,400)),/tidak muat/);assert.throws(()=>calculateLine(p,input(100,1e100)),/terlalu besar/);
  assert.throws(()=>calculateLine(p,{width:1,length:1,quantity:1,rollCalculationVersion:1}),/Ukuran/);
  assert.throws(()=>calculateLine(p,input(100,200,0,{finishing:[{id:'fin-out-eyelet',units:1e100}]})),/terlalu besar/);
  const custom={...p,wholesaleEnabled:true,priceTiers:[{min:2,max:null,price:25000}],discount:{enabled:true,type:'percent',value:10},rollStockSources:{1:[{sourceMaterialId:p.materialSources[0].materialId,materialId:'chosen-roll',sku:'CHOSEN',name:'Chosen'}]}};
  const line=calculateLine(custom,input(200,100,5,{quantity:2,fileServiceId:'DESIGN_B',fileServiceQuantity:2,finishing:[{id:'fin-out-eyelet',units:6,note:'Atas'}]}));
  assert.equal(line.unitPrice,22500);assert.equal(line.baseTotal,90000);assert.equal(line.finishingTotal,3000);assert.equal(line.fileServiceTotal,70000);assert.equal(line.materials[0].materialId,'chosen-roll');assert.equal(line.materials[0].unitCost,p.materialSources[0].cost);assert.equal(line.materials[0].units,4.2);
  const t=product('spanduk-template'),template=calculateLine(t,{width:1.5,length:1,quantity:2,templateDesign:'SB-01',finishing:[]});assert.equal(template.baseTotal,90000);assert.equal(template.templateDesignTotal,35000);assert.equal(template.rollPlacement,undefined);
  assert.equal(calculateLine(product('poster-albatros'),input(91,101)).baseTotal,180000);
});

test('an untouched legacy Outdoor draft keeps its charge; changed allowance/new configuration/repeat use automatic placement without rewriting history',()=>{
  const p=product('fl-280-glossy'),legacy={...calculateLine(p,{width:3,length:1,quantity:1,finishing:[]}),itemId:'old',imageWidthCm:200,imageLengthCm:100,allowanceCm:0,finalImageWidthCm:200,finalImageLengthCm:100};
  const before=structuredClone(legacy),request={...legacy,fileServiceId:'READY'};
  const same=calculateOrder([p],[request],[],[legacy]).items[0];assert.equal(same.width,3);assert.equal(same.rollPlacement,undefined);assert.equal(same.baseTotal,90000);
  const revised=calculateOrder([p],[{...request,rollCalculationVersion:1}],[],[legacy]).items[0];assert(revised.rollPlacement);assert.equal(revised.width,1);assert.equal(revised.baseTotal,60000);
  const allowance=calculateOrder([p],[{...request,allowanceCm:5}],[],[legacy]).items[0];assert(allowance.rollPlacement);assert.equal(allowance.allowanceCm,5);
  const quote=repeatQuote(state,{id:'old-order',code:'OLD',customerName:'Tes',phone:'8988',total:legacy.subtotal,items:[legacy]},{id:'cashier',role:'CASHIER',permissions:ROLE_PRESETS.CASHIER.permissions});assert(quote.canRepeat);assert.equal(quote.items[0].width,1);assert.deepEqual(legacy,before);
});
