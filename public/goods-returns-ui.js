let currentDialog;
export function closeGoodsReturns() { currentDialog?.close(); currentDialog?.remove(); currentDialog = null; }
const dateLabel = value => new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Makassar'}).format(new Date(value))+' WITA';
export async function mountGoodsReturnHistory({ scope, order, api, escapeHtml:e, valid }) {
  if (!order.items.some(item => item.stockTiming === 'SALE')) return;
  let page=1;
  const section=document.createElement('section');section.className='goods-return-history';
  const draw=async()=>{
    const data=await api(`/api/orders/${order.id}/returns?page=${page}`);
    if(!valid()||!scope.isConnected)return;
    if(!data.total){section.remove();return;}
    if(!section.isConnected)scope.querySelector('.detail-body').append(section);
    section.innerHTML=`<h3>Riwayat Retur Barang</h3>${data.records.map(record=>`<article><strong>${e(record.code)}</strong><small>${e(dateLabel(record.createdAt))} · ${e(record.actor)}</small>${record.lines.map(line=>`<p>${line.quantity} ${e(line.unitName)} ${e(line.productName)} · ${e(line.sku)}<small>Sumber: ${e(line.sourceCode)}</small></p>`).join('')}<p>${e(record.note)}</p><small>Barang defect diterima; pengganti SKU yang sama diserahkan tanpa pembayaran tambahan.</small></article>`).join('')}<div class="goods-return-pages"><button type="button" class="secondary" data-prev ${page<=1?'disabled':''}>Sebelumnya</button><span>${page}/${data.pages}</span><button type="button" class="secondary" data-next ${page>=data.pages?'disabled':''}>Berikutnya</button></div>`;
    const navigate=async delta=>{page+=delta;try{await draw();}catch(error){page-=delta;if(valid()&&scope.isConnected){let alert=section.querySelector('[role=alert]');if(!alert){alert=document.createElement('p');alert.setAttribute('role','alert');section.append(alert);}alert.textContent=error.message;}}};
    section.querySelector('[data-prev]').onclick=()=>navigate(-1);section.querySelector('[data-next]').onclick=()=>navigate(1);
  };
  await draw();
}
export async function openGoodsReturn({ order, api, escapeHtml:e, valid, onSaved, toast }) {
  closeGoodsReturns();
  const d=document.createElement('dialog');currentDialog=d;d.className='goods-return-dialog';
  d.innerHTML=`<div class="detail-head"><div><h2>Retur Barang</h2><p>${e(order.code)} · ${e(order.customerName)}</p></div><button type="button" class="detail-close" aria-label="Tutup retur">×</button></div><div class="goods-return-body"><p>Memuat barang yang dapat ditukar…</p></div>`;
  document.body.append(d);let busy=false;
  const close=()=>{if(busy)return;d.close();};d.querySelector('.detail-close').onclick=close;
  d.oncancel=event=>{if(busy)event.preventDefault();};d.onclose=()=>{d.remove();if(currentDialog===d)currentDialog=null;};d.showModal();
  try {
    const data=await api(`/api/orders/${order.id}/returns`);
    if(!valid()||!d.open){d.close();return;}
    const requestId=crypto.randomUUID(),options=data.options;
    d.querySelector('.goods-return-body').innerHTML=`<p class="goods-return-intro">Tukar barang defect dengan SKU yang sama. Barang rusak dicatat terpisah dari stok layak jual.</p><form id="goods-return-form"><fieldset><legend>Pilih barang dan jumlah</legend><div class="goods-return-options">${options.map((option,index)=>`<div class="goods-return-option"><label><input type="checkbox" data-return-select="${index}" ${option.maxQuantity<=0?'disabled':''}><span><strong>${e(option.productName)}</strong><small>${e(option.specification)} · ${e(option.sku)}</small><small>${e(option.sourceCode)} · Sisa dapat ditukar ${option.remaining} ${e(option.unitName)}</small><small>${option.stockError?e(option.stockError):`Stok pengganti tersedia ${option.stockQuantity} ${e(option.unitName)}`}</small></span></label><label class="field return-quantity"><span>Jumlah</span><input type="number" min="1" max="${option.maxQuantity}" step="1" value="1" data-return-quantity="${index}" aria-label="Jumlah retur ${e(option.productName)} dari ${e(option.sourceCode)}" disabled></label></div>`).join('')||'<p>Belum ada barang dagangan yang sudah diserahkan dan memenuhi syarat penukaran.</p>'}</div><label class="field"><span>Alasan</span><input value="Rusak / defect" readonly></label><label class="field"><span>Catatan kerusakan *</span><textarea name="note" required maxlength="1000" placeholder="Contoh: tinta bolpen macet" rows="3"></textarea></label><div class="goods-return-summary" aria-live="polite"><strong data-return-summary>Pilih barang yang akan ditukar</strong><span>Tambahan pembayaran: Rp 0</span><small>Stok layak jual berkurang untuk barang pengganti. Omzet, uang masuk, dan tagihan tetap.</small></div><label class="goods-return-confirm"><input type="checkbox" name="physicalConfirmed" required><span>Barang defect sudah diterima dan barang pengganti sudah diserahkan.</span></label></fieldset><p class="goods-return-error" role="alert"></p><div class="goods-return-actions"><button type="button" class="secondary" data-cancel-retur>Batal</button><button type="submit" class="primary" disabled>Konfirmasi Retur Barang</button></div></form>`;
    const form=d.querySelector('form'),button=form.querySelector('[type=submit]'),summary=form.querySelector('[data-return-summary]'),error=form.querySelector('.goods-return-error');
    const selections=()=>[...form.querySelectorAll('[data-return-select]:checked')].map(input=>{const option=options[Number(input.dataset.returnSelect)];return {itemId:option.itemId,parentLineId:option.parentLineId,quantity:Number(form.querySelector(`[data-return-quantity="${input.dataset.returnSelect}"]`).value)};});
    const update=()=>{for(const input of form.querySelectorAll('[data-return-select]'))form.querySelector(`[data-return-quantity="${input.dataset.returnSelect}"]`).disabled=!input.checked;const lines=selections(),quantity=lines.reduce((sum,line)=>sum+line.quantity,0);button.disabled=busy||!lines.length;summary.textContent=lines.length?`Barang defect diterima dan pengganti diserahkan: ${quantity} barang`:'Pilih barang yang akan ditukar';};
    form.addEventListener('input',update);form.addEventListener('change',update);form.querySelector('[data-cancel-retur]').onclick=close;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!form.reportValidity())return;
      const lines=selections();if(!lines.length)return;
      busy=true;button.disabled=true;form.querySelector('fieldset').disabled=true;error.textContent='';
      try {
        const record=await api(`/api/orders/${order.id}/returns`,{method:'POST',body:JSON.stringify({requestId,reason:'DEFECT',note:form.elements.note.value.trim(),lines,defectReceived:true,replacementDelivered:true})});
        busy=false;d.close();
        if(valid())await onSaved(record);
      } catch(cause) {if(d.isConnected&&valid())error.textContent=cause.message;}
      finally {busy=false;if(form.isConnected){form.querySelector('fieldset').disabled=false;update();}}
    };
  } catch(error) {if(d.isConnected&&valid()){d.querySelector('.goods-return-body').textContent=error.message;toast(error.message,'error');}}
}
export function goodsReturnReportHtml(report,e,money) {
  const data=report.goodsReturns||{rows:[],quantity:0,transactions:0};
  return `<section class="panel report-ranking"><div class="panel-head"><h2>Retur Barang · Penukaran Defect</h2><span>${data.transactions} retur · ${data.quantity} barang pengganti</span></div><p class="goods-return-report-note">Dicatat berdasarkan tanggal penukaran. Omzet dan uang masuk tambahan Rp 0.${report.capabilities.cost?` Biaya barang pengganti ${money(data.cost||0)} diperhitungkan pada laba estimasi periode ini.`:''}</p><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Retur / Invoice</th><th>Barang</th><th>Jumlah</th><th>Mutasi stok layak jual</th><th>Catatan / Petugas</th>${report.capabilities.cost?'<th>Biaya pengganti</th>':''}</tr></thead><tbody>${data.rows.map(row=>`<tr><td>${e(dateLabel(row.date))}</td><td><strong>${e(row.code)}</strong><small>${e(row.invoice)}</small><small>${e(row.customer)}</small></td><td><strong>${e(row.product)}</strong><small>${e(row.sku)}</small><small>Sumber: ${e(row.sourceCode)}</small></td><td>${row.quantity} ${e(row.unitName)}</td><td>−${row.quantity} ${e(row.unitName)}</td><td>${e(row.note)}<small>${e(row.actor)}</small></td>${report.capabilities.cost?`<td>${money(row.cost)}</td>`:''}</tr>`).join('')||'<tr><td colspan="7">Belum ada retur pada periode ini.</td></tr>'}</tbody></table></div></section>`;
}
