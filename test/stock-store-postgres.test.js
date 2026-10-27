import { appendDeposit,allocateCustomerPayment,finishOperation } from '../lib/customer-deposits.js';
import test from "node:test";
import assert from "node:assert/strict";
import { Store, seedState } from "../lib/store.js";
import { adjustPhysicalStock } from "../lib/physical-stock.js";

// Contract test for the SQL transaction path; no production connection is used.
async function databaseFixture({legacyLf=false,legacyCustomer=false,legacyInvoice=false,legacyPrint=false,legacyDtf=false,legacyDirectory=false}={}) {
 let data=seedState();data.inventory[0].quantity=777;data.orders=[{id:'legacy',status:'DIAMBIL',stockCommitted:true,total:123,paidAmount:123,payments:[{id:'pay',amount:123}],timeline:[{message:'Historic'}],items:[]}];
 const normalizer=new Store();normalizer.memory=data;data=await normalizer.read();data.printStockVersion=1;delete data.stockSchemaVersion;
 if (legacyLf) {
  data.stockSchemaVersion=1;delete data.lfRollWidthVersion;
  data.materials=data.materials.filter(m=>!m.lfRollGroup);
  const materialIds=new Set(data.materials.map(m=>m.id));data.inventory=data.inventory.filter(row=>!row.materialId||materialIds.has(row.materialId));
  for(const p of data.products){delete p.rollStockBindings;delete p.rollStockSources;delete p.rollCapacities;}
 }
 if(legacyCustomer){data.stockSchemaVersion=1;data.lfRollWidthVersion=1;delete data.customerSchemaVersion;delete data.customers;delete data.depositLedger;delete data.cashReceipts;delete data.customerOperations;delete data.customerAccessVersion;}
 if(legacyInvoice){data.stockSchemaVersion=1;data.lfRollWidthVersion=1;data.customerSchemaVersion=1;delete data.invoiceNumberVersion;delete data.invoiceNumberMigration;data.orders[0].code='MP-20261023-0001';data.cashReceipts=[{orderId:'legacy',orderCode:'MP-20261023-0001',amount:123}];}
 if(legacyPrint){data.stockSchemaVersion=1;data.lfRollWidthVersion=1;data.customerSchemaVersion=1;delete data.printStockVersion;const stock=data.inventory.find(row=>row.sku==='KRT-AP260');stock.quantity=100;Object.assign(data.orders[0],{status:'CETAK',stockCommitted:false,items:[{itemId:'printed',status:'CETAK',stockTiming:'PRODUCTION',stockCommitted:false,materials:[{materialId:stock.materialId,sku:stock.sku,units:10,unit:stock.unit}]}]});}
 if(legacyDtf){data.stockSchemaVersion=1;data.lfRollWidthVersion=1;data.customerSchemaVersion=1;delete data.dtfMerchandiseVersion;const p=data.products.find(p=>p.dtfShirt);p.category='Sablon DTF';p.price=123456;data.catalogOptions.categories.push('Sablon DTF');data.catalogOptions.categoryKeys['Sablon DTF']='sablon-dtf';}
 if(legacyDirectory){delete data.customerDirectoryVersion;Object.assign(data.orders[0],{customerName:'Baccala',phone:'081234567890'});}
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


test("customer migration backs up raw production state before adding empty ledgers without rewriting orders or inventory",async()=>{
 const f=await databaseFixture({legacyCustomer:true});await f.store.init();assert.equal(f.store.customerBackupVerified,true);assert.deepEqual(f.backups.get('customer-deposits-v1'),f.data);assert.deepEqual(f.getState().orders,f.data.orders);assert.deepEqual(f.getState().inventory,f.data.inventory);assert.deepEqual(f.getState().customers,[]);assert.deepEqual(f.getState().depositLedger,[]);assert.equal(f.getState().customerSchemaVersion,1);
 const backup=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups'));const update=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));assert(backup<update);assert(f.queries.slice(0,backup).some(q=>q.sql.endsWith('FOR UPDATE')));const raw=structuredClone(f.backups.get('customer-deposits-v1'));await f.store.init();assert.deepEqual(f.backups.get('customer-deposits-v1'),raw);assert.equal(f.backups.size,1);
});
test("customer migration stops before modifying state when its durable backup fails",async()=>{
 const f=await databaseFixture({legacyCustomer:true}),connect=f.store.pool.connect;f.store.pool.connect=async()=>{const connection=await connect();return {...connection,query:async(sql,params)=>{if(sql.startsWith('INSERT INTO app_state_backups'))throw new Error('backup unavailable');return connection.query(sql,params);}};};const before=structuredClone(f.getState());await assert.rejects(f.store.init(),/backup unavailable/);assert.deepEqual(f.getState(),before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert(!f.store.customerBackupVerified);
});


test("PostgreSQL deposit spending, cash receipt and order payment share one locked atomic patch and rollback together",async()=>{
 const f=await databaseFixture();await f.store.init();const user={id:'owner',name:'Owner'};
 await f.store.mutate(state=>{state.customers.push({id:'pg-c',name:'Customer',phone:'081234567890'});appendDeposit(state,'pg-c',20000,'OPENING',user);state.orders.push({id:'pg-o',code:'PG',customerId:'pg-c',customerName:'Customer',phone:'081234567890',total:125000,paidAmount:0,payments:[],items:[],status:'DESAIN',createdAt:new Date().toISOString()});});
 const before=structuredClone(f.getState());f.queries.length=0;
 await f.store.mutate(state=>{allocateCustomerPayment(state,state.orders.find(o=>o.id==='pg-o'),{amount:105000,depositAmount:20000,method:'TRANSFER',requestId:'pg-pay'},user,{canUse:true});finishOperation(state,'pg-pay','pg-test',user,{orderId:'pg-o'});});
 const updates=f.queries.filter(q=>q.sql.startsWith('UPDATE app_state SET data = data ||'));assert.equal(updates.length,1);const patch=JSON.parse(updates[0].params[0]);for(const key of ['orders','depositLedger','cashReceipts','customerOperations'])assert(Object.hasOwn(patch,key));assert(!Object.hasOwn(patch,'inventory'));assert.equal(f.getState().orders.find(o=>o.id==='pg-o').paidAmount,125000);assert(f.queries.some(q=>q.sql.endsWith('FOR UPDATE')));assert.equal(f.queries.at(-1).sql,'COMMIT');assert.deepEqual(f.getState().inventory,before.inventory);
 const paid=structuredClone(f.getState());await assert.rejects(f.store.mutate(state=>{appendDeposit(state,'pg-c',50000,'CORRECTION',user);state.orders[0].paidAmount=999;throw new Error('financial rollback');}));assert.deepEqual(f.getState(),paid);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});

test("invoice conversion backs up raw PostgreSQL state under lock before updating references", async () => {
 const f = await databaseFixture({legacyInvoice:true});
 await f.store.init();
 assert.equal(f.store.invoiceBackupVerified,true);
 assert.deepEqual(f.backups.get('invoice-numbers-v1'),f.data);
 assert.equal(f.getState().orders[0].code,'INV-102326-001');
 assert.equal(f.getState().cashReceipts[0].orderCode,'INV-102326-001');
 assert.equal(f.getState().cashReceipts[0].amount,123);
 assert.deepEqual(f.getState().orders[0].payments,f.data.orders[0].payments);
 assert.deepEqual(f.getState().inventory,f.data.inventory);
 const backup=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups'));
 const update=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));
 assert(backup<update);assert(f.queries.slice(0,backup).some(q=>q.sql.endsWith('FOR UPDATE')));
 const converted=structuredClone(f.getState());await f.store.init();
 assert.deepEqual(f.getState(),converted);assert.equal(f.backups.size,1);
});

