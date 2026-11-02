import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {Store} from '../lib/store.js';
import {SecurityStore} from '../lib/security-store.js';
import {BackupManager,checksum} from '../lib/backups.js';
import {databaseConfig} from '../lib/database-config.js';
import {applyOwnerPinPolicy,initializeOwnerPinPolicy,validOwnerPin} from '../lib/owner-pins.js';

const at=hour=>`2026-11-01T${String(hour).padStart(2,'0')}:00:00.000Z`;
const credentials=pin=>{const pinSalt=crypto.randomBytes(16).toString('hex');return {pinSalt,pinHash:crypto.scryptSync(pin,pinSalt,32).toString('hex')};};
function fixture(){
 const assigned=credentials('1234'),changed=credentials('827194');
 const user={id:'cash',name:'Latest Name',username:'cashier',role:'CASHIER',active:true,createdAt:at(0),sessionVersion:2,pinChangeRequired:true,...changed};
 const state={users:[user],orders:[{id:'invoice',total:55000,paidAmount:25000}],inventory:[{quantity:98}],customers:[{name:'Abdul',balance:5000}],products:[],auditLogs:[]};
 const events=[{action:'PIN_CHANGE',userId:'cash',createdAt:at(2)}],snapshots=[{createdAt:at(1),users:[{...user,...assigned,sessionVersion:1}]}];
 return {state,user,assigned,changed,events,snapshots};
}
test('only numeric Owner-assigned PINs of 4–12 digits are accepted, including leading zeroes',()=>{
 for(const pin of ['1234','0007','123456789012'])assert(validOwnerPin(pin));
 for(const pin of ['123','1234567890123','ab12','12 34','1234\n',1234,null])assert.equal(validOwnerPin(pin),false);
});
test('removing a forced-change flag leaves the original PIN and existing sessions unchanged',()=>{
 const f=fixture();f.state.users[0]={...f.user,...f.assigned,sessionVersion:1};
 applyOwnerPinPolicy(f.state,[]);assert.equal(f.state.users[0].pinHash,f.assigned.pinHash);assert.equal(f.state.users[0].sessionVersion,1);assert.equal(f.state.users[0].pinChangeRequired,undefined);assert.equal(f.state.ownerPinRecovery.restoredCount,0);
});
test('recovers the Owner-assigned credential only and invalidates changed-PIN sessions',()=>{
 const f=fixture(),before=structuredClone(f.state);applyOwnerPinPolicy(f.state,f.events,f.snapshots);
 assert.equal(f.user.pinHash,f.assigned.pinHash);assert.equal(f.user.pinSalt,f.assigned.pinSalt);assert.equal(f.user.sessionVersion,3);assert.equal(f.user.name,'Latest Name');assert.equal(f.user.pinRecoveryNeeded,false);
 for(const key of ['orders','inventory','customers','products'])assert.deepEqual(f.state[key],before[key]);
 assert.equal(f.state.ownerPinRecovery.restoredCount,1);assert.equal(f.state.ownerPinRecovery.unresolvedCount,0);assert(!JSON.stringify(f.state.auditLogs).includes(f.assigned.pinHash));
 const once=structuredClone(f.state);applyOwnerPinPolicy(f.state,f.events,f.snapshots);assert.deepEqual(f.state,once);
});
test('multiple self-service changes still restore the same Owner assignment',()=>{
 const f=fixture();f.user.sessionVersion=3;f.events.push({...f.events[0],createdAt:at(3)});applyOwnerPinPolicy(f.state,f.events,f.snapshots);assert.equal(f.user.pinHash,f.assigned.pinHash);assert.equal(f.user.sessionVersion,4);
});
test('a newer Owner PIN assignment is preserved and a later self-change restores that newer assignment',()=>{
 const f=fixture();f.state.auditLogs=[{action:'USER_UPDATE',metadata:{targetUserId:'cash',pinChanged:true},createdAt:at(4)}];f.user.sessionVersion=3;
 applyOwnerPinPolicy(f.state,f.events,f.snapshots);assert.equal(f.user.pinHash,f.changed.pinHash);assert.equal(f.state.ownerPinRecovery.restoredCount,0);
 const next=fixture(),latest=credentials('0082');next.state.auditLogs=f.state.auditLogs;next.user.sessionVersion=4;next.events.push({...next.events[0],createdAt:at(6)});next.snapshots.push({createdAt:at(5),users:[{...next.user,...latest,sessionVersion:3}]});
 applyOwnerPinPolicy(next.state,next.events,next.snapshots);assert.equal(next.user.pinHash,latest.pinHash);assert.notEqual(next.user.pinHash,next.assigned.pinHash);
});
test('missing snapshots or unexplained version increments never guess or overwrite a PIN',()=>{
 for(const mode of ['missing','access-change','wrong-user','after-change','before-owner']){
  const f=fixture();if(mode==='missing')f.snapshots=[];if(mode==='access-change')f.user.sessionVersion=8;if(mode==='wrong-user')f.snapshots[0].users[0].id='other';if(mode==='after-change')f.snapshots[0].createdAt=at(3);if(mode==='before-owner')f.user.pinOwnerAssignedAt='2026-11-01T01:30:00.000Z';
  applyOwnerPinPolicy(f.state,f.events,f.snapshots);assert.equal(f.user.pinHash,f.changed.pinHash,mode);assert.equal(f.user.pinRecoveryNeeded,true,mode);assert.equal(f.state.ownerPinRecovery.unresolvedCount,1,mode);
 }
});

