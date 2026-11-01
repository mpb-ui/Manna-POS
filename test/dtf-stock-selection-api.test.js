import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';

test('endpoint stok kaos ringan, tanpa nominal, permission POS, dan memakai reservasi pembayaran atomik',async()=>{
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const request=async(path,method='GET',body,auth=cookie)=>{const r=await fetch(base+path,{method,headers:{cookie:auth,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:await r.json()};};
  const ok=async(...args)=>{const r=await request(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
  assert.equal((await fetch(base+'/api/pos/shirt-stock')).status,401);
  let response=await request('/api/pos/shirt-stock');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Object.keys(response.body),['shirtStock']);assert.equal(response.body.shirtStock.length,10);assert(response.body.shirtStock.every(row=>Object.keys(row).every(key=>['materialId','color','size','available'].includes(key))));
  await ok('/api/inventory/KAOS-HIT-M','PATCH',{change:5,reason:'QA stok kaos'});
  const input={customerName:'QA stok',phone:'8988',items:[{productId:'dtf-sablon-kaos',dtfPackageId:'logo',shirtVariants:[{color:'Hitam',size:'M',quantity:3}]}]};
  const a=await ok('/api/orders','POST',input),b=await ok('/api/orders','POST',input);
  assert.equal((await ok('/api/pos/shirt-stock')).shirtStock.find(row=>row.color==='Hitam'&&row.size==='M').available,5);
  const payments=await Promise.all([a,b].map(order=>request(`/api/orders/${order.id}/payments`,'POST',{method:'TUNAI',amount:1})));assert.deepEqual(payments.map(r=>r.status).sort(),[200,400]);
  assert.equal((await ok('/api/pos/shirt-stock')).shirtStock.find(row=>row.color==='Hitam'&&row.size==='M').available,2);
  assert.equal((await ok('/api/bootstrap?view=stock')).inventory.find(row=>row.sku==='KAOS-HIT-M').quantity,5);
  await ok('/api/users','POST',{name:'Gudang QA',username:'shirt-gudang',pin:'7890',role:'WAREHOUSE'});
  const warehouseLogin=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'shirt-gudang',pin:'7890'})});const warehouseCookie=warehouseLogin.headers.get('set-cookie').split(';')[0];assert.equal((await request('/api/pos/shirt-stock','GET',undefined,warehouseCookie)).status,403);
 }finally{child.kill();}
});
