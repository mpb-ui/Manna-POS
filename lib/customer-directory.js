import crypto from 'node:crypto';
import { customerPhone,customerNameKey } from '../public/customer-identity.js';
import { identityKey,customerMatch } from '../public/customer-search.js';
import { cancelled,unconfirmedDraft } from '../public/order-rules.js';
export const CUSTOMER_DIRECTORY_VERSION=1;
export function customerRoots(state) {
  const customers=new Map((state.customers || []).map(c=>[c.id,c])),roots=new Map();
  for(const c of customers.values()){let current=c,seen=new Set();while(current?.mergedInto&&!seen.has(current.id)){seen.add(current.id);current=customers.get(current.mergedInto);}roots.set(c.id,current?.id || c.id);}
  return {customers,roots};
}
export function directoryIndex(state) {
  const {customers,roots}=customerRoots(state),index=new Map(),identities=new Map();
  for(const c of customers.values())if(!c.archivedAt&&!c.mergedInto){index.set(c.id,{...c,depositBalance:0,totalSpend:0,paidOrders:0,orderCount:0,averageSpend:0,outstanding:0,activeOrders:0,unsettledTotal:0,lastPurchaseAt:null,historyCount:0});const key=identityKey(c.name,c.phone);identities.set(key,[...identities.get(key) || [],c.id]);}
  for(const m of state.depositLedger || []){const c=index.get(roots.get(m.customerId));if(c)c.depositBalance+=m.amount;}
  const orderCustomers=new Map();
  for(const o of state.orders || []){
    const matches=!o.customerId?identities.get(identityKey(o.customerName,o.phone)):null,id=o.customerId?roots.get(o.customerId):matches?.length===1?matches[0]:null,c=index.get(id);if(!c)continue;orderCustomers.set(o.id,id);c.historyCount++;
    if(!cancelled(o))c.unsettledTotal+=Math.max(0,Number(o.total || 0)-Number(o.paidAmount || 0));
    if(!cancelled(o)&&!['DIAMBIL','SELESAI'].includes(o.status))c.activeOrders++;
    if(cancelled(o)||unconfirmedDraft(o))continue;
    c.orderCount++;const remaining=Math.max(0,Number(o.total || 0)-Number(o.paidAmount || 0));c.outstanding+=remaining;
    if(Number(o.total)>0&&Number(o.paidAmount)>=Number(o.total)&&(o.paymentConfirmed||(o.payments || []).some(p=>p.amount>0))){c.totalSpend+=Number(o.total);c.paidOrders++;if(!c.lastPurchaseAt||o.createdAt>c.lastPurchaseAt)c.lastPurchaseAt=o.createdAt;}
  }
  for(const c of index.values())c.averageSpend=c.paidOrders?Math.round(c.totalSpend/c.paidOrders):0;
  return {index,roots,customers,orderCustomers};
}
export function matchingCustomers(state,name,phone='',{strong=false}={}) {
  const {index}=directoryIndex(state);return [...index.values()].map(c=>({...c,...customerMatch(c,name,phone)})).filter(c=>Number.isFinite(c.rank)&&(!strong||c.strongMatch)).sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name,'id'));
}
export function registerOrderCustomer(state,order,body,user) {
  if(String(order.customerName || '').trim().length>200)throw new Error('Nama pelanggan maksimal 200 karakter');
  const {index,roots}=directoryIndex(state);
  if(body.customerId){const c=index.get(roots.get(body.customerId));if(!c)throw new Error('Profil pelanggan tidak aktif. Pilih pelanggan kembali.');
    // Explicit choice is authoritative, but stale forms cannot silently change identity.
    if(customerNameKey(order.customerName)!==customerNameKey(c.name)||customerPhone(order.phone)!==customerPhone(c.phone))throw new Error('Data pelanggan berubah. Pilih ulang saran pelanggan sebelum menyimpan.');
    order.customerId=c.id;order.customerName=c.name;order.phone=c.phone;return c;
  }
  const exact=[...index.values()].filter(c=>identityKey(c.name,c.phone)===identityKey(order.customerName,order.phone));
  if(exact.length===1){order.customerId=exact[0].id;return exact[0];}
  const matches=matchingCustomers(state,order.customerName,order.phone,{strong:true});
  const accepted=new Set(body.newCustomerConfirmedIds || []);
  if(matches.some(c=>!accepted.has(c.id)))throw Object.assign(new Error('Ada pelanggan yang mungkin sama. Pilih profil atau konfirmasi pelanggan baru.'),{status:409,code:'CUSTOMER_MATCH_REQUIRED',matches:matches.map(c=>({id:c.id,name:c.name,phone:c.phone,matchReason:c.matchReason,lastPurchaseAt:c.lastPurchaseAt}))});
  const c={id:crypto.randomUUID(),name:order.customerName.trim().replace(/\s+/g,' '),phone:order.phone,note:'',aliases:[],createdAt:new Date().toISOString(),createdById:user.id,source:'ORDER'};
  (state.customers ||= []).push(c);order.customerId=c.id;return c;
}
// One-time exact-identity backfill. Similar names and shared phone numbers remain separate.
export function migrateCustomerDirectory(state) {
  if(state.customerDirectoryVersion>=CUSTOMER_DIRECTORY_VERSION)return;
  state.customers ||= [];const groups=new Map(),review=[];
  for(const c of state.customers)if(!c.archivedAt&&!c.mergedInto){const key=identityKey(c.name,c.phone);groups.set(key,[...groups.get(key) || [],c]);}
  let linked=0,created=0;
  for(const o of state.orders || []){
    if(o.customerId)continue;if(!String(o.customerName || '').trim()||!customerPhone(o.phone)){review.push(o.id);continue;}
    const key=identityKey(o.customerName,o.phone),matches=groups.get(key) || [];
    if(matches.length>1){review.push(o.id);continue;}
    let c=matches[0];if(!c){c={id:crypto.randomUUID(),name:o.customerName.trim().replace(/\s+/g,' '),phone:o.phone,note:'',aliases:[],createdAt:o.createdAt || new Date().toISOString(),source:'HISTORY'};state.customers.push(c);groups.set(key,[c]);created++;}
    o.customerId=c.id;linked++;
  }
  state.customerDirectoryMigration={created,linked,reviewOrderIds:review,completedAt:new Date().toISOString()};state.customerDirectoryVersion=CUSTOMER_DIRECTORY_VERSION;
}
export function mergeCustomers(state,sourceId,targetId,user) {
  const {index,roots}=directoryIndex(state),source=index.get(sourceId),target=index.get(targetId);
  if(!source||!target||sourceId===targetId)throw new Error('Pilih dua profil aktif yang berbeda');
  if(source.depositBalance+target.depositBalance>1_000_000_000_000)throw new Error('Gabungan saldo melebihi batas');
  const from=state.customers.find(c=>c.id===sourceId),to=state.customers.find(c=>c.id===targetId),at=new Date().toISOString();
  const aliases=[...to.aliases || [],from.name,...from.aliases || []];to.aliases=[...new Set(aliases.map(v=>String(v).trim()).filter(v=>v&&customerNameKey(v)!==customerNameKey(to.name)))];
  to.phoneAliases=[...new Set([...to.phoneAliases || [],from.phone,...from.phoneAliases || []].filter(v=>v&&v!==to.phone))];
  to.mergedProfiles=[...to.mergedProfiles || [],{id:sourceId,name:from.name,phone:from.phone,note:from.note || '',mergedAt:at,mergedById:user.id}];
  // Preserve original ledger, receipt and invoice text. Only the order's profile link moves.
  for(const o of state.orders || [])if(roots.get(o.customerId)===sourceId){o.originalCustomerId ||= o.customerId;o.customerId=targetId;}
  Object.assign(from,{mergedInto:targetId,archivedAt:at,mergedById:user.id});to.updatedAt=at;
  return {sourceId,targetId};
}
