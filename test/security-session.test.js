import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import {Store} from '../lib/store.js';
import {createSecurity,installSecurityHeaders,IDLE_AGE,SESSION_AGE} from '../lib/security.js';

test('server idle lock is independent of background GETs, activity extends idle time, session expires after 12 hours',async()=>{
 const store=new Store();await store.init();const salt='test-salt';store.memory.users=[{id:'owner',username:'owner',name:'Owner',role:'OWNER',active:true,sessionVersion:1,pinSalt:salt,pinHash:crypto.scryptSync('827194',salt,32).toString('hex')}];
 let now=Date.now();const app=express();installSecurityHeaders(app);app.use(express.json());const security=createSecurity({app,store,secret:'test-session-secret-32-characters',clock:()=>now});await security.init();app.use('/api',security.middleware);security.registerAuthenticated();app.get('/api/business',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;let cookie,csrf;
 const request=async(path,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(cookie?{cookie,'x-manna-csrf':csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:await r.json()};};
 try{
  const logged=await request('/api/login',{username:'owner',pin:'827194'});cookie=logged.headers.get('set-cookie').split(';')[0];csrf=logged.body.csrfToken;
  now+=IDLE_AGE-1000;assert.equal((await request('/api/business')).status,200);now+=1001;assert.equal((await request('/api/business')).status,423);assert.equal((await request('/api/session')).body.locked,true);
  assert.equal((await request('/api/security/unlock',{pin:'827194'})).status,200);const session=(await request('/api/security/sessions')).body.sessions[0];assert(await security.isSessionActive(session.id));
  now+=IDLE_AGE-1000;assert.equal((await request('/api/security/activity',{})).status,200);now+=2000;assert.equal((await request('/api/business')).status,200);
  await request('/api/security/lock',{});assert.equal(await security.isSessionActive(session.id),false);await request('/api/security/unlock',{pin:'827194'});
  now+=SESSION_AGE;assert.equal((await request('/api/business')).status,401);assert.equal((await request('/api/session')).body.authenticated,false);
 }finally{await new Promise(r=>server.close(r));}
});
