import test from "node:test";
import assert from "node:assert/strict";
import { Store, seedState } from "../lib/store.js";
import { adjustPhysicalStock } from "../lib/physical-stock.js";

// Contract test for the SQL transaction path; no production connection is used.
async function databaseFixture({legacyLf=false}={}) {
 let data=seedState();data.inventory[0].quantity=777;data.orders=[{id:'legacy',status:'DIAMBIL',stockCommitted:true,total:123,paidAmount:123,payments:[{id:'pay',amount:123}],timeline:[{message:'Historic'}],items:[]}];
 const normalizer=new Store();normalizer.memory=data;data=await normalizer.read();delete data.stockSchemaVersion;
 if (legacyLf) {
  data.stockSchemaVersion=1;delete data.lfRollWidthVersion;
  data.materials=data.materials.filter(m=>!m.lfRollGroup);
  const materialIds=new Set(data.materials.map(m=>m.id));data.inventory=data.inventory.filter(row=>!row.materialId||materialIds.has(row.materialId));
  for(const p of data.products){delete p.rollStockBindings;delete p.rollStockSources;delete p.rollCapacities;}
 }
 let state=structuredClone(data),working,backups=new Map(),savedBackups,queries=[];
 const query=async(sql,params=[])=>{
  queries.push({sql,params});
  if(sql==='BEGIN'){working=structuredClone(state);savedBackups=new Map(backups);}
  else if(sql==='COMMIT'){state=working;working=null;}
  else if(sql==='ROLLBACK'){working=null;backups=savedBackups;}
  else if(sql.startsWith('SELECT data FROM'))return{rows:[{data:structuredClone(working||state)}]};
  else if(sql.startsWith('SELECT EXISTS'))return{rows:[{verified:backups.has(params[0])}]};
  else if(sql.startsWith('INSERT INTO app_state_backups')){if(!backups.has(params[0]))backups.set(params[0],JSON.parse(params[1]));}
  else if(sql.startsWith('UPDATE app_state SET data = data ||'))Object.assign(working,JSON.parse(params[0]));
  else if(sql.startsWith('UPDATE app_state SET data = $1'))working=JSON.parse(params[0]);
  else if(sql.includes("data->'users'"))return{rows:[{users:state.users}]};
  return{rows:[]};
 };
 const store=new Store();store.pool={query,connect:async()=>({query,release(){}})};
 return {store,data,backups,queries,getState:()=>state};
}

test("PostgreSQL migration backs up raw app_state before changing metadata, and is repeatable",async()=>{
 const f=await databaseFixture();await f.store.init();assert.equal(f.store.stockBackupVerified,true);assert.deepEqual(f.backups.get('stock-methods-v1'),f.data);assert.equal(f.getState().inventory[0].quantity,777);assert.equal(f.getState().inventory[0].unit,'m²');assert.equal(f.getState().stockSchemaVersion,1);assert.deepEqual(f.getState().orders[0].payments,f.data.orders[0].payments);assert.deepEqual(f.getState().orders[0].timeline,f.data.orders[0].timeline);
 const backupIndex=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups'));const migrateIndex=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));assert(backupIndex>=0&&backupIndex<migrateIndex);assert(f.queries.slice(0,backupIndex).some(q=>q.sql.endsWith('FOR UPDATE')));
 await f.store.init();assert.equal(f.backups.size,1);assert.deepEqual(f.backups.get('stock-methods-v1'),f.data);
});

test("PostgreSQL stock writes use a locked atomic patch, excluding untouched orders",async()=>{
 const f=await databaseFixture();await f.store.init();f.queries.length=0;
 await f.store.mutate(state=>adjustPhysicalStock(state,state.inventory.find(r=>r.sku==='KRT-AP260'),{change:5,reason:'Stock in'},'Staff'));
 const update=f.queries.find(q=>q.sql.startsWith('UPDATE app_state SET data = data ||'));assert(update);const patch=JSON.parse(update.params[0]);assert(patch.inventory);assert(patch.stockMovements);assert(!Object.hasOwn(patch,'orders'));assert(!Object.hasOwn(patch,'products'));assert(f.queries.some(q=>q.sql.endsWith('FOR UPDATE')));assert.equal(f.queries.at(-1).sql,'COMMIT');
});

test("PostgreSQL errors roll back a mutation and leave the backup untouched",async()=>{
 const f=await databaseFixture();await f.store.init();const before=structuredClone(f.getState());
 await assert.rejects(f.store.mutate(state=>{state.inventory[0].quantity=0;throw new Error('failure')}));assert.deepEqual(f.getState(),before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert.deepEqual(f.backups.get('stock-methods-v1'),f.data);
});


test("LF width migration keeps a raw backup, preserves old balances, creates empty roll SKUs only once",async()=>{
 const f=await databaseFixture({legacyLf:true});await f.store.init();assert.equal(f.store.lfRollBackupVerified,true);assert.deepEqual(f.backups.get('lf-roll-widths-v1'),f.data);assert.equal(f.getState().lfRollWidthVersion,1);assert.equal(f.getState().inventory[0].quantity,777);
 const added=f.getState().materials.filter(m=>m.lfRollGroup);assert.equal(added.length,16);assert(added.every(m=>f.getState().inventory.find(row=>row.materialId===m.id).quantity===0));assert.deepEqual(f.getState().orders,f.data.orders);
 const first=structuredClone(f.getState());await f.store.init();assert.deepEqual(f.getState(),first);assert.equal(f.backups.size,1);
 const backup=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups'));const update=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));assert(backup<update);
});
