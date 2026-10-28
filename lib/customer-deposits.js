import { customerRoots } from './customer-directory.js';
import crypto from 'node:crypto';
import { customerPhone, customerNameKey } from '../public/customer-identity.js';
export const CUSTOMER_SCHEMA_VERSION=1;
export function initializeCustomers(state) {
  state.customers ||= []; state.depositLedger ||= []; state.cashReceipts ||= []; state.customerOperations ||= [];
  state.customerSchemaVersion=CUSTOMER_SCHEMA_VERSION;
}
export function rupiahAmount(value,{zero=false,signed=false}={}) {
  const n=Number(value);
  if(!Number.isSafeInteger(n)||Math.abs(n)>1_000_000_000_000||(!signed&&n<0)||(!zero&&n===0))throw new Error('Nominal harus berupa rupiah bulat yang valid');
  return n;
}
export function customerById(state,id,{allowArchived=false}={}) {
  const {customers,roots}=customerRoots(state),customer=customers.get(roots.get(id));
  if(!customer||customer.archivedAt&&!allowArchived)throw new Error('Pelanggan tidak ditemukan atau sudah dihapus');
  return customer;
}
export function customerBalance(state,id,at=null) {
  if(!id)return 0;const {roots}=customerRoots(state),root=roots.get(id) || id;
  const balance=(state.depositLedger || []).filter(m=>(roots.get(m.customerId) || m.customerId)===root&&(!at||m.createdAt<=at)).reduce((s,m)=>s+m.amount,0);
  if(!Number.isSafeInteger(balance)||balance<0)throw new Error('Saldo deposit tidak konsisten');
  return balance;
}
export function customerSnapshot(state,customer) { return {...customer,depositBalance:customerBalance(state,customer.id)}; }
export function appendDeposit(state,customerId,amount,kind,user,extra={}) {
  initializeCustomers(state);const customer=customerById(state,customerId);rupiahAmount(amount,{signed:true});
  const before=customerBalance(state,customerId),after=before+amount;
  if(!Number.isSafeInteger(after)||after<0||after>1_000_000_000_000)throw new Error('Saldo deposit tidak cukup atau melebihi batas');
  const movement={...extra,id:crypto.randomUUID(),customerId,customerName:customer.name,phone:customer.phone,kind,amount,balanceBefore:before,balanceAfter:after,createdAt:new Date().toISOString(),actor:user.name,actorId:user.id};
  state.depositLedger.push(movement);return movement;
}
export function checkOperation(state,requestId,payload,user) {
  if(typeof requestId!=='string'||requestId.length<1||requestId.length>150)throw new Error('Identitas transaksi wajib diisi');
  const fingerprint=JSON.stringify(payload);
  const old=(state.customerOperations || []).find(o=>o.requestId===requestId);
  if(old&&(old.actorId!==user.id||old.fingerprint!==fingerprint))throw new Error('Identitas transaksi sudah digunakan untuk data berbeda');
  return {old,fingerprint};
}
export function finishOperation(state,requestId,fingerprint,user,result) {
  initializeCustomers(state);state.customerOperations.push({requestId,fingerprint,actorId:user.id,result:structuredClone(result)});return result;
}
export function resolveOrderCustomer(state,order,id) {
  if(!id)return order.customerId?customerById(state,order.customerId,{allowArchived:true}):null;
  const customer=customerById(state,id,{allowArchived:Boolean(order.customerId)});
  if(order.customerId&&customerById(state,order.customerId,{allowArchived:true}).id!==customer.id)throw new Error('Pelanggan pembayaran berbeda dari pelanggan pesanan');
  if(!order.customerId&&(customerPhone(order.phone)!==customerPhone(customer.phone)||customerNameKey(order.customerName)!==customerNameKey(customer.name)))throw new Error('Nama dan WhatsApp pelanggan harus sesuai dengan nota sebelum deposit digunakan');
  order.customerId=customer.id;return customer;
}
export function cashReceipt(state,order,customer,user,values) {
  initializeCustomers(state);
  const reference=String(values.reference || '').trim();
  if(reference.length>150)throw new Error('Referensi bank maksimal 150 karakter');
  if(reference&&state.cashReceipts.some(r=>r.reference===reference&&r.method===values.method&&r.kind!=='REFUND'))throw new Error('Referensi transfer sudah pernah dicatat');
  const receipt={id:crypto.randomUUID(),orderId:order?.id || null,orderCode:order?.code || null,customerId:customer?.id || null,customerName:order?.customerName || customer?.name || '',phone:order?.phone || customer?.phone || '',createdAt:new Date().toISOString(),actor:user.name,actorId:user.id,...values,reference};
  state.cashReceipts.push(receipt);return receipt;
}
// Called inside the same Store.mutate transaction as order confirmation/stock.
export function allocateCustomerPayment(state,order,body,user,{canUse=false}={}) {
  initializeCustomers(state);
  const incoming=rupiahAmount(body.amount ?? 0,{zero:true}),used=rupiahAmount(body.depositAmount ?? 0,{zero:true});
  const method=String(body.method || '').trim().toUpperCase();
  const outstanding=Math.max(0,order.total-order.paidAmount);
  if(used&&!canUse)throw Object.assign(new Error('Akses penggunaan deposit tidak diizinkan'),{status:403});
  if(incoming&&!['TUNAI','QRIS','TRANSFER'].includes(method))throw new Error('Metode pembayaran tidak valid');
  if(!incoming&&!used)throw new Error('Nominal pembayaran wajib diisi');
  if(used>outstanding)throw new Error('Pemakaian deposit melebihi sisa tagihan');
  const customer=resolveOrderCustomer(state,order,body.customerId);
  if(used&&!customer)throw new Error('Pilih pelanggan untuk menggunakan deposit');
  if(used>customerBalance(state,customer?.id))throw new Error('Saldo deposit tidak cukup; perbarui saldo pelanggan');
  const allocated=Math.min(incoming,outstanding-used),excess=incoming-allocated;
  if(excess&&!['DEPOSIT','CHANGE'].includes(body.excessAction))throw new Error('Konfirmasi penyelesaian kelebihan pembayaran');
  if(excess&&body.excessAction==='DEPOSIT'&&!customer)throw new Error('Pilih pelanggan untuk menyimpan kelebihan pembayaran');
  if(excess&&body.excessAction==='DEPOSIT'&&body.confirmDeposit!==true)throw new Error('Konfirmasi nominal kelebihan yang masuk deposit');
  if(excess&&body.excessAction==='CHANGE'&&method!=='TUNAI')throw new Error('Pengembalian kelebihan transfer harus dicatat melalui refund deposit');
  if((used||excess)&&!body.requestId)throw new Error('Identitas transaksi wajib diisi');
  const transactionId=crypto.randomUUID(),at=new Date().toISOString(),payments=[];
  const addPayment=(amount,paymentMethod,type,extra={})=>{
    if(!amount)return;
    const before=order.paidAmount;
    const p={id:crypto.randomUUID(),requestId:body.requestId || null,transactionId,method:paymentMethod,type,amount,createdAt:at,actor:user.name,actorId:user.id,note:String(body.note || '').trim().slice(0,1000),sequence:order.payments.filter(p=>p.type!=='PO'&&p.amount>0).length+1,orderTotal:order.total,...(order.invoiceDiscount?{orderGrossTotal:order.grossTotal,invoiceDiscountAmount:order.invoiceDiscount.amount}:{}),paidBefore:before,paidAfter:before+amount,balanceAfter:Math.max(0,order.total-before-amount),...extra};
    order.payments.push(p);order.paidAmount+=amount;payments.push(p);return p;
  };
  if(used){const move=appendDeposit(state,customer.id,-used,'USE',user,{transactionId,orderId:order.id,orderCode:order.code,note:String(body.note || '').trim()});addPayment(used,'DEPOSIT','DEPOSIT',{depositMovementId:move.id,depositBalanceAfter:move.balanceAfter});}
  const credit=excess&&body.excessAction==='DEPOSIT'?excess:0,change=excess-credit;
  let receipt;
  if(incoming){
    receipt=cashReceipt(state,order,customer,user,{transactionId,kind:'RECEIPT',method,amount:incoming-change,amountReceived:incoming,allocatedAmount:allocated,depositAmount:credit,changeAmount:change,reference:body.reference,note:String(body.note || '').trim().slice(0,1000)});
    addPayment(allocated,method,'PAYMENT',{cashReceiptId:receipt.id});
  }
  if(credit){const move=appendDeposit(state,customer.id,credit,'EXCESS',user,{transactionId,orderId:order.id,orderCode:order.code,cashReceiptId:receipt.id,note:receipt.note});receipt.depositMovementId=move.id;receipt.depositBalanceAfter=move.balanceAfter;}
  return {payments,receipt,used,credit,allocated,transactionId};
}

