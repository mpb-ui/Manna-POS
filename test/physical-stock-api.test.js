import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";

test("API stok: roll/opname, ATK, DP/PO, produksi, retry, retur dan izin",async()=>{
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const req=async(path,method='GET',data,auth=cookie)=>{const r=await fetch(base+path,{method,headers:{cookie:auth,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return{status:r.status,body:await r.json()}};
  const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body};
  let state=await ok('/api/bootstrap'),roll=state.materials.find(m=>m.id==='mat-flexi-280');const oldStock=state.inventory.find(r=>r.materialId===roll.id),oldBalance=oldStock.quantity;
  assert.equal(roll.stockMethod,'ROLL');assert.equal(oldStock.stockNeedsCount,true);assert.equal(oldStock.unit,'m²');assert.equal((await req('/api/inventory/'+roll.sku,'PATCH',{change:-1,reason:'bad'})).status,400);
  roll=await ok('/api/materials/'+roll.id,'PUT',{...roll,stockMethod:'ROLL',rollWidthCm:110,confirmStockCount:true,stockOpeningBalance:10,stockCountReason:'Hitung 10 roll gudang',minStock:1});assert.equal(roll.unit,'m²');assert.equal(roll.stockUnit,'roll');
  await ok('/api/inventory/'+roll.sku,'PATCH',{change:-1,reason:'Buka roll',requestId:'roll-out'});await ok('/api/inventory/'+roll.sku,'PATCH',{change:-1,reason:'Buka roll',requestId:'roll-out'});await ok('/api/inventory/'+roll.sku,'PATCH',{change:5,reason:'Masuk 5 roll',requestId:'roll-in'});state=await ok('/api/bootstrap');assert.equal(state.inventory.find(r=>r.materialId===roll.id).quantity,14);assert.equal(state.stockMovements.find(m=>m.type==='METHOD_OPENING').previousBalance,oldBalance);
  assert.equal((await req('/api/materials/'+roll.id,'PUT',{...roll,stockMethod:'UNIT',stockUnit:'m²'})).status,400);
  const pen=state.products.find(p=>p.retailAtK&&p.saleUnit==='pcs'),paper=state.products.find(p=>p.a3Variant==='AP 260'&&p.a3Side==='1S');assert(pen);assert(paper);
  const penSku=pen.retailStockSku,paperStock=state.inventory.find(r=>r.materialId===paper.materialSources[0].materialId);
  await ok('/api/inventory/'+penSku,'PATCH',{change:100,reason:'Awal pulpen'});await ok('/api/inventory/'+paperStock.sku,'PATCH',{change:1000-paperStock.quantity,reason:'Hitung 1000 lembar'});
  const create=async(items,name='Stok Test',requestId)=>ok('/api/orders','POST',{customerName:name,phone:'081234567890',items,requestId});
  const stock=async sku=>(await ok('/api/bootstrap?view=stock')).inventory.find(r=>r.sku===sku).quantity;
  const draft=await create([{productId:pen.id,quantity:5}],'Draft','create-pen');const retry=await create([{productId:pen.id,quantity:5}],'Draft','create-pen');assert.equal(draft.id,retry.id);assert.equal(await stock(penSku),100);
  const paid=await Promise.all([1,2].map(()=>ok(`/api/orders/${draft.id}/payments`,'POST',{method:'TUNAI',amount:draft.total,requestId:'pay-pen'})));assert.equal(paid[0].payments.length,1);assert.equal(paid[0].status,'DIAMBIL');assert.equal(await stock(penSku),95);
  const mixed=await create([{productId:pen.id,quantity:3},{productId:paper.id,quantity:50}]);let o=await ok(`/api/orders/${mixed.id}/payments`,'POST',{method:'TUNAI',amount:1,requestId:'mixed-dp'});assert.equal(o.items[0].status,'SELESAI');assert.equal(o.items[1].status,'DESAIN');assert.equal(o.stockCommitted,false);assert.equal(await stock(penSku),92);assert.equal(await stock(paperStock.sku),1000);
  await ok(`/api/orders/${mixed.id}/items/${o.items[1].itemId}/design-pic`,'PATCH',{designPic:'Gema'});for(const status of ['CETAK','FINISHING'])await ok(`/api/orders/${mixed.id}/items/${o.items[1].itemId}/status`,'PATCH',{status});
  const done=await Promise.all([1,2,3].map(()=>req(`/api/orders/${mixed.id}/items/${o.items[1].itemId}/status`,'PATCH',{status:'SELESAI',expectedStatus:'FINISHING'})));assert.equal(done.filter(r=>r.status===200).length,1);assert.equal(await stock(paperStock.sku),950);assert.equal(await stock(penSku),92);
  const po=await create([{productId:pen.id,quantity:2}]);await ok(`/api/orders/${po.id}/payments`,'POST',{type:'PO',poNumber:'PO-TEST',requestId:'po'});assert.equal(await stock(penSku),90);
  const banner=await create([{productId:'fl-280-glossy',width:1,length:1,quantity:2}]);o=await ok(`/api/orders/${banner.id}/payments`,'POST',{method:'TUNAI',amount:1});await ok(`/api/orders/${banner.id}/items/${o.items[0].itemId}/design-pic`,'PATCH',{designPic:'Gema'});for(const status of ['CETAK','FINISHING','SELESAI'])await ok(`/api/orders/${banner.id}/items/${o.items[0].itemId}/status`,'PATCH',{status});assert.equal(await stock(roll.sku),14);
  state=await ok('/api/bootstrap?view=stock');const original=state.stockMovements.find(m=>m.orderId===draft.id&&m.type==='AUTO_USE');assert(original);
  assert.equal((await req('/api/inventory/'+penSku,'PATCH',{change:2,reason:'Batal',reversalOf:original.id})).status,400);
  const back={change:2,reason:'Barang kembali fisik',reversalOf:original.id,physicalReturned:true,requestId:'return-pen'};await ok('/api/inventory/'+penSku,'PATCH',back);await ok('/api/inventory/'+penSku,'PATCH',back);assert.equal(await stock(penSku),92);
  const pos=await ok('/api/bootstrap?view=pos');assert(!pos.orders.some(o=>o.id===draft.id));assert.equal(pos.allProducts.length,0);assert.equal(pos.inventory.length,0);assert.equal(pos.auditLogs.length,0);assert.equal((await ok(`/api/order-history/${draft.id}`)).payments.length,1);
  const master=await ok('/api/bootstrap?view=master');assert(master.allProducts.length);assert(master.inventory.length);const history=await ok('/api/stock-movements?offset=0&limit=3');assert.equal(history.movements.length,3);assert.equal(history.hasMore,true);
  await ok('/api/users','POST',{name:'Operator',username:'op-stock',pin:'5678',role:'PRINT'});const auth=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'op-stock',pin:'5678'})});const restricted=auth.headers.get('set-cookie').split(';')[0];assert.equal((await req('/api/inventory/'+penSku,'PATCH',{change:1,reason:'no'},restricted)).status,403);assert.equal((await req('/api/stock-movements','GET',undefined,restricted)).status,403);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
