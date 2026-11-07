import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';

test('PM: detail item tanpa uang, simpan atomik, hold independen, lompat/mundur dan stok tepat sekali',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',NODE_ENV:'test',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,80));}assert.ok(ready);
  const login=async(username,pin='5678')=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login('admin','1234');
  const req=async(path,method='GET',body,cookie=owner)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const ok=async(...args)=>{const r=await req(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
  const auth={};for(const [name,role,permissions]of[['print','PRINT'],['cash','CASHIER'],['design','DESIGN'],['view','MANAGER',['projects.orders']],['warehouse','WAREHOUSE']]){await ok('/api/users','POST',{name,username:name,pin:'5678',role,permissions,briefingProfile:'none'});auth[name]=await login(name);}
  await ok('/api/inventory/BHN-BLF','PATCH',{change:100,reason:'Fixture produksi'});
  const input={productId:'poster-backlite-film',sizeVariantId:'a3',quantity:2,finishing:[],productionNote:'Catatan awal'};
  let order=await ok('/api/orders','POST',{customerName:'PM Test',phone:'6789',deadline:'2026-10-01T10:00:00+08:00',items:[input,{...input,quantity:3}]});
  const [a,b]=order.items, path=item=>`/api/orders/${order.id}/items/${item.itemId}`, detail=()=>ok(path(a)+'/production-details');
  assert.equal((await req(path(a)+'/production-details')).status,400);
  order=await ok(`/api/orders/${order.id}/payments`,'POST',{amount:1,method:'TUNAI'});
  for(const item of order.items)await ok(path(item)+'/design-pic','PATCH',{designPic:'Gema'});
  const original=await detail();for(const name of ['print','cash','design'])assert.deepEqual(await ok(path(a)+'/production-details','GET',undefined,auth[name]),original);
  assert.equal(original.itemNumber,1);assert.equal(original.item.itemId,a.itemId);assert.equal(original.item.productionNote,'Catatan awal');
  assert.equal((await req(path(a)+'/production-details','GET',undefined,auth.warehouse)).status,403);
  assert.equal((await req(path(a)+'/production-details','PATCH',{productionNote:'X',driveUrl:'',expectedRevision:0},auth.view)).status,403);
  const link='https://drive.google.com/drive/folders/test';
  let d=await ok(path(a)+'/production-details','PATCH',{productionNote:'Catatan baru',driveUrl:link,expectedRevision:0},auth.print);
  assert.equal(d.item.driveUrl,link);assert.equal(d.item.productionRevision,1);assert.equal((await ok(path(b)+'/production-details')).item.productionNote,'Catatan awal');
  assert.equal((await req(path(a)+'/production-details','PATCH',{productionNote:'stale',driveUrl:'',expectedRevision:0},auth.cash)).status,409);
  assert.equal((await req(path(a)+'/production-details','PATCH',{productionNote:'invalid atomic',driveUrl:'https://evil.test',expectedRevision:1})).status,400);
  assert.equal((await detail()).item.productionNote,'Catatan baru');
  const concurrent=await Promise.all(['first','second'].map(productionNote=>req(path(a)+'/production-details','PATCH',{productionNote,driveUrl:link,expectedRevision:1})));
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  d=await detail();d=await ok(path(a)+'/production-details','PATCH',{productionNote:'',driveUrl:'',expectedRevision:d.item.productionRevision},auth.cash);assert.equal(d.item.productionNote,'');assert.equal(d.item.driveUrl,'');
  const inventory=await ok('/api/bootstrap?view=stock');
  const holdA=await ok(path(a)+'/hold','PATCH',{reason:'Menunggu approval customer',note:'Proof A',expectedHoldUpdatedAt:null},auth.print);
  assert.ok(holdA.item.hold);assert.equal((await ok(path(b)+'/production-details')).item.hold,null);
  await ok(path(b)+'/hold','PATCH',{reason:'Kendala mesin'});
  const move=async(item,status,expectedStatus,extra={},cookie=owner)=>ok(path(item)+'/project-status','PATCH',{status,expectedStatus,...extra},cookie);
  const released=await move(a,'SELESAI','DESAIN',{expectedHoldUpdatedAt:holdA.item.hold.updatedAt},auth.print);
  assert.equal(released.item.hold,null);assert.ok(released.item.completedAt);assert.ok((await ok(path(b)+'/production-details')).item.hold);
  const doneAt=released.item.completedAt;
  assert.equal((await req(path(a)+'/project-status','PATCH',{status:'CETAK',expectedStatus:'DESAIN'},auth.print)).status,409);
  const afterFirst=await ok('/api/bootstrap?view=stock');assert.notDeepEqual(afterFirst.inventory,inventory.inventory);
  await move(a,'DESAIN','SELESAI',{},auth.design);assert.equal((await detail()).item.completedAt,null);
  await move(a,'CETAK','DESAIN',{},auth.print);await move(a,'FINISHING','CETAK',{},auth.print);await move(a,'SELESAI','FINISHING',{},auth.print);
  assert.deepEqual((await ok('/api/bootstrap?view=stock')).inventory,afterFirst.inventory);
  assert.equal((await req(path(b)+'/project-status','PATCH',{status:'CETAK',expectedStatus:'DESAIN'},auth.cash)).status,403);
  assert.equal((await req(path(b)+'/project-status','PATCH',{status:'CETAK',expectedStatus:'DESAIN'},auth.view)).status,403);
  assert.equal((await req(path(b)+'/project-status','PATCH',{status:'DIAMBIL',expectedStatus:'DESAIN'})).status,403);
  await move(b,'FINISHING','DESAIN',{},auth.print);await move(b,'SELESAI','FINISHING',{},auth.cash);
  const after=await ok(`/api/order-history/${order.id}`);assert.equal(after.status,'SELESAI');assert.equal(after.total,order.total);assert.equal(after.paidAmount,1);assert.equal(after.payments.length,1);assert.ok(after.items.every(item=>item.stockCommitted));assert.equal(after.hold,null);
  assert.ok(after.timeline.some(row=>row.itemId===a.itemId && row.message.includes('Penanda tertahan dilepas')));assert.ok(doneAt);
  const blockedOrder=await ok('/api/orders','POST',{customerName:'Stock rollback',phone:'1',items:[input]});
  const blocked=blockedOrder.items[0], blockedPath=`/api/orders/${blockedOrder.id}/items/${blocked.itemId}`;
  await ok(`/api/orders/${blockedOrder.id}/payments`,'POST',{amount:1,method:'TUNAI'});
  await ok(blockedPath+'/design-pic','PATCH',{designPic:'Gema'});
  await ok(blockedPath+'/hold','PATCH',{reason:'Bahan belum tersedia'});
  const stock=(await ok('/api/bootstrap?view=stock')).inventory.find(row=>row.sku==='BHN-BLF');
  await ok('/api/inventory/BHN-BLF','PATCH',{change:-stock.quantity,reason:'Fixture stok kosong'});
  const rejected=await req(blockedPath+'/project-status','PATCH',{status:'SELESAI',expectedStatus:'DESAIN'},auth.print);assert.equal(rejected.status,400);
  const preserved=await ok(blockedPath+'/production-details');assert.equal(preserved.item.status,'DESAIN');assert.ok(preserved.item.hold);assert.equal(preserved.item.completedAt,undefined);
  // Replayed completion is a no-op and retains the completion timestamp.
  const completed=(await detail()).item.completedAt;await move(a,'SELESAI','SELESAI');assert.equal((await detail()).item.completedAt,completed);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
