import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { assetToday, addAssetMonths } from '../public/asset-domain.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('API aset membatasi role, mengamankan revisi dan hubungan mesin, serta menjaga laporan pesanan',async()=>{
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'});const base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await wait(100);}assert.ok(ready);
  const login=async(username,pin)=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,pin})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  const owner=await login('admin','1234');const request=async(path,method='GET',payload,cookie=owner)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:payload===undefined?undefined:JSON.stringify(payload)});return {status:r.status,body:await r.json()};};
  const ok=async(path,method,payload,cookie)=>{const r=await request(path,method,payload,cookie);assert.ok(r.status>=200 && r.status<300,JSON.stringify(r.body));return r.body;};
  for(const role of ['CASHIER','WAREHOUSE','ADMIN'])await ok('/api/users','POST',{name:role,username:`asset-${role.toLowerCase()}`,role,pin:'5678'});
  const cashier=await login('asset-cashier','5678'),warehouse=await login('asset-warehouse','5678'),admin=await login('asset-admin','5678');
  for(const cookie of [cashier,warehouse]){assert.equal((await request('/api/assets','GET',undefined,cookie)).status,403);assert.equal((await request('/api/assets','POST',{},cookie)).status,403);assert.deepEqual((await ok('/api/bootstrap','GET',undefined,cookie)).assetLinks,[]);}
  assert.deepEqual((await ok('/api/assets','GET',undefined,admin)).rows,[]);
  const today=assetToday(),period=today.slice(0,7),previous=addAssetMonths(period,-1);
  const machine=await ok('/api/machines','POST',{name:'Asset Machine Test',code:'ASSET-MACH'});
  const body={name:'Mesin Test',code:'AST-TEST',category:'Mesin Produksi',machineId:machine.id,acquiredDate:`${previous}-01`,readyDate:`${previous}-01`,acquisitionCost:12000000,residualValue:0,usefulLifeMonths:48};
  const beforeReport=await ok('/api/reports');const asset=await ok('/api/assets','POST',body,admin);assert.ok(asset.id);
  assert.equal((await request('/api/assets','POST',{...body,code:'AST-DUP'})).status,400);
  assert.equal((await request(`/api/assets/${asset.id}`,'PUT',{...body,name:'Edited',revision:0})).status,400);
  assert.equal((await request(`/api/assets/${asset.id}`,'PUT',{...body})).status,400);
  const edited=await ok(`/api/assets/${asset.id}`,'PUT',{...body,name:'Edited',revision:asset.revision});assert.equal(edited.revision,2);
  let report=await ok(`/api/assets?period=${period}`);assert.equal(report.totals.depreciation,250000);assert.equal(report.rows[0].name,'Edited');
  const link=(await ok('/api/bootstrap')).assetLinks.find(row=>row.id===asset.id);assert.equal(link.machineId,machine.id);assert.equal(link.bookValue,11500000);
  const oldSchedule=(await ok(`/api/assets/${asset.id}?from=${previous}&to=${previous}`)).schedule;
  assert.equal((await request(`/api/assets/${asset.id}`,'DELETE',{revision:edited.revision})).status,400);
  const estimate=await ok(`/api/assets/${asset.id}/estimate`,'POST',{revision:edited.revision,effectivePeriod:addAssetMonths(period,1),remainingMonths:46,residualValue:0,capitalAddition:1000000,reason:'Upgrade'});
  await ok(`/api/machines/${machine.id}`,'DELETE');
  report=await ok(`/api/assets?period=${period}`);assert.equal(report.totals.depreciation,250000);assert.equal(report.rows[0].machineName,'Asset Machine Test');
  const disposed=await ok(`/api/assets/${asset.id}/disposal`,'POST',{revision:estimate.revision,date:today,type:'SOLD',proceeds:9000000,reason:'Dijual'});assert.equal(disposed.disposal.type,'SOLD');
  await ok(`/api/assets/${asset.id}`,'DELETE',{revision:disposed.revision});
  assert.deepEqual((await ok(`/api/assets/${asset.id}?from=${previous}&to=${previous}`)).schedule,oldSchedule);
  const afterReport=await ok('/api/reports');assert.deepEqual(afterReport.summary,beforeReport.summary);
  assert.equal((await request(`/api/assets/${asset.id}`,'GET',undefined,cashier)).status,403);
  assert.equal((await request(`/api/assets/${asset.id}/estimate`,'POST',{},cashier)).status,403);
  assert.equal((await request(`/api/assets/${asset.id}/disposal`,'POST',{},cashier)).status,403);
  const audit=(await ok('/api/bootstrap')).auditLogs;assert.ok(audit.some(row=>row.action==='ASSET_CREATE'));assert.ok(audit.some(row=>row.action==='ASSET_DISPOSE'));assert.ok(audit.some(row=>row.action==='ASSET_ARCHIVE'));
 }finally{child.kill();if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));}
});
