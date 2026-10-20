import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.js';
import { initializeCustomers,appendDeposit,customerBalance,allocateCustomerPayment,cancelCustomerOrder,resolveOrderCustomer } from '../lib/customer-deposits.js';
import { aggregateReport } from '../lib/reports.js';
import { cashReceiptHtml,depositMovementHtml,depositInvoiceLines } from '../public/customer-documents.js';
import { ROLE_PRESETS,migrateCustomerAccess } from '../lib/access.js';
const owner={id:'owner',name:'Owner',role:'OWNER'},customer={id:'c',name:'Toko Manna',phone:'081234567890'};
const fixture=()=>{const state={customers:[{...customer}],orders:[],products:[{id:'p',category:'Print'}],materials:[],inventory:[],machines:[]};initializeCustomers(state);return state;};
const order=(id='o',total=125000)=>({id,code:id,customerName:customer.name,phone:customer.phone,customerId:'c',total,paidAmount:0,payments:[],status:'DESAIN',paymentConfirmed:true,createdAt:new Date().toISOString(),items:[{productId:'p',subtotal:total,quantity:1}]});
const pay=(state,o,body)=>allocateCustomerPayment(state,o,{requestId:crypto.randomUUID(),method:'TRANSFER',...body},owner,{canUse:true});
test('overpayment and a real second transfer allocate only the outstanding invoice amount',()=>{
 const s=fixture(),o=order();pay(s,o,{amount:152000,excessAction:'DEPOSIT',confirmDeposit:true});assert.equal(o.paidAmount,125000);assert.equal(customerBalance(s,'c'),27000);assert.equal(s.cashReceipts[0].amount,152000);assert.equal(s.cashReceipts[0].allocatedAmount,125000);assert.equal(s.cashReceipts[0].depositAmount,27000);
 pay(s,o,{amount:125000,excessAction:'DEPOSIT',confirmDeposit:true});assert.equal(o.paidAmount,125000);assert.equal(o.payments.length,1);assert.equal(customerBalance(s,'c'),152000);
});
test('deposit pays an invoice partially, fully or together with money; cash change is not credited',()=>{
 const s=fixture();appendDeposit(s,'c',200000,'OPENING',owner);const a=order('a');pay(s,a,{amount:0,depositAmount:125000});assert.equal(a.paidAmount,125000);assert.equal(customerBalance(s,'c'),75000);assert.equal(s.cashReceipts.length,0);
 const b=order('b',100000);pay(s,b,{amount:73000,depositAmount:27000});assert.equal(b.paidAmount,100000);assert.equal(customerBalance(s,'c'),48000);assert.equal(b.payments[0].type,'DEPOSIT');assert.equal(b.payments[1].amount,73000);
 const c=order('c',25000);pay(s,c,{method:'TUNAI',amount:50000,excessAction:'CHANGE'});assert.equal(s.cashReceipts.at(-1).amount,25000);assert.equal(s.cashReceipts.at(-1).changeAmount,25000);assert.equal(customerBalance(s,'c'),48000);
});
test('wallet and identity validation rejects insufficient balances, missing consent, wrong customer and fractional rupiah',()=>{
 const s=fixture(),o=order();s.customers.push({id:'other',name:'Other',phone:'081299999999'});
 for(const body of [{amount:125000.1},{amount:152000},{amount:152000,excessAction:'DEPOSIT'},{amount:0,depositAmount:1},{amount:152000,excessAction:'CHANGE'},{amount:1,customerId:'other'}])assert.throws(()=>pay(s,o,body));
 assert.equal(o.paidAmount,0);assert.equal(s.depositLedger.length,0);
 const old={...order(),customerId:null,phone:'+62 812-3456-7890'};assert.equal(resolveOrderCustomer(s,old,'c').id,'c');assert.equal(old.customerId,'c');
 assert.throws(()=>allocateCustomerPayment(s,o,{amount:0,depositAmount:1},owner),/Akses/);
});
test('read-only initialization does not infer credit or modify old invoice, price, payment and stock records',()=>{
 const s=fixture();delete s.customers;delete s.depositLedger;delete s.cashReceipts;const old=order();old.customerId=null;s.orders=[old];s.inventory=[{sku:'stock',quantity:50}];const snapshot=structuredClone({orders:s.orders,inventory:s.inventory});initializeCustomers(s);initializeCustomers(s);assert.deepEqual({orders:s.orders,inventory:s.inventory},snapshot);assert.deepEqual(s.customers,[]);assert.deepEqual(s.depositLedger,[]);
 const custom={role:'CASHIER',permissions:['pos.view','pos.create','pos.payment']},preset={role:'CASHIER',permissions:ROLE_PRESETS.CASHIER.permissions.filter(p=>!p.startsWith('customers.')&&!p.startsWith('deposit.'))};const access={users:[custom,preset]};migrateCustomerAccess(access);assert.deepEqual(custom.permissions,['pos.view','pos.create','pos.payment']);assert(preset.permissions.includes('deposit.use'));assert(!preset.permissions.includes('master.products'));
});
test('concurrent wallet spending and failures serialize/rollback through the existing Store transaction',async()=>{
 const store=new Store();await store.mutate(s=>{initializeCustomers(s);s.customers=[{...customer}];appendDeposit(s,'c',125000,'OPENING',owner);s.orders=[order('a'),order('b')];});
 const results=await Promise.allSettled(['a','b'].map(id=>store.mutate(s=>pay(s,s.orders.find(o=>o.id===id),{amount:0,depositAmount:125000}))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(customerBalance(await store.read(),'c'),0);
 await assert.rejects(store.mutate(s=>{appendDeposit(s,'c',5000,'CORRECTION',owner);throw Error('rollback');}));assert.equal(customerBalance(await store.read(),'c'),0);
});
test('cancellation restores used deposit exactly once and independently refunds or credits money, without changing physical stock',()=>{
 const s=fixture(),o=order();s.inventory=[{quantity:12}];appendDeposit(s,'c',27000,'OPENING',owner);pay(s,o,{amount:98000,depositAmount:27000});s.orders=[o];const body={requestId:'cancel',reason:'Customer batal',disposition:'REFUND',method:'TRANSFER'};cancelCustomerOrder(s,o,body,owner);cancelCustomerOrder(s,o,body,owner);assert.equal(customerBalance(s,'c'),27000);assert.equal(s.cashReceipts.at(-1).amount,-98000);assert.equal(o.paidAmount,0);assert.equal(s.inventory[0].quantity,12);assert.equal(o.status,'BATAL');assert.equal(o.payments.filter(p=>p.type==='REVERSAL').length,2);
 const b=order('b');pay(s,b,{amount:125000});cancelCustomerOrder(s,b,{requestId:'b',reason:'Ganti nota',disposition:'DEPOSIT'},owner);assert.equal(customerBalance(s,'c'),152000);assert.equal(s.cashReceipts.filter(r=>r.kind==='REFUND').length,1);
});
test('reports count received money once, exclude deposit usage from cash, retain settlement and refundable liability',()=>{
 const s=fixture(),a=order('a');s.orders.push(a);pay(s,a,{amount:152000,excessAction:'DEPOSIT',confirmDeposit:true});const b=order('b',100000);s.orders.push(b);pay(s,b,{amount:73000,depositAmount:27000});const query={from:new Date(Date.now()-86400000).toISOString().slice(0,10),to:new Date(Date.now()+86400000).toISOString().slice(0,10)};
 const r=aggregateReport(s,owner,query);assert.equal(r.summary.sales,225000);assert.equal(r.summary.paid,225000);assert.equal(r.summary.outstanding,0);assert.equal(r.deposits.incoming,27000);assert.equal(r.deposits.used,27000);assert.equal(r.deposits.balance,0);assert.equal(r.receipts.length,2);assert.equal(r.rows.find(row=>row.id==='b').paid,100000);
 assert.equal(aggregateReport(s,{role:'WAREHOUSE'},query).deposits,null);assert.equal(aggregateReport(s,{...owner,reportScope:'own'},query).deposits,null);
});
test('documents escape user text and retain immutable balance and receipt splits',()=>{
 const s=fixture(),o=order();pay(s,o,{amount:152000,excessAction:'DEPOSIT',confirmDeposit:true});const m=s.depositLedger[0],r=s.cashReceipts[0],html=cashReceiptHtml({...r,customerName:'<img onerror=x>'});assert(!html.includes('<img'));assert(html.includes('152.000'));assert(html.includes('27.000'));appendDeposit(s,'c',10000,'CORRECTION',owner);assert(depositMovementHtml(customer,m).includes('27.000'));assert(!depositMovementHtml(customer,m).includes('37.000'));const b=order('b');pay(s,b,{amount:0,depositAmount:10000});assert(depositInvoiceLines(b).includes('10.000'));
});
