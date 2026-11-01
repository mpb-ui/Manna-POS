import test from 'node:test';
import assert from 'node:assert/strict';
import { productSearchIndex, matchingProducts } from '../public/pos-search.js';

test('global product search is case insensitive and keeps all matches beyond seven', () => {
  const products = [...Array.from({ length: 10 }, (_, i) => ({ id: `fl-${i}`, name: `FL ${280 + i} Glossy`, category: 'Outdoor' })), { id: 'flash', name: 'Stempel Flash Ink', category: 'Stempel' }, { id: 'paper', name: 'Art Paper', category: 'Print A3+' }, { id: 'inactive', name: 'FL discontinued', category: 'Outdoor', active: false }];
  const index = productSearchIndex(products);
  const matches = matchingProducts(index, ' FL ');
  assert.equal(matches.length, 11);
  assert.equal(matches.at(-1).id, 'flash');
  assert(!matches.some(p => p.id === 'inactive'));
  assert.deepEqual(matchingProducts(index, 'flash').map(p => p.id), ['flash']);
  assert.deepEqual(matchingProducts(index, 'tidak ada'), []);
  assert.deepEqual(matchingProducts(index, ''), []);
});

test('one global search retains SKU and barcode lookup formerly provided by local catalog searches',()=>{
 const products=[{id:'pen',name:'Bolpen Faster Biru',category:'ATK',sku:'ATK-F600-BLU',barcode:'00123456789'},{id:'stamp',name:'Stempel Bulat',category:'Stempel',sku:'ST-D12'},{id:'inactive',name:'Archived',sku:'OLD',active:false}];
 const index=productSearchIndex(products);assert.deepEqual(matchingProducts(index,'atk-f600').map(p=>p.id),['pen']);assert.deepEqual(matchingProducts(index,'00123456789').map(p=>p.id),['pen']);assert.deepEqual(matchingProducts(index,'st-d12').map(p=>p.id),['stamp']);assert.deepEqual(matchingProducts(index,'old'),[]);
});
