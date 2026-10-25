import test from 'node:test';
import assert from 'node:assert/strict';
import { historyActions, historyProductRows } from '../public/order-history-detail.js';
import { historyLastPaymentMethod, filterOrderHistory } from '../public/order-history.js';
const perms=['orders.view','projects.money','pos.edit','pos.view','pos.payment'];
test('selection actions match unpaid, paid and completed workflows while respecting access',()=>{
 const actions=(status,paidAmount=0)=>historyActions({status,total:100,paidAmount},perms);
 assert.deepEqual(actions('MENUNGGU_PEMBAYARAN'),{detail:true,edit:true,invoice:true,spk:false,receipt:false,payment:true});
 for(const status of ['DESAIN','CETAK','FINISHING'])for(const paid of [0,40,100])assert.deepEqual(actions(status,paid),{detail:true,edit:false,invoice:true,spk:true,receipt:false,payment:paid<100});
 for(const status of ['SELESAI','DIAMBIL'])for(const paid of [0,40,100])assert.deepEqual(actions(status,paid),{detail:true,edit:false,invoice:true,spk:true,receipt:true,payment:paid<100});
 assert(Object.values(historyActions(null,perms)).every(v=>!v));
 const limited=historyActions({status:'SELESAI',total:100,paidAmount:0},['orders.view']);assert.deepEqual(limited,{detail:true,edit:false,invoice:false,spk:true,receipt:false,payment:false});
 assert(Object.values(historyActions({status:'CETAK',total:100},['projects.money','pos.edit','pos.payment'])).every(v=>!v));
 assert.deepEqual(actions('BATAL'),{detail:true,edit:false,invoice:true,spk:false,receipt:false,payment:false});
 assert.equal(historyActions({status:'MENUNGGU_PEMBAYARAN'},['orders.view','pos.edit']).edit,false);
});
test('product panel uses stored variants, actual dimensions and finishing quantities without changing orders',()=>{
 const order={items:[{productName:'LF Sticker',priceBasis:'area',imageWidthCm:200,imageLengthCm:600,width:3.2,actualLength:6.4,billedLength:6.5,quantity:1,unitName:'Lembar',materialVariantLabel:'Sandblast',subVariantLabel:'Tanpa Cetak',finishing:[{name:'Seaming Lem',units:12,note:'Sambungan'}],productionNote:'Rapi <script>'},{productName:'A3+ AP150 /2S',priceBasis:'unit',quantity:5,unitName:'Lembar',finishing:[]},{productName:'Produk Lama',priceBasis:'unit',quantity:2,unitName:'pcs',displaySize:'2 pcs · Biru'}]};
 const before=structuredClone(order),rows=historyProductRows(order);
 assert.deepEqual(rows[0],{product:'LF Sticker',variant:'Sandblast | Tanpa Cetak',size:'200 × 600 cm',quantity:'1 Lembar',finishing:'Seaming Lem × 12 (Sambungan)',note:'Rapi <script>'});
 assert.deepEqual(rows[1],{product:'Art Paper',variant:'AP150 | Cetak 2 Sisi',size:'A3+',quantity:'5 Lembar',finishing:'—',note:'—'});
 assert.equal(rows[2].variant,'Biru');assert.equal(rows[2].size,'—');assert.deepEqual(order,before);
});
test('DTF panel separates color and size quantities and fixed-size products retain historical size labels',()=>{
 const rows=historyProductRows({items:[{productName:'Kaos DTF',dtfPackageLabel:'Logo+A4',quantity:3,shirtVariants:[{color:'Hitam',size:'M',quantity:1},{color:'Putih',size:'XXL',quantity:2}]},{productName:'Poster',quantity:2,priceBasis:'unit',sizeVariantLabel:'A1',choices:[{optionLabel:'Luster'}],unitName:'Lembar'}]});
 assert.deepEqual(rows.map(r=>[r.variant,r.size,r.quantity]),[['Logo+A4 | Hitam','M','1 Kaos'],['Logo+A4 | Putih','XXL','2 Kaos'],['Luster','A1','2 Lembar']]);
});
test('last payment display ignores PO, reversals and empty payments; unpaid filter covers zero and DP',()=>{
 const order={status:'DESAIN',total:100,paidAmount:60,payments:[{id:'transfer',method:'TRANSFER',amount:40,createdAt:'2026-10-23T00:00:00Z'},{id:'qris',method:'QRIS',amount:20,createdAt:'2026-10-24T00:00:00Z'},{type:'PO',method:'TUNAI',amount:0,createdAt:'2026-10-25T00:00:00Z'}]};
 assert.equal(historyLastPaymentMethod(order),'QRIS');assert.equal(historyLastPaymentMethod({...order,status:'MENUNGGU_PEMBAYARAN'}),'');assert.equal(historyLastPaymentMethod({...order,status:'BATAL'}),'');
 assert.equal(historyLastPaymentMethod({...order,payments:[...order.payments,{type:'REVERSAL',reversalOf:'qris',amount:-20}]}),'TRANSFER');
 assert.equal(historyLastPaymentMethod({...order,payments:[...order.payments,{method:'DEPOSIT',amount:10,createdAt:'2026-10-24T00:00:00Z'}]}),'DEPOSIT');
 assert.equal(historyLastPaymentMethod({...order,payments:[]}),'');
 const orders=[{id:'zero',status:'MENUNGGU_PEMBAYARAN',total:100,paidAmount:0},{id:'dp',...order},{id:'paid',...order,paidAmount:100},{id:'cancel',...order,status:'BATAL'}];
 assert.deepEqual(filterOrderHistory(orders,{payment:'BELUM_LUNAS'}).map(o=>o.id).sort(),['dp','zero']);assert.deepEqual(filterOrderHistory(orders,{payment:'LUNAS'}).map(o=>o.id),['paid']);
});
