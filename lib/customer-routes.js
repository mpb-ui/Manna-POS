import { hasPermission } from './access.js';
import { customerPhone,customerNameKey } from '../public/customer-identity.js';
import { requiredPhone } from '../public/customer-validation.js';
import { initializeCustomers,customerById,customerSnapshot,appendDeposit,rupiahAmount,checkOperation,finishOperation,cashReceipt } from './customer-deposits.js';
import crypto from 'node:crypto';
export function registerCustomerRoutes(app,{store,requirePermission,audit}) {
  const route=(method,path,permission,handler)=>app[method](path,requirePermission(permission),async(req,res,next)=>{try{res.json(await handler(req));}catch(error){next(error);}});
  const manager=req=>{if(!['OWNER','ADMIN'].includes(req.user.role)||!hasPermission(req.user,'deposit.manage'))throw Object.assign(new Error('Koreksi dan refund deposit hanya untuk Owner/Admin'),{status:403});};
  const page=(rows,query,size=25)=>{const limit=Math.min(100,Math.max(1,parseInt(query.pageSize)||size)),pages=Math.max(1,Math.ceil(rows.length/limit)),number=Math.min(pages,Math.max(1,parseInt(query.page)||1));return {rows:rows.slice((number-1)*limit,number*limit),page:number,pages,total:rows.length};};
  route('get','/api/customers','customers.view',async req=>{
    const state=await store.read(),q=String(req.query.q || '').trim().toLocaleLowerCase('id'),phone=customerPhone(q);
    const balances=new Map();for(const m of state.depositLedger || [])balances.set(m.customerId,(balances.get(m.customerId)||0)+m.amount);
    let customers=(state.customers || []).filter(c=>!c.archivedAt&&(!q||`${c.name} ${c.phone}`.toLocaleLowerCase('id').includes(q)||phone.length>=3&&customerPhone(c.phone).includes(phone))).map(c=>({...c,depositBalance:balances.get(c.id) || 0}));
    if(req.query.deposit==='yes')customers=customers.filter(c=>c.depositBalance>0);
    customers.sort((a,b)=>a.name.localeCompare(b.name,'id'));
    return page(customers,req.query);
  });
  route('post','/api/customers','customers.create',req=>store.mutate(state=>{
    initializeCustomers(state);const name=String(req.body.name || '').trim().replace(/\s+/g,' '),phone=requiredPhone(req.body.phone),note=String(req.body.note || '').trim();
    if(!name||name.length>200||note.length>1000)throw new Error('Isi nama pelanggan dan catatan yang valid');
    const payload=['create-customer',name,phone,note],op=checkOperation(state,req.body.requestId,payload,req.user);
    if(op.old)return customerSnapshot(state,customerById(state,op.old.result.id));
    if(state.customers.some(c=>!c.archivedAt&&customerNameKey(c.name)===customerNameKey(name)&&customerPhone(c.phone)===customerPhone(phone)))throw new Error('Pelanggan dengan nama dan WhatsApp yang sama sudah tersedia');
    const customer={id:crypto.randomUUID(),name,phone,note,createdAt:new Date().toISOString(),createdById:req.user.id};state.customers.push(customer);
    audit(state,req.user,'CUSTOMER_CREATE',`Menambahkan pelanggan ${name}`,{customerId:customer.id});finishOperation(state,req.body.requestId,op.fingerprint,req.user,{id:customer.id});return customerSnapshot(state,customer);
  }));
  route('put','/api/customers/:id','customers.edit',req=>store.mutate(state=>{
    const customer=customerById(state,req.params.id),name=String(req.body.name || '').trim().replace(/\s+/g,' '),phone=requiredPhone(req.body.phone),note=String(req.body.note || '').trim();
    if(!name||name.length>200||note.length>1000)throw new Error('Isi nama pelanggan dan catatan yang valid');
    if(state.customers.some(c=>c.id!==customer.id&&!c.archivedAt&&customerNameKey(c.name)===customerNameKey(name)&&customerPhone(c.phone)===customerPhone(phone)))throw new Error('Identitas pelanggan sudah digunakan');
    const before={name:customer.name,phone:customer.phone,note:customer.note};Object.assign(customer,{name,phone,note,updatedAt:new Date().toISOString()});
    audit(state,req.user,'CUSTOMER_UPDATE',`Mengubah data ${name}`,{customerId:customer.id,before});return customerSnapshot(state,customer);
  }));
  route('get','/api/customers/:id/balance','customers.view',async req=>{const state=await store.read();return {customer:customerSnapshot(state,customerById(state,req.params.id))};});
  route('get','/api/customers/:id','customers.view',async req=>{
    const state=await store.read(),customer=customerById(state,req.params.id);
    const orders=state.orders.filter(o=>o.customerId===customer.id||!o.customerId&&customerPhone(o.phone)===customerPhone(customer.phone)&&customerNameKey(o.customerName)===customerNameKey(customer.name)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const history=page(orders.map(o=>({id:o.id,code:o.code,createdAt:o.createdAt,total:o.total,paidAmount:o.paidAmount,status:o.status,linked:o.customerId===customer.id,products:o.items.map(i=>i.productName).join(', ')})),req.query);
    const ledger=page((state.depositLedger || []).filter(m=>m.customerId===customer.id).toReversed().map(m=>m.kind==='REFUND'?{...m,receipt:(state.cashReceipts || []).find(r=>r.depositMovementId===m.id)}:m),{page:req.query.ledgerPage,pageSize:25});
    return {customer:customerSnapshot(state,customer),history,ledger};
  });
  route('post','/api/customers/:id/deposit','deposit.manage',req=>{
    manager(req);return store.mutate(state=>{
      initializeCustomers(state);const customer=customerById(state,req.params.id),kind=req.body.kind,amount=rupiahAmount(req.body.amount,{signed:kind==='CORRECTION'}),note=String(req.body.note || '').trim();
      if(!['OPENING','CORRECTION','REFUND'].includes(kind)||!note||note.length>1000)throw new Error('Pilih jenis transaksi dan isi alasan maksimal 1.000 karakter');
      if(kind==='REFUND'&&!['TUNAI','QRIS','TRANSFER'].includes(req.body.method))throw new Error('Pilih metode pengembalian uang');
      const payload=['deposit',customer.id,kind,amount,note,req.body.method || '',req.body.reversalOf || ''],op=checkOperation(state,req.body.requestId,payload,req.user);if(op.old)return op.old.result;
      let delta=kind==='REFUND'?-amount:amount;
      if(req.body.reversalOf){
        const original=state.depositLedger.find(m=>m.id===req.body.reversalOf&&m.customerId===customer.id&&['OPENING','CORRECTION'].includes(m.kind));
        if(!original||state.depositLedger.some(m=>m.reversalOf===original.id))throw new Error('Transaksi tidak dapat dibalik atau sudah dibalik');
        if(delta!==-original.amount||kind!=='CORRECTION')throw new Error('Nominal pembalik harus tepat sama dengan transaksi asal');
      }
      const move=appendDeposit(state,customer.id,delta,kind,req.user,{note,reversalOf:req.body.reversalOf || null});
      if(kind==='REFUND')cashReceipt(state,null,customer,req.user,{kind:'REFUND',method:req.body.method,amount:delta,depositMovementId:move.id,note});
      audit(state,req.user,'DEPOSIT_'+kind,`${kind} deposit ${customer.name}`,{customerId:customer.id,movementId:move.id,amount:delta,note});
      return finishOperation(state,req.body.requestId,op.fingerprint,req.user,{movement:move,customer:customerSnapshot(state,customer)});
    });
  });
}
