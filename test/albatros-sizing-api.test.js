import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('Albatros API recalculates automatic placement, preserves A1, retries, permissions and physical roll balances',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert(ready);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const req=async(path,method='GET',data,auth=cookie)=>{const response=await fetch(base+path,{method,headers:{cookie:auth,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,body:await response.json()};};
  const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body;};
  const stockBefore=(await ok('/api/bootstrap?view=stock')).inventory;
  const catalog=await ok('/api/bootstrap?view=master');
  const manual=catalog.products.find(p=>p.id==='poster-albatros').finishing.find(f=>f.id==='fin-lf-manual');assert(manual);
  const cutting=await ok('/api/orders','POST',{customerName:'Manual Cutting',phone:'8988',items:[{productId:'poster-albatros',imageWidthCm:91,imageLengthCm:101,quantity:3,finishing:[{id:manual.id,units:1.3,note:'Ikuti garis'}],fileServiceId:'DESIGN_B',fileServiceQuantity:2,fileServiceNote:'Siapkan revisi',productionNote:'Catatan produksi panjang'}]});
  assert.equal(cutting.items[0].finishing[0].units,1.3);assert.equal(cutting.items[0].finishingTotal,Math.round(1.3*manual.price));
  const cuttingEdit=await ok(`/api/orders/${cutting.id}`,'PUT',{customerName:'Manual Cutting Edit',phone:'8988',items:cutting.items.map(item=>({...item,fileServiceId:item.fileService.id,fileServiceQuantity:item.fileService.quantity,fileServiceNote:item.fileService.note}))});
  assert.equal(cuttingEdit.total,cutting.total);assert.equal(cuttingEdit.items[0].finishing[0].note,'Ikuti garis');assert.equal(cuttingEdit.items[0].fileService.note,'Siapkan revisi');assert.equal(cuttingEdit.items[0].productionNote,'Catatan produksi panjang');
  const item={productId:'poster-albatros',imageWidthCm:91,imageLengthCm:101,width:.9,quantity:1,finishing:[],rollPlacement:{nominalWidth:.9,baseTotal:1}};
  const payload={customerName:'Albatros',phone:'8988',requestId:'albatros-repeat',items:[item,{...item,imageWidthCm:101,imageLengthCm:91},{productId:'poster-albatros',sizeVariantId:'a1',quantity:2,finishing:[]}]};
  const [a,b]=await Promise.all([ok('/api/orders','POST',payload),ok('/api/orders','POST',payload)]);assert.equal(a.id,b.id);assert.equal(a.total,560000);assert.equal(a.items[0].width,1.2);assert.equal(a.items[0].rollPlacement.acrossCm,101);assert.equal(a.items[0].rollPlacement.baseTotal,undefined);assert.equal(a.items[1].baseTotal,a.items[0].baseTotal);assert.equal(a.items[2].baseTotal,200000);
  const saved=await ok(`/api/order-history/${a.id}`);assert.deepEqual(saved.items[0].rollPlacement,a.items[0].rollPlacement);
  const edited=await ok(`/api/orders/${a.id}`,'PUT',{customerName:'Albatros Edited',phone:'8988',items:a.items.map(i=>({...i,width:1.5,rollCalculationVersion:0,rollPlacement:{nominalWidth:1.5}}))});assert.equal(edited.total,560000);assert.equal(edited.items[0].width,1.2);assert.equal(edited.items[2].baseTotal,200000);
  const invalid=await req('/api/orders','POST',{customerName:'No Fit',phone:'8988',items:[{...item,imageWidthCm:200,imageLengthCm:250}]});assert.equal(invalid.status,400);assert.match(invalid.body.error,/tidak muat/);
  const paid=await ok(`/api/orders/${a.id}/payments`,'POST',{method:'TUNAI',amount:1,requestId:'albatros-dp'});assert.equal(paid.paidAmount,1);
  const again=await ok(`/api/orders/${a.id}/payments`,'POST',{method:'TUNAI',amount:1,requestId:'albatros-dp'});assert.equal(again.payments.length,1);assert.equal(again.items[0].baseTotal,a.items[0].baseTotal);
  await ok('/api/users','POST',{name:'Operator',username:'albatros-op',pin:'5678',role:'PRINT'});const auth=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'albatros-op',pin:'5678'})});const op=auth.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/orders','POST',payload,op)).status,403);
  const restricted=await ok('/api/bootstrap?view=projects','GET',undefined,op);const visible=restricted.orders.find(o=>o.id===a.id);assert(visible);assert.equal(visible.total,undefined);assert.equal(visible.items[0].baseTotal,undefined);assert.equal(visible.items[0].unitPrice,undefined);assert.equal(visible.items[0].rollPlacement.acrossCm,101);
  for(const i of paid.items){await ok(`/api/orders/${a.id}/items/${i.itemId}/design-pic`,'PATCH',{designPic:'Gema'});for(const status of ['CETAK','FINISHING','SELESAI'])await ok(`/api/orders/${a.id}/items/${i.itemId}/status`,'PATCH',{status});}
  const final=await ok(`/api/order-history/${a.id}`);assert.equal(final.status,'SELESAI');assert.equal(final.paidAmount,1);assert.equal(final.total,560000);
  assert.deepEqual((await ok('/api/bootstrap?view=stock')).inventory,stockBefore);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
