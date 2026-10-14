import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../lib/store.js";
import { initializeStockState, commitPhysicalStock, confirmRetailStock, updateStockMethod, adjustPhysicalStock, syncRetailProductStock } from "../lib/physical-stock.js";

const actor="Kasir",timestamp="2026-10-14T08:00:00+08:00";
const row=(sku,quantity,unit="pcs",stockMethod="UNIT")=>({sku,quantity,unit,stockUnit:unit,stockMethod,productName:sku,stockNeedsCount:false});
const item=(id,sku,units,timing="PRODUCTION",status="SELESAI")=>({itemId:id,productName:sku,materials:[{sku,units,unit:sku==='paper'?'lbr':'pcs'}],quantity:units,stockTiming:timing,status,stockCommitted:false});
const order=(items)=>({id:'o',code:'INV',status:'SELESAI',items,total:100,paidAmount:100,paymentConfirmed:true,stockCommitted:false});
const fixture=()=>({inventory:[row('pen',100),row('paper',1000,'lembar'),row('roll',10,'roll','ROLL')],stockMovements:[],materials:[],products:[],orders:[]});

test("10 roll tidak dipotong oleh pesanan selesai; keluar 1 lalu masuk 5 menghasilkan 14",()=>{
 const state=fixture(),o=order([item('r','roll',77)]);commitPhysicalStock(state,o,{timestamp});assert.equal(state.inventory[2].quantity,10);assert.equal(state.stockMovements.length,0);assert.equal(o.stockCommitted,true);
 const stock=state.inventory[2];adjustPhysicalStock(state,stock,{change:-1,reason:'Buka roll',requestId:'out-1'},actor,timestamp);assert.equal(stock.quantity,9);adjustPhysicalStock(state,stock,{change:5,reason:'Stok masuk',requestId:'in-5'},actor,timestamp);assert.equal(stock.quantity,14);assert.equal(state.stockMovements.length,2);
 assert.throws(()=>adjustPhysicalStock(state,stock,{change:-.5,reason:'Bad'},actor),/roll utuh/);
});

test("ATK 100 dikurangi 5 saat konfirmasi; pembayaran berikutnya/retry tidak memotong lagi",()=>{
 const state=fixture(),o=order([item('p','pen',5,'SALE','MENUNGGU_PEMBAYARAN')]);o.paidAmount=50;
 confirmRetailStock(state,o,actor,timestamp);assert.equal(state.inventory[0].quantity,95);assert.equal(o.status,'SELESAI');assert.equal(state.stockMovements.length,1);
 o.paidAmount=100;confirmRetailStock(state,o,actor,timestamp);assert.equal(o.status,'DIAMBIL');confirmRetailStock(state,o,actor,timestamp);commitPhysicalStock(state,o,{timestamp});assert.equal(state.inventory[0].quantity,95);assert.equal(state.stockMovements.length,1);
});

test("invoice campuran: ATK saat penjualan, kertas 50 saat seluruh produksi selesai",()=>{
 const state=fixture(),o=order([item('p','pen',5,'SALE','MENUNGGU_PEMBAYARAN'),item('k','paper',50,'PRODUCTION','DESAIN')]);
 confirmRetailStock(state,o,actor,timestamp);assert.equal(state.inventory[0].quantity,95);assert.equal(state.inventory[1].quantity,1000);assert.equal(o.stockCommitted,false);
 commitPhysicalStock(state,o,{timestamp});assert.equal(state.inventory[1].quantity,1000);o.items[1].status='SELESAI';commitPhysicalStock(state,o,{timestamp});commitPhysicalStock(state,o,{timestamp});assert.equal(state.inventory[1].quantity,950);assert.equal(state.stockMovements.length,2);assert.equal(o.total,100);assert.equal(o.paidAmount,100);
});

test("roll lama tidak dikonversi; metode baru perlu hitung fisik, unit HPP tetap",()=>{
 const state={products:[],orders:[],stockMovements:[],materials:[{id:'m',sku:'roll',name:'FL 280',category:'Roll Outdoor',unit:'m²',cost:123,stock:770,minStock:10}],inventory:[{materialId:'m',...row('roll',770,'m²')}]};
 delete state.inventory[0].stockMethod;delete state.inventory[0].stockUnit;initializeStockState(state);const m=state.materials[0],stock=state.inventory[0];assert.equal(m.stockMethod,'ROLL');assert.equal(stock.quantity,770);assert.equal(stock.unit,'m²');assert.equal(stock.stockNeedsCount,true);assert.equal(m.cost,123);
 assert.throws(()=>adjustPhysicalStock(state,stock,{change:-1,reason:'Out'},actor),/stok opname/);
 assert.throws(()=>updateStockMethod(state,m,{stockMethod:'ROLL',confirmStockCount:true,stockOpeningBalance:10,stockCountReason:'Count'},actor),/lebar roll/);
 updateStockMethod(state,m,{stockMethod:'ROLL',rollWidthCm:110,confirmStockCount:true,stockOpeningBalance:10,stockCountReason:'Count gudang'},actor,timestamp);
 assert.equal(stock.quantity,10);assert.equal(stock.unit,'roll');assert.equal(m.unit,'m²');assert.equal(m.cost,123);assert.equal(state.stockMovements[0].previousBalance,770);assert.equal(state.stockMovements[0].previousUnit,'m²');
 assert.throws(()=>updateStockMethod(state,m,{stockMethod:'UNIT'},actor),/stok opname/);
});

