import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { calculateLine } from '../lib/domain.js';
import { repeatQuote, lastCustomerOrder } from '../lib/order-assistance.js';
import { ROLE_PRESETS } from '../lib/access.js';
import { requiredPhone } from '../public/customer-validation.js';
import { suggestedOutdoorWidth, outdoorCapacity, imageGeometry } from '../public/outdoor-sizing.js';

const state = await new Store().read();
const product = state.products.find(p => p.id === 'fl-280-glossy');
const input = {width:1,quantity:1,imageWidthCm:100,imageLengthCm:100,allowanceCm:5,finishing:[]};
const cashier = {id:'cashier',role:'CASHIER',permissions:ROLE_PRESETS.CASHIER.permissions};

test('Outdoor memakai kapasitas aktual dan memilih roll terkecil yang cukup, termasuk overflow', () => {
  for (const id of ['fl-280-glossy','fl-380-matte']) {
    const p=state.products.find(p=>p.id===id);
    assert.deepEqual(p.widths,[1,2,3]);
    for (const [cm,allowance,expected] of [[100,5,1],[100,10,2],[110,0,1],[111,0,2],[220,0,2],[221,0,3],[320,0,3],[400,10,3]]) {
      assert.equal(suggestedOutdoorWidth(p,cm,allowance),expected);
    }
    assert.deepEqual(p.widths.map(w=>outdoorCapacity(p,w)),[110,220,320]);
  }
  for (const [id,width] of [['fl-410-glossy',2],['fl-440-matte',3],['nb-backlite-510',3]]) {
    const p=state.products.find(p=>p.id===id);
    assert.deepEqual(p.widths,[width]);
    assert.equal(suggestedOutdoorWidth(p,50,0),width);
    assert.equal(suggestedOutdoorWidth(p,999,10),width);
    assert.throws(()=>calculateLine(p,{...input,width:1}),/Lebar/);
  }
  const cloth=state.products.find(p=>p.id==='cloth-banner');
  assert.deepEqual(cloth.widths,[1,1.5]);
  assert.equal(suggestedOutdoorWidth(cloth,100,0),1);
  assert.equal(suggestedOutdoorWidth(cloth,100,5),1.5);
});

test('Lebihan sampai 5 cm gratis; di atas 5 cm kedua sisi masuk pembulatan dan stock', () => {
  const free=calculateLine(product,input);
  assert.equal(free.actualLength,1);assert.equal(free.billedLength,1);
  assert.equal(free.finalImageWidthCm,110);assert.equal(free.finalImageLengthCm,110);
  assert.equal(free.imageWidthCm,100);assert.equal(free.imageLengthCm,100);
  assert.equal(free.allowanceCm,5);
  const charged=calculateLine(product,{...input,width:2,allowanceCm:10});
  assert.equal(charged.actualLength,1.2);assert.equal(charged.billedLength,1.5);
  assert.equal(charged.finalImageWidthCm,120);assert.equal(charged.finalImageLengthCm,120);
  assert.equal(charged.baseTotal,free.baseTotal*3);
  assert.equal(charged.stockConsumption,1.5);
  assert.equal(calculateLine(product,{...input,allowanceCm:5.01}).billedLength,1.5);
  assert.equal(calculateLine(product,{...input,allowanceCm:0}).baseTotal,free.baseTotal);
  assert.throws(()=>calculateLine(product,{...input,allowanceCm:-1}),/Lebihan/);
  assert.throws(()=>calculateLine(product,{...input,allowanceCm:'invalid'}),/Lebihan/);
});

test('Kasir dapat memilih lebar manual dan ukuran di atas kapasitas tidak memblokir pesanan', () => {
  const manual=calculateLine(product,{...input,width:3});
  assert.equal(manual.width,3);assert.equal(manual.baseTotal,calculateLine(product,input).baseTotal*3);
  const oversize=calculateLine(product,{...input,width:3,imageWidthCm:400,allowanceCm:10});
  assert.equal(oversize.finalImageWidthCm,420);assert.equal(oversize.width,3);
  const indoor=state.products.find(p=>p.id==='poster-albatros');
  const geometry=imageGeometry(indoor,{...input,allowanceCm:20});
  assert.equal(geometry.allowanceCm,0);assert.equal(geometry.billingLength,1);
});

