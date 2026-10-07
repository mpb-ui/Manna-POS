import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLine } from '../lib/domain.js';
import { PRODUCTS } from '../lib/store.js';
const product = PRODUCTS.find(item => item.id === 'fl-280-glossy');
test('ukuran gambar cm tetap memakai lebar bahan dan panjang ditagihkan untuk harga dan stok', () => {
  const input = { width: 1, length: 1.2, quantity: 2, finishing: [] };
  const legacy = calculateLine(product, input);
  const line = calculateLine(product, { ...input, imageWidthCm: 80, imageLengthCm: 120 });
  assert.equal(line.imageWidthCm, 80); assert.equal(line.imageLengthCm, 120);
  assert.equal(line.actualLength, 1.2); assert.equal(line.billedLength, 1.5);
  assert.equal(line.baseTotal, legacy.baseTotal); assert.equal(line.stockConsumption, legacy.stockConsumption);
  assert.deepEqual(line.materials, legacy.materials);
  assert.equal(calculateLine(product, { ...input, imageWidthCm: 50, imageLengthCm: 120 }).baseTotal, line.baseTotal);
});
test('panjang gambar menjadi sumber panjang aktual dan ukuran invalid ditolak', () => {
  assert.equal(calculateLine(product, { width: 1, length: 99, quantity: 1, imageWidthCm: 80, imageLengthCm: 120 }).billedLength, 1.5);
  for (const size of [{imageWidthCm: -1,imageLengthCm:120},{imageWidthCm:80,imageLengthCm:0},{imageWidthCm:80},{imageWidthCm:80,imageLengthCm:'invalid'}]) {
    assert.throws(() => calculateLine(product, {width:1,length:1,quantity:1,...size}), /Ukuran gambar tidak valid/);
  }
});
test('finishing identik digabung sebelum tingkat grosir dihitung', () => {
  const finish = { id: 'combined', name: 'Finishing', price: 2500, rule: 'point', wholesaleEnabled: true, priceTiers: [{min:4,max:null,price:2000}] };
  const line = calculateLine({...product,finishing:[finish]}, {width:1,length:1,quantity:1,finishing:[{id:finish.id,units:2,note:'A'},{id:finish.id,units:2,note:'B'}]});
  assert.equal(line.finishing.length, 1); assert.equal(line.finishing[0].units,4); assert.equal(line.finishingTotal,8000); assert.equal(line.finishing[0].note,'A; B');
});
