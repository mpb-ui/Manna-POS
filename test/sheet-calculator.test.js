import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHEET_PROFILES, calculateSheetLayout, calculateSheetCapacity, sheetSpecification, validateSheetProfile, cuttingMode, productSheetProfile } from '../public/sheet-calculator.js';
import { initializeSheetCalculator, validateProductCalculator } from '../lib/sheet-calculator.js';
import { calculateOrder } from '../lib/domain.js';
import { Store } from '../lib/store.js';
import { repeatQuote } from '../lib/order-assistance.js';

const input = { shape:'rectangle',widthCm:8,lengthCm:10,requestedQuantity:100,allowRotation:true };

test('empat area final, jarak, rotasi dan kebutuhan lembar menggunakan area gambar', () => {
  for (const [id,mode,capacity,sheets,width,length] of [['a3','none',12,9,28.5,41],['a3','kiss',9,12,27,39.5],['a3-plus','none',15,7,31,47],['a3-plus','die',12,9,30,45]]) {
    const p=DEFAULT_SHEET_PROFILES.find(p=>p.id===id),r=calculateSheetLayout(p,input,mode);
    assert.equal(r.capacity,capacity);assert.equal(r.sheets,sheets);assert.equal(r.areaWidthCm,width);assert.equal(r.areaLengthCm,length);
    assert.equal(r.lastSheetQuantity,100-(sheets-1)*capacity);
    const exact=calculateSheetLayout(p,{...input,widthCm:width,lengthCm:length,requestedQuantity:1},mode);
    assert.equal(exact.capacity,1);
    assert.throws(()=>calculateSheetLayout(p,{...input,widthCm:width+.01,lengthCm:length},mode),/tidak muat/);
  }
  assert.equal(calculateSheetLayout(DEFAULT_SHEET_PROFILES[1],{...input,allowRotation:false}).capacity,12);
});

test('grid integer menjaga jarak antara gambar dan batas printable pada ribuan ukuran', () => {
  for(const profile of DEFAULT_SHEET_PROFILES)for(const mode of ['none','kiss'])for(let w=10;w<=4700;w+=149)for(let h=10;h<=4700;h+=157){
    const aw=Math.round((mode==='none'?profile.areaWidthCm:profile.cuttingWidthCm)*1000),ah=Math.round((mode==='none'?profile.areaLengthCm:profile.cuttingLengthCm)*1000),g=profile.gapMm*100;
    const expected=Math.max(Math.floor((aw+g)/(w*10+g))*Math.floor((ah+g)/(h*10+g)),Math.floor((aw+g)/(h*10+g))*Math.floor((ah+g)/(w*10+g)));
    if(!expected){assert.throws(()=>calculateSheetLayout(profile,{...input,widthCm:w/100,lengthCm:h/100},mode));continue;}
    const r=calculateSheetLayout(profile,{...input,widthCm:w/100,lengthCm:h/100},mode);assert.equal(r.capacity,expected);
  }
});

test('profil, ukuran, lingkaran, jumlah dan identitas finishing divalidasi', () => {
  assert.throws(()=>validateSheetProfile({...DEFAULT_SHEET_PROFILES[0],cuttingWidthCm:30}),/Area gambar/);
  assert.throws(()=>validateSheetProfile({...DEFAULT_SHEET_PROFILES[0],gapMm:0}));
  for(const bad of [{requestedQuantity:0},{requestedQuantity:1.5},{widthCm:NaN},{lengthCm:.001},{shape:'triangle'}])assert.throws(()=>calculateSheetLayout(DEFAULT_SHEET_PROFILES[0],{...input,...bad}));
  const r=calculateSheetLayout(DEFAULT_SHEET_PROFILES[0],{...input,shape:'circle',lengthCm:6},'kiss');assert.equal(r.widthCm,6);assert.equal(r.rotated,false);
  assert.equal(cuttingMode([{name:'Die Cut'}]),'die');assert.equal(cuttingMode([{name:'Cutting Kisscut Sticker A3+'}]),'kiss');assert.equal(cuttingMode([{name:'Die Cut'},{name:'Kisscut'}]),'both');assert.equal(cuttingMode([{name:'Potong Manual'}]),'none');
  assert.equal(cuttingMode([{id:'fin-a3-diecut',name:'Potong Presisi'}]),'die');
});

test('migrasi profil tidak mengubah harga, stok, pembayaran dan snapshot historis', async () => {
  const store=new Store('');const state=await store.read();
  assert.equal(state.products.find(p=>p.a3Family==='HVS').sheetProfileId,'a3');
  assert.equal(state.products.find(p=>p.a3Family==='Art Paper (AP)'&&p.a3Variant==='AP 150').sheetProfileId,'a3-plus');
  assert(state.products.filter(p=>p.a3Kind==='sticker').every(p=>p.sheetProfileId==='a3-plus'));
  const product=state.products.find(p=>p.a3Kind==='paper');product.sheetCalculatorEnabled=false;
  state.orders=[{items:[{sheetCalculation:{profile:{name:'historical'}}}],total:8000,paidAmount:4000}];
  const before=structuredClone({orders:state.orders,inventory:state.inventory,prices:state.products.map(p=>p.price)});
  initializeSheetCalculator(state);assert.equal(product.sheetCalculatorEnabled,false);
  assert.deepEqual({orders:state.orders,inventory:state.inventory,prices:state.products.map(p=>p.price)},before);
});

