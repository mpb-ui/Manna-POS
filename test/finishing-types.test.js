import test from 'node:test';
import assert from 'node:assert/strict';
import { finishingType, validateFinishingType, groupFinishingTypes, initializeFinishingTypes } from '../public/finishing-types.js';
import { calculateLine } from '../lib/domain.js';

test('legacy names group as cutting, laminating or finishing; an explicit type survives renaming',()=>{
 for(const name of ['Cutting Pisau Max 8 Pcs','Cutting Pisau Max 36 Pcs','Die Cut','Cutting Diecut Sticker','Cutting Kisscut Sticker','Potong Pas Gambar','Rounded Kartu Nama','Sudut Bulat'])assert.equal(finishingType({name}),'CUTTING',name);
 for(const name of ['Laminating A3','Laminating A4','Laminasi Doff 1 Sisi','Laminasi Doff 2 Sisi','Laminasi Glossy 1 Sisi','Laminasi Glossy 2 Sisi'])assert.equal(finishingType({name}),'LAMINATING',name);
 for(const name of ['Perforasi','Rit','Transfer Sticker','Seaming Lem','Ring Mata Ayam','Fee Design Nota','Lebihan'])assert.equal(finishingType({name}),'FINISHING',name);
 assert.equal(finishingType({name:'Laminating',type:'CUTTING'}),'CUTTING');assert.equal(finishingType({id:'fin-a3-lam-gloss-1',name:'Custom'}),'LAMINATING');
 assert.equal(validateFinishingType(undefined,'CUTTING'),'CUTTING');for(const value of [null,'','OTHER',1,{}])assert.throws(()=>validateFinishingType(value),/Pilih tipe/);
});
test('groups keep a stable type order, every original item, selection identity and all prices',()=>{
 const rows=[{id:'f',name:'Rit',price:500},{id:'l',name:'Laminasi',price:1500},{id:'c2',name:'Cutting 36',price:1500},{id:'c1',name:'Cutting 8',price:500}],before=structuredClone(rows);
 const groups=groupFinishingTypes(rows);assert.deepEqual(groups.map(g=>g.id),['CUTTING','LAMINATING','FINISHING']);assert.deepEqual(groups[0].items.map(f=>f.id),['c2','c1']);assert.strictEqual(groups[0].items[0],rows[2]);assert.deepEqual(rows,before);assert.deepEqual(groupFinishingTypes([]),[]);assert.equal(groupFinishingTypes([rows[0]]).length,1);
});
test('classification leaves prices, wholesale, material usage, order snapshots and inventory unchanged',()=>{
 const product={id:'p',name:'Produk',saleUnit:'pcs',priceBasis:'unit',price:10000,finishing:[{id:'cut',name:'Cutting',price:500,rule:'free',priceTiers:[{min:3,max:null,price:400}],materialId:'m',cost:20}],materialSources:[]};
 const state={finishings:structuredClone(product.finishing),products:[product],orders:[{total:123,payments:[{amount:123}],items:[{finishing:[{name:'Cutting',subtotal:123}]}]}],inventory:[{quantity:50}]},before=structuredClone(state),input={quantity:2,finishing:[{id:'cut',units:3}]};const quote=calculateLine(product,input);
 initializeFinishingTypes(state);assert.equal(state.finishings[0].type,'CUTTING');assert.equal(product.finishing[0].type,'CUTTING');assert.deepEqual(calculateLine(product,input),quote);assert.deepEqual(state.orders,before.orders);assert.deepEqual(state.inventory,before.inventory);assert.deepEqual(state.finishings[0].priceTiers,before.finishings[0].priceTiers);
 const once=structuredClone(state);initializeFinishingTypes(state);assert.deepEqual(state,once);
});
