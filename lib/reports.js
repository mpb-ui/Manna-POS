import { discountedItemTotals } from '../public/order-discount.js';
import { goodsReturnReport } from "./goods-return-report.js";
import { depositReport } from "./deposit-reports.js";
import { dated, cancellationDate, orderAtPeriodEnd, reportItemQuantity } from "./report-period.js";
import { projectJobs } from "../public/item-workflow.js";
import { ROLE_PRESETS, hasPermission } from "./access.js";
import { STATUS_LABEL } from "./domain.js";
const text = value => String(value || "").trim();
function reportRange(query, user) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const scope = user.reportScope || ROLE_PRESETS[user.role]?.reportScope || "all";
  const fromText = scope === "today" ? today : String(query.from || "");
  const toText = scope === "today" ? today : String(query.to || "");
  const defaultFrom = new Date(); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const fallbackFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(defaultFrom);
  for (const value of [fromText,toText]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)) throw new Error('Rentang tanggal tidak valid');
  const from = new Date(`${fromText || fallbackFrom}T00:00:00+08:00`);
  const to = new Date(`${toText || today}T23:59:59.999+08:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new Error("Rentang tanggal tidak valid");
  return { from, to, fromText: fromText || fallbackFrom, toText: toText || today, locked: scope === "today", scope };
}

function estimateItemCost(item, state) {
  const materialCost = (item.materials || []).reduce((sum, usage) => {
    const material = state.materials.find((row) => row.id === usage.materialId || row.sku === usage.sku);
    return sum + Number(usage.units || 0) * Number(usage.unitCost ?? material?.cost ?? 0);
  }, 0);
  if (materialCost > 0) return materialCost;
  if (Number.isFinite(item.baseCostTotal)) return item.baseCostTotal;
  const product = state.products.find((row) => row.id === item.productId);
  if (!product?.baseCost) return 0;
  const units = item.priceBasis === "sqm" ? Number(item.width || 0) * Number(item.billedLength || 0) * Number(item.quantity || 1) : item.priceBasis === "linear_m" ? Number(item.billedLength || 0) * Number(item.quantity || 1) : Number(item.quantity || 1);
  return Number(product.baseCost) * units;
}

function purchaseOrderNota(order) {
  return {
    code: order.code, customerName: order.customerName, phone: order.phone || "",
    createdAt: order.createdAt, deadline: order.deadline, grossTotal:order.grossTotal, invoiceDiscount:order.invoiceDiscount, total: order.total, paidAmount: order.paidAmount || 0,
    items: order.items.map(item => ({
      productName: item.productName, displaySize: item.displaySize, quantity: item.quantity, imageWidthCm: item.imageWidthCm ?? null, imageLengthCm: item.imageLengthCm ?? null, allowanceCm: item.allowanceCm || 0, finalImageWidthCm: item.finalImageWidthCm ?? null, finalImageLengthCm: item.finalImageLengthCm ?? null,
      baseTotal: item.baseTotal, templateDesign: item.templateDesign, templateDesignTotal: item.templateDesignTotal,
      subtotal: item.subtotal, productionNote: item.productionNote || "",
      fileService: item.fileService ? { id: item.fileService.id, name: item.fileService.name,
        price: item.fileService.price, quantity: item.fileService.quantity, note: item.fileService.note } : null,
      finishing: (item.finishing || []).map(f => ({ name: f.name, units: f.units, note: f.note }))
    }))
  };
}

export function aggregateReport(state, user, query = {}) {
  const range = reportRange(query,user), money = hasPermission(user,'reports.money'), cost = hasPermission(user,'reports.cost');
  const paymentMethod = text(query.paymentMethod).toUpperCase(), paymentStatus = text(query.paymentStatus).toUpperCase();
  if (paymentMethod && !['TUNAI','QRIS','TRANSFER','DEPOSIT'].includes(paymentMethod)) throw new Error('Sumber pembayaran tidak valid');
  if (paymentStatus && !['BELUM_BAYAR','BELUM_LUNAS','LUNAS'].includes(paymentStatus)) throw new Error('Status pembayaran tidak valid');
  if (!money && (paymentMethod || paymentStatus)) throw new Error('Akses filter pembayaran tidak diizinkan');
  const category = text(query.category), machineId = text(query.machineId);
  const products = new Map(state.products.map(p=>[p.id,p]));
  const itemCategory = item => item.reportCategory ?? item.category ?? products.get(item.productId)?.category ?? 'Tanpa kategori';
  const itemMachines = item => item.reportMachines ?? (products.get(item.productId)?.machineIds || []).map(id=>({id,name:state.machines.find(m=>m.id===id)?.name || id}));
  const selectedItems = order => order.items.filter(item=>(!category || itemCategory(item)===category) && (!machineId || itemMachines(item).some(m=>m.id===machineId)));
  const inUserScope = order => range.scope !== 'own' || order.createdById===user.id || order.designPic===user.name || order.items.some(i=>i.designPic===user.name);
  const rawOrders = new Map(state.orders.map(o=>[o.id,o]));
  const all = state.orders.filter(o=>dated(o.createdAt)!=null && dated(o.createdAt)<=+range.to).map(o=>orderAtPeriodEnd(o,range.to));
  const matchesStatus = order => !paymentStatus || (paymentStatus==='BELUM_BAYAR' ? order.paidAmount===0 && order.paymentStatus!=='LUNAS' : order.paymentStatus===paymentStatus);
  const matchesMethod = order => !paymentMethod || order.payments.some(p=>p.amount>0 && String(p.method).toUpperCase()===paymentMethod);
  const scoped = all.filter(o=>inUserScope(o) && matchesStatus(o) && matchesMethod(o) && selectedItems(o).length);
  const byId = new Map(all.map(o=>[o.id,o]));
  const allocations = new WeakMap();
  const itemNet = (o,i) => { if (!allocations.has(o)) allocations.set(o,discountedItemTotals(o)); return allocations.get(o)[o.items.indexOf(i)] || 0; };
  const selectedSales = o => selectedItems(o).reduce((n,i)=>n+itemNet(o,i),0);
  const ratio = o => Number(o.total)>0 ? selectedSales(o)/Number(o.total) : 0;
  const within = value => dated(value)!=null && dated(value)>=+range.from && dated(value)<=+range.to;
  const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar'}).format(new Date(value));
  const laterDiscount = o => o.invoiceDiscount?.amount>0 && dated(o.invoiceDiscount.appliedAt)!=null && dayKey(o.invoiceDiscount.appliedAt)>dayKey(o.createdAt);
  const events = scoped.flatMap(order=>[
    ...(within(order.createdAt) ? [{order,date:order.createdAt,sign:1,kind:'SALE',gross:laterDiscount(order)}] : []),
    ...(laterDiscount(order) && within(order.invoiceDiscount.appliedAt) ? [{order,date:order.invoiceDiscount.appliedAt,sign:-1,kind:'DISCOUNT'}] : []),
    ...(order.isCancelled && within(cancellationDate(order)) ? [{order,date:cancellationDate(order),sign:-1,kind:'CANCELLATION'}] : [])
  ]);
  const eventItemNet = (event,item) => event.sign*(event.kind==='DISCOUNT' ? Number(item.subtotal || 0)-itemNet(event.order,item) : event.gross ? Number(item.subtotal || 0) : itemNet(event.order,item));
  const eventSales = event => selectedItems(event.order).reduce((n,i)=>n+eventItemNet(event,i),0);
  const eventItemCost = (event,item) => event.kind==='DISCOUNT'?0:estimateItemCost(item,state)*event.sign;
  const mask = row => {
    const copy={...row};
    if (!money) for (const k of ['sales','paid','outstanding','paymentStatus','poNumbers','method','methods']) delete copy[k];
    if (!cost) for (const k of ['cost','value','profit','margin','salesCost','returnCost']) delete copy[k];
    return copy;
  };
  const rows = events.map(event=>{
    const {order:o,date,sign,kind}=event;
    const items=selectedItems(o), sales=eventSales(event), itemCost=items.reduce((n,i)=>n+eventItemCost(event,i),0);
    const methods=[...new Set(o.payments.filter(p=>p.amount>0 && p.type!=='PO').map(p=>String(p.method).toUpperCase()))];
    return mask({id:o.id,eventId:`${o.id}:${kind}`,date,invoiceDate:o.createdAt,kind,cancelled:o.isCancelled,code:o.code,customer:o.customerName,products:items.map(i=>i.productName).join(', '),itemCount:kind==='DISCOUNT'?0:items.reduce((n,i)=>n+Number(i.quantity || 1),0)*sign,status:kind==='CANCELLATION'?'Koreksi pembatalan':kind==='DISCOUNT'?'Diskon invoice':o.isCancelled?'Dibatalkan':STATUS_LABEL[o.status],paymentStatus:o.paymentStatus,poNumbers:o.payments.filter(p=>p.type==='PO').map(p=>p.poNumber).filter(Boolean),methods,method:methods.join(' + ') || '-',sales,paid:kind==='SALE'?o.paidAmount*ratio(o):0,outstanding:kind==='SALE'?o.outstanding*ratio(o):0,cost:itemCost,profit:sales-itemCost,margin:sales?(sales-itemCost)/sales*100:0});
  }).sort((a,b)=>b.date.localeCompare(a.date) || a.eventId.localeCompare(b.eventId));
  const receivables = scoped.filter(o=>!o.isCancelled && o.outstanding>0).map(o=>({id:o.id,date:o.createdAt,code:o.code,customer:o.customerName,sales:selectedSales(o),paid:o.paidAmount*ratio(o),outstanding:o.outstanding*ratio(o)})).sort((a,b)=>a.date.localeCompare(b.date));
  const receiptOrderMatches = o => o && inUserScope(o) && matchesStatus(o) && selectedItems(o).length;
  const legacyReceipts = all.filter(receiptOrderMatches).flatMap(o=>(rawOrders.get(o.id).payments || []).filter(p=>!p.cashReceiptId && p.type!=='DEPOSIT' && p.type!=='PO' && p.type!=='REVERSAL' && p.amount>0 && within(p.createdAt) && (!paymentMethod || String(p.method).toUpperCase()===paymentMethod)).map(p=>({id:p.id,orderId:o.id,code:o.code,customer:o.customerName,date:p.createdAt,method:String(p.method || 'Lainnya').toUpperCase(),paid:Number(p.amount)*ratio(o),kind:p.type==='DP'?'DP':'PAYMENT'})));
  const newReceipts = (state.cashReceipts || []).filter(r=>{
    const o=byId.get(r.orderId);
    return within(r.createdAt) && (!paymentMethod || r.method===paymentMethod) && (o ? receiptOrderMatches(o) : !paymentStatus && !category && !machineId && (range.scope!=='own' || r.actorId===user.id));
  }).map(r=>({id:r.id,orderId:r.orderId,code:r.orderCode || 'Deposit pelanggan',customer:r.customerName,date:r.createdAt,method:r.method,paid:(category || machineId)?Number(r.kind==='REFUND'?r.amount:r.allocatedAmount || 0)*ratio(byId.get(r.orderId)):Number(r.amount),allocatedAmount:r.allocatedAmount || 0,depositAmount:r.depositAmount || 0,kind:r.kind,paymentType:r.kind==='REFUND'?'REFUND':!r.orderId || !r.allocatedAmount && r.depositAmount?'TOPUP':(rawOrders.get(r.orderId)?.payments || []).some(p=>p.cashReceiptId===r.id && p.balanceAfter>0)?'DP':'PAYMENT'}));
  const receipts=[...legacyReceipts,...newReceipts].sort((a,b)=>b.date.localeCompare(a.date));
  const maps={categories:new Map(),products:new Map(),machines:new Map(),days:new Map(),customers:new Map(),statuses:new Map()};
  const add = (map,key,seed,itemSales,itemCost,quantity,unit,sign,first=true) => {
    const row=map.get(key) || {...seed,orders:0,jobs:0,quantity:0,sales:0,cost:0,units:{}};
    row.sales+=itemSales;row.cost+=itemCost;row.quantity+=quantity;row.units[unit]=(row.units[unit] || 0)+quantity;if(first)row.orders+=sign;row.jobs+=sign;map.set(key,row);
  };
  for (const event of events) {
    const {order:o,date,sign,kind}=event, quantitySign=kind==='DISCOUNT'?0:sign;
    const seenCategories=new Set(),seenProducts=new Set(),seenMachines=new Set();
    const account=(state.customers || []).find(c=>c.id===o.customerId), customerKey=o.customerId || `${o.customerName}|${o.phone || ''}`.toLowerCase(), customer=maps.customers.get(customerKey) || {label:account?.name || o.customerName,phone:account?.phone || o.phone || '',orders:0,items:0,sales:0,paid:0,lastOrderAt:o.createdAt};
    customer.orders+=quantitySign;customer.sales+=eventSales(event);customer.items+=selectedItems(o).reduce((n,i)=>n+Number(i.quantity || 1),0)*quantitySign;if(sign===1)customer.paid+=o.paidAmount*ratio(o);if(o.createdAt>customer.lastOrderAt)customer.lastOrderAt=o.createdAt;maps.customers.set(customerKey,customer);
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar'}).format(new Date(date));
    for (const item of selectedItems(o)) {
      const p=products.get(item.productId), categoryName=itemCategory(item), itemSales=eventItemNet(event,item), itemCost=eventItemCost(event,item);
      const {unit,quantity}=reportItemQuantity(item,p), q=quantity*quantitySign;
      add(maps.categories,categoryName,{label:categoryName},itemSales,itemCost,q,unit,quantitySign,!seenCategories.has(categoryName));seenCategories.add(categoryName);
      add(maps.products,item.productId,{id:item.productId,label:item.productName,category:categoryName,unit},itemSales,itemCost,q,unit,quantitySign,!seenProducts.has(item.productId));seenProducts.add(item.productId);
      // Legacy products can reference several machines. Allocate each line once,
      // so machine totals still reconcile with sales, including unmapped work.
      const machines=itemMachines(item), buckets=machines.length?machines:[{id:'unassigned',name:'Tanpa mesin'}];
      buckets.forEach((m,index)=>{
        const share=Math.trunc(itemSales/buckets.length)+(index<Math.abs(itemSales%buckets.length)?Math.sign(itemSales):0);
        add(maps.machines,m.id,{id:m.id,label:m.name},share,itemCost/buckets.length,q/buckets.length,unit,quantitySign,!seenMachines.has(m.id));seenMachines.add(m.id);
      });
      add(maps.days,day,{label:day},itemSales,itemCost,Number(item.quantity || 1)*quantitySign,'item',quantitySign);
    }
  }
  const ranking = map => [...map.values()].map(r=>mask({...r,quantities:Object.entries(r.units).map(([unit,quantity])=>({unit,quantity})),units:undefined,profit:r.sales-r.cost,margin:r.sales?(r.sales-r.cost)/r.sales*100:0})).sort((a,b)=>money?b.sales-a.sales:b.quantity-a.quantity);
  const goodsReturns=goodsReturnReport(state,range,{showCost:cost,includeOrder:o=>{const at=byId.get(o.id);return at && inUserScope(at) && matchesStatus(at) && matchesMethod(at);},includeItem:(o,i)=>selectedItems(o).includes(i)});
  const sales=rows.reduce((n,r)=>n+Number(r.sales || 0),0), hpp=events.reduce((n,event)=>n+selectedItems(event.order).reduce((v,i)=>v+eventItemCost(event,i),0),0);
  const returnCost=goodsReturns.cost || 0, paid=receipts.reduce((n,r)=>n+r.paid,0),outstanding=receivables.reduce((n,r)=>n+r.outstanding,0);
  const inventory=state.inventory.map(i=>({id:i.materialId,label:i.productName,sku:i.sku,category:i.category,quantity:i.quantity,minStock:i.minStock,unit:i.unit,stockMethod:i.stockMethod,stockNeedsCount:Boolean(i.stockNeedsCount),low:!i.stockNeedsCount && i.quantity<=i.minStock}));
  const statuses=new Map();for(const o of scoped.filter(o=>!o.isCancelled))for(const j of projectJobs([o])) {const r=statuses.get(j.status)||{id:j.status,label:STATUS_LABEL[j.status]||j.status,orders:0,items:0};r.orders++;r.items+=Number(j.items[0]?.quantity||1);statuses.set(j.status,r);}
  const purchaseOrders=money?scoped.flatMap(o=>o.payments.filter(p=>p.type==='PO' && within(p.createdAt)).map(p=>({orderId:o.id,nota:purchaseOrderNota(o),code:o.code,customer:o.customerName,poNumber:p.poNumber,createdAt:p.createdAt,attachment:p.poAttachment || null}))):[];
  return {range:{from:range.fromText,to:range.toText,locked:range.locked,scope:range.scope},capabilities:{money,cost,export:hasPermission(user,'reports.export'),print:hasPermission(user,'reports.print'),delete:money && user.role==='OWNER' && hasPermission(user,'orders.view') && hasPermission(user,'deposit.manage')},paymentMethod,paymentStatus,
    summary:mask({orders:events.filter(e=>e.kind==='SALE').length,corrections:events.filter(e=>e.kind!=='SALE').length,items:events.reduce((n,{order,sign,kind})=>n+(kind==='DISCOUNT'?0:sign)*selectedItems(order).reduce((a,i)=>a+Number(i.quantity || 1),0),0),sales,paid,outstanding,salesCost:hpp,returnCost,returnQuantity:goodsReturns.quantity,returnTransactions:goodsReturns.transactions,cost:hpp+returnCost,profit:sales-hpp-returnCost,margin:sales?(sales-hpp-returnCost)/sales*100:0}),
    rows,receipts:money?receipts:[],receivables:money?receivables:[],categories:ranking(maps.categories),products:ranking(maps.products),machines:ranking(maps.machines),days:ranking(maps.days),customers:[...maps.customers.values()].map(mask),statuses:[...statuses.values()],inventory,purchaseOrders,goodsReturns,
    deposits:money && hasPermission(user,'customers.view') && range.scope==='all'?depositReport(state,range.from,range.to):null,attention:[],insights:[],paymentSummary:mask({unpaid:scoped.filter(o=>!o.paidAmount).length,partial:scoped.filter(o=>o.paidAmount && o.paymentStatus!=='LUNAS').length,paidOrders:scoped.filter(o=>o.paymentStatus==='LUNAS').length,sales,paid,outstanding})};
}