test("invoice conversion stops without changing data if its PostgreSQL backup fails", async () => {
 const f=await databaseFixture({legacyInvoice:true}),connect=f.store.pool.connect;
 f.store.pool.connect=async()=>{const connection=await connect();return {...connection,query:async(sql,params)=>{if(sql.startsWith('INSERT INTO app_state_backups'))throw new Error('backup unavailable');return connection.query(sql,params);}};};
 const before=structuredClone(f.getState());await assert.rejects(f.store.init(),/backup unavailable/);
 assert.deepEqual(f.getState(),before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert(!f.store.invoiceBackupVerified);
});

test("print timing migration backs up raw state before consuming previously printed jobs exactly once",async()=>{
 const f=await databaseFixture({legacyPrint:true});await f.store.init();assert(f.store.printStockBackupVerified);assert.deepEqual(f.backups.get('print-stock-v1'),f.data);
 assert.equal(f.getState().inventory.find(row=>row.sku==='KRT-AP260').quantity,90);assert.equal(f.getState().stockMovements.filter(move=>move.itemId==='printed').length,1);assert.equal(f.getState().orders[0].status,'CETAK');assert.deepEqual(f.getState().orders[0].payments,f.data.orders[0].payments);
 const backup=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups')),update=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));assert(backup>=0&&backup<update);assert(f.queries.slice(0,backup).some(q=>q.sql.endsWith('FOR UPDATE')));
 await f.store.init();assert.equal(f.getState().inventory.find(row=>row.sku==='KRT-AP260').quantity,90);assert.equal(f.backups.size,1);
});
test("print timing migration rolls back if the pre-migration backup fails",async()=>{
 const f=await databaseFixture({legacyPrint:true}),connect=f.store.pool.connect;f.store.pool.connect=async()=>{const c=await connect();return {...c,query:async(sql,params)=>{if(sql.startsWith('INSERT INTO app_state_backups'))throw new Error('backup unavailable');return c.query(sql,params);}};};
 const before=structuredClone(f.getState());await assert.rejects(f.store.init(),/backup unavailable/);assert.deepEqual(f.getState(),before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});


test('DTF category migration backs up raw state and preserves pricing, stock and invoices exactly once',async()=>{
 const f=await databaseFixture({legacyDtf:true}),before=structuredClone(f.getState());await f.store.init();
 assert(f.store.dtfMerchandiseBackupVerified);assert.deepEqual(f.backups.get('dtf-merchandise-v1'),before);
 assert.equal(f.getState().products.find(p=>p.dtfShirt).category,'Merchandise');assert.equal(f.getState().products.find(p=>p.dtfShirt).price,123456);
 assert.deepEqual(f.getState().products.find(p=>p.dtfShirt).dtfPackages,before.products.find(p=>p.dtfShirt).dtfPackages);
 assert.deepEqual(f.getState().orders,before.orders);assert.deepEqual(f.getState().inventory,before.inventory);assert.deepEqual(f.getState().materials,before.materials);
 assert(!f.getState().catalogOptions.categories.includes('Sablon DTF'));assert.equal(f.getState().dtfMerchandiseVersion,1);
 const migrated=structuredClone(f.getState());await f.store.init();assert.deepEqual(f.getState(),migrated);assert.equal(f.backups.size,1);
 const backup=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups'));const update=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));assert(backup<update);
});
test('DTF category migration rolls back if its durable backup cannot be saved',async()=>{
 const f=await databaseFixture({legacyDtf:true}),connect=f.store.pool.connect,before=structuredClone(f.getState());
 f.store.pool.connect=async()=>{const c=await connect();return {...c,query:async(sql,params)=>{if(sql.startsWith('INSERT INTO app_state_backups'))throw new Error('backup unavailable');return c.query(sql,params);}};};
 await assert.rejects(f.store.init(),/backup unavailable/);assert.deepEqual(f.getState(),before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});

test('customer directory migration creates and links exact profiles only after a locked raw backup, preserves finances and stock, and repeats safely',async()=>{
 const f=await databaseFixture({legacyDirectory:true});
 await f.store.init();assert.equal(f.store.customerDirectoryBackupVerified,true);const backup=f.backups.get('customer-directory-v1');assert.equal(backup.orders[0].customerId,undefined);const state=f.getState();assert.equal(state.customerDirectoryVersion,1);assert.equal(state.customers.length,1);assert.equal(state.orders[0].customerId,state.customers[0].id);assert.deepEqual(state.orders[0].payments,backup.orders[0].payments);assert.deepEqual(state.inventory,backup.inventory);assert.deepEqual(state.depositLedger,backup.depositLedger);
 const b=f.queries.findIndex(q=>q.sql.startsWith('INSERT INTO app_state_backups')&&q.params[0]==='customer-directory-v1'),u=f.queries.findIndex(q=>q.sql.startsWith('UPDATE app_state SET data = $1'));assert(b>=0&&b<u);assert(f.queries.slice(0,b).some(q=>q.sql.endsWith('FOR UPDATE')));
 const first=structuredClone(f.getState());await f.store.init();assert.deepEqual(f.getState(),first);
});
test('customer directory refuses to migrate when its durable backup fails',async()=>{
 const f=await databaseFixture({legacyDirectory:true}),connect=f.store.pool.connect;f.store.pool.connect=async()=>{const c=await connect(),query=c.query;c.query=async(sql,params)=>{if(sql.startsWith('INSERT INTO app_state_backups')&&params[0]==='customer-directory-v1')throw Error('backup unavailable');return query(sql,params);};return c;};const before=structuredClone(f.getState());await assert.rejects(f.store.init(),/backup unavailable/);assert.deepEqual(f.getState(),before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');
});