export function cancelCustomerOrder(state,order,body,user) {
  initializeCustomers(state);const reason=String(body.reason || '').trim(),disposition=body.disposition;
  if(!reason||reason.length>1000||!['DEPOSIT','REFUND'].includes(disposition))throw new Error('Isi alasan dan pilih penyelesaian pembayaran');
  const op=checkOperation(state,body.requestId,['cancel',order.id,reason,disposition,body.method || '',body.customerId || ''],user);
  if(op.old)return order;
  if(order.cancelledAt)throw new Error('Pesanan sudah dibatalkan');
  const positive=order.payments.filter(p=>p.amount>0&&p.type!=='PO');
  const cash=positive.filter(p=>p.type!=='DEPOSIT').reduce((sum,p)=>sum+p.amount,0),deposit=positive.filter(p=>p.type==='DEPOSIT').reduce((sum,p)=>sum+p.amount,0);
  const customer=resolveOrderCustomer(state,order,body.customerId);
  if((deposit||cash&&disposition==='DEPOSIT')&&!customer)throw new Error('Hubungkan nota dengan pelanggan sebelum mengembalikan pembayaran ke deposit');
  if(cash&&disposition==='REFUND'&&!['TUNAI','QRIS','TRANSFER'].includes(body.method))throw new Error('Pilih sumber pengembalian uang');
  if(deposit)appendDeposit(state,customer.id,deposit,'PAYMENT_REVERSAL',user,{orderId:order.id,orderCode:order.code,note:reason});
  if(cash&&disposition==='DEPOSIT')appendDeposit(state,customer.id,cash,'CANCEL_CREDIT',user,{orderId:order.id,orderCode:order.code,note:reason});
  if(cash&&disposition==='REFUND')cashReceipt(state,order,customer,user,{kind:'REFUND',method:body.method,amount:-cash,note:reason});
  for(const payment of positive)order.payments.push({id:crypto.randomUUID(),type:'REVERSAL',method:payment.method,amount:-payment.amount,reversalOf:payment.id,createdAt:new Date().toISOString(),actor:user.name,actorId:user.id,note:reason});
  order.paidAmount=0;order.cancelledAt=new Date().toISOString();order.cancelReason=reason;order.status='BATAL';order.items.forEach(i=>i.status='BATAL');order.updatedAt=order.cancelledAt;
  finishOperation(state,body.requestId,op.fingerprint,user,{orderId:order.id});return order;
}
