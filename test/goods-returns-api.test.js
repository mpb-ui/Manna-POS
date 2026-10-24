import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
test('retur API: invoice/item identity, partial quantities, replacement chain, permissions, atomic stock, report invariants and print timing',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}assert(ready);
  const login=async(username)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin:'1234'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login('admin');const req=async(path,method='GET',body,auth=owner)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie:auth},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};const ok=async(...args)=>{const r=await req(...args);assert(r.status<300,JSON.stringify(r));return r.body;};
  for(const [name,role,permissions]of[['cash','CASHIER'],['limited','CASHIER',['orders.view','projects.money']],['printer','PRINT']])await ok('/api/users','POST',{name,username:name,role,pin:'1234',...(permissions?{permissions}:{})});const cash=await login('cash'),limited=await login('limited'),printer=await login('printer');
  assert((await ok('/api/bootstrap','GET',undefined,cash)).permissions.includes('orders.return'));assert(!(await ok('/api/bootstrap','GET',undefined,cash)).permissions.includes('stock.adjust'));
  const pen=await ok('/api/products','POST',{name:'Bolpen Faster C600 Biru QA',sku:'QA-PEN-BLUE',category:'ATK',retailAtK:true,price:5000,baseCost:1500,priceBasisId:'unit',saleUnit:'pcs'});await ok('/api/inventory/QA-PEN-BLUE','PATCH',{change:100,reason:'Stok QA'});
  const make=async(items)=>ok('/api/orders','POST',{customerName:'Retur QA',phone:'6789',items});
  const order=await make([{productId:pen.id,quantity:3},{productId:pen.id,quantity:2}]);
  const route=`/api/orders/${order.id}/returns`,firstId=order.items[0].itemId,secondId=order.items[1].itemId;
  const payload=(requestId,quantity=1,parentLineId=null,itemId=firstId)=>({requestId,reason:'DEFECT',note:'Tinta bolpen macet',defectReceived:true,replacementDelivered:true,lines:[{itemId,quantity,parentLineId}]});
  assert.equal((await req(route,'POST',payload('draft'),cash)).status,409);
  const paid=await ok(`/api/orders/${order.id}/payments`,'POST',{method:'TUNAI',amount:order.total},cash);assert.equal(paid.status,'DIAMBIL');
  const other=await make([{productId:pen.id,quantity:1}]);
  const reportBefore=await ok('/api/reports?from=2020-01-01&to=2099-12-31');const stock=async()=>((await ok('/api/bootstrap?view=stock')).inventory.find(row=>row.sku==='QA-PEN-BLUE').quantity);assert.equal(await stock(),95);
  assert.equal((await req(route,'POST',payload('limited'),limited)).status,403);assert.equal((await req(route,'GET',undefined,printer)).status,403);
  const responses=await Promise.all(Array.from({length:6},()=>ok(route,'POST',payload('repeat',2),cash)));const first=responses[0];assert(responses.every(r=>r.id===first.id));assert.equal(first.cost,undefined);assert(first.lines.every(line=>line.cost===undefined));assert.equal(await stock(),93);
  const history=await ok(route);assert.equal(history.total,1);assert.equal(history.records[0].cost,3000);assert.equal(history.options.find(o=>o.itemId===firstId&&!o.parentLineId).remaining,1);assert.equal(history.options.find(o=>o.itemId===secondId&&!o.parentLineId).remaining,2);
  const finance=o=>({code:o.code,status:o.status,total:o.total,paidAmount:o.paidAmount,paymentStatus:o.paymentStatus,payments:o.payments,items:o.items});assert.deepEqual(finance(await ok(`/api/order-history/${order.id}`)),finance(paid));
  assert.equal((await req(route,'POST',payload('repeat',1),cash)).status,409);
  assert.equal((await req(route,'POST',payload('wrong-order',1,null,other.items[0].itemId),cash)).status,409);
  for(const quantity of [0,-1,1.5,4])assert.equal((await req(route,'POST',payload('invalid-'+quantity,quantity),cash)).status,409);
  // Two lines can point at one physical SKU; aggregate demand is validated atomically.
  await ok('/api/inventory/QA-PEN-BLUE','PATCH',{change:-92,reason:'QA saldo terbatas'});assert.equal(await stock(),1);
  assert.equal((await req(route,'POST',{...payload('combined'),lines:[{itemId:firstId,quantity:1},{itemId:secondId,quantity:1}]},cash)).status,409);assert.equal(await stock(),1);assert.equal((await ok(route)).total,1);
  await ok('/api/inventory/QA-PEN-BLUE','PATCH',{change:92,reason:'Pulihkan saldo QA'});
  const race=await Promise.all(['race-a','race-b'].map(id=>req(route,'POST',payload(id),cash)));assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.status===409).length,1);
  await ok(route,'POST',payload('replacement-defect',1,first.lines[0].id),cash);assert.equal(await stock(),91);
  const reportAfter=await ok('/api/reports?from=2020-01-01&to=2099-12-31');
  assert.equal(reportAfter.summary.sales,reportBefore.summary.sales);assert.equal(reportAfter.summary.items,reportBefore.summary.items);assert.equal(reportAfter.summary.cost,reportBefore.summary.cost+6000);assert.equal(reportAfter.summary.profit,reportBefore.summary.profit-6000);assert.equal(reportAfter.summary.paid,reportBefore.summary.paid);assert.equal(reportAfter.summary.returnQuantity,4);assert.equal(reportAfter.summary.returnCost,6000);assert.equal(reportAfter.goodsReturns.transactions,3);
  const cashReport=await ok('/api/reports?from=2020-01-01&to=2099-12-31','GET',undefined,cash);assert.equal(cashReport.summary.returnCost,undefined);assert(cashReport.goodsReturns.rows.every(row=>row.cost===undefined));
  const event=await ok(`/api/order-history/${order.id}`);assert.equal(event.items[0].quantity,3);assert.equal(event.items[1].quantity,2);assert.equal(event.timeline.filter(row=>row.message.includes('retur defect')).length,3);
  // Both per-item and whole-order printing consume only lines that enter print.
  await ok('/api/inventory/BHN-BLF','PATCH',{change:10,reason:'Bahan produksi QA'});
  const production=await make([{productId:'poster-backlite-film',sizeVariantId:'a3',quantity:2},{productId:'poster-backlite-film',sizeVariantId:'a3',quantity:3}]);await ok(`/api/orders/${production.id}/payments`,'POST',{method:'TUNAI',amount:1});for(const item of production.items)await ok(`/api/orders/${production.id}/items/${item.itemId}/design-pic`,'PATCH',{designPic:'Gema'});
  const quantity=async()=>((await ok('/api/bootstrap?view=stock')).inventory.find(row=>row.sku==='BHN-BLF').quantity),initial=await quantity();
  const a=production.items[0],b=production.items[1];await ok(`/api/orders/${production.id}/items/${a.itemId}/status`,'PATCH',{status:'CETAK'});assert.equal(await quantity(),initial-a.materials[0].units);
  assert.equal((await req(`/api/orders/${production.id}/items/${a.itemId}/status`,'PATCH',{status:'CETAK',expectedStatus:'DESAIN'})).status,409);
  for(const status of ['FINISHING','SELESAI'])await ok(`/api/orders/${production.id}/items/${a.itemId}/status`,'PATCH',{status});assert.equal(await quantity(),initial-a.materials[0].units);
  await ok(`/api/orders/${production.id}/items/${b.itemId}/status`,'PATCH',{status:'CETAK'});const consumed=await quantity();assert.equal(consumed,initial-a.materials[0].units-b.materials[0].units);
  const beforeCancel=consumed;await ok(`/api/orders/${production.id}/cancel`,'POST',{requestId:'cancel-printed',reason:'Owner batal',disposition:'REFUND',method:'TUNAI'});assert.equal(await quantity(),beforeCancel);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
