const escape=value=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money=n=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n || 0));
const row=(label,value)=>`<div class="print-total"><span>${label}</span><b>${money(value)}</b></div>`;
export const depositKindLabel=kind=>({EXCESS:'Kelebihan pembayaran',USE:'Pembayaran dengan deposit',OPENING:'Saldo awal terverifikasi',CORRECTION:'Koreksi saldo',REFUND:'Pengembalian deposit',PAYMENT_REVERSAL:'Pengembalian pembayaran deposit',CANCEL_CREDIT:'Pembatalan menjadi deposit'}[kind] || kind);
export function cashReceiptHtml(r) {
 return `<div class="print-brand">MANNA PRINT</div><div class="print-subtitle">${r.kind==='REFUND'?'BUKTI PENGEMBALIAN UANG':'BUKTI PENERIMAAN UANG'}</div><hr><p>Referensi: ${escape(r.id)}<br>Nota: ${escape(r.orderCode || '—')}<br>Pelanggan: ${escape(r.customerName)}<br>WhatsApp: ${escape(r.phone)}<br>${escape(new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'}).format(new Date(r.createdAt)))} WITA<br>Metode: ${escape(r.method)}<br>Petugas: ${escape(r.actor)}</p><hr>${row(r.kind==='REFUND'?'Uang dikembalikan':'Uang diterima',r.kind==='REFUND'?-r.amount:r.amountReceived ?? r.amount)}${r.kind==='REFUND'?'':row('Pembayaran nota',r.allocatedAmount)+row('Masuk deposit',r.depositAmount)+row('Kembalian tunai',r.changeAmount)}${r.depositBalanceAfter!=null?row('Saldo deposit setelah transaksi',r.depositBalanceAfter):''}${r.reference?`<p>Referensi bank: ${escape(r.reference)}</p>`:''}${r.note?`<p>Catatan: ${escape(r.note)}</p>`:''}<hr><p>Manna Print · Labuan Bajo</p>`;
}
export function depositMovementHtml(customer,m) {
 return `<div class="print-brand">MANNA PRINT</div><div class="print-subtitle">BUKTI MUTASI DEPOSIT</div><hr><p>${escape(m.customerName || customer.name)} · ${escape(m.phone || customer.phone)}<br>Referensi: ${escape(m.id)}<br>${escape(new Date(m.createdAt).toLocaleString('id-ID',{timeZone:'Asia/Makassar'}))} WITA<br>${escape(depositKindLabel(m.kind))}<br>Nota: ${escape(m.orderCode || '—')}<br>Petugas: ${escape(m.actor)}</p>${row('Saldo sebelumnya',m.balanceBefore)}${row('Mutasi',m.amount)}${row('Saldo setelah transaksi',m.balanceAfter)}<p>${escape(m.note || '')}</p><hr><p>Manna Print · Labuan Bajo</p>`;
}
export function depositInvoiceLines(order) {
 const used=(order.payments || []).filter(p=>p.type==='DEPOSIT'||p.type==='REVERSAL'&&p.method==='DEPOSIT').reduce((n,p)=>n+p.amount,0);
 return used?row('Pembayaran deposit',used):'';
}
