import test from 'node:test';
import assert from 'node:assert/strict';
import {a3Choices,a3QuickProducts,a3QuickCount} from '../public/a3-selection.js';
import {initializeA3Presentation,productA3Settings} from '../lib/a3-presentation.js';
import {Store} from '../lib/store.js';

test('A3 choices combine legacy families and new products without missing labels or duplicate ready products',()=>{
 const products=[{id:'legacy1',name:'Art Paper 1',a3Kind:'paper',a3Family:'Art Paper'},{id:'legacy2',name:'Art Paper 2',a3Kind:'paper',a3Family:'Art Paper'},
  {id:'new',name:'Custom Paper',a3Kind:'paper'},{id:'old',name:'Old Paper'},{id:'ready',name:'Brosur',a3Kind:'ready',a3Family:'Brosur'},{id:'disabled',name:'Hidden',active:false}];
 assert.deepEqual(a3Choices(products,'paper').map(c=>c.value),['family:Art Paper','product:new','product:old']);
 assert.deepEqual(a3Choices(products,'ready').map(c=>c.value),['product:ready']);
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
 const state={catalogOptions:{categoryKeys:{'Cetak A3':'print-a3',Merchandise:'merchandise'}},products:Array.from({length:4},(_,i)=>({id:String(i),category:'Cetak A3',a3Kind:'ready',a3Popular:true}))};
 assert.throws(()=>productA3Settings(state,{a3Kind:'ready',a3Popular:true},null,'Cetak A3'),error=>error.code==='A3_QUICK_LIMIT');
 assert.equal(productA3Settings(state,{a3Kind:'ready',a3Popular:false},null,'Cetak A3').a3Popular,false);
 assert.equal(productA3Settings(state,{a3Kind:'paper',a3Popular:true},null,'Cetak A3').a3Kind,'paper');
 assert.equal(productA3Settings(state,{a3Kind:'ready',a3Popular:true},state.products[0],'Cetak A3').a3Popular,true);
 assert.equal(productA3Settings(state,{},state.products[0],'Merchandise').a3Popular,false);
 assert.throws(()=>productA3Settings(state,{a3Kind:'unknown'},null,'Cetak A3'),/Pilih tab/);
 const old={id:'paper',category:'Cetak A3',a3Kind:'paper',a3Family:'HVS'};
 assert.equal(productA3Settings(state,{a3Kind:'sticker'},old,'Cetak A3').preserveLegacy,false);
 assert.equal(productA3Settings(state,{},old,'Cetak A3').preserveLegacy,true);
});
