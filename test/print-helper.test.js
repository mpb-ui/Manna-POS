import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerPrintHelper } from '../lib/print-helper-routes.js';
import { printDocumentData } from '../lib/print-document.js';
const owner={id:'owner',name:'Owner',role:'OWNER',active:true,sessionVersion:1};
const cashier={id:'cash',name:'Kasir',role:'CASHIER',active:true,sessionVersion:1};
const printer={id:'print',name:'Cetak',role:'PRINT',active:true,sessionVersion:1};
const order=()=>({id:'o',code:'INV-103126-001',customerName:'Customer',phone:'1172',createdAt:'2026-10-31T01:00:00Z',updatedAt:'2026-10-31T02:00:00Z',status:'DESAIN',confirmed:true,paymentConfirmed:true,createdByName:'Owner',paidAmount:20000,total:100000,grossTotal:120000,invoiceDiscount:{amount:20000},payments:[{id:'dp',type:'PAYMENT',transactionId:'tx',method:'TUNAI',amount:20000,actor:'Kasir',paidBefore:0,paidAfter:20000,balanceAfter:80000,orderTotal:100000,orderGrossTotal:120000,invoiceDiscountAmount:20000}],items:[{productName:'Poster',quantity:2,unitName:'pcs',priceBasis:'unit',subtotal:120000,baseCostTotal:77777,productionNote:'Jangan dilipat'}]});
async function setup(t){
 let at=1000;const state={orders:[order()],users:structuredClone([owner,cashier,printer]),cashReceipts:[],inventory:[{quantity:100}]};
 const app=express();app.use(express.json());
 const register=registerPrintHelper(app,{store:{read:async()=>state},normalizeOrder:o=>o,clock:()=>at,ttl:5000,maxJobs:20});
 app.use('/api',(req,res,next)=>{req.user=state.users.find(u=>u.id===req.headers['x-user']);if(!req.user)return res.status(401).json({error:'Login'});next();});register();
 app.use((err,req,res,next)=>res.status(err.status || 500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const req=async(path,body,user='owner',auth)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(user?{'x-user':user}:{}),...(auth?{authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};};
 const create=async(kind='invoice',user='owner',extra={})=>{const r=await req('/api/print-jobs',{kind,orderId:'o',...extra},user);assert.equal(r.status,201,JSON.stringify(r));return {...r.data,token:new URL(r.data.launchUrl).searchParams.get('job')};};
 return {state,req,create,advance:()=>{at+=6000;}};
}
test('jobs require login, enforce role permissions and never include money in Work Order',async t=>{
 const {create,req,state}=await setup(t);const before=structuredClone(state);
 assert.equal((await req('/api/print-jobs',{kind:'invoice',orderId:'o'},'')).status,401);
 assert.equal((await req('/api/print-jobs',{kind:'invoice',orderId:'o'},'print')).status,403);
 const job=await create('work-order','print');const claimed=await req('/print-helper/claim',{},'',job.token);
 assert.equal(claimed.status,200);assert.equal(claimed.cache,'no-store');assert.equal(claimed.data.document.items.length,1);
 const doc=JSON.stringify(claimed.data.document);assert.doesNotMatch(doc,/price|subtotal|paid|total|77777|100000|120000|rows|Kasir|DEPOSIT|TUNAI/);
 assert.deepEqual(state,before);assert.equal((await req('/api/print-jobs/'+job.id,undefined,'cash')).status,404);
});
test('capability redemption is one use even concurrently; status cannot reveal report again',async t=>{
 const {create,req}=await setup(t),job=await create();
 const results=await Promise.all([req('/print-helper/claim',{},'',job.token),req('/print-helper/claim',{},'',job.token)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,410]);
 assert.equal((await req('/print-helper/status',{status:'opened'},'',job.token)).status,200);
 const status=await req('/api/print-jobs/'+job.id);assert.equal(status.data.status,'opened');assert.equal(status.data.document,undefined);assert.equal(status.data.launchUrl,undefined);
 assert.equal((await req('/print-helper/claim',{},'',job.token)).status,410);
});
test('expired, changed, disabled and revoked sessions cannot redeem an old print request',async t=>{
 const {create,req,state,advance}=await setup(t);let job=await create();advance();assert.equal((await req('/print-helper/claim',{},'',job.token)).status,410);
 job=await create();state.orders[0].updatedAt='changed';assert.equal((await req('/print-helper/claim',{},'',job.token)).status,409);
 job=await create();state.users[0].sessionVersion=2;assert.equal((await req('/print-helper/claim',{},'',job.token)).status,403);
 job=await create();state.users[0].active=false;assert.equal((await req('/print-helper/claim',{},'',job.token)).status,403);
});
test('historical DP remains frozen after settlement and no database/order/stock writes occur',async t=>{
 const {create,req,state}=await setup(t);state.orders[0].paidAmount=100000;state.orders[0].total=200000;const before=structuredClone(state);
 const job=await create('payment','cash',{paymentId:'dp'});const data=(await req('/print-helper/claim',{},'',job.token)).data.document;
 assert.equal(data.status,'Belum Lunas');assert.equal(data.sequence,1);assert.equal(data.cashier,'Kasir');assert.match(data.date,/31 Okt 2026/);
 assert.match(data.rows.find(r=>r.label==='Grand Total').value,/100.000/);assert.match(data.rows.find(r=>r.label==='Sisa saat transaksi').value,/80.000/);
 assert.deepEqual(state,before);
});
test('document projection handles DTF combinations, zero discounts, draft and paid-history restrictions',()=>{
 const o={...order(),printRole:'OWNER'};o.items[0].shirtVariants=[{color:'Hitam',size:'M',quantity:1},{color:'Putih',size:'XL',quantity:1}];
 let d=printDocumentData(o,'invoice');assert.equal(d.items.length,1);assert.match(d.items[0].details.join(' '),/Hitam · M × 1 pcs/);
 d=printDocumentData({...o,printRole:'ADMIN'},'invoice');assert.equal(d.sequence,null);assert.equal(d.cashier,'Owner');assert.doesNotMatch(JSON.stringify(d),/Sudah Bayar|Kasir/);
 assert.throws(()=>printDocumentData(o,'payment','missing'),/tidak ditemukan/);
 d=printDocumentData({...o,total:0,paidAmount:0,payments:[],invoiceDiscount:{amount:120000}},'invoice');assert.equal(d.status,'Lunas');assert.equal(d.sequence,null);assert.match(d.messages.join(''),/diskon penuh/);
});