test("cancel tidak otomatis mengembalikan stok; retur fisik berreferensi dibatasi dan diaudit",()=>{
 const state=fixture(),o=order([item('p','pen',5,'SALE')]);commitPhysicalStock(state,o,{phase:'SALE',timestamp});const move=state.stockMovements[0];o.cancelledAt=timestamp;commitPhysicalStock(state,o,{phase:'SALE',timestamp});confirmRetailStock(state,o,actor,timestamp);assert.equal(state.inventory[0].quantity,95);
 assert.throws(()=>adjustPhysicalStock(state,state.inventory[0],{change:5,reason:'Batal',reversalOf:move.id},actor),/fisik/);
 const payload={change:3,reason:'3 pulpen diterima kembali',physicalReturned:true,reversalOf:move.id,requestId:'return'};adjustPhysicalStock(state,state.inventory[0],payload,actor,timestamp);adjustPhysicalStock(state,state.inventory[0],payload,actor,timestamp);assert.equal(state.inventory[0].quantity,98);assert.equal(state.stockMovements.length,2);assert.throws(()=>adjustPhysicalStock(state,state.inventory[0],{...payload,change:3,requestId:'other'},actor),/Retur/);assert.equal(state.stockMovements[0].reversalOf,move.id);
});

test("barang dan varian memakai SKU yang ada, tanpa master Bahan duplikat",()=>{
 const state={materials:[],products:[{id:'p',sku:'PEN',retailAtK:true,name:'Pulpen',saleUnit:'pcs'}],inventory:[{sku:'p-unit',quantity:100,unit:'pcs',updatedAt:timestamp}],stockMovements:[],orders:[]};initializeStockState(state);initializeStockState(state);assert.equal(state.materials.length,0);assert.equal(state.inventory.length,1);assert.equal(state.products[0].retailStockSku,'p-unit');assert.equal(state.inventory[0].quantity,100);
});

test("permintaan konkuren stok dan rollback menjaga satu kali deduction",async()=>{
 const store=new Store();store.memory.inventory=[row('pen',100)];store.memory.orders=[order([item('p','pen',5,'SALE')])];store.memory.stockMovements=[];
 await Promise.all(Array.from({length:8},()=>store.mutate(state=>commitPhysicalStock(state,state.orders[0],{phase:'SALE',timestamp}))));const state=await store.read();assert.equal(state.inventory.find(r=>r.sku==='pen').quantity,95);assert.equal(state.stockMovements.length,1);
 await assert.rejects(store.mutate(state=>{adjustPhysicalStock(state,state.inventory.find(r=>r.sku==='pen'),{change:9,reason:'Rollback'},actor);throw new Error('rollback')}));assert.equal((await store.read()).inventory.find(r=>r.sku==='pen').quantity,95);
});

test("migrasi pesanan lama tidak mengubah pembayaran, timeline, status atau saldo",()=>{
 const state=fixture();state.products=[{id:'p',sku:'pen',retailAtK:true,name:'Pulpen',saleUnit:'pcs'}];const o=order([item('p','pen',5)]);delete o.items[0].stockTiming;delete o.items[0].stockCommitted;o.items[0].productId='p';o.status='DESAIN';o.items[0].status='DESAIN';o.timeline=[{message:'Historis'}];o.payments=[{amount:50}];state.orders=[o];const before=structuredClone(o);initializeStockState(state);assert.equal(o.items[0].stockTiming,'PRODUCTION');assert.equal(state.inventory[0].quantity,100);assert.deepEqual(o.payments,before.payments);assert.deepEqual(o.timeline,before.timeline);assert.equal(o.status,before.status);
});

test("pesanan selesai lama tanpa marker tidak dipotong lagi ketika dibuka atau diproses ulang",()=>{
 const state=fixture(),o=order([item('p','pen',5)]);delete o.stockCommitted;delete o.items[0].stockCommitted;state.orders=[o];initializeStockState(state);assert.equal(o.stockCommitBasis,'LEGACY_CLOSED_SKIP');commitPhysicalStock(state,o);assert.equal(state.inventory[0].quantity,100);assert.equal(state.stockMovements.length,0);
});


test("SKU bahan tidak boleh dipakai ulang barang dagangan, stok SALE hilang menolak transaksi",()=>{
 const state=fixture();state.inventory[0].materialId='m';const p={id:'p',sku:'pen',retailAtK:true,name:'Pulpen',saleUnit:'pcs'};state.products=[p];initializeStockState(state);assert.equal(state.inventory[0].productId,undefined);assert.throws(()=>syncRetailProductStock(state,p),/SKU stok/);
 const o=order([item('missing','missing',5,'SALE')]);assert.throws(()=>commitPhysicalStock(state,o,{phase:'SALE'}),/tidak ditemukan/);assert.equal(o.items[0].stockCommitted,false);
});
