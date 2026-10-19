import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { calculateLine } from '../lib/domain.js';
import { addCartLine, editCartLine, ensureCartIds, cartMergeKey, plainRetailLine } from '../public/cart.js';
import { remainingShirtStock } from '../public/dtf-stock-selection.js';

const state=await new Store().read(), product=id=>state.products.find(p=>p.id===id);
const request=(extra={})=>({productId:'direct-akrilik-display-7x4',width:1,length:1,quantity:1,fileServiceId:'READY',finishing:[],...extra});
const quote=(p,line)=>{const priced=calculateLine(p,line);return {...line,...priced,length:priced.actualLength,fileServiceId:priced.fileService.id,fileServiceQuantity:priced.fileService.quantity,fileServicePrice:priced.fileService.price,fileServiceNote:priced.fileService.note};};

test('repeated additions merge across normalized/raw shapes, preserve identity and reprice wholesale at the combined quantity',()=>{
  const p={...product('direct-akrilik-display-7x4'),wholesaleEnabled:true,priceTiers:[{min:3,max:null,price:10000}]};
  let cart=[];
  for(let i=0;i<3;i++)cart=addCartLine(cart,request(),p).map(line=>quote(p,line));
  assert.equal(cart.length,1);assert.equal(cart[0].quantity,3);assert.equal(cart[0].subtotal,30000);assert(plainRetailLine(cart[0]));
  const before=structuredClone(cart),id=cart[0].cartId,next=addCartLine(cart,request({quantity:2}),p);
  assert.equal(next[0].cartId,id);assert.equal(next[0].quantity,5);assert.deepEqual(cart,before);
  assert.equal(ensureCartIds(cart),cart);assert.equal(new Set(ensureCartIds([request(),request()]).map(l=>l.cartId)).size,2);
});

test('original dimensions, allowance, variants, sides, choices, notes, calculators and finishing ratios distinguish production rows',()=>{
  const p=product('fl-280-glossy'),base=request({productId:p.id,imageWidthCm:100,imageLengthCm:200,allowanceCm:5,width:1,length:2});
  for(const patch of [{imageWidthCm:200,imageLengthCm:100},{allowanceCm:6},{materialVariantId:'x'},{subVariantId:'2S'},{sizeVariantId:'A1'},{productionNote:'File berbeda'},{fileServiceId:'DESIGN_A'},{choices:[{groupId:'g',optionId:'a'}]},{sheetCalculation:{mode:'capacity',widthCm:10,lengthCm:8}},{finishing:[{id:'fin-out-eyelet',units:4,note:'Kiri'}]}])assert.equal(addCartLine(addCartLine([],base,p),{...base,...patch},p).length,2,JSON.stringify(patch));
  const a={...base,choices:[{groupId:'b',optionId:'2'},{groupId:'a',optionId:'1'}]},b={...a,choices:a.choices.toReversed()};assert.equal(cartMergeKey(a,p),cartMergeKey(b,p));
  assert.notEqual(cartMergeKey({...base,finishing:[{id:'fin-out-eyelet',units:4}]},p),cartMergeKey({...base,quantity:2,finishing:[{id:'fin-out-eyelet',units:4}]},p));
});

