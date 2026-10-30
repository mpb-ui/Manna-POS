import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLine, calculateOrder, isDiscountActive } from '../lib/domain.js';
import { availableVariants, copyTierRanges, mergeMaterialSources, promoDate, promoDateBoundary, variantCardName } from '../public/product-variants.js';

test('promo dates include the whole WITA day, allow a single day and reject invalid calendar dates',()=>{
  assert.equal(promoDateBoundary('2026-10-30'),'2026-10-29T16:00:00.000Z');
  assert.equal(promoDateBoundary('2026-10-30',true),'2026-10-30T15:59:59.999Z');
  const product={discount:{enabled:true,value:20,startsAt:promoDateBoundary('2026-10-30'),endsAt:promoDateBoundary('2026-10-30',true)}};
  assert.equal(isDiscountActive(product,new Date('2026-10-29T15:59:59.999Z')),false);
  assert.equal(isDiscountActive(product,new Date('2026-10-29T16:00:00Z')),true);
  assert.equal(isDiscountActive(product,new Date('2026-10-30T15:59:59.999Z')),true);
  assert.equal(isDiscountActive(product,new Date('2026-10-30T16:00:00Z')),false);
  for(const date of ['2026-02-30','2026-13-01','30/10/2026'])assert.throws(()=>promoDateBoundary(date));
  assert.equal(promoDate('2026-10-29T17:00:00Z'),'2026-10-30');
});
test('wholesale copy carries only ranges, remains independent, and preserves open ended ranges',()=>{
  const first=[{min:1,max:9,price:65000},{min:10,max:49,price:60000},{min:50,max:null,price:55000}];
  const copy=copyTierRanges(first);assert.deepEqual(copy,first.map(t=>({...t,price:''})));
  copy[0].min=2;copy[0].price=10000;assert.equal(first[0].min,1);assert.equal(first[0].price,65000);
});
test('legacy common and variant material usage combine once without losing waste quantities',()=>{
  const common=[{materialId:'paper',quantity:1,wastePercent:5}],variant=[{materialId:'paper',quantity:2},{materialId:'leg',quantity:1}];
  assert.deepEqual(mergeMaterialSources(common,variant).map(s=>[s.materialId,s.quantity,s.wastePercent]),[['paper',3.05,0],['leg',1,0]]);
  assert.equal(common[0].quantity,1);
});
test('variant labels and availability are independent from dimensions and prices',()=>{
  assert.equal(variantCardName({label:'Cream'},{label:'Cetak 1 Sisi'}),'Cream, Cetak 1 Sisi');
  assert.equal(variantCardName({label:''},{label:''},1,1),'Varian 2, Opsi 2');
  const p={subVariants:[{id:'one'}],materialVariants:[{id:'a',active:false,combinations:[{active:true}]},{id:'b',combinations:[{active:false}]},{id:'c',combinations:[{active:true}]}]};
  assert.deepEqual(availableVariants(p).map(v=>v.id),['c']);
});
const product={id:'variant-qa',name:'Varian Ukuran QA',productEditorVersion:1,variantType:'Varian Ukuran',saleUnit:'pcs',unitName:'pcs',priceBasis:'unit',price:65000,baseCost:5000,finishing:[],machineIds:['machine'],materialSources:[],hasMaterialVariants:true,
  materialVariants:[{id:'cream',label:'100 × 200',price:65000,active:true,materialSources:[{materialId:'old',quantity:99}],combinations:[{subVariantId:'one',price:65000,baseCost:5000,active:true,priceTiers:[{min:10,max:null,price:60000}],materialSources:[{materialId:'paper',quantity:1,cost:1000}]},{subVariantId:'two',price:75000,baseCost:7000,active:false,materialSources:[{materialId:'paper',quantity:2,cost:1000}]}]}],subVariants:[{id:'one',label:'Cetak 1 Sisi'},{id:'two',label:'Cetak 2 Sisi'}]};
test('selected combination alone determines unit price, wholesale, material quantity and HPP snapshot',()=>{
  const line=calculateLine(product,{materialVariantId:'cream',subVariantId:'one',quantity:10,width:999,length:999});
  assert.equal(line.baseTotal,600000);assert.equal(line.baseCostTotal,50000);
  assert.deepEqual(line.materials.map(m=>[m.materialId,m.units]),[['paper',10]]);assert.equal(line.width,1);
  assert.throws(()=>calculateLine(product,{materialVariantId:'cream',subVariantId:'two',quantity:1}),/tidak tersedia/);
  const p=structuredClone(product);p.materialVariants[0].combinations[0].materialSources=[];
  assert.deepEqual(calculateLine(p,{materialVariantId:'cream',subVariantId:'one',quantity:1}).materials,[]);
  p.materialVariants[0].active=false;assert.throws(()=>calculateLine(p,{materialVariantId:'cream',subVariantId:'one',quantity:1}),/tidak tersedia/);
});
test('per combination choices keep wholesale boundaries separate when measured order rows are accumulated',()=>{
  const p=structuredClone(product);p.saleUnit='m²';p.priceBasis='sqm';p.widths=[1];p.wholesaleBasis='area';p.billingIncrement=.1;
  p.materialVariants[0].combinations[1].active=true;p.materialVariants[0].combinations.forEach(c=>c.priceTiers=[{min:3,max:null,price:50000}]);
  const input={productId:p.id,materialVariantId:'cream',width:1,length:2,quantity:1};
  const separate=calculateOrder([p],[{...input,subVariantId:'one'},{...input,subVariantId:'two'}]);assert.equal(separate.total,280000);
  const combined=calculateOrder([p],[{...input,subVariantId:'one'},{...input,subVariantId:'one'}]);assert.equal(combined.total,200000);
});
