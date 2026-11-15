import { secureFetch as fetch } from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { grossUpQuote, taxRateBps } from '../public/order-tax.js';
import { chargedItemTotals } from '../public/order-discount.js';
import { orderAtPeriodEnd } from '../lib/report-period.js';
import { printDocumentData } from '../lib/print-document.js';
import { invoiceReceiptHtml } from '../public/thermal-documents.js';

test('gross-up uses whole rupiah and allocates the tagihan across items',()=>{
  assert.equal(taxRateBps('2,5'),250);
  assert.deepEqual(grossUpQuote(1000000,250),{total:1025641,adjustment:25641});
  for(const rate of ['100','-2','0','1,234'])assert.throws(()=>taxRateBps(rate));
  const order={items:[{subtotal:300000},{subtotal:700000}],grossTotal:1000000,total:923077,taxGrossUp:{rateBps:250,adjustment:23077},invoiceDiscount:{amount:100000,appliedAt:'2026-10-22T02:00:00Z'}};
  assert.equal(chargedItemTotals(order).reduce((a,b)=>a+b),923077);
  assert.equal(chargedItemTotals(order,{beforeDiscount:true}).reduce((a,b)=>a+b),1025641);
  assert.equal(orderAtPeriodEnd(order,new Date('2026-10-21T15:59:59Z')).total,1025641);
});

test('gross-up draft/PO, withholding without proof, report cutoffs, receipt and cash-only refund',async()=>{
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;let cookie;
  const req=async(path,method='GET',data)=>{
    const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r.body));return r.body;};
  try {
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,60));}
    cookie=(await req('/api/login','POST',{username:'admin',pin:'1234'})).cookie;
    const item={productId:'poster-backlite-film',sizeVariantId:'a3',quantity:8};
    const draft={customerName:'Customer Gross Up',phone:'081255550127',items:[item],taxRateBps:250};
    assert.equal((await req('/api/orders','POST',{...draft,taxRateBps:10000})).status,400);
    let order=await ok('/api/orders','POST',draft);
    const path='/api/orders/'+order.id, pay=path+'/payments';
    assert.equal(order.items[0].subtotal,1000000);
    assert.equal(order.total,1025641);
    assert.equal(order.taxGrossUp.adjustment,25641);
    order=await ok(path,'PUT',{...draft,items:[{...item,quantity:4}]});
    assert.equal(order.total,512821);
    order=await ok(path,'PUT',{...draft,taxRateBps:0});
    assert.equal(order.total,1000000);assert.equal(order.taxGrossUp,undefined);
    order=await ok(path,'PUT',draft);
    assert.equal((await req(pay,'POST',{type:'PO',poNumber:'PO-TAX',taxWithheld:25641,requestId:'bad-po'})).status,400);
    order=await ok(pay,'POST',{type:'PO',poNumber:'PO-TAX',requestId:'tax-po'});
    assert.equal(order.paidAmount,0);
    assert.equal((await req(path,'PUT',{...draft,taxRateBps:0})).status,400);
    const report=()=>ok('/api/reports?from=2020-01-01&to=2099-12-31');
    let r=await report();
    assert.equal(r.rows.find(x=>x.id===order.id).hasTax,true);
    assert.equal(r.purchaseOrders.find(x=>x.orderId===order.id).nota.total,1025641);
    assert.equal((await req(pay,'POST',{method:'TRANSFER',amount:1,taxWithheld:1025642,requestId:'excess-tax'})).status,400);
    const dp={method:'TRANSFER',amount:200000,taxWithheld:0,requestId:'tax-dp'};
    await ok(pay,'POST',dp);
    const settle={method:'TRANSFER',amount:800000,taxWithheld:25641,requestId:'tax-settle'};
    const [paid,retry]=await Promise.all([ok(pay,'POST',settle),ok(pay,'POST',settle)]);
    assert.equal(paid.paymentStatus,'LUNAS');
    assert.equal(retry.payments.length,3);
    assert.equal((await req(pay,'POST',{...settle,taxWithheld:25000})).status,400);
    r=await report();
    const sale=r.rows.find(x=>x.id===order.id);
    assert.equal(sale.sales,1025641);
    assert.equal(sale.taxWithheld,25641);
    assert.equal(sale.outstanding,0);
    assert.equal(r.receipts.filter(x=>x.orderId===order.id).reduce((a,x)=>a+x.paid,0),1000000);
    const receipts=await ok(path+'/cash-receipts');
    assert.equal(receipts.length,2);
    const historic=await ok('/api/order-history/'+order.id+'/payments/'+paid.payments.at(-1).id);
    assert.equal(historic.payment.amount,800000);
    assert.equal(historic.payment.taxWithheld,25641);
    const print=printDocumentData({...paid,printRole:'OWNER'},'payment',paid.payments.at(-1).id,receipts);
    assert(print.rows.some(x=>x.label==='Penyesuaian Harga'));
    assert(print.rows.some(x=>x.label==='Potongan pajak'));
    assert.match(invoiceReceiptHtml(paid,historic.payment),/Potongan pajak/);
    await ok(path+'/cancel','POST',{requestId:'tax-cancel',reason:'Uji pembatalan',disposition:'REFUND',method:'TRANSFER'});
    assert.equal((await ok(path+'/cash-receipts')).find(x=>x.kind==='REFUND').amount,-1000000);

    const ordinary=await ok('/api/orders','POST',{...draft,taxRateBps:0,items:[{...item,quantity:1}]});
    const otherPay='/api/orders/'+ordinary.id+'/payments';
    await ok(otherPay,'POST',{method:'TRANSFER',amount:121875,requestId:'ordinary-cash'});
    assert.equal((await ok(otherPay,'POST',{amount:0,taxWithheld:3125,requestId:'ordinary-withheld'})).paymentStatus,'LUNAS');
    r=await report();
    assert.equal(r.rows.find(x=>x.id===ordinary.id).hasTax,true);
    assert.equal(r.receipts.filter(x=>x.orderId===ordinary.id).length,1);
  }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
