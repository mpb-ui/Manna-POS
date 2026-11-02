import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {Store} from '../lib/store.js';
import {createSecurity,installSecurityHeaders,SESSION_AGE} from '../lib/security.js';

test('Owner-assigned four-digit PIN opens production POS without a change prompt; no idle/manual lock, sessions still expire and revoke',async()=>{
 const store=new Store();await store.init();const salt='test-salt';store.memory.users=[{id:'owner',username:'owner',name:'Owner',role:'OWNER',active:true,sessionVersion:1,pinChangeRequired:true,pinSalt:salt,pinHash:crypto.scryptSync('1234',salt,32).toString('hex')}];
 let now=Date.now();const app=express();installSecurityHeaders(app);app.use(express.json());const security=createSecurity({app,store,secret:'test-session-secret-32-characters',production:true,clock:()=>now});await security.init();app.use('/api',security.middleware);security.registerAuthenticated();app.get('/api/business',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;let cookie,csrf;
 const request=async(path,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(cookie?{cookie,'x-manna-csrf':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:await r.json()};};
 try{
  const logged=await request('/api/login',{username:'owner',pin:'1234'});assert.equal(logged.status,200);assert.equal(logged.body.pinChangeRequired,false);cookie=logged.headers.get('set-cookie').split(';')[0];csrf=logged.body.csrfToken;
  const session=(await request('/api/security/sessions')).body.sessions[0];assert(await security.isSessionActive(session.id));
  // A lock left by the previous release and prolonged inactivity have no effect.
  await security.database.mutate(s=>{for(const row of Object.values(s.sessions)){row.locked=true;row.lastActivity=now-60*60*1000;}});
  now+=16*60000;assert.equal((await request('/api/business')).status,200);assert.equal((await request('/api/session')).body.locked,false);assert(await security.isSessionActive(session.id));
  for(const path of ['lock','unlock','activity'])assert.equal((await request('/api/security/'+path,{})).status,410);
  assert.equal((await request('/api/security/pin',{pin:'1234',newPin:'827194'})).status,403);assert.equal((await store.readUsers())[0].pinHash,crypto.scryptSync('1234',salt,32).toString('hex'));
  now+=SESSION_AGE-16*60000-1;assert.equal((await request('/api/business')).status,200);now+=1;assert.equal((await request('/api/business')).status,401);assert.equal((await request('/api/session')).body.authenticated,false);assert.equal(await security.isSessionActive(session.id),false);
  const again=await request('/api/login',{username:'owner',pin:'1234'});cookie=again.headers.get('set-cookie').split(';')[0];csrf=again.body.csrfToken;const fresh=(await request('/api/security/sessions')).body.sessions[0];
  await store.mutate(s=>s.users[0].sessionVersion++);assert.equal(await security.isSessionActive(fresh.id),false);assert.equal((await request('/api/business')).status,401);
 }finally{await new Promise(r=>server.close(r));}
});