test('Migrasi opsi Outdoor tidak mengubah harga, BOM, stok atau snapshot lama dan hanya berjalan sekali', async () => {
  const store=new Store();store.memory.catalogVersion=15;
  const old=store.memory.products.find(p=>p.id==='fl-410-glossy');
  old.widths=[1,2];old.price=12345;old.note='Custom';
  old.materialSources=[{materialId:'mat-fl410',quantity:2,wastePercent:3}];
  const historical={id:'old',status:'SELESAI',items:[{productId:old.id,width:1,total:12345}]};
  store.memory.orders.push(historical);
  const inventory=structuredClone(store.memory.inventory),bom=structuredClone(old.materialSources);
  await store.mutate(()=>{});
  const migrated=await store.read(),updated=migrated.products.find(p=>p.id===old.id);
  assert.equal(migrated.catalogVersion,16);assert.deepEqual(updated.widths,[2]);
  assert.equal(updated.price,12345);assert.equal(updated.note,'Custom');
  assert.deepEqual(updated.materialSources.map(({materialId,quantity,wastePercent})=>({materialId,quantity,wastePercent})),bom);
  assert.deepEqual(migrated.inventory,inventory);const { designPicColor, items, ...snapshot } = migrated.orders[0];
  assert.deepEqual(snapshot, { id: historical.id, status: historical.status });
  const { itemId, status, designPic, designPicId, designPicColor: itemColor, deadline, statusEnteredAt, updatedAt, ...pricedSnapshot } = items[0];
  assert.deepEqual(pricedSnapshot, historical.items[0]);
  assert.equal(itemId, 'old-item-1'); assert.equal(status, historical.status);
  await store.mutate(s=>{s.products.find(p=>p.id===old.id).widths=[2,3];});
  assert.deepEqual((await store.read()).products.find(p=>p.id===old.id).widths,[2,3]);
});

test('Repeat order menyimpan lebihan dan ukuran asli serta menyesuaikan opsi lama yang tidak lagi tersedia', () => {
  const line=calculateLine(product,{...input,allowanceCm:10,width:2});
  const source={id:'source',code:'SOURCE',customerName:'Tes',phone:'8988',total:line.subtotal,items:[line]};
  const repeat=repeatQuote(state,source,cashier);
  assert.equal(repeat.canRepeat,true);assert.equal(repeat.inputs[0].allowanceCm,10);
  assert.equal(repeat.items[0].finalImageLengthCm,120);assert.equal(repeat.items[0].imageLengthCm,100);
  assert.equal(repeat.items[0].billedLength,1.5);
  const legacy={...line,productId:'fl-410-glossy',width:1};
  const adapted=repeatQuote(state,{...source,items:[legacy]},cashier);
  assert.equal(adapted.canRepeat,true);assert.equal(adapted.inputs[0].width,2);
  assert.equal(legacy.width,1);
});

test('WhatsApp wajib terisi namun teks pendek/bebas diterima dan repeat tidak mencampur identitas', () => {
  for (const phone of ['8988','1','abc','+628123456789','customer 123','  8988  ']) assert.equal(requiredPhone(phone),phone.trim());
  for (const phone of ['',null,undefined,'   ']) assert.throws(()=>requiredPhone(phone),/WhatsApp wajib/);
  const order=(id,phone)=>({id,phone,code:id,customerName:'Tes',status:'DESAIN',confirmed:true,createdAt:'2026-10-07T00:00:00Z',items:[{productName:'Print'}]});
  const s={orders:[order('one','customer 123'),order('two','other 123'),order('short','8988'),order('punctuation','---')]};
  assert.equal(lastCustomerOrder(s,cashier,'Tes','customer 123').order.id,'one');
  assert.equal(lastCustomerOrder(s,cashier,'Tes','8988').order.id,'short');
  assert.equal(lastCustomerOrder(s,cashier,'Tes','---').order.id,'punctuation');
});
