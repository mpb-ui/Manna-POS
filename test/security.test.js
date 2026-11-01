import {clientAddress} from '../lib/client-address.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveAttempt,LOGIN_POLICY} from '../lib/security.js';
import {SecurityStore} from '../lib/security-store.js';
import {seedState,Store} from '../lib/store.js';
import {BackupManager,encryptBackup,decryptBackup,checksum,verifySnapshot} from '../lib/backups.js';
import {prepareImage} from '../lib/media.js';
import sharp from 'sharp';

test('five reservations give 1/5/15 minute cooldowns, capped at 15; blocked traffic never extends a cooldown',()=>{
 const state={limits:{}};let time=10000000;
 for(const delay of [60,300,900,900]){
  for(let i=0;i<5;i++)assert.equal(reserveAttempt(state,'account','ip',time).allowed,true);
  const blocked=reserveAttempt(state,'account','different-ip',time+1000);assert.equal(blocked.allowed,false);assert.equal(blocked.retryAfter,delay-1);
  assert.equal(reserveAttempt(state,'account','ip',time+(delay-1)*1000).retryAfter,1);time+=delay*1000;
 }
 assert.equal(LOGIN_POLICY.resetAfter,30*60000);
 const fresh=reserveAttempt(state,'account','ip',time+30*60000);assert.equal(fresh.allowed,true);assert.equal(state.limits['account:account'].failures,1);
});
test('concurrent guesses reserve only five slots; account limits follow the account across IPs',async()=>{
 const database=new SecurityStore();const results=await Promise.all(Array.from({length:30},(_,i)=>database.mutate(state=>reserveAttempt(state,'same','ip-'+i,1000000))));assert.equal(results.filter(r=>r.allowed).length,5);
 assert.equal((await database.mutate(state=>reserveAttempt(state,'another','different',1000000))).allowed,true);
});
test('IP guard bounds unknown-account spraying independently of per-account counters',()=>{
 const state={limits:{}};for(let i=0;i<40;i++)assert.equal(reserveAttempt(state,'user-'+i,'same-ip',1000000).allowed,true);assert.equal(reserveAttempt(state,'new-user','same-ip',1000000).allowed,false);assert.equal(reserveAttempt(state,'new-user','different-ip',1000000).allowed,true);
});
test('encrypted backup restores exact business state and images; wrong passwords and corruption fail closed',async()=>{
 const data=seedState();data.orders.push({id:'paid-order',total:55000,paidAmount:55000,payments:[{id:'dp',amount:25000},{id:'settle',amount:30000}],items:[]});data.cashReceipts=[{id:'cash',amount:30000}];data.customers=[{id:'customer',name:'Private customer'}];data.depositLedger=[{amount:1000}];data.homeCampaign={items:[{thumbnail:'data:image/png;base64,example'}]};
 const archive=await encryptBackup(data,'test passphrase 2026');assert(!JSON.stringify(archive).includes('Private customer'));const restored=await decryptBackup(archive,'test passphrase 2026');assert.deepEqual(restored.data,data);assert.equal(restored.summary.orders,1);
 const target=new Store();target.memory=structuredClone(restored.data);assert.deepEqual(target.memory.orders,data.orders);assert.deepEqual(target.memory.homeCampaign,data.homeCampaign);assert.equal(checksum(target.memory),restored.digest);
 await assert.rejects(decryptBackup(archive,'incorrect passphrase'),/salah|rusak/);await assert.rejects(decryptBackup({...archive,content:archive.content.slice(0,-8)+'AAAAAAAA'},'test passphrase 2026'),/salah|rusak/);assert.throws(()=>verifySnapshot(data,'0'.repeat(64)),/checksum/);
});
test('daily snapshots verify stored bytes, are idempotent per day, and preserve the source state',async()=>{
 const store=new Store();await store.init();let time=Date.now();const manager=new BackupManager(store,{clock:()=>time});const before=structuredClone(store.memory);await manager.init();assert.equal(manager.status.verified,true);await manager.capture();assert.equal(manager.rows.length,1);assert.deepEqual(store.memory,before);
 manager.rows[0].data.inventory[0].quantity++;await assert.rejects(manager.capture(),/checksum/);assert.equal(manager.status.verified,false);assert.deepEqual(store.memory,before);
 time+=86400000;await manager.capture();assert.equal(manager.rows.length,2);assert.equal(manager.status.verified,true);
});
test('upload adapter decodes real pixels, strips metadata, computes a reference, rejects forged/truncated/oversized images',async()=>{
 const bytes=await sharp({create:{width:800,height:600,channels:3,background:'#e0c5a0'}}).jpeg().toBuffer();
 const result=await prepareImage({name:'../PO.jpg',type:'image/jpeg',dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')});assert.equal(result.type,'image/webp');assert.equal(result.storage,'database');assert.equal(result.width,800);assert.equal(result.height,600);assert.match(result.checksum,/^[a-f0-9]{64}$/);assert(!result.name.includes('/'));
 const thumbnail=await prepareImage({dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')},'campaign');assert.equal(thumbnail.width,512);
 await assert.rejects(prepareImage({dataUrl:'data:image/png;base64,'+bytes.toString('base64')}),/format|rusak/);
 await assert.rejects(prepareImage({dataUrl:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}),/rusak/);
 await assert.rejects(prepareImage({dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}),/valid/);
 await assert.rejects(prepareImage({dataUrl:'data:image/png;base64,'+'A'.repeat(3600000)}),/maksimal/);
});

test('Render client address ignores forged leftmost XFF and skips only trusted proxy ranges',()=>{
 const req={socket:{remoteAddress:'10.0.0.1'},headers:{'x-forwarded-for':'1.2.3.4, 203.0.113.10, 104.16.1.1, 10.1.1.1'}};assert.equal(clientAddress(req,{render:true}),'203.0.113.10');assert.equal(clientAddress(req,{render:false}),'10.0.0.1');
});
