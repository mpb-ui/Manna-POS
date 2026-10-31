import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
test('report deletion is Owner-only, rejects a changed preview, preserves refund history, and retries once',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
  const login=async username=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin:'1234'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login('admin');
  const req=async(path,method='GET',body,cookie=owner)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  const ok=async(...args)=>{const r=await req(...args);assert(r.status<300,JSON.stringify(r));return r.body;};
  for(const [username,role] of [['manager','MANAGER'],['cashier','CASHIER'],['administrator','ADMIN']])await ok('/api/users','POST',{name:username,username,role,pin:'1234'});
  let o=await ok('/api/orders','POST',{customerName:'Report Refund',phone:'7997',items:[{productId:'poster-backlite-film',sizeVariantId:'a3',quantity:1,finishing:[]}]});
  const preview=o;o=await ok('/api/orders/'+o.id+'/payments','POST',{method:'TUNAI',amount:1000});
  const body={reason:'Salah transaksi',disposition:'REFUND',method:'TUNAI',requestId:'report-cancel',expectedUpdatedAt:preview.updatedAt,expectedTotal:preview.total,expectedPaidAmount:preview.paidAmount};
  assert.equal((await req('/api/reports/orders/'+o.id+'/cancel','POST',body)).status,409);
  for(const name of ['manager','cashier','administrator'])assert.equal((await req('/api/reports/orders/'+o.id+'/cancel','POST',body,await login(name))).status,403);
  Object.assign(body,{expectedUpdatedAt:o.updatedAt,expectedTotal:o.total,expectedPaidAmount:o.paidAmount});
  const canceled=await ok('/api/reports/orders/'+o.id+'/cancel','POST',body);assert.equal(canceled.status,'BATAL');await ok('/api/reports/orders/'+o.id+'/cancel','POST',body);
  const history=await ok('/api/orders/'+o.id+'/cash-receipts');assert.equal(history.length,2);assert.equal(history.filter(r=>r.amount<0).length,1);assert.equal(history.reduce((n,r)=>n+r.amount,0),0);
  const report=await ok('/api/reports?from=2020-01-01&to=2099-12-31');assert.equal(report.summary.sales,0);assert.equal(report.summary.paid,0);assert.equal(report.summary.outstanding,0);assert.equal(report.rows.filter(r=>r.id===o.id).length,2);assert.equal(report.rows.filter(r=>r.kind==='CANCELLATION').length,1);assert.equal(report.capabilities.delete,true);
  assert.equal((await req('/api/reports/orders/'+o.id+'/cancel','POST',{...body,reason:'data berbeda'})).status,400);
  // An unpaid invoice cancels without inventing a cash movement.
  o=await ok('/api/orders','POST',{customerName:'Report Unpaid',phone:'7998',items:[{productId:'poster-backlite-film',sizeVariantId:'a3',quantity:1,finishing:[]}]});
  await ok('/api/reports/orders/'+o.id+'/cancel','POST',{reason:'Salah invoice',disposition:'REFUND',requestId:'unpaid-cancel',expectedUpdatedAt:o.updatedAt,expectedTotal:o.total,expectedPaidAmount:o.paidAmount});
  assert.equal((await ok('/api/orders/'+o.id+'/cash-receipts')).length,0);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
});
