import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('master settings persist, measured quotes reprice all rows, and minimum rules cannot be bypassed by order/edit/payment requests',async()=>{
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
  try {
    for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,75));}
    const auth=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})}),cookie=auth.headers.get('set-cookie').split(';')[0];
    const req=async(path,method='GET',data)=>{const r=await fetch(base+path,{method,headers:{cookie,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
    const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body;};
    const body={name:'Mug Custom QA',sku:'QA-MUG',category:'ATK',saleUnit:'pcs',priceBasisId:'unit',retailAtK:true,price:50000,minimumEnabled:true,minimumQuantity:3};
    const mug=await ok('/api/products','POST',body);assert.equal(mug.minimumQuantity,3);assert.equal(mug.wholesaleBasis,'quantity');
    await ok('/api/inventory/QA-MUG','PATCH',{change:100,reason:'QA stock'});
    const payload=q=>({customerName:'MOQ',phone:'6789',items:[{productId:mug.id,quantity:q}]});
    for(const q of [0,1,2,2.5]){
      assert.equal((await req('/api/orders/check','POST',payload(q))).status,400);
      assert.equal((await req('/api/orders','POST',payload(q))).status,400);
    }
    const order=await ok('/api/orders','POST',payload(4));assert.equal(order.total,200000);
    assert.equal((await req('/api/orders/'+order.id,'PUT',payload(2))).status,400);
    const paid=await ok(`/api/orders/${order.id}/payments`,'POST',{method:'TUNAI',amount:10000,requestId:'minimum-pay'});
    assert.equal(paid.paidAmount,10000);assert.equal((await ok(`/api/orders/${order.id}/payments`,'POST',{method:'TUNAI',amount:10000,requestId:'minimum-pay'})).paidAmount,10000);
    // Changing master rules must not prevent settlement of an already accepted order.
    await ok('/api/products/'+mug.id,'PUT',{...body,minimumQuantity:5});
    assert.equal((await ok(`/api/orders/${order.id}/payments`,'POST',{method:'TRANSFER',amount:1})).paidAmount,10001);
    await ok('/api/products/'+mug.id,'PUT',{...body,minimumEnabled:false});
    const oldDraft=await ok('/api/orders','POST',payload(1));
    await ok('/api/products/'+mug.id,'PUT',body);
    assert.equal((await req(`/api/orders/${oldDraft.id}/payments`,'POST',{method:'TUNAI',amount:1})).status,400);
    for(const minimumQuantity of [0,1.5,-1])assert.equal((await req('/api/products/'+mug.id,'PUT',{...body,minimumQuantity})).status,400);
    const bootstrap=await ok('/api/bootstrap?view=master'),p=bootstrap.products.find(p=>p.id==='poster-luster');
    const update={...p,price:150000,wholesaleEnabled:true,wholesaleBasis:'area',priceTiers:[{min:5,price:140000},{min:10,price:130000}]};
    await ok('/api/products/'+p.id,'PUT',update);
    const items=[{productId:p.id,imageWidthCm:100,imageLengthCm:200,quantity:1},{productId:p.id,imageWidthCm:90,imageLengthCm:150,quantity:2,wholesaleQuantity:10000}];
    const quote=await ok('/api/orders/check','POST',{items,includeItems:true});assert.equal(quote.total,714000);assert(quote.items.every(i=>i.unitPrice===140000&&i.wholesaleQuantity===5.1));
    const snapshot=await ok('/api/orders','POST',{customerName:'Area',phone:'1234',items});assert.equal(snapshot.total,quote.total);
    const edited=await ok('/api/orders/'+snapshot.id,'PUT',{customerName:'Area edit',phone:'1234',items:snapshot.items.map(i=>({...i,quantity:1}))});assert.equal(edited.total,562500);assert(edited.items.every(i=>i.unitPrice===150000));
    // Failed master saves are atomic and do not change persisted prices or rules.
    assert.equal((await req('/api/products/'+p.id,'PUT',{...update,priceTiers:[{min:5,price:140000},{min:5,price:130000}]})).status,400);
    assert.equal((await req('/api/products/'+mug.id,'PUT',{...body,wholesaleBasis:'area'})).status,400);
    assert.equal((await ok('/api/bootstrap?view=master')).products.find(i=>i.id===p.id).priceTiers.length,2);
    const physical=(await ok('/api/bootstrap?view=stock')).inventory.find(i=>i.sku==='QA-MUG');assert.equal(physical.quantity,96);
  } finally {child.kill();await new Promise(r=>child.once('exit',r));}
});