test('design quantity and manual finishing units add independently of print quantity; automatic area finishing is recalculated',()=>{
  const p=product('fl-280-glossy'),line={productId:p.id,imageWidthCm:100,imageLengthCm:200,allowanceCm:5,quantity:1,fileServiceId:'DESIGN_A',fileServiceQuantity:1,fileServicePrice:25000,fileServiceNote:'Logo',finishing:[{id:'fin-out-eyelet',units:4,note:'Empat sudut'}]};
  let cart=[];for(let i=0;i<3;i++)cart=addCartLine(cart,line,p).map(l=>quote(p,l));
  assert.equal(cart.length,1);assert.equal(cart[0].quantity,3);assert.equal(cart[0].fileServiceQuantity,3);assert.equal(cart[0].fileServiceTotal,75000);assert.equal(cart[0].finishing[0].units,12);assert.equal(cart[0].finishingTotal,6000);
  const different=addCartLine(cart,{...line,fileServiceNote:'Desain berbeda'},p);assert.equal(different.length,2);
  const q={...p,finishing:[{id:'area',name:'Laminasi',rule:'area',price:1000}]};
  const withArea={...line,fileServiceId:'READY',fileServicePrice:0,finishing:[{id:'area',units:2}]};
  const combined=addCartLine(addCartLine([],withArea,q),withArea,q)[0],priced=calculateLine(q,combined);
  assert.equal(priced.finishing[0].units,4);assert.equal(priced.finishingTotal,4000);
});

test('editing replaces only the selected duplicate row and retains its persisted item ID; invalid edits are rejected',()=>{
  const cart=ensureCartIds([{...request(),itemId:'old-1'},{...request(),itemId:'old-2',productionNote:'Kedua'}]),before=structuredClone(cart);
  const edited=editCartLine(cart,cart[1].cartId,request({quantity:5,productionNote:'Baru'}));
  assert.equal(edited.length,2);assert.equal(edited[0],cart[0]);assert.equal(edited[1].quantity,5);assert.equal(edited[1].itemId,'old-2');assert.equal(edited[1].cartId,cart[1].cartId);assert.deepEqual(cart,before);
  assert.equal(editCartLine(cart,cart[0].cartId,request({productId:'different'}))[0].itemId,undefined);
  assert.throws(()=>editCartLine(cart,'missing',request()),/tidak tersedia/);
  for(const quantity of [0,-1,1.5,Infinity])assert.throws(()=>editCartLine(cart,cart[0].cartId,request({quantity})),/Jumlah/);
});

test('DTF merges matching package/color/size sets and editing excludes the old quantity from local stock use',()=>{
  const p=product('dtf-sablon-kaos'),line={productId:p.id,dtfPackageId:p.dtfPackages[0].id,quantity:2,shirtVariants:[{color:'Hitam',size:'M',quantity:2}],fileServiceId:'READY',finishing:[]};
  const cart=addCartLine(addCartLine([],line,p),{...line,quantity:3,shirtVariants:[{color:'Hitam',size:'M',quantity:3}]},p);
  assert.equal(cart.length,1);assert.equal(cart[0].quantity,5);assert.equal(cart[0].shirtVariants[0].quantity,5);
  assert.equal(addCartLine(cart,{...line,shirtVariants:[{color:'Putih',size:'M',quantity:2}]},p).length,2);
  const stock=[{color:'Hitam',size:'M',available:5}];assert.equal(remainingShirtStock(stock,cart.filter(l=>l.cartId!==cart[0].cartId),p.id)[0].available,5);assert.equal(remainingShirtStock(stock,cart,p.id)[0].available,0);
});

test('template design fees accumulate explicitly; legacy requests retain one fee and invalid counts cannot alter billing',()=>{
  const p=product('spanduk-template'),line={productId:p.id,width:1.5,length:1,quantity:1,templateDesign:'SB-01',templateDesignQuantity:1,finishing:[],fileServiceId:'READY'};
  const cart=addCartLine(addCartLine([],line,p),line,p),priced=calculateLine(p,cart[0]);
  assert.equal(cart.length,1);assert.equal(priced.quantity,2);assert.equal(priced.baseTotal,90000);assert.equal(priced.templateDesignQuantity,2);assert.equal(priced.templateDesignTotal,70000);
  const legacy=calculateLine(p,{...line,templateDesignQuantity:undefined});assert.equal(legacy.templateDesignTotal,35000);
  for(const templateDesignQuantity of [0,-1,1.5,Infinity])assert.throws(()=>calculateLine(p,{...line,templateDesignQuantity}),/template/);
});
