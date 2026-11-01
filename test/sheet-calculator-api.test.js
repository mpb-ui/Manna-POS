import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('API profil, produk baru, varian, snapshot, permission, pembayaran dan stok lembar', async () => {
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const child=spawn(process.execPath,[new URL('../server.js',import.meta.url).pathname],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  try {
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert(ready);
    const login=async(username,pin)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
    const owner=await login('admin','1234');
    const request=async(path,method='GET',body,cookie=owner)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    const ok=async(...args)=>{let r=await request(...args); // These fixtures intentionally use separate customers sharing a phone/name.
      if(r.body?.code==='CUSTOMER_MATCH_REQUIRED'&&args[1]==='POST')r=await request(args[0],args[1],{...args[2],newCustomerConfirmedIds:r.body.matches.map(c=>c.id)},args[3]);assert(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body;};
    let state=await ok('/api/bootstrap');
    const paper=state.products.find(p=>p.a3Family==='Art Paper (AP)'&&p.a3Variant==='AP 150'&&p.a3Side==='1S');
    const calc={shape:'rectangle',widthCm:8,lengthCm:10,requestedQuantity:100,allowRotation:true};
    const capacityInput={mode:'capacity',widthCm:8,lengthCm:10,allowRotation:true,capacity:999};
    const manual=await ok('/api/orders','POST',{customerName:'Manual sheets',phone:'081234567891',items:[{productId:paper.id,quantity:3,sheetCalculation:capacityInput,finishing:[]},{productId:paper.id,quantity:5,sheetCalculation:capacityInput,finishing:[{id:'fin-a3-diecut',units:1}]}]});
    assert.deepEqual(manual.items.map(i=>i.quantity),[3,5]);assert.deepEqual(manual.items.map(i=>i.sheetCalculation.capacity),[12,12]);assert.equal(manual.total,8*8000+1500);
    assert.deepEqual((await ok('/api/bootstrap')).orders.find(o=>o.id===manual.id).items,manual.items);
    const lines=[{productId:paper.id,quantity:7,sheetCalculation:calc,finishing:[]},{productId:paper.id,quantity:9,sheetCalculation:calc,finishing:[{id:'fin-a3-diecut',units:1}]}];
    assert.equal((await request('/api/orders','POST',{customerName:'Invalid sheet',phone:'081234567890',items:[{...lines[0],quantity:1}]})).status,400);
    let order=await ok('/api/orders','POST',{customerName:'Sheet Test',phone:'081234567890',items:lines});
    assert.deepEqual(order.items.map(i=>i.sheetCalculation.capacity),[15,12]);assert.equal(order.total,7*8000+9*8000+1500);
    const before=structuredClone(order);
    const profile=state.catalogOptions.sheetCalculatorProfiles.find(p=>p.id==='a3-plus');
    assert.equal((await request('/api/sheet-profiles/a3-plus','PUT',{...profile,cuttingWidthCm:50})).status,400);
    await ok('/api/sheet-profiles/a3-plus','PUT',{...profile,areaWidthCm:30,areaLengthCm:45});
    const preserved=(await ok('/api/bootstrap')).orders.find(o=>o.id===order.id);
    assert.deepEqual(preserved.items,before.items);assert.equal(preserved.total,before.total);assert.deepEqual(preserved.payments,before.payments);assert.deepEqual(preserved.timeline,before.timeline);
    order=await ok(`/api/orders/${order.id}`,'PUT',{customerName:order.customerName,phone:order.phone,items:order.items.map(i=>({...i,length:i.actualLength}))});
    assert.equal(order.items[0].sheetCalculation.capacity,15);assert.equal(order.total,before.total);
    // New products and variants use persisted profile IDs, not name matching.
    const custom={sku:'CALC-NEW',name:'Kertas Baru Kalkulator',category:'Print A3+',saleUnit:'lbr',priceBasis:'unit',price:10000,machineIds:['mach-digital'],materialSources:[],hasMaterialVariants:true,materialVariants:[{id:'v-a3',label:'Kecil',materialSources:[{materialId:'mat-art150',quantity:1}],sheetProfileId:'a3'},{id:'v-plus',label:'Besar',materialSources:[{materialId:'mat-art150',quantity:1}],sheetProfileId:'a3-plus'}],sheetCalculatorEnabled:true,sheetProfileId:'a3-plus',finishingIds:['fin-a3-diecut']};
    const saved=await ok('/api/products','POST',custom);assert.equal(saved.materialVariants[0].sheetProfileId,'a3');
    assert.equal((await request('/api/products','POST',{...custom,sku:'BAD-CALC',name:'Bad Calc',sheetProfileId:'missing'})).status,400);
    const variantOrder=await ok('/api/orders','POST',{customerName:'New paper',phone:'081234567890',items:[{productId:saved.id,materialVariantId:'v-a3',quantity:9,sheetCalculation:calc,finishing:[]}]});assert.equal(variantOrder.items[0].sheetCalculation.profile.name,'A3');
    await ok('/api/users','POST',{name:'Calc Cashier',username:'calc-cashier',role:'CASHIER',pin:'5678'});const cashier=await login('calc-cashier','5678');
    assert.equal((await request('/api/sheet-profiles/a3','PUT',state.catalogOptions.sheetCalculatorProfiles[0],cashier)).status,403);
    assert.equal((await request(`/api/products/${saved.id}`,'PUT',{...saved,sheetCalculatorEnabled:false},cashier)).status,403);
    await ok('/api/users','POST',{name:'Calc Operator',username:'calc-print',role:'PRINT',pin:'5678'});const operator=await login('calc-print','5678');
    await ok('/api/inventory/KRT-AP150','PATCH',{change:100,reason:'Sheet test'});
    const inventoryBefore=(await ok('/api/bootstrap')).inventory.find(i=>i.sku==='KRT-AP150').quantity;
    order=await ok(`/api/orders/${order.id}/payments`,'POST',{method:'Tunai',amount:1});assert.equal(order.paidAmount,1);
    for(const item of order.items){const path=`/api/orders/${order.id}/items/${item.itemId}`;await ok(path+'/design-pic','PATCH',{designPic:'Gema'});await ok(path+'/status','PATCH',{status:'CETAK'});await ok(path+'/status','PATCH',{status:'FINISHING'});}
    const paths=order.items.map(item=>`/api/orders/${order.id}/items/${item.itemId}/status`);
    const outcomes=await Promise.all([paths[0],paths[1],paths[0],paths[1]].map(path=>request(path,'PATCH',{status:'SELESAI',expectedStatus:'FINISHING'},operator)));
    assert.equal(outcomes.filter(r=>r.status===200).length,2);assert.equal(outcomes.filter(r=>r.status===409).length,2);
    state=await ok('/api/bootstrap');order=state.orders.find(o=>o.id===order.id);assert.equal(order.paidAmount,1);assert.equal(order.total,before.total);assert.equal(order.stockCommitted,true);
    assert.equal(state.inventory.find(i=>i.sku==='KRT-AP150').quantity,inventoryBefore-16);
    const hidden=(await ok('/api/bootstrap','GET',undefined,operator)).orders.find(o=>o.id===order.id);assert.equal(hidden.total,undefined);assert.equal(hidden.items[0].subtotal,undefined);assert.equal(hidden.items[0].sheetCalculation.capacity,15);
  } finally {child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
});
