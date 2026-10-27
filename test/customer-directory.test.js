import test from 'node:test';
import assert from 'node:assert/strict';
import { customerMatch,similarName } from '../public/customer-search.js';
import { directoryIndex,matchingCustomers,registerOrderCustomer,migrateCustomerDirectory,mergeCustomers } from '../lib/customer-directory.js';
import { initializeCustomers,appendDeposit,customerBalance,allocateCustomerPayment,cancelCustomerOrder } from '../lib/customer-deposits.js';
import { Store } from '../lib/store.js';
import { aggregateReport } from '../lib/reports.js';
const owner={id:'owner',name:'Owner',role:'OWNER'};
const customer=(id,name='Baccala',phone='081234567890')=>({id,name,phone,aliases:[],note:''});
const order=(id,extra={})=>({id,code:id,customerName:'Baccala',phone:'081234567890',createdAt:'2026-10-27T01:00:00Z',status:'DESAIN',paymentConfirmed:true,total:100000,paidAmount:0,payments:[],items:[],...extra});
function fixture(){const state={customers:[customer('a'),customer('b','Bacalla','081298765432'),customer('c','Batter Days','085678901234')],orders:[],products:[],inventory:[],machines:[]};initializeCustomers(state);return state;}
test('suggestions match contains text, typo, alias, accents and full/suffix phone without auto merging',()=>{
 const s=fixture();s.customers.push(customer('d','Sabrina','086789123456'),customer('e','Abdul','087654321098'));
 assert.deepEqual(matchingCustomers(s,'ab').map(c=>c.name),['Abdul','Sabrina']);
 for(const query of ['Bacala','Bacalla'])assert(matchingCustomers(s,query).some(c=>c.id==='a'));
 for(const query of ['Bater Days','Better Days'])assert(matchingCustomers(s,query).some(c=>c.id==='c'));
 assert(!similarName('ab','Abdul'));assert(!similarName('Baccala','Sekolah Manna'));
 s.customers[0].aliases=['Restó Italia'];assert.equal(matchingCustomers(s,'resto')[0].id,'a');
 assert.equal(customerMatch(s.customers[0],'','6281234567890').matchReason,'WhatsApp sama');
 assert(!customerMatch(s.customers[0],'','7890').strongMatch);assert.equal(s.customers.length,5);
});
test('order registration reuses exact identity, blocks fuzzy duplicates until explicit decision and accepts arbitrary numeric phone',()=>{
 const s=fixture(),o=order('new',{customerName:' baccala '});registerOrderCustomer(s,o,{},owner);assert.equal(o.customerId,'a');assert.equal(s.customers.length,3);
 const typo=order('typo',{customerName:'Bacala'});assert.throws(()=>registerOrderCustomer(s,typo,{},owner),e=>e.code==='CUSTOMER_MATCH_REQUIRED'&&e.matches.some(c=>c.id==='a'));
 registerOrderCustomer(s,typo,{newCustomerConfirmedIds:['a','b']},owner);assert.equal(s.customers.length,4);assert.notEqual(typo.customerId,'a');
 assert.throws(()=>registerOrderCustomer(s,order('stale',{customerName:'Typo'}),{customerId:'a'},owner),/Pilih ulang/);
 const short=order('short',{customerName:'Nomor Bebas',phone:'123'});registerOrderCustomer(s,short,{},owner);assert.equal(s.customers.at(-1).phone,'123');
});
test('Total Belanja counts fully settled confirmed invoices once; DP, draft, canceled and extra deposit excluded',()=>{
 const s=fixture();s.orders=[order('paid',{customerId:'a',paidAmount:100000}),order('dp',{customerId:'a',paidAmount:50000}),order('draft',{customerId:'a',status:'MENUNGGU_PEMBAYARAN',paymentConfirmed:false}),order('canceled',{customerId:'a',paidAmount:100000,cancelledAt:'2026-10-27',status:'BATAL'})];
 appendDeposit(s,'a',500000,'OPENING',owner);let stats=directoryIndex(s).index.get('a');assert.equal(stats.totalSpend,100000);assert.equal(stats.paidOrders,1);assert.equal(stats.averageSpend,100000);assert.equal(stats.outstanding,50000);assert.equal(stats.unsettledTotal,150000);assert.equal(stats.depositBalance,500000);
 s.orders[1].paidAmount=100000;stats=directoryIndex(s).index.get('a');assert.equal(stats.totalSpend,200000);assert.equal(stats.paidOrders,2);
});
test('exact identity backfill preserves historical content, never merges typos/shared phones, flags ambiguous and missing identity, is idempotent',()=>{
 const s=fixture();s.customers.push(customer('duplicate'));s.orders=[order('ambiguous'),order('typo',{customerName:'Bacala'}),order('shared',{customerName:'Other Company'}),order('missing',{phone:''}),order('linked',{customerId:'b'})];const before=structuredClone(s.orders);migrateCustomerDirectory(s);
 assert.equal(s.orders[0].customerId,undefined);assert.equal(s.orders[3].customerId,undefined);assert.deepEqual(s.customerDirectoryMigration.reviewOrderIds,['ambiguous','missing']);assert.equal(s.orders[4].customerId,'b');assert.notEqual(s.orders[1].customerId,'a');assert.notEqual(s.orders[2].customerId,'a');
 assert.deepEqual(s.orders.map(({customerId,...o})=>o),before.map(({customerId,...o})=>o));const snapshot=structuredClone(s);migrateCustomerDirectory(s);assert.deepEqual(s,snapshot);
});
test('profile merge combines history and wallet once, preserves all immutable records, supports chained merges and subsequent cancellation',()=>{
 const s=fixture();appendDeposit(s,'a',150000,'OPENING',owner);appendDeposit(s,'b',50000,'OPENING',owner);const a=order('invoice-a',{customerId:'a'}),b=order('invoice-b',{customerId:'b',customerName:'Bacalla',phone:s.customers[1].phone});s.orders=[a,b];
 allocateCustomerPayment(s,b,{requestId:'spend',amount:0,depositAmount:50000},owner,{canUse:true});const ledger=structuredClone(s.depositLedger),payments=structuredClone(b.payments),receipts=structuredClone(s.cashReceipts);
 mergeCustomers(s,'b','a',owner);assert.equal(customerBalance(s,'a'),150000);assert.equal(customerBalance(s,'b'),150000);assert.equal(directoryIndex(s).index.size,2);assert.equal(b.customerId,'a');assert.equal(b.customerName,'Bacalla');assert.deepEqual(s.depositLedger,ledger);assert.deepEqual(b.payments,payments);assert.deepEqual(s.cashReceipts,receipts);assert(matchingCustomers(s,'Bacalla').some(c=>c.id==='a'));assert(matchingCustomers(s,'','081298765432').some(c=>c.id==='a'));assert.throws(()=>mergeCustomers(s,'b','a',owner));
 cancelCustomerOrder(s,b,{requestId:'cancel-merged',reason:'Batal',disposition:'DEPOSIT',customerId:'b'},owner);assert.equal(customerBalance(s,'a'),200000);
 mergeCustomers(s,'a','c',owner);assert.equal(customerBalance(s,'c'),200000);assert.equal(customerBalance(s,'b'),200000);assert.equal(a.customerId,'c');assert.equal(b.customerId,'c');
 const paid=order('paid',{customerId:'c',customerName:'Batter Days',phone:s.customers[2].phone});s.orders.push(paid);allocateCustomerPayment(s,paid,{requestId:'after-merge',amount:0,depositAmount:100000,customerId:'b'},owner,{canUse:true});assert.equal(customerBalance(s,'c'),100000);assert.equal(s.depositLedger.at(-1).balanceBefore,200000);assert.equal(s.depositLedger.at(-1).balanceAfter,100000);
 const report=aggregateReport(s,owner,{from:'2026-01-01',to:'2026-12-31'});assert.equal(report.deposits.balance,100000);assert(report.deposits.rows.every(m=>m.customer==='Batter Days'));
});
test('simultaneous order creation uses one exact profile and rollback never leaves an orphan customer',async()=>{
 const store=new Store();await store.init();const results=await Promise.all(Array.from({length:6},(_,i)=>store.mutate(s=>{const o=order('o'+i,{customerName:'New Company'});registerOrderCustomer(s,o,{},owner);s.orders.push(o);return o.customerId;})));assert.equal(new Set(results).size,1);
 const before=await store.read();await assert.rejects(store.mutate(s=>{registerOrderCustomer(s,order('fail',{customerName:'Completely Different',phone:'001'}),{},owner);throw Error('downstream failure');}));assert.deepEqual((await store.read()).customers,before.customers);
});
