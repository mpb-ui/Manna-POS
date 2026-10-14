import { Store } from '../lib/store.js';
const original=Store.prototype.init;
Store.prototype.init=async function(){
 if(this.pool)throw new Error('Benchmark fixtures require an in-memory database');
 await original.call(this);
 this.memory.orders=Array.from({length:3000},(_,i)=>({id:'benchmark-'+i,code:'BENCH-'+i,status:'DIAMBIL',stockCommitted:true,customerName:'Synthetic benchmark',phone:'081234567890',total:1000,paidAmount:1000,paymentConfirmed:true,createdAt:'2026-01-01T00:00:00Z',items:[{productId:'poster-albatros',productName:'Poster',quantity:1,status:'DIAMBIL',subtotal:1000}],payments:[{id:'payment-'+i,amount:1000,method:'TUNAI'}],timeline:Array.from({length:10},(_,n)=>({message:'Step '+n,createdAt:'2026-01-01T00:00:00Z'}))}));
};
