import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('cart quotation is read-only, authoritative, backwards-compatible and permission protected; saved draft retains item IDs and additive design charges',async()=>{
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
  try{
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
    const login=async(username,pin='1234')=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
    const cookie=await login('admin');
    const request=async(path,method='GET',data,auth=cookie)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie:auth},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
    const ok=async(...args)=>{const r=await request(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
    const item={productId:'fl-280-glossy',imageWidthCm:200,imageLengthCm:100,allowanceCm:5,quantity:1,fileServiceId:'DESIGN_A',fileServiceQuantity:1,fileServiceNote:'Logo',finishing:[{id:'fin-out-eyelet',units:4,note:'Empat sudut'}]};
    const draft=await ok('/api/orders','POST',{customerName:'Cart test',phone:'081234567890',items:[item]});
    await ok('/api/users','POST',{username:'cart-printer',name:'Operator',role:'PRINT',pin:'1234'});const operator=await login('cart-printer');
    const before=await ok('/api/bootstrap?view=stock');
    const changed={...item,itemId:draft.items[0].itemId,quantity:3,fileServiceQuantity:3,finishing:[{id:'fin-out-eyelet',units:12,note:'Empat sudut'}],previewTotal:1,unitPrice:1,baseTotal:1};
    const simple=await ok('/api/orders/check','POST',{items:[changed]});assert.equal(simple.items,undefined);
    const payload={items:[changed],editingOrderId:draft.id,includeItems:true};
    const quotes=await Promise.all(Array.from({length:6},()=>ok('/api/orders/check','POST',payload)));
    for(const quote of quotes){assert.equal(quote.total,261000);assert.equal(quote.items[0].fileServiceTotal,75000);assert.equal(quote.items[0].finishingTotal,6000);assert.equal(quote.items[0].baseTotal,180000);}
    const after=await ok('/api/bootstrap?view=stock');assert.deepEqual(after.orders,before.orders);assert.deepEqual(after.inventory,before.inventory);assert.deepEqual(after.stockMovements,before.stockMovements);
    assert.equal((await request('/api/orders/check','POST',payload,operator)).status,403);
    const saved=await ok(`/api/orders/${draft.id}`,'PUT',{customerName:draft.customerName,phone:draft.phone,items:[changed]});assert.equal(saved.items[0].itemId,draft.items[0].itemId);assert.equal(saved.total,261000);assert.equal(saved.paidAmount,0);
    const paid=await ok(`/api/orders/${draft.id}/payments`,'POST',{method:'TUNAI',amount:1,requestId:'cart-payment'});assert.equal(paid.payments.length,1);assert.equal(paid.paidAmount,1);
    assert.equal((await request(`/api/orders/${draft.id}`,'PUT',{customerName:'Changed',phone:draft.phone,items:[changed]})).status,400);
    const template={productId:'spanduk-template',width:1.5,length:1,quantity:2,templateDesign:'SB-01',templateDesignQuantity:2,finishing:[]};
    const templateQuote=await ok('/api/orders/check','POST',{items:[template],includeItems:true});assert.equal(templateQuote.items[0].templateDesignTotal,70000);assert.equal(templateQuote.total,160000);
    assert.equal((await request('/api/orders/check','POST',{items:[{...template,templateDesignQuantity:0}],includeItems:true})).status,400);
    assert.deepEqual((await ok('/api/bootstrap?view=stock')).inventory,before.inventory);
  }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
