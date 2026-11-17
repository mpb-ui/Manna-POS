import test from 'node:test';
import assert from 'node:assert/strict';
import {A3_TABS,a3Choices,a3QuickProducts,a3QuickCount} from '../public/a3-selection.js';
import {initializeA3Presentation,productA3Settings} from '../lib/a3-presentation.js';
import {Store} from '../lib/store.js';
import {PAPER_PRODUCT_TABS,paperProductTab} from '../public/paper-product-tabs.js';

test('A3 lists only paper and sticker while preserving the legacy paper families',()=>{
 const products=[{id:'legacy1',name:'Art Paper 1',a3Kind:'paper',a3Family:'Art Paper'},{id:'legacy2',name:'Art Paper 2',a3Kind:'paper',a3Family:'Art Paper'},
  {id:'new',name:'Custom Paper',a3Kind:'paper'},{id:'old',name:'Old Paper'},{id:'ready',name:'Brosur',a3Kind:'ready',a3Family:'Brosur'},{id:'disabled',name:'Hidden',active:false}];
 assert.deepEqual(a3Choices(products,'paper').map(c=>c.value),['family:Art Paper','product:new','product:old']);
 assert.deepEqual(A3_TABS,[['paper','Kertas'],['sticker','Sticker']]);
 assert.deepEqual(a3Choices(products,'ready'),[]);
 products.forEach(p=>p.a3Popular=true);assert.equal(a3QuickProducts(products,'paper').length,4);assert.equal(a3QuickCount(products,'paper','new'),4);
});
test('editable shortcut defaults initialize once and leave prices, old classification, orders and stock untouched',async()=>{
 const store=new Store();const state=await store.read();delete state.a3QuickPicksVersion;for(const p of state.products)delete p.a3Popular;const prior=structuredClone(state);initializeA3Presentation(state);
 for(const key of ['orders','inventory','stockMovements'])assert.deepEqual(state[key],prior[key]);
 assert.equal(a3QuickProducts(state.products,'paper').length,3);assert.equal(a3QuickProducts(state.products,'sticker').length,3);
 for(const p of state.products)if(p.a3Popular)p.a3Popular=false;
 const after=structuredClone(state);initializeA3Presentation(state);assert.deepEqual(state,after);
 const old=state.products.find(p=>p.id==='business-card');assert.equal(old.a3Kind,prior.products.find(p=>p.id==='business-card').a3Kind);
});
test('tab settings respect renamed categories, preserve false, reject a fifth pick and clear legacy metadata on tab changes',()=>{
 const state={catalogOptions:{categoryKeys:{'Cetak A3':'print-a3',Merchandise:'merchandise'}},products:Array.from({length:4},(_,i)=>({id:String(i),category:'Cetak A3',a3Kind:'paper',a3Popular:true}))};
 assert.throws(()=>productA3Settings(state,{a3Kind:'paper',a3Popular:true},null,'Cetak A3'),error=>error.code==='A3_QUICK_LIMIT');
 assert.equal(productA3Settings(state,{a3Kind:'paper',a3Popular:false},null,'Cetak A3').a3Popular,false);
 assert.equal(productA3Settings(state,{a3Kind:'sticker',a3Popular:true},null,'Cetak A3').a3Kind,'sticker');
 assert.equal(productA3Settings(state,{a3Kind:'paper',a3Popular:true},state.products[0],'Cetak A3').a3Popular,true);
 assert.equal(productA3Settings(state,{},state.products[0],'Merchandise').a3Popular,false);
 assert.throws(()=>productA3Settings(state,{a3Kind:'unknown'},null,'Cetak A3'),/Pilih tab/);
 assert.throws(()=>productA3Settings(state,{a3Kind:'ready'},null,'Cetak A3'),/Kertas atau Sticker/);
 const old={id:'paper',category:'Cetak A3',a3Kind:'paper',a3Family:'HVS'};
 assert.equal(productA3Settings(state,{a3Kind:'sticker'},old,'Cetak A3').preserveLegacy,false);
 assert.equal(productA3Settings(state,{},old,'Cetak A3').preserveLegacy,true);
});


test('Produk Kertas has six tabs and classifies existing products without overwriting manual choices',()=>{
 const category='Produk Kertas';
 assert.deepEqual(PAPER_PRODUCT_TABS.map(([,label])=>label),['Kartu Nama','Brosur','Nota','Tent Card','Map Folder','Voucher']);
 for(const [name, tab] of [
   ['Kartu Nama AP260','kartu-nama'],['[RIM] Brosur A3','brosur'],['PAKET Brosur A3','brosur'],
   ['Nota 2 Ply','nota'],['[RIM] Buku Nota 1/2 Folio 1PLY','nota'],
   ['[3Pcs] Tent Card A6','tent-card'],['[5 Pcs] Map Folder A4','map-folder'],['Voucher Pad AP150','voucher'],
   ['[5 PAD] Karcis Pad HVS/BW',null],['Brosurlain',null]
 ]) assert.equal(paperProductTab({category,name}),tab);
 assert.equal(paperProductTab({category,name:'Brosur A3',paperProductTab:'voucher'}),'voucher');
 assert.equal(paperProductTab({category:'Print A3+',name:'Voucher Pad AP150'}),null);
});
