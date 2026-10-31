import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
test('real POS server routes preserve print capability status codes, native access and rate limits',async()=>{
 const sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const req=async(path,data,auth=true,token)=>{const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{'content-type':'application/json',...(auth?{cookie}:{}),...(token?{authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  assert.equal((await req('/api/print-jobs',{kind:'invoice',orderId:'x'},false)).status,401);
  assert.equal((await req('/print-helper/claim',{},false)).status,410);
  const o=(await req('/api/orders',{customerName:'Print API Customer',phone:'1172',items:[{productId:'poster-backlite-film',sizeVariantId:'a3',quantity:1}]})).body;
  const created=await req('/api/print-jobs',{orderId:o.id,kind:'invoice'});assert.equal(created.status,201);
  const token=new URL(created.body.launchUrl).searchParams.get('job');const claimed=await req('/print-helper/claim',{},false,token);assert.equal(claimed.status,200);assert.equal(claimed.body.document.kind,'invoice');assert.equal(claimed.body.document.status,'Belum Lunas');
  assert.equal((await req('/print-helper/claim',{},false,token)).status,410);
  assert.equal((await req('/print-helper/status',{status:'opened'},false,token)).status,200);
  assert.equal((await req('/api/print-jobs/'+created.body.id)).body.status,'opened');
  const results=await Promise.all(Array.from({length:13},()=>req('/api/print-jobs',{orderId:o.id,kind:'invoice'})));
  assert.equal(results.filter(r=>r.status===201).length,11);assert.equal(results.filter(r=>r.status===429).length,2);
 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
