import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { calculateLine, calculateOrder } from '../lib/domain.js';
import { supportsLfPlacement, supportsRollPlacement, rollPlacements, selectRollPlacement } from '../public/roll-placement.js';
import { repeatQuote } from '../lib/order-assistance.js';
import { ROLE_PRESETS } from '../lib/access.js';

const state = await new Store().read(), products = state.products.filter(supportsLfPlacement);
const input = (w, h, extra = {}) => ({imageWidthCm:w, imageLengthCm:h, quantity:1, finishing:[], ...extra});

test('Luster, Canvas and every free-size LF Sticker use placement, including newly added sticker products', () => {
  assert.equal(products.length, 9);
  assert.equal(products.filter(p => p.category === 'LF Sticker').length, 7);
  assert(products.every(supportsRollPlacement));
  const custom = {...products[0], id:'new-sticker', category:'LF Sticker', widths:[.8], rollCapacities:{.8:85}};
  assert(supportsLfPlacement(custom));
  assert.equal(selectRollPlacement(custom, input(85,200)).capacityCm, 85);
  for (const p of [{...custom, priceBasis:'unit'}, {...custom, templateProduct:true}, state.products.find(p => p.id === 'poster-backlite-film')]) assert.equal(supportsLfPlacement(p), false);
});

test('all nine LF products minimize material in both orientations at capacity and decimal boundaries', () => {
  for (const p of products) for (const w of [.01,88,90,90.01,101,102,102.01,125,125.01,152,152.01,200]) for (const h of [70,100,101,125,152,210]) {
    const plans = rollPlacements(p,input(w,h)), reversed = rollPlacements(p,input(h,w));
    assert.equal(plans.length,reversed.length);
    if (!plans.length) { assert.throws(() => calculateLine(p,input(w,h)), /tidak muat/); continue; }
    const a = calculateLine(p,input(w,h,{width:999,allowanceCm:20,rollPlacement:{nominalWidth:999,usedArea:0}})), b = calculateLine(p,input(h,w));
    for (const k of ['width','actualLength','billedLength','baseTotal']) assert.equal(a[k],b[k],p.id+' '+k);
    assert.equal(a.imageWidthCm,w); assert.equal(a.imageLengthCm,h); assert.equal(a.allowanceCm,0);
    assert.equal(a.rollPlacement.usedArea,Math.min(...plans.map(plan => plan.usedArea)));
    assert(a.rollPlacement.acrossCm <= a.rollPlacement.capacityCm);
    assert.equal(a.baseTotal,Math.round(a.width*a.billedLength*p.price));
    assert.equal(a.billedLength,Math.max(1,Math.ceil(a.actualLength*10-1e-9)/10));
    assert.equal(a.materials[0].materialId,p.rollStockSources[a.width][0].materialId);
  }
  const canvas = products.find(p => p.id === 'poster-canvas');
  assert.equal(selectRollPlacement(canvas,input(200,125)).rotated,true);
  assert.throws(() => calculateLine(canvas,input(126,126)), /tidak muat/);
});

test('LF fixed A1, finishing, discounts and design keep their own pricing; invalid automatic input is blocked', () => {
  for (const p of products) {
    for (const fixed of p.fixedSizeVariants || []) {
      const line = calculateLine(p,{sizeVariantId:fixed.id,quantity:2,finishing:[]});
      assert.equal(line.baseTotal,2*fixed.price); assert.equal(line.rollPlacement,undefined);
    }
    for (const extra of [{imageWidthCm:0},{imageLengthCm:Infinity},{quantity:0},{quantity:1.5}]) assert.throws(() => calculateLine(p,input(90,100,extra)), /Ukuran|Jumlah/);
    assert.throws(() => calculateLine(p,{width:p.widths[0],length:1,quantity:1,rollCalculationVersion:1}), /Ukuran/);
  }
  const p = structuredClone(products.find(p => p.id === 'poster-luster'));
  Object.assign(p,{price:200000,wholesaleEnabled:true,priceTiers:[{min:2,max:null,price:180000}],discount:{enabled:true,type:'percent',value:10},finishing:[{id:'lam',name:'Laminasi',price:25000,rule:'area'}]});
  const line = calculateLine(p,input(91,101,{quantity:2,finishing:[{id:'lam',units:9}],fileServiceId:'DESIGN_A',fileServiceQuantity:2}));
  assert.equal(line.width,1.2); assert.equal(line.baseTotal,388800); assert.equal(line.finishing[0].units,2.4); assert.equal(line.subtotal,498800);
});

test('unchanged legacy LF drafts keep prices; changed size/quantity and repeat use automatic placement without changing history', () => {
  for (const p of products) {
    const old = calculateLine(p,{width:p.widths.at(-1),length:2.1,quantity:1,finishing:[]});
    Object.assign(old,{itemId:'legacy',imageWidthCm:90,imageLengthCm:201,actualLength:2.01,finalImageWidthCm:90,finalImageLengthCm:201});
    const before = structuredClone(old), request = {...old,length:old.actualLength};
    const saved = calculateOrder([p],[request],[],[old]).items[0];
    assert.equal(saved.baseTotal,old.baseTotal); assert.equal(saved.width,old.width); assert.equal(saved.rollPlacement,undefined);
    for (const extra of [{imageWidthCm:91},{quantity:2},{rollCalculationVersion:1}]) assert(calculateOrder([p],[{...request,...extra}],[],[old]).items[0].rollPlacement);
    const quote = repeatQuote(state,{id:'old',code:'OLD',customerName:'LF',phone:'6789',total:old.subtotal,items:[old]},{id:'cashier',role:'CASHIER',permissions:ROLE_PRESETS.CASHIER.permissions});
    assert(quote.canRepeat); assert(quote.items[0].rollPlacement); assert.deepEqual(old,before);
  }
});