test('profil per varian dan server menghitung quantity lembar serta harga dan stok satu kali', async () => {
  const state=await new Store('').read(),p=state.products.find(p=>p.a3Family==='Art Paper (AP)'&&p.a3Variant==='AP 150'&&p.a3Side==='1S');
  const profiles=state.catalogOptions.sheetCalculatorProfiles;
  const line={productId:p.id,quantity:7,finishing:[],sheetCalculation:{...input,capacity:999,sheets:1}};
  const quote=calculateOrder([p],[line],profiles);assert.equal(quote.total,56000);assert.equal(quote.items[0].sheetCalculation.capacity,15);assert.equal(quote.items[0].materials[0].units,7);
  assert.throws(()=>calculateOrder([p],[{...line,quantity:1}],profiles),/Jumlah lembar/);
  const historical=quote.items[0];historical.itemId='old';const changed=profiles.map(p=>({...p,areaWidthCm:p.cuttingWidthCm,areaLengthCm:p.cuttingLengthCm}));
  const repriced=calculateOrder([p],[{...line,itemId:'old'}],changed,[historical]);assert.equal(repriced.items[0].sheetCalculation.capacity,15);
  assert.throws(()=>calculateOrder([p],[line],changed),/Jumlah lembar/);
  const vp={...p,materialVariants:[{id:'custom',sheetProfileId:'a3'}]};assert.equal(productSheetProfile(vp,profiles,'custom').id,'a3');
  assert.throws(()=>validateProductCalculator({...p},state,{sheetCalculatorEnabled:true,sheetProfileId:'missing'},p),/Pilih profil/);
});

test('repeat memakai kapasitas profil terbaru dan mempertahankan jumlah lembar manual serta pesanan lama', async () => {
  const state=await new Store('').read(),p=state.products.find(p=>p.a3Family==='Art Paper (AP)'&&p.a3Variant==='AP 150'&&p.a3Side==='1S');
  const quote=calculateOrder([p],[{productId:p.id,quantity:7,sheetCalculation:input}],state.catalogOptions.sheetCalculatorProfiles);
  const order={id:'original',code:'ORIGINAL',customerName:'Customer',phone:'081234567890',items:quote.items,total:quote.total};
  const profile=state.catalogOptions.sheetCalculatorProfiles.find(p=>p.id==='a3-plus');profile.areaWidthCm=30;profile.areaLengthCm=45;
  const before=structuredClone(order);
  const repeated=repeatQuote(state,order,{role:'OWNER'});assert.equal(repeated.canRepeat,true);assert.equal(repeated.items[0].quantity,7);assert.equal(repeated.items[0].sheetCalculation.mode,'capacity');assert.equal(repeated.items[0].sheetCalculation.capacity,12);assert.equal(repeated.items[0].sheetCalculation.requestedQuantity,undefined);assert.deepEqual(order,before);
});

test('kapasitas memakai area terkecil dan tidak membutuhkan bentuk maupun pesanan pcs', () => {
  const a3=calculateSheetCapacity(DEFAULT_SHEET_PROFILES[0],{widthCm:8,lengthCm:10,allowRotation:true});
  const plus=calculateSheetCapacity(DEFAULT_SHEET_PROFILES[1],{widthCm:8,lengthCm:10,allowRotation:true});
  assert.equal(a3.capacity,9);assert.equal(a3.areaWidthCm,27);assert.equal(a3.areaLengthCm,39.5);
  assert.equal(plus.capacity,12);assert.equal(plus.areaWidthCm,30);assert.equal(plus.areaLengthCm,45);
  assert.equal(plus.profile.gapMm,3);assert.equal(a3.profile.gapMm,2);
  for(const key of ['requestedQuantity','sheets','lastSheetQuantity','cuttingMode'])assert.equal(plus[key],undefined);
  assert.doesNotMatch(sheetSpecification(plus),/cutting|100 pcs|Kebutuhan/);
  assert.match(sheetSpecification(plus),/12 pcs\/lembar/);
  assert.equal(calculateSheetCapacity(DEFAULT_SHEET_PROFILES[1],{widthCm:5,lengthCm:5}).shape,'rectangle');
});

test('snapshot kapasitas dihitung server tanpa mengubah jumlah manual, harga, atau stok karena finishing', async () => {
  const state=await new Store('').read(),p=state.products.find(p=>p.a3Family==='Art Paper (AP)'&&p.a3Variant==='AP 150'&&p.a3Side==='1S');
  const line={productId:p.id,quantity:3,finishing:[],sheetCalculation:{mode:'capacity',widthCm:8,lengthCm:10,capacity:999,areaWidthCm:100,allowRotation:true}};
  const quote=calculateOrder([p],[line],state.catalogOptions.sheetCalculatorProfiles);
  assert.equal(quote.items[0].quantity,3);assert.equal(quote.items[0].sheetCalculation.capacity,12);assert.equal(quote.total,24000);assert.equal(quote.items[0].materials[0].units,3);
  const cut=calculateOrder([p],[{...line,finishing:[{id:'fin-a3-diecut',units:1}]}],state.catalogOptions.sheetCalculatorProfiles);
  assert.equal(cut.items[0].quantity,3);assert.equal(cut.items[0].sheetCalculation.capacity,12);assert.equal(cut.items[0].materials[0].units,3);assert.equal(cut.total,quote.total+1500);
});
