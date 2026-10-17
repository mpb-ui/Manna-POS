import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

test('Outdoor API recalculates placement for every product, persists original dimensions, and preserves retries, payments, permission and manual roll stock',async()=>{
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
  try {
    let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+'/api/health')).ok}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100))}assert(ready);
    const auth=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})}),cookie=auth.headers.get('set-cookie').split(';')[0];
    const req=async(path,method='GET',data,session=cookie)=>{const r=await fetch(base+path,{method,headers:{cookie:session,'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()}};
    const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body};
    const before=(await ok('/api/bootstrap?view=stock')).inventory;
    const ids=['fl-280-glossy','fl-380-matte','fl-410-glossy','fl-440-matte','cloth-banner','nb-backlite-510'];
    const items=ids.map(id=>({productId:id,imageWidthCm:100,imageLengthCm:200,allowanceCm:0,quantity:1,width:999,rollCalculationVersion:1,rollPlacement:{nominalWidth:999,usedArea:0,baseTotal:1},finishing:[]}));
    items.push({...items[0],imageWidthCm:200,imageLengthCm:100});
    const payload={customerName:'Outdoor otomatis',phone:'8988',requestId:'outdoor-api-double',items};
    const [a,b]=await Promise.all([ok('/api/orders','POST',payload),ok('/api/orders','POST',payload)]);assert.equal(a.id,b.id);
    for(const item of a.items){assert(item.rollPlacement);assert.notEqual(item.width,999);assert.equal(item.rollPlacement.baseTotal,undefined);assert.equal(item.rollPlacement.usedArea>0,true)}
    assert.equal(a.items[0].baseTotal,a.items.at(-1).baseTotal);assert.equal(a.items[0].rollPlacement.usedArea,a.items.at(-1).rollPlacement.usedArea);assert.equal(a.items[5].baseTotal,135000);
    assert.equal(a.items.at(-1).imageWidthCm,200);assert.equal(a.items.at(-1).imageLengthCm,100);assert(a.items.at(-1).rollPlacement.rotated);
    assert.deepEqual((await ok(`/api/order-history/${a.id}`)).items[0].rollPlacement,a.items[0].rollPlacement);
    const edited=await ok(`/api/orders/${a.id}`,'PUT',{customerName:'Outdoor edit',phone:'8988',items:a.items.map(item=>({...item,width:999,productionNote:'Tepi sesuai desain'}))});assert.equal(edited.total,a.total);assert.equal(edited.items[0].productionNote,'Tepi sesuai desain');
    for(const invalid of [{imageWidthCm:500,imageLengthCm:500},{imageWidthCm:0},{quantity:1.5},{quantity:0},{allowanceCm:-1},{imageWidthCm:null,imageLengthCm:null}])assert.equal((await req('/api/orders','POST',{customerName:'Invalid',phone:'8988',items:[{...items[0],...invalid}]})).status,400);
    const legacy=await ok('/api/orders','POST',{customerName:'Legacy Outdoor',phone:'8988',items:[{productId:ids[0],width:3,length:1,quantity:1,finishing:[]}]});assert.equal(legacy.total,90000);assert.equal(legacy.items[0].rollPlacement,undefined);
    const legacyEdit=await ok(`/api/orders/${legacy.id}`,'PUT',{customerName:'Legacy note edit',phone:'8988',items:legacy.items.map(item=>({...item,length:item.actualLength}))});assert.equal(legacyEdit.total,legacy.total);
    await ok(`/api/orders/${a.id}/payments`,'POST',{method:'TUNAI',amount:1,requestId:'outdoor-dp'});const payment=await ok(`/api/orders/${a.id}/payments`,'POST',{method:'TUNAI',amount:1,requestId:'outdoor-dp'});assert.equal(payment.paidAmount,1);assert.equal(payment.payments.length,1);assert.equal(payment.total,a.total);
    const repeat=await ok(`/api/orders/${a.id}/repeat`,'POST',{});assert(repeat.canRepeat);assert.equal(repeat.total,a.total);assert(repeat.items.every(item=>item.rollPlacement));
    await ok('/api/users','POST',{name:'Outdoor Operator',username:'outdoor-op',role:'PRINT',pin:'5678'});const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'outdoor-op',pin:'5678'})}),op=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await req('/api/orders','POST',payload,op)).status,403);const restricted=(await ok('/api/bootstrap?view=projects','GET',undefined,op)).orders.find(o=>o.id===a.id);assert.equal(restricted.total,undefined);assert.equal(restricted.items[0].baseTotal,undefined);assert.equal(restricted.items[0].unitPrice,undefined);assert(restricted.items[0].rollPlacement);
    for(const item of payment.items){await ok(`/api/orders/${a.id}/items/${item.itemId}/design-pic`,'PATCH',{designPic:'Gema'});for(const status of ['CETAK','FINISHING','SELESAI'])await ok(`/api/orders/${a.id}/items/${item.itemId}/status`,'PATCH',{status});}
    const final=await ok(`/api/order-history/${a.id}`);assert.equal(final.status,'SELESAI');assert.equal(final.paidAmount,1);assert.equal(final.total,a.total);assert.deepEqual((await ok('/api/bootstrap?view=stock')).inventory,before);
  } finally {child.kill();await new Promise(r=>child.once('exit',r));}
});
