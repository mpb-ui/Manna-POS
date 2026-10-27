import test from 'node:test';
import assert from 'node:assert/strict';
import { materialChoices, filterMaterials } from '../public/material-picker.js';
import { migrateDtfMerchandise } from '../lib/dtf-catalog.js';
import { seedState, Store } from '../lib/store.js';

test('material choices are A–Z/natural sorted and searchable by multiple name/SKU terms without changing values',()=>{
  const options=[{value:'',label:'Pilih bahan'},{value:'f',label:'Flexi 280 · m²'},{value:'a260',label:'Art Paper 260 · lbr'},{value:'a150',label:'Art Paper 150 · lbr'},{value:'a120',label:'Art Paper 120 · lbr',disabled:true}];
  const before=structuredClone(options),choices=materialChoices(options,[{id:'f',sku:'BHN-FL280'},{id:'a150',sku:'KRT-AP150'}]);
  assert.deepEqual(choices.map(c=>c.value),['a120','a150','a260','f']);assert(choices[0].disabled);
  assert.deepEqual(filterMaterials(choices,'paper 150').map(c=>c.value),['a150']);assert.equal(filterMaterials(choices,'bhn fl280')[0].value,'f');
  assert.equal(filterMaterials(choices,'KRT-AP150')[0].value,'a150');assert.equal(filterMaterials(choices,'not found').length,0);assert.deepEqual(options,before);
});

test('new catalog places Sablon Kaos under Merchandise with no Sablon DTF category',async()=>{
  const state=await new Store().read();assert.equal(state.products.find(p=>p.dtfShirt).category,'Merchandise');assert(!state.catalogOptions.categories.includes('Sablon DTF'));
});

test('category merge moves all source references once and preserves custom settings, material categories and historical orders',()=>{
  const state=seedState();delete state.dtfMerchandiseVersion;
  state.catalogOptions.categories=['Outdoor','Sablon DTF','Merchandise','ATK'];state.catalogOptions.categoryKeys={'Sablon DTF':'sablon-dtf',Merchandise:'custom-merch'};
  const shirt=state.products.find(p=>p.dtfShirt);shirt.category='Sablon DTF';shirt.price=123456;shirt.minimumEnabled=true;shirt.minimumQuantity=3;
  state.products.push({id:'other-shirt',category:'Sablon DTF',deletedAt:'old',price:777});
  state.finishings.push({id:'custom',categories:['Sablon DTF','Merchandise'],price:99});
  state.orders.push({id:'old',total:123,payments:[{amount:123}],items:[{category:'Sablon DTF',productId:shirt.id,subtotal:123}]});
  const before=structuredClone(state);assert.equal(migrateDtfMerchandise(state),true);
  assert.equal(shirt.price,123456);assert.equal(shirt.minimumQuantity,3);assert.equal(shirt.category,'Merchandise');assert.equal(state.products.at(-1).category,'Merchandise');
  assert.deepEqual(state.finishings.at(-1).categories,['Merchandise']);assert.equal(state.catalogOptions.categoryKeys.Merchandise,'custom-merch');
  assert.deepEqual(state.orders,before.orders);assert.deepEqual(state.inventory,before.inventory);assert.deepEqual(state.materials,before.materials);
  const migrated=structuredClone(state);assert.equal(migrateDtfMerchandise(state),false);assert.deepEqual(state,migrated);
});
