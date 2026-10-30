import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import net from 'node:net';

test('two tab product API persists types, per combination prices/materials/availability, dates and print-time stock without rewriting history',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try {
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  const login=async username=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin:'1234'})});return r.headers.get('set-cookie').split(';')[0];};const owner=await login('admin');
  const req=async(path,method='GET',data,cookie=owner)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
  const before=await ok('/api/bootstrap?view=master');assert(before.catalogOptions.variantTypes.includes('Varian Ukuran'));assert(before.catalogOptions.variantOptionTypes.includes('Sisi Cetak'));
  await ok('/api/catalog-options/variantTypes','POST',{label:'Warna Kertas'});await ok('/api/catalog-options/variantOptionTypes','POST',{label:'Paket Cetak'});
  assert.equal((await req('/api/catalog-options/variantTypes','POST',{label:'warna kertas'})).status,400);
  const source=qty=>[{materialId:'mat-art260',quantity:qty}];
  const config={productEditorVersion:1,name:'Editor Produk QA',sku:'EDITOR-PROD-QA',category:'Merchandise',saleUnit:'pcs',price:65000,baseCost:5000,active:true,featured:true,machineIds:['mach-digital'],materialSources:[],hasMaterialVariants:true,variantType:'Warna Kertas',optionType:'Paket Cetak',subVariants:[{id:'one',label:'Cetak 1 Sisi'},{id:'two',label:'Cetak 2 Sisi'}],
   materialVariants:['cream','white'].map((id,i)=>({id,label:i?'White':'Cream',price:65000,baseCost:5000,materialSources:[],active:true,combinations:[{subVariantId:'one',price:65000,baseCost:5000,materialSources:source(1),active:i===0,priceTiers:[{min:1,max:9,price:65000},{min:10,max:null,price:60000}]},{subVariantId:'two',price:75000,baseCost:7000,materialSources:source(2),active:true,priceTiers:[]}]}))};
  let p=await ok('/api/products','POST',config);assert.equal(p.variantType,'Warna Kertas');assert.equal(p.subVariantLabel,'Paket Cetak');
  assert.equal(p.materialVariants[0].combinations[1].baseCost,7000);assert.equal(p.materialVariants[0].combinations[1].materialSources[0].quantity,2);
  const item=(sub='one',variant='cream',quantity=3)=>({productId:p.id,materialVariantId:variant,subVariantId:sub,quantity,width:999,length:999});
  let quote=await ok('/api/orders/check','POST',{items:[item('one','cream',10)],includeItems:true});assert.equal(quote.total,600000);assert.equal(quote.items[0].materials[0].units,10);assert.equal(quote.items[0].baseCostTotal,50000);
  assert.equal((await req('/api/orders/check','POST',{items:[item('one','white')]})).status,400);
  quote=await ok('/api/orders/check','POST',{items:[item('two')],includeItems:true});assert.equal(quote.total,225000);assert.equal(quote.items[0].materials[0].units,6);
  const oldOrder=await ok('/api/orders','POST',{customerName:'Editor QA Customer',phone:'7412',items:[item('two')]});
  const stock=async()=>(await ok('/api/bootstrap?view=stock')).inventory.find(r=>r.materialId==='mat-art260').quantity;
  const stockBefore=await stock();const paid=await ok(`/api/orders/${oldOrder.id}/payments`,'POST',{requestId:'editor-dp',method:'TUNAI',amount:1});assert.equal(await stock(),stockBefore);
  await ok(`/api/orders/${oldOrder.id}/items/${paid.items[0].itemId}/design-pic`,'PATCH',{designPic:'Gema'});
  await ok(`/api/orders/${oldOrder.id}/items/${paid.items[0].itemId}/status`,'PATCH',{status:'CETAK'});assert.equal(await stock(),stockBefore-6);
  const changed=structuredClone(p);changed.name='Editor Produk QA Renamed';changed.materialVariants[0].label='Cream Baru';changed.materialVariants[0].combinations[1].price=90000;changed.materialVariants[0].combinations[1].materialSources=[];
  p=await ok('/api/products/'+p.id,'PUT',changed);assert.equal(p.materialVariants[0].combinations[1].materialSources.length,0);
  assert.equal((await ok('/api/order-history/'+oldOrder.id)).total,oldOrder.total);assert.equal((await ok('/api/order-history/'+oldOrder.id)).items[0].materialVariantLabel,'Cream');assert.equal(await stock(),stockBefore-6);
  assert.deepEqual((await ok('/api/orders/check','POST',{items:[item('two')],includeItems:true})).items[0].materials,[]);
  for(const patch of [{machineIds:['mach-digital','mach-solvent']},{variantType:'Tidak terdaftar'},{materialVariants:[{...p.materialVariants[0],combinations:[{...p.materialVariants[0].combinations[0],baseCost:-1},p.materialVariants[0].combinations[1]]},p.materialVariants[1]]}])assert.equal((await req('/api/products/'+p.id,'PUT',{...p,...patch})).status,400);
  assert.equal((await ok('/api/bootstrap?view=master')).products.find(v=>v.id===p.id).name,p.name);
  const single=await ok('/api/products','POST',{...config,name:'Tanpa Bahan QA',sku:'NO-SOURCE-QA',hasMaterialVariants:false,materialVariants:[],subVariants:[],variantType:'',optionType:'',materialSources:[],discount:{enabled:true,type:'percent',value:20,startDate:'2026-10-30',endDate:'2026-10-30'}});
  const decimalPromo=await ok('/api/products/'+single.id,'PUT',{...single,discount:{enabled:true,type:'percent',value:12.5,startDate:'2026-10-30',endDate:'2026-10-30'}});assert.equal(decimalPromo.discount.value,12.5);
  const unavailable=structuredClone(p);unavailable.materialVariants[1].combinations[0].price=null;const preserved=await ok('/api/products/'+p.id,'PUT',unavailable);assert.equal(preserved.materialVariants[1].combinations[0].active,false);assert.equal(preserved.materialVariants[1].combinations[0].price,null);
  assert.equal(single.discount.startsAt,'2026-10-29T16:00:00.000Z');assert.equal(single.discount.endsAt,'2026-10-30T15:59:59.999Z');
  for(const startDate of ['2026-02-30','bad'])assert.equal((await req('/api/products/'+single.id,'PUT',{...single,discount:{enabled:true,type:'percent',value:20,startDate,endDate:'2026-11-01'}})).status,400);
  await ok('/api/users','POST',{username:'editor-cashier',name:'Kasir',role:'CASHIER',pin:'1234'});const cashier=await login('editor-cashier');
  assert.equal((await req('/api/catalog-options/variantTypes','POST',{label:'Dilarang'},cashier)).status,403);
  const safe=(await ok('/api/bootstrap?view=pos','GET',undefined,cashier)).products.find(v=>v.id===p.id);assert(!Object.hasOwn(safe.materialVariants[0],'baseCost'));assert(!Object.hasOwn(safe.materialVariants[0].combinations[0],'baseCost'));
  const safeQuote=await ok('/api/orders/check','POST',{items:[item()],includeItems:true},cashier);assert(!Object.hasOwn(safeQuote.items[0],'baseCostTotal'));
  const safeRepeat=await ok('/api/orders/'+oldOrder.id+'/repeat','POST',{},cashier);assert.equal(safeRepeat.canRepeat,true);assert(!Object.hasOwn(safeRepeat.items[0],'baseCostTotal'));
  assert.deepEqual((await ok('/api/bootstrap?view=master')).catalogOptions.variantTypes,[...before.catalogOptions.variantTypes,'Warna Kertas']);
 } finally {child.kill();await new Promise(r=>child.once('exit',r));}
});
