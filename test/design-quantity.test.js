import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLine, FILE_SERVICES } from '../lib/domain.js';
import { PRODUCTS } from '../lib/store.js';
const product = PRODUCTS.find(p => p.id === 'poster-albatros');
const base = { width: 0.9, length: 1, quantity: 1, finishing: [] };
for (const service of FILE_SERVICES.filter(s => s.price)) {
 test(`${service.name}: harga dikalikan jumlah design, terpisah dari jumlah cetak`, () => {
  const line = calculateLine(product, { ...base, quantity: 10, fileServiceId: service.id, fileServiceQuantity: 3, fileServiceNote: '  Revisi logo  ' });
  assert.equal(line.fileServiceTotal, service.price * 3);
  assert.equal(line.fileService.quantity, 3);
  assert.equal(line.fileService.note, 'Revisi logo');
  assert.equal(line.subtotal, line.baseTotal + line.finishingTotal + service.price * 3);
  assert.equal(calculateLine(product, { ...base, fileServiceId: service.id }).fileServiceTotal, service.price);
 });
}
test('File Siap Cetak mengabaikan jumlah dan catatan design yang tidak aktif', () => {
 const line = calculateLine(product, { ...base, fileServiceId: 'READY', fileServiceQuantity: 10, fileServiceNote: 'lama' });
 assert.equal(line.fileServiceTotal, 0);assert.equal(line.fileService.quantity, 1);assert.equal(line.fileService.note, '');
});
test('jumlah design menolak nilai pecahan, nol, negatif dan bukan angka', () => {
 for (const quantity of [0, -1, 1.5, 'abc', Infinity]) assert.throws(() => calculateLine(product, { ...base, fileServiceId: 'DESIGN_A', fileServiceQuantity: quantity }), /bilangan bulat/);
});
