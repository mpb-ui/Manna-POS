import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import sharp from 'sharp';
import {decryptBackup} from '../lib/backups.js';

test('real server enforces session revocation, CSRF, lock, Owner boundaries, upload validation and encrypted exports',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',NODE_ENV:'test',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 const request=async(path,method='GET',body,session,extra={})=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(session?{cookie:session.cookie,'x-manna-csrf':session.csrf}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:await r.json()};};
 const login=async(username='admin',pin='1234')=>{const r=await request('/api/login','POST',{username,pin});assert.equal(r.status,200,JSON.stringify(r.body));return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.body.csrfToken,user:r.body.user};};
 try{
  let ready=false;for(let i=0;i<150;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready);
  const owner=await login();assert.equal(owner.csrf.length,64);
  const health=await request('/api/health');assert.match(health.headers.get('content-security-policy'),/script-src 'self'/);assert.equal(health.headers.get('x-content-type-options'),'nosniff');assert.equal(health.headers.get('x-powered-by'),null);
  assert.equal((await request('/api/users','POST',{name:'bad'},owner,{'x-manna-csrf':''})).status,403);
  assert.equal((await request('/api/users','POST',{name:'bad'},owner,{origin:'https://attacker.example'})).status,403);
  assert.equal((await request('/api/users','POST',{name:'bad'},owner,{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await request('/api/users','POST',{name:'bad'},owner,{'content-type':'text/plain'})).status,415);
  for(const [role,username] of [['CASHIER','cashier'],['ADMIN','administrator'],['WAREHOUSE','warehouse']])assert.equal((await request('/api/users','POST',{name:role,username,pin:'1234',role},owner)).status,201);
  const cashier=await login('cashier'),administrator=await login('administrator'),warehouse=await login('warehouse');
  for(const session of [cashier,administrator,warehouse])assert.equal((await request('/api/security/backups','GET',undefined,session)).status,403);
  assert.equal((await request('/api/users','POST',{name:'Escalation',username:'escalation',pin:'1234',role:'OWNER'},administrator)).status,403);
  assert.equal((await request('/api/users/'+owner.user.id,'PUT',{name:'Changed Owner',username:'admin',role:'OWNER'},administrator)).status,403);
  assert.equal((await request('/api/users/'+owner.user.id,'DELETE',{},administrator)).status,403);
  const order=await request('/api/orders','POST',{customerName:'Security test',phone:'9876',items:[{productId:'poster-backlite-film',sizeVariantId:'a3',quantity:1}]},cashier);assert.equal(order.status,201);
  const path='/api/orders/'+order.body.id;
  assert.equal((await request('/api/security/lock','POST',{},cashier)).status,200);
  assert.equal((await request('/api/bootstrap','GET',undefined,cashier)).status,423);
  assert.equal((await request('/api/security/unlock','POST',{pin:'0000'},cashier)).body.code,'AUTH_FAILED');
  assert.equal((await request('/api/security/unlock','POST',{pin:'1234'},cashier)).status,200);
  assert.equal((await request('/api/bootstrap','GET',undefined,cashier)).status,200);
  assert.equal((await request(path+'/payments','POST',{type:'PO',poNumber:'PO-X',poAttachment:{type:'image/png',dataUrl:'data:image/png;base64,iVBORw0KGgo='}},cashier)).status,400);
  const unchanged=await request('/api/order-history/'+order.body.id,'GET',undefined,owner);assert.equal(unchanged.body.paidAmount,0);assert.equal(unchanged.body.payments.length,0);
  const bytes=await sharp({create:{width:30,height:20,channels:3,background:'white'}}).png().toBuffer();
  const po=await request(path+'/payments','POST',{type:'PO',poNumber:'PO-X',poAttachment:{name:'po.png',type:'image/png',dataUrl:'data:image/png;base64,'+bytes.toString('base64')}},cashier);assert.equal(po.status,200,JSON.stringify(po.body));assert.equal(po.body.payments[0].poAttachment.type,'image/webp');assert.equal(po.body.payments[0].poAttachment.storage,'database');
  assert.equal((await request(path+'/cancel','POST',{reason:'test'},cashier)).status,403);
  // Account cooldown does not terminate a valid already-open session.
  for(let i=0;i<5;i++){const r=await request('/api/login','POST',{username:'cashier',pin:'wrong'});assert.equal(r.status,i===4?429:401);}
  const blocked=await request('/api/login','POST',{username:'cashier',pin:'1234'});assert.equal(blocked.status,429);assert(Number(blocked.headers.get('retry-after'))>0);
  assert.equal((await request('/api/bootstrap','GET',undefined,cashier)).status,200);
  const overview=await request('/api/security/overview','GET',undefined,owner);assert.equal(overview.body.blocked[0].username,'cashier');assert(overview.body.events.some(row=>row.action==='LOGIN_FAILED'));assert(!JSON.stringify(overview.body).includes('pinHash'));
  assert.equal((await request('/api/security/unblock','POST',{username:'cashier',reason:'Kasir lupa mengetik PIN',pin:'1234'},owner)).status,200);await login('cashier');
  const exported=await request('/api/security/backups/export','POST',{pin:'1234',passphrase:'backup secret phrase'},owner);assert.equal(exported.status,200,JSON.stringify(exported.body));assert.equal(exported.headers.get('cache-control'),'no-store');const restored=await decryptBackup(exported.body,'backup secret phrase');assert.equal(restored.data.orders[0].id,order.body.id);assert.equal(restored.data.orders[0].payments[0].poAttachment.checksum,po.body.payments[0].poAttachment.checksum);
  assert.equal((await request('/api/logout','POST',{},warehouse)).status,200);assert.equal((await request('/api/bootstrap','GET',undefined,warehouse)).status,401);
  const sessions=await request('/api/security/sessions','GET',undefined,owner),other=sessions.body.sessions.find(s=>s.userId===administrator.user.id);assert(other);assert.equal((await request('/api/security/sessions/'+other.id,'DELETE',undefined,cashier)).status,403);assert.equal((await request('/api/security/sessions/'+other.id,'DELETE',undefined,owner)).status,200);assert.equal((await request('/api/bootstrap','GET',undefined,administrator)).status,401);
  assert.equal((await request('/api/security/pin','POST',{pin:'1234',newPin:'827194'},cashier)).status,200);assert.equal((await request('/api/bootstrap','GET',undefined,cashier)).status,401);await login('cashier','827194');

 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
