import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
test('new and edited A3 products persist tabs; concurrent fifth quick pick is rejected and history/stock stay intact',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',NODE_ENV:'test',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 try{
  for(let i=0;i<120;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  const auth=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})}),cookie=auth.headers.get('set-cookie').split(';')[0];
  const request=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const ok=async(...args)=>{const r=await request(...args);assert(r.status<300,JSON.stringify(r));return r.body;};
  const before=await ok('/api/bootstrap?view=master');
  const config=i=>({productEditorVersion:1,sku:'A3-TAB-QA-'+i,name:'A3 Tab QA '+i,category:'Print A3+',a3Kind:'ready',a3Popular:true,price:10000,saleUnit:'pcs',materialSources:[],machineIds:['mach-digital'],active:true,featured:false});
  const concurrent=await Promise.all(Array.from({length:5},(_,i)=>request('/api/products','POST',config(i))));assert.equal(concurrent.filter(r=>r.status===201).length,4);assert.equal(concurrent.find(r=>r.status===409).body.code,'A3_QUICK_LIMIT');
  const p=concurrent.find(r=>r.status===201).body;assert.equal(p.a3Kind,'ready');assert.equal(p.featured,false);assert.equal(p.a3Family,null);
  const order=await ok('/api/orders','POST',{customerName:'A3 Tabs QA',phone:'445566',items:[{productId:p.id,quantity:2}]});assert.equal(order.total,20000);
  const moved=await ok('/api/products/'+p.id,'PUT',{...p,a3Kind:'sticker',a3Popular:false,price:12000});assert.equal(moved.a3Kind,'sticker');assert.equal(moved.a3Popular,false);
  assert.deepEqual((await ok('/api/order-history/'+order.id)).items,order.items);assert.equal((await ok('/api/order-history/'+order.id)).total,order.total);
  const added=await ok('/api/products','POST',config('replacement'));assert.equal(added.a3Kind,'ready');
  const paper=await ok('/api/products','POST',{...config('paper'),a3Kind:'paper',a3Popular:false});assert.equal(paper.a3Family,null);
  assert.equal((await ok('/api/orders/check','POST',{items:[{productId:paper.id,quantity:3}]})).total,30000);
  const generic=await ok('/api/products/'+paper.id,'PUT',{...paper,category:'Merchandise',a3Popular:true});assert.equal(generic.a3Kind,null);assert.equal(generic.a3Popular,false);
  assert.equal((await request('/api/products','POST',{...config('invalid'),a3Kind:'INVALID'})).status,400);
  await ok('/api/products/'+added.id,'DELETE');assert.equal((await request('/api/products','POST',config('after-delete'))).status,201);
  const after=await ok('/api/bootstrap?view=master');assert.deepEqual(after.inventory,before.inventory);assert.equal(after.products.filter(p=>p.a3Kind==='ready'&&p.a3Popular&&!p.deletedAt).length,4);
 }finally{child.kill();if(child.exitCode===null)await new Promise(r=>child.once('exit',r));}
});
