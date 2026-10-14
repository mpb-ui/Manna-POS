import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingShirtStock, validateShirtSelection } from '../public/dtf-stock-selection.js';

const productId = 'dtf-sablon-kaos';
const stock = [
  {color:'Hitam',size:'M',materialId:'black-m',available:5},
  {color:'Hitam',size:'L',materialId:'black-l',available:0},
  {color:'Putih',size:'M',materialId:'white-m',available:3}
];
const variants = (quantity=1,size='M',color='Hitam') => [{color,size,quantity}];

test('pilihan kaos menolak stok nol, jumlah berlebih/tidak valid dan duplikasi sebelum tambah keranjang',()=>{
 assert.equal(validateShirtSelection(variants(1,'L'),stock).valid,false);
 assert.match(validateShirtSelection(variants(1,'L'),stock).message,/habis/);
 assert.match(validateShirtSelection(variants(6),stock).message,/tersedia 5 pcs, diminta 6 pcs/);
 for(const quantity of [0,-1,1.5,NaN,Infinity])assert.equal(validateShirtSelection(variants(quantity),stock).valid,false);
 assert.equal(validateShirtSelection([],stock).valid,false);
 assert.equal(validateShirtSelection(variants(5),stock).valid,true);
 assert.equal(validateShirtSelection([...variants(1),...variants(2)],stock).rows[0].kind,'duplicate');
 assert.equal(validateShirtSelection(variants(1,'S'),stock).valid,false);
});

test('stok dropdown dikurangi isi keranjang lintas paket tanpa mengubah stok server atau harga',()=>{
 const cart=[{productId,dtfPackageId:'logo',shirtVariants:variants(2),subtotal:190000},{productId,dtfPackageId:'a3-a3',shirtVariants:variants(1),subtotal:145000},{productId:'paper',shirtVariants:variants(99)}];
 const before=structuredClone({stock,cart});const remaining=remainingShirtStock(stock,cart,productId);
 assert.equal(remaining[0].available,2);assert.equal(remaining[2].available,3);
 assert.equal(validateShirtSelection(variants(3),remaining).valid,false);
 assert.equal(validateShirtSelection(variants(2),remaining).valid,true);
 assert.deepEqual({stock,cart},before);
 assert.equal(remainingShirtStock(stock,[{productId,shirtVariants:variants(8)}],productId)[0].available,0);
});

test('dua ukuran yang dipetakan ke bahan fisik sama tidak dapat memakai saldo dua kali',()=>{
 const shared=[{color:'Hitam',size:'M',materialId:'same',available:5},{color:'Putih',size:'S',materialId:'same',available:5}];
 const remaining=remainingShirtStock(shared,[{productId,shirtVariants:variants(3)}],productId);assert.deepEqual(remaining.map(row=>row.available),[2,2]);
 assert.equal(validateShirtSelection([...variants(),...variants(1,'S','Putih')],remaining).valid,false);
});

test('perubahan warna menggunakan saldo warna baru, dan data stok hilang tidak membolehkan tambah',()=>{
 assert.equal(validateShirtSelection(variants(4,'M','Putih'),stock).valid,false);
 assert.equal(validateShirtSelection(variants(3,'M','Putih'),stock).valid,true);
 assert.equal(validateShirtSelection(variants(),[]).valid,false);
 assert.equal(validateShirtSelection(variants(),[{...stock[0],available:Infinity}]).valid,false);
});
