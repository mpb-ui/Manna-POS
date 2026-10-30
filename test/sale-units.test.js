import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSaleUnit, saleUnitBasis, saleUnitProduct, normalizeSaleUnitOptions } from '../public/sale-units.js';
import { migrateSaleUnitPricing } from '../lib/sale-unit-migration.js';
import { calculateLine, calculateOrder } from '../lib/domain.js';
import { Store } from '../lib/store.js';
const basic={id:'p',name:'Produk',category:'Merchandise',price:10000,widths:[2],billingIncrement:.5,materialSources:[{materialId:'m',quantity:1,cost:5000}],finishing:[],discount:{enabled:false}};
test('unit aliases select a single pricing mode and unit options do not duplicate',()=>{
 for(const label of ['m2','m²','M^2','m 2','meter persegi']){assert.equal(normalizeSaleUnit(label),'m²');assert.equal(saleUnitBasis(label),'sqm');}
 for(const label of ['m lari','Meter Lari','meter_lari','linear_m'])assert.equal(saleUnitBasis(label),'linear_m');
 for(const label of ['pcs','lbr','pack','set','box','paket','rim','lembar','Botol'])assert.equal(saleUnitBasis(label),'unit');
 assert.deepEqual(normalizeSaleUnitOptions(['M2','m²','pcs','PCS','Meter Lari','m lari']),['m²','pcs','m lari']);
});
test('sale unit wins over forged price basis; unit products ignore stale dimensions and fixed variants keep their own price',()=>{
 for(const saleUnit of ['pcs','lbr','pack','set','box','paket']){
  const p={...basic,saleUnit,priceBasis:'sqm'},line=calculateLine(p,{quantity:3,width:999,length:999,imageWidthCm:-1,imageLengthCm:-1,allowanceCm:99,baseTotal:1});assert.equal(line.priceBasis,'unit');assert.equal(line.baseTotal,30000);assert.equal(line.materials[0].units,3);assert.equal(line.width,1);assert.equal(line.actualLength,1);assert.deepEqual(saleUnitProduct(p).widths,[]);
 }
 const area=calculateLine({...basic,saleUnit:'m2',priceBasis:'unit'},{width:2,length:1.1,quantity:3});assert.equal(area.billedLength,1.5);assert.equal(area.baseTotal,90000);assert.equal(area.materials[0].units,9);
 const meter=calculateLine({...basic,saleUnit:'Meter Lari',priceBasis:'unit'},{width:2,length:1.1,quantity:3});assert.equal(meter.baseTotal,45000);assert.equal(meter.materials[0].units,4.5);
 const p={...basic,saleUnit:'m²',priceBasis:'unit',fixedSizeVariants:[{id:'a1',label:'A1',price:125000,area:.5}]};assert.equal(calculateLine(p,{sizeVariantId:'a1',quantity:2}).baseTotal,250000);
 assert.equal(calculateOrder([{...basic,saleUnit:'pcs',priceBasis:'sqm'}],[{productId:'p',quantity:2,width:2,length:100}]).total,20000);
});
test('legacy catalog migration preserves the actual old pricing basis, all prices, invoices, stock and wholesale thresholds',()=>{
 const state={products:[{...basic,id:'a',saleUnit:'pcs',priceBasis:'sqm',priceTiers:[{min:10,max:20,price:9000}],wholesaleBasis:'quantity'},{...basic,id:'b',saleUnit:'m2',unitName:'pcs',priceBasis:'unit'},{...basic,id:'c',saleUnit:'Meter Lari',priceBasis:'linear_m'}],orders:[{total:123,items:[{subtotal:123,width:99,priceBasis:'sqm'}]}],inventory:[{quantity:7}],catalogOptions:{saleUnits:['m2','m²','pcs']}};
 const before=structuredClone(state);assert(migrateSaleUnitPricing(state));assert.equal(state.products[0].saleUnit,'m²');assert.equal(state.products[0].priceBasis,'sqm');assert.equal(state.products[1].saleUnit,'pcs');assert.equal(state.products[1].priceBasis,'unit');assert.equal(state.products[1].unitName,'pcs');assert.equal(state.products[1].unitLabel,'/pcs');assert.equal(state.products[2].saleUnit,'m lari');assert.deepEqual(state.orders,before.orders);assert.deepEqual(state.inventory,before.inventory);assert.deepEqual(state.products[0].priceTiers,before.products[0].priceTiers);assert.equal(state.products[0].wholesaleBasis,'quantity');assert.equal(state.products[0].price,before.products[0].price);const once=structuredClone(state);assert.equal(migrateSaleUnitPricing(state),false);assert.deepEqual(state,once);
});
test('all seeded products retain pricing and specialized A1/DTF/roll rules after unit resolution',async()=>{
 const store=new Store();await store.init();const state=await store.read();assert(state.products.length>250);for(const p of state.products)assert.equal(saleUnitBasis(p.saleUnit),p.priceBasis,p.id);
 const p=state.products.find(p=>p.id==='poster-albatros');assert.equal(calculateLine(p,{sizeVariantId:'a1',quantity:2}).baseTotal,200000);
 const dtf=state.products.find(p=>p.dtfShirt);assert.equal(saleUnitBasis(dtf.saleUnit),'unit');
});
