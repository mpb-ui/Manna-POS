import test from 'node:test';
import assert from 'node:assert/strict';
import {createMasterFilters} from '../public/master-filters.js';
import {bindBackdropClose,trackDialogMutation} from '../public/dialog-dismiss.js';

const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('Master filters restore exact search text, combined filters and sorting per tab after recreating the UI',()=>{
 const disk=storage(),identity=()=> 'owner';const first=createMasterFilters({identity,storage:()=>disk});
 first.write('products',{query:'FL 280',category:'Outdoor',machine:'eco',promoOnly:true});first.write('materials',{query:'Art Paper',sort:'name'});
 const next=createMasterFilters({identity,storage:()=>disk});assert.deepEqual(next.read('products',{query:'',category:'',machine:'',promoOnly:false}),{query:'FL 280',category:'Outdoor',machine:'eco',promoOnly:true});assert.deepEqual(next.read('materials',{query:'',sort:'category-asc'}),{query:'Art Paper',sort:'name'});assert.deepEqual(next.read('finishings',{query:''}),{query:''});
 next.write('products',{query:'',category:'',machine:'',promoOnly:false});assert.equal(next.read('products',{category:'Outdoor'}).category,'');
});
test('filter preferences belong to one account and logout clears that account',()=>{
 let id='owner';const disk=storage(),prefs=createMasterFilters({identity:()=>id,storage:()=>disk});prefs.write('products',{query:'private keyword'});id='cashier';assert.deepEqual(prefs.read('products',{query:''}),{query:''});prefs.write('products',{query:'cash'});prefs.clear();assert.equal(prefs.read('products',{query:''}).query,'');id='owner';assert.equal(prefs.read('products',{query:''}).query,'private keyword');prefs.clear();assert.equal(createMasterFilters({identity:()=>id,storage:()=>disk}).read('products',{query:''}).query,'');
});
test('unavailable storage and malformed preferences cannot break filtering',()=>{
 const bad=createMasterFilters({identity:()=> 'owner',storage:()=>{throw Error('unavailable');}});bad.write('products',{query:'Outdoor'});assert.equal(bad.read('products',{query:''}).query,'Outdoor');bad.clear();assert.equal(bad.read('products',{query:''}).query,'');
 for(const raw of ['not-json','[]','{"products":{"query":false,"promoOnly":"yes"}}']){
  const prefs=createMasterFilters({identity:()=> 'owner',storage:()=>({getItem:()=>raw,setItem(){},removeItem(){}})});assert.deepEqual(prefs.read('products',{query:'',promoOnly:false}),{query:'',promoOnly:false});
 }
});

class Dialog {
 constructor(){this.open=true;this.listeners=new Map();this.closed=0;this.saving=false;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,values={}){const event={type,target:this,button:0,clientX:50,clientY:50,...values};for(const fn of [...this.listeners.get(type)||[]])fn(event);}
 dispatchEvent(event){for(const fn of [...this.listeners.get(event.type)||[]])fn(event);return !event.defaultPrevented;}
 getBoundingClientRect(){return {left:100,top:100,right:300,bottom:300};}
 querySelector(){return this.saving?{}:null;}
 close(){this.open=false;this.closed++;this.emit('close');}
 backdrop(){this.emit('pointerdown');this.emit('click');}
}
test('a backdrop click dismisses the modal, while inside clicks and inside-to-outside drags do not',()=>{
 const d=new Dialog();bindBackdropClose(d);d.emit('pointerdown',{clientX:150,clientY:150});d.emit('click',{clientX:150,clientY:150});assert(d.open);d.emit('pointerdown',{clientX:150,clientY:150});d.emit('click');assert(d.open);d.emit('pointerdown');d.emit('pointercancel');d.emit('click');assert(d.open);d.backdrop();assert.equal(d.closed,1);assert.equal(d.listeners.get('click').size,0);
});
test('saving and concurrent writes block dismissal until all requests finish; GETs do not block',()=>{
 const d=new Dialog(),doc={activeElement:{closest:()=>d},querySelectorAll:()=>[d]};bindBackdropClose(d);d.saving=true;d.backdrop();assert(d.open);d.saving=false;
 const end1=trackDialogMutation(doc,'POST'),end2=trackDialogMutation(doc,'DELETE');d.backdrop();assert(d.open);end1();end1();d.backdrop();assert(d.open);end2();trackDialogMutation(doc,'GET');d.backdrop();assert.equal(d.closed,1);
});
test('cancel handlers remain authoritative and rebinding a reused dialog does not duplicate listeners',()=>{
 const d=new Dialog();const veto=event=>event.preventDefault();d.addEventListener('cancel',veto);bindBackdropClose(d);bindBackdropClose(d);d.backdrop();assert(d.open);assert.equal(d.listeners.get('click').size,1);d.removeEventListener('cancel',veto);d.emit('close');d.backdrop();assert.equal(d.closed,1);
});