test('Postgres recovery verifies snapshots, backs up atomically, preserves business state and runs once',{skip:!process.env.TEST_SECURITY_DATABASE_URL},async()=>{
 const schema='owner_pins_'+crypto.randomBytes(8).toString('hex'),root=new pg.Pool(databaseConfig(process.env.TEST_SECURITY_DATABASE_URL));let pool;
 try{
  await root.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({...databaseConfig(process.env.TEST_SECURITY_DATABASE_URL),options:'-csearch_path='+schema});const store=new Store();store.pool=pool;await store.init();
  const security=new SecurityStore(pool);await security.init();const backup=new BackupManager(store);await backup.init();const f=fixture();
  const original=(await pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data;Object.assign(original,{users:[{...f.user,...f.assigned,sessionVersion:1}],orders:f.state.orders});
  await pool.query('INSERT INTO pos_daily_backups(id,data,digest,created_at) VALUES ($1,$2::jsonb,$3,$4)',['daily:2026-11-01',JSON.stringify(original),checksum(original),at(1)]);
  await pool.query("UPDATE app_state SET data=$1::jsonb WHERE id='main'",[JSON.stringify({...original,users:[f.user]})]);
  await pool.query('INSERT INTO pos_security_events(id,data) VALUES ($1,$2::jsonb)',[crypto.randomUUID(),JSON.stringify(f.events[0])]);
  await initializeOwnerPinPolicy(store,security);const migrated=(await pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data;
  assert.equal(migrated.users[0].pinHash,f.assigned.pinHash);assert.equal(migrated.users[0].sessionVersion,3);assert.equal(store.ownerPinRecovery.restoredCount,1);
  assert.deepEqual(migrated.orders,original.orders);assert.deepEqual(migrated.inventory,original.inventory);assert.deepEqual(migrated.products,original.products);
  const before=(await pool.query("SELECT data FROM app_state_backups WHERE tag='owner-pin-policy-v1'")).rows[0].data;assert.equal(before.users[0].pinHash,f.changed.pinHash);
  await initializeOwnerPinPolicy(store,security);assert.deepEqual((await pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data,migrated);
  // An invalid checksum prevents automatic recovery; the Owner can set it via Edit User.
  const damaged={...original,users:[{...f.user,id:'unknown',sessionVersion:2}],ownerPinPolicyVersion:0};await pool.query("UPDATE app_state SET data=$1::jsonb WHERE id='main'",[JSON.stringify(damaged)]);
  await pool.query('INSERT INTO pos_security_events(id,data) VALUES ($1,$2::jsonb)',[crypto.randomUUID(),JSON.stringify({...f.events[0],userId:'unknown'})]);
  await pool.query('UPDATE pos_daily_backups SET data=$1::jsonb WHERE id=$2',[JSON.stringify({...original,users:[{...f.user,id:'unknown',...f.assigned,sessionVersion:1}]}),'daily:2026-11-01']);
  await initializeOwnerPinPolicy(store,security);assert.equal(store.ownerPinRecovery.unresolvedCount,1);assert.equal((await store.readUsers())[0].pinHash,f.changed.pinHash);
 }finally{await pool?.end();await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.end();}
});
