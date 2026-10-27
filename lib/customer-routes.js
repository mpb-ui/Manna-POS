import { cancelled } from '../public/order-rules.js';
import { directoryIndex, matchingCustomers, mergeCustomers, customerRoots } from './customer-directory.js';
import { hasPermission } from './access.js';
import { customerPhone,customerNameKey } from '../public/customer-identity.js';
import { requiredPhone } from '../public/customer-validation.js';
import { initializeCustomers,customerById,customerSnapshot,appendDeposit,rupiahAmount,checkOperation,finishOperation,cashReceipt } from './customer-deposits.js';
import crypto from 'node:crypto';
export function registerCustomerRoutes(app,{store,requirePermission,audit}) {
  const route=(method,path,permission,handler)=>app[method](path,requirePermission(permission),async(req,res,next)=>{try{res.json(await handler(req));}catch(error){next(error);}});
  const readAliases=value=>{const rows=Array.isArray(value)?value:String(value || '').split('\n');if(rows.length>50||rows.some(v=>typeof v!=='string'||v.length>200))throw new Error('Maksimal 50 alias, masing-masing 200 karakter');return [...new Set(rows.map(v=>v.trim()).filter(Boolean))];};
  const manager=req=>{if(!['OWNER','ADMIN'].includes(req.user.role)||!hasPermission(req.user,'deposit.manage'))throw Object.assign(new Error('Koreksi dan refund deposit hanya untuk Owner/Admin'),{status:403});};
  const page=(rows,query,size=25)=>{const limit=Math.min(100,Math.max(1,parseInt(query.pageSize)||size)),pages=Math.max(1,Math.ceil(rows.length/limit)),number=Math.min(pages,Math.max(1,parseInt(query.page)||1));return {rows:rows.slice((number-1)*limit,number*limit),page:number,pages,total:rows.length};};
  // Checkout suggestions are also available to users allowed to enter orders.
  app.get('/api/customers/suggestions',async(req,res,next)=>{try{
    if(!hasPermission(req.user,'customers.view')&&!hasPermission(req.user,'pos.create'))throw Object.assign(new Error('Akses pelanggan diperlukan'),{status:403});
    const state=await store.read(),name=String(req.query.name ?? req.query.q ?? '').slice(0,200),phone=String(req.query.phone || '').slice(0,100);
    const matches=matchingCustomers(state,name,phone,{strong:req.query.strong==='yes'});
    res.json({rows:matches.slice(0,12).map(c=>({id:c.id,name:c.name,phone:c.phone,matchReason:c.matchReason,strongMatch:c.strongMatch,lastPurchaseAt:c.lastPurchaseAt,...hasPermission(req.user,'customers.view')?{depositBalance:c.depositBalance}:{}}))});
  }catch(error){next(error);}});
  route('get','/api/customers','customers.view',async req=>{
    const state=await store.read(),{index}=directoryIndex(state),q=String(req.query.q || '').trim();
    let customers=q?matchingCustomers(state,q):[...index.values()];
    if(req.query.deposit==='yes')customers=customers.filter(c=>c.depositBalance>0);
    if(req.query.outstanding==='yes')customers=customers.filter(c=>c.outstanding>0);
    const sort=req.query.sort;
    customers.sort((a,b)=>sort==='spend'?b.totalSpend-a.totalSpend:sort==='recent'?String(b.lastPurchaseAt || '').localeCompare(a.lastPurchaseAt || ''):a.name.localeCompare(b.name,'id'));
    return {...page(customers,req.query),summary:{customers:index.size,withPurchases:[...index.values()].filter(c=>c.paidOrders>0).length,outstanding:[...index.values()].reduce((n,c)=>n+c.outstanding,0),deposit:[...index.values()].reduce((n,c)=>n+c.depositBalance,0)},reviewOrders:(state.customerDirectoryMigration?.reviewOrderIds || []).filter(id=>state.orders.some(o=>o.id===id&&!o.customerId)).length};
  });
  route('post','/api/customers','customers.create',req=>store.mutate(state=>{
    initializeCustomers(state);const name=String(req.body.name || '').trim().replace(/\s+/g,' '),phone=requiredPhone(req.body.phone),note=String(req.body.note || '').trim();
    if(!name||name.length>200||note.length>1000)throw new Error('Isi nama pelanggan dan catatan yang valid');
    const payload=['create-customer',name,phone,note],op=checkOperation(state,req.body.requestId,payload,req.user);
    if(op.old)return customerSnapshot(state,customerById(state,op.old.result.id));
    if(state.customers.some(c=>!c.archivedAt&&customerNameKey(c.name)===customerNameKey(name)&&customerPhone(c.phone)===customerPhone(phone)))throw new Error('Pelanggan dengan nama dan WhatsApp yang sama sudah tersedia');
    const matches=matchingCustomers(state,name,phone,{strong:true});if(matches.some(c=>!(req.body.newCustomerConfirmedIds || []).includes(c.id)))throw Object.assign(new Error('Ada pelanggan yang mungkin sama. Periksa sebelum membuat profil baru.'),{status:409,code:'CUSTOMER_MATCH_REQUIRED',matches:matches.map(c=>({id:c.id,name:c.name,phone:c.phone,matchReason:c.matchReason}))});
    const aliases=readAliases(req.body.aliases);const customer={id:crypto.randomUUID(),name,phone,note,aliases,createdAt:new Date().toISOString(),createdById:req.user.id};state.customers.push(customer);
    audit(state,req.user,'CUSTOMER_CREATE',`Menambahkan pelanggan ${name}`,{customerId:customer.id});finishOperation(state,req.body.requestId,op.fingerprint,req.user,{id:customer.id});return customerSnapshot(state,customer);
  }));
  route('put','/api/customers/:id','customers.edit',req=>store.mutate(state=>{
    const customer=customerById(state,req.params.id),name=String(req.body.name || '').trim().replace(/\s+/g,' '),phone=requiredPhone(req.body.phone),note=String(req.body.note || '').trim();
    if(!name||name.length>200||note.length>1000)throw new Error('Isi nama pelanggan dan catatan yang valid');
    if(state.customers.some(c=>c.id!==customer.id&&!c.archivedAt&&customerNameKey(c.name)===customerNameKey(name)&&customerPhone(c.phone)===customerPhone(phone)))throw new Error('Identitas pelanggan sudah digunakan');
    const before={name:customer.name,phone:customer.phone,note:customer.note,aliases:customer.aliases};const aliases=readAliases(req.body.aliases ?? customer.aliases);if(customerNameKey(name)!==customerNameKey(customer.name))aliases.push(customer.name);Object.assign(customer,{name,phone,note,aliases:[...new Set(aliases)].filter(a=>customerNameKey(a)!==customerNameKey(name)),updatedAt:new Date().toISOString()});
    audit(state,req.user,'CUSTOMER_UPDATE',`Mengubah data ${name}`,{customerId:customer.id,before});return customerSnapshot(state,customer);
  }));
  route('get','/api/customers/:id/balance','customers.view',async req=>{const state=await store.read();return {customer:customerSnapshot(state,customerById(state,req.params.id,{allowArchived:true}))};});
  route('get','/api/customers/:id','customers.view',async req=>{
    const state=await store.read(),customer=customerById(state,req.params.id);
    const {orderCustomers,roots}=directoryIndex(state);
    const orders=state.orders.filter(o=>orderCustomers.get(o.id)===customer.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const selectedOrders=req.query.active==='yes'?orders.filter(o=>!['SELESAI','DIAMBIL'].includes(o.status)&&!cancelled(o)):orders;
    const history=page(selectedOrders.map(o=>({id:o.id,code:o.code,createdAt:o.createdAt,total:o.total,paidAmount:o.paidAmount,status:o.status,linked:Boolean(o.customerId),products:o.items.map(i=>i.productName).join(', ')})),req.query);
    let running=0;const movements=(state.depositLedger || []).filter(m=>roots.get(m.customerId)===customer.id).map(m=>{running+=m.amount;return {...m,profileBalanceAfter:running,originalProfile:state.customers.find(c=>c.id===m.customerId)?.name,...m.kind==='REFUND'?{receipt:(state.cashReceipts || []).find(r=>r.depositMovementId===m.id)}:{}};});
    const ledger=page(movements.toReversed(),{page:req.query.ledgerPage,pageSize:25});
    return {customer:{...customerSnapshot(state,customer),...directoryIndex(state).index.get(customer.id)},history,ledger};
  });
  const owner=req=>{if(req.user.role!=='OWNER')throw Object.assign(new Error('Hanya Owner dapat menghapus atau menggabungkan profil'),{status:403});};
  const preview=(state,sourceId,targetId)=>{
    const {index}=directoryIndex(state),source=index.get(sourceId),target=index.get(targetId);
    if(!source||!target||sourceId===targetId)throw new Error('Pilih dua profil aktif yang berbeda');
    const token=crypto.createHash('sha256').update(JSON.stringify([source,target])).digest('hex');
    return {source,target,token};
  };
  route('post','/api/customers/:id/merge-preview','customers.view',async req=>{owner(req);return preview(await store.read(),req.params.id,req.body.targetId);});
  route('post','/api/customers/:id/merge','customers.view',req=>{owner(req);return store.mutate(state=>{
    const payload=['merge-customer',req.params.id,req.body.targetId,req.body.reason],op=checkOperation(state,req.body.requestId,payload,req.user);if(op.old)return op.old.result;
    if(req.body.confirm!==true||!String(req.body.reason || '').trim())throw new Error('Periksa profil dan isi alasan penggabungan');
    const data=preview(state,req.params.id,req.body.targetId);if(data.token!==req.body.previewToken)throw Object.assign(new Error('Data pelanggan berubah. Buka kembali pratinjau penggabungan.'),{status:409});
    const result=mergeCustomers(state,req.params.id,req.body.targetId,req.user);
    audit(state,req.user,'CUSTOMER_MERGE',`Menggabungkan ${data.source.name} ke ${data.target.name}`,{...result,reason:String(req.body.reason).trim().slice(0,1000),sourceDeposit:data.source.depositBalance,targetDeposit:data.target.depositBalance});
    return finishOperation(state,req.body.requestId,op.fingerprint,req.user,result);
  });});
  route('delete','/api/customers/:id','customers.view',req=>{owner(req);return store.mutate(state=>{
    const op=checkOperation(state,req.body.requestId,['archive-customer',req.params.id,req.body.reason],req.user);if(op.old)return op.old.result;
    const {index}=directoryIndex(state),c=index.get(req.params.id);if(!c)throw new Error('Profil tidak aktif');
    if(req.body.confirm!==true||!String(req.body.reason || '').trim())throw new Error('Konfirmasi penghapusan dan isi alasan');
    if(c.depositBalance>0||c.unsettledTotal>0)throw new Error('Profil masih memiliki saldo deposit atau pesanan belum lunas (termasuk draft). Selesaikan terlebih dahulu atau gabungkan ke profil yang sesuai.');
    Object.assign(state.customers.find(v=>v.id===c.id),{archivedAt:new Date().toISOString(),archivedById:req.user.id,archiveReason:String(req.body.reason).trim().slice(0,1000)});
    audit(state,req.user,'CUSTOMER_ARCHIVE',`Menghapus profil ${c.name} dari daftar aktif`,{customerId:c.id,reason:req.body.reason});
    return finishOperation(state,req.body.requestId,op.fingerprint,req.user,{id:c.id,archived:true});
  });});
  route('post','/api/customers/:id/deposit','deposit.manage',req=>{
    manager(req);return store.mutate(state=>{
      initializeCustomers(state);const customer=customerById(state,req.params.id),kind=req.body.kind,amount=rupiahAmount(req.body.amount,{signed:kind==='CORRECTION'}),note=String(req.body.note || '').trim();
      if(!['OPENING','CORRECTION','REFUND'].includes(kind)||!note||note.length>1000)throw new Error('Pilih jenis transaksi dan isi alasan maksimal 1.000 karakter');
      if(kind==='REFUND'&&!['TUNAI','QRIS','TRANSFER'].includes(req.body.method))throw new Error('Pilih metode pengembalian uang');
      const payload=['deposit',customer.id,kind,amount,note,req.body.method || '',req.body.reversalOf || ''],op=checkOperation(state,req.body.requestId,payload,req.user);if(op.old)return op.old.result;
      let delta=kind==='REFUND'?-amount:amount;
      if(req.body.reversalOf){
        const original=state.depositLedger.find(m=>m.id===req.body.reversalOf&&customerRoots(state).roots.get(m.customerId)===customer.id&&['OPENING','CORRECTION'].includes(m.kind));
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
