import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLine, calculateOrder } from '../lib/domain.js';
import { Store } from '../lib/store.js';
import { normalizeMinimum, minimumError, normalizeProductTiers, normalizeWholesaleBasis, candidateRollPrice } from '../public/product-pricing.js';
import { wholesalePriceRows, effectivePriceTiers } from '../public/wholesale-prices.js';

const state=await new Store().read();
const poster=()=>({...structuredClone(state.products.find(p=>p.id==='poster-luster')),price:150000,wholesaleEnabled:true,wholesaleBasis:'area',priceTiers:[{min:5,max:null,price:140000},{min:10,max:null,price:130000}]});
const input=(w,h,q=1,extra={})=>({productId:'poster-luster',imageWidthCm:w,imageLengthCm:h,quantity:q,...extra});

test('area tiers use nominal rounded billing area, preserve original image and charge design/finishing separately',()=>{
  const p=poster(),line=calculateLine(p,input(100,200,3,{fileServiceId:'DESIGN_A'}));
  assert.equal(line.width,1.2);assert.equal(line.wholesaleQuantity,7.2);assert.equal(line.unitPrice,140000);assert.equal(line.baseTotal,1008000);assert.equal(line.subtotal,1033000);
  assert.equal(line.rollPlacement.usedArea,2.5);assert.equal(line.imageWidthCm,100);
  const fixed=calculateLine(p,{sizeVariantId:'a1',quantity:20});assert.equal(fixed.unitPrice,125000);assert.equal(fixed.baseTotal,2500000);assert.equal(effectivePriceTiers(p,p.fixedSizeVariants[0]).length,0);
  p.discount={enabled:true,type:'percent',value:10};assert.equal(calculateLine(p,input(100,200,3)).unitPrice,126000);
});

test('same product/variant areas accumulate across different sizes, reprice every row and ignore forged quantities',()=>{
  const p=poster(),lines=[input(100,200),input(90,150,2,{wholesaleQuantity:999999,baseTotal:1})];
  const quote=calculateOrder([p],lines), reversed=calculateOrder([p],[...lines].reverse());
  assert.equal(quote.items[0].wholesaleQuantity,5.1);assert(quote.items.every(l=>l.unitPrice===140000));assert.equal(quote.total,714000);assert.equal(reversed.total,quote.total);
  const own=calculateOrder([p],[lines[0]]);assert.equal(own.items[0].unitPrice,150000);
  const other={...p,id:'other'};const separate=calculateOrder([p,other],[lines[0],{...lines[1],productId:'other'}]);assert(separate.items.every(l=>l.unitPrice===150000));
});

test('variant, combination and fixed-size boundaries keep independent measured wholesale groups',()=>{
  const p=poster();p.hasMaterialVariants=true;p.materialVariants=['white','cream'].map(id=>({id,label:id,price:150000,materialSources:[],priceTiers:p.priceTiers}));
  const quote=calculateOrder([p],[input(100,200,2,{materialVariantId:'white'}),input(100,200,2,{materialVariantId:'cream'})]);assert(quote.items.every(l=>l.unitPrice===150000));
  const combined=calculateOrder([p],[input(100,200,2,{materialVariantId:'white'}),input(90,150,1,{materialVariantId:'white'})]);assert(combined.items.every(l=>l.unitPrice===140000));
  p.subVariants=[{id:'one',label:'1 sisi'},{id:'two',label:'2 sisi'}];
  p.materialVariants[0].combinations=p.subVariants.map(v=>({subVariantId:v.id,active:true,priceTiers:p.priceTiers}));
  const split=calculateOrder([p],[input(100,200,2,{materialVariantId:'white',subVariantId:'one'}),input(100,200,2,{materialVariantId:'white',subVariantId:'two'})]);
  assert(split.items.every(l=>l.unitPrice===150000));
});

test('legacy quantity tiers stay quantity-based; meter tiers use rounded length with no width multiplier',()=>{
  const p=poster();delete p.wholesaleBasis;p.priceTiers=[{min:2,max:4,price:100000}];assert.equal(calculateLine(p,input(100,200,1)).unitPrice,150000);assert.equal(calculateLine(p,input(100,200,2)).unitPrice,100000);
  const cloth={...state.products.find(p=>p.id==='cloth-banner'),wholesaleBasis:'length',wholesaleEnabled:true,priceTiers:[{min:3,price:10000}]};
  const line=calculateLine(cloth,{imageWidthCm:100,imageLengthCm:200,quantity:2});assert.equal(line.wholesaleQuantity,4);assert.equal(line.baseTotal,40000);
});

test('roll comparison prices evaluate each candidate at its own measured tier and promo',()=>{
  const p=poster();p.priceTiers[1].min=8;
  const line=calculateLine(p,input(100,200,3));assert.equal(line.unitPrice,140000);
  assert.equal(candidateRollPrice(p,line,{billingUnits:3}),1170000);
  p.discount={enabled:true,type:'percent',value:10};
  assert.equal(candidateRollPrice(p,calculateLine(p,input(100,200,3)),{billingUnits:3}),1053000);
});

test('continuous measured thresholds, displayed ranges and invalid master inputs are handled without gaps',()=>{
  const tiers=normalizeProductTiers([{min:5,price:140000},{min:10,price:130000}],'area');assert.equal(tiers[0].max,null);
  assert.deepEqual(wholesalePriceRows(tiers,150000,'area').map(r=>[r.min,r.max,r.exclusive]),[[0,5,true],[5,10,true],[10,null,true]]);
  for(const value of [0,-1,NaN,Infinity])assert.throws(()=>normalizeProductTiers([{min:value,price:1}],'area'));
  assert.throws(()=>normalizeProductTiers([{min:5,price:1},{min:5,price:2}],'area'));
  assert.throws(()=>normalizeProductTiers([{min:1.5,price:1}],'quantity'));
  assert.throws(()=>normalizeWholesaleBasis('area','unit'));
  const p=poster();for(const [area,price] of [[4.9999,150000],[5,140000],[9.9999,140000],[10,130000]]){
    p.widths=[1];p.rollCapacities={1:100};p.billingIncrement=.0001;
    assert.equal(calculateLine(p,input(100,area*100)).unitPrice,price);
  }
});

test('minimum toggle validates whole quantities while allowing every integer above the minimum',()=>{
  const p={...poster(),priceBasis:'unit',fixedSizeVariants:[],minimumEnabled:true,minimumQuantity:3,unitName:'pcs'};
  for(const q of [0,1,2,2.9,NaN,Infinity])assert.throws(()=>calculateLine(p,{quantity:q}),/Minimum pembelian 3/);
  for(const q of [3,4,5])assert.equal(calculateLine(p,{quantity:q}).quantity,q);
  assert.equal(minimumError({...p,minimumEnabled:false},1),'');assert.equal(normalizeMinimum({minimumEnabled:false,minimumQuantity:3}).minimumQuantity,1);
  for(const n of [0,1.5,Infinity])assert.throws(()=>normalizeMinimum({minimumEnabled:true,minimumQuantity:n}));
  assert.equal(normalizeMinimum({},p).minimumQuantity,3);
  const dtf={...state.products.find(p=>p.dtfShirt),minimumEnabled:true,minimumQuantity:3};
  const dtfInput={dtfPackageId:dtf.dtfPackages[0].id,shirtVariants:[{color:'Hitam',size:'S',quantity:2}]};
  assert.throws(()=>calculateLine(dtf,dtfInput),/Minimum pembelian 3/);
  dtfInput.shirtVariants.push({color:'Putih',size:'S',quantity:1});assert.equal(calculateLine(dtf,dtfInput).quantity,3);
});
