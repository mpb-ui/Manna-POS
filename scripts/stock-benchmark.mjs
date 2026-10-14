import {spawn} from 'node:child_process';
import {performance} from 'node:perf_hooks';
const root=new URL('..',import.meta.url).pathname;
const child=spawn(process.execPath,['--import','./scripts/stock-benchmark-fixture.mjs','server.js'],{cwd:root,env:{...process.env,DATABASE_URL:'',PORT:'3152',APP_PIN:'1234'},stdio:'ignore'});
const base='http://127.0.0.1:3152';
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})});const cookie=login.headers.get('set-cookie').split(';')[0];
 const results=[];
 for(const endpoint of ['/api/bootstrap','/api/bootstrap?view=pos','/api/bootstrap?view=stock']){
  const samples=[];let bytes,orders;
  for(let i=0;i<5;i++){const start=performance.now();const response=await fetch(base+endpoint,{headers:{cookie}});const body=await response.text();if(!response.ok)throw Error(body);samples.push(Number((performance.now()-start).toFixed(2)));bytes=Buffer.byteLength(body);orders=JSON.parse(body).orders.length;}
  results.push({endpoint,bytes,orders,milliseconds:samples});
 }
 console.log(JSON.stringify({fixture:'3000 completed orders, 10 timeline entries/order, in-memory only',results},null,2));
}finally{child.kill();await new Promise(r=>child.once('exit',r))}
