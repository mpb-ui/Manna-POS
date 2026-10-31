import { thermalItemData, thermalDate, receiptView } from '../public/thermal-documents.js';
import { historyDraft, paymentReceipts } from '../public/order-history.js';
import { cancelled, paymentHistoryVisible } from '../public/order-rules.js';
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n || 0));

// Explicit document projection: the desktop client never receives raw order,
// price/cost records, customer deposits, PO attachments or database credentials.
export function printDocumentData(order,kind,paymentId,cashReceipts=[]) {
  const work=kind==='work-order';
  const base={schemaVersion:1,kind,code:order.code,customerName:order.customerName || '—',phone:order.phone || '—',
    date:thermalDate(order.createdAt,work)+' WITA',deadline:order.deadline?thermalDate(order.deadline,true)+' WITA':'—',
    items:(order.items || []).map(item=>{const {subtotal,...data}=thermalItemData(item,{work,deadline:order.deadline});return {...data,...(!work?{price:money(subtotal)}:{})};})};
  if(work)return {...base,warning:cancelled(order)?'PESANAN DIBATALKAN':historyDraft(order)?'DRAFT · BELUM DIKONFIRMASI':''};
  const receipts=paymentHistoryVisible(order.printRole)?paymentReceipts(order,cashReceipts):[];
  const selected=kind==='payment'?receipts.find(p=>p.id===paymentId || p.memberIds.includes(paymentId)):null;
  if(kind==='payment'&&!selected)throw Object.assign(new Error('Bukti pembayaran tidak ditemukan'),{status:404});
  const v=receiptView(paymentHistoryVisible(order.printRole)?order:{...order,payments:[]},selected,receipts.at(-1)),p=v.latest,rows=[];
  const row=(label,value,style='normal')=>rows.push({label,value:money(value),style});
  if(v.discount){row('Total Pesanan',v.gross);row('Diskon pesanan',-v.discount);}
  row('Grand Total',v.total,'grand');
  if(p){
    row('Sudah Bayar (sebelumnya)',p.paidBefore);row('Bayar (pembayaran ini)',p.amount);
    if(p.depositUsed)row('Termasuk deposit',p.depositUsed);
    if(p.tenderKnown){row('Uang diterima',p.amountReceived);row('Kembali',p.changeAmount || 0);}
    if(p.depositAmount)row('Disimpan ke deposit',p.depositAmount);
  }
  rows.push({label:'Metode',value:p?.method || '—',style:'normal'});
  row(v.historical?'Total dibayar saat transaksi':'Total dibayar',v.paid);
  if(v.historical||!v.isCancelled)row(v.historical?'Sisa saat transaksi':'Sisa Tagihan',v.balance);
  const messages=[];
  if(v.isCancelled)messages.push('Tagihan dibatalkan; penyelesaian dana mengikuti bukti refund / deposit.');
  if(!p&&v.total===0&&v.settled&&v.discount)messages.push('Lunas melalui diskon penuh. Tidak ada uang masuk.');
  if(p?.note)messages.push('Catatan pembayaran: '+p.note);
  if(p?.reconstructed)messages.push('Saldo direkonstruksi dari riwayat pembayaran yang tersedia.');
  return {...base,shopName:'Manna Print',shopAddress:'Jl. Mangga Golek, Labuan Bajo | WA: 082247299578',
    warning:v.isCancelled?'PESANAN DIBATALKAN':v.draft?'DRAFT · BELUM DIKONFIRMASI':'',rows,messages,
    status:v.status,sequence:p?.sequence || null,cashier:v.cashier,
    reference:kind==='payment'?`BUKTI PEMBAYARAN${v.settled?' / PELUNASAN':''} · ${p.id}${v.isCancelled?' · Riwayat sebelum pembatalan':''}`:'',
    footer:'Harap bawa nota ini saat pengambilan barang.\nRetur barang defect mengikuti ketentuan toko.',slogan:'Print apa saja, di Manna aja!'};
}
