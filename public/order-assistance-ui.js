import { completeness, needsFile, witaDay } from "./order-rules.js";

export const briefingProfileOptions = [["auto","Otomatis sesuai role"],["cashier","CS / Kasir"],["design","Operator Design"],["print","Operator Cetak"],["finishing","Tim Finishing"],["all","Seluruh outstanding"],["none","Tanpa briefing otomatis"]];
const fileNames = { UNCONFIRMED: "Belum dikonfirmasi", MISSING: "Belum ada file", RECEIVED: "Sudah diterima", READY: "Siap cetak" };

export function createOrderAssistance(c) {
  const h = c.escapeHtml, money = n => c.rupiah.format(Number(n || 0));
  const stamp = value => value ? c.dateFormat.format(new Date(value)) + " WITA" : "Belum ditentukan";
  const qty = n => Number(n).toLocaleString("id-ID", { maximumFractionDigits:4 });
  const can = permission => c.state.permissions.includes(permission);
  const identity = () => c.state.currentUser?.id;
  let epoch = 0, checkedAuto = new Set(), briefingLoading = false;
  const dialogs = new Set();
  function modal(title, content, onClose) {
    const uid = identity(), element = document.createElement("dialog");
    element.className = "assistance-dialog";
    element.innerHTML = `<div class="assist-modal-head"><h2>${h(title)}</h2><button type="button" class="assist-close" aria-label="Tutup">×</button></div><div class="assist-modal-body">${content}</div>`;
    document.body.append(element); dialogs.add(element);
    let ended = false;
    const close = () => { if (ended) return; ended = true; element.close(); element.remove(); dialogs.delete(element); if (uid === identity()) onClose?.(); };
    element.querySelector(".assist-close").onclick = close;
    element.addEventListener("cancel", event => { event.preventDefault(); close(); });
    element.addEventListener("close", close);
    element.showModal();
    return { element, close };
  }
  function confirm(title, text, accept = "Ya, Lanjutkan") {
    return new Promise(resolve => {
      let accepted = false;
      const m = modal(title, `<p>${h(text)}</p><div class="assist-modal-actions"><button class="secondary" type="button" data-cancel>Cek Kembali</button><button class="primary" type="button" data-accept>${h(accept)}</button></div>`, () => resolve(accepted));
      m.element.querySelector("[data-cancel]").onclick = m.close;
      m.element.querySelector("[data-accept]").onclick = () => { accepted = true; m.close(); };
      m.element.querySelector("[data-cancel]").focus();
    });
  }
  function greeting() {
    const hour = Number(new Intl.DateTimeFormat("en",{timeZone:"Asia/Makassar",hour:"numeric",hourCycle:"h23"}).format(new Date()));
    return hour < 11 ? "selamat pagi" : hour < 15 ? "selamat siang" : hour < 18 ? "selamat sore" : "selamat malam";
  }
  function since(value) {
    const days = Math.max(0, Math.round((Date.parse(witaDay()) - Date.parse(witaDay(value)))/86400000));
    return days === 0 ? "sejak hari ini" : days === 1 ? "sejak kemarin" : `sejak ${days} hari lalu`;
  }
  function briefingRow(order) {
    const priority = order.priority === 0 ? "late" : order.priority === 1 ? "today" : "";
    return `<article class="assist-job"><div class="assist-job-info"><div class="assist-job-heading"><strong title="${h(order.customerName)}">${h(order.customerName)}</strong><span class="assist-invoice">${h(order.code)}</span></div><p class="assist-product-summary" title="${h(order.summary)}">${h(order.summary)}</p><div class="assist-job-meta"><span class="assist-chip blue">${h(c.state.statusLabels[order.status] || order.status)}</span><span title="PIC: ${h(order.pic)}">PIC: ${h(order.pic)}</span>${order.hold ? `<span class="assist-held-note" title="${h(order.hold.reason)} ${h(since(order.hold.since))}">Ⅱ ${h(order.hold.reason)} ${h(since(order.hold.since))}</span>` : ""}</div></div><div class="assist-job-action"><span class="assist-chip ${priority}">${order.priority===0?"Lewat · ":""}${h(order.deadline ? c.deadlineLabel(order) : "Tanpa deadline")}</span>${order.outstanding > 0 ? `<strong class="assist-balance">Sisa ${money(order.outstanding)}</strong>` : ""}<button type="button" class="secondary" data-brief-order="${h(order.id)}">Buka Pesanan ↗</button></div></article>`;
  }
  function bindRows(element, close) { element.querySelectorAll("[data-brief-order]").forEach(button => button.onclick = () => { close?.(); c.openOrder(button.dataset.briefOrder); }); }
  async function showBriefing(manual = true) {
    const uid = identity(), version = epoch;
    if (!uid || briefingLoading || dialogs.size || !manual && (c.dialog.open || !c.canAuto())) return;
    briefingLoading = true;
    try {
      const data = await c.api(manual ? "/api/briefing" : "/api/briefing/open", manual ? {} : { method:"POST", body:"{}" });
      if (uid !== identity() || version !== epoch || dialogs.size || !manual && (c.dialog.open || !c.canAuto() || !data.show)) return;
      const markRead = () => c.api("/api/briefing/read",{method:"POST",body:JSON.stringify({date:data.date})}).catch(error => { if (uid === identity()) c.toast(error.message,"error"); });
      const dayLabel = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Makassar",day:"numeric",month:"long",year:"numeric"}).format(new Date(`${data.date}T00:00:00+08:00`));
      const m = modal(`Halo, ${data.userName}, ${greeting()} 👋`, `<p class="assist-brief-intro">Berikut pekerjaan yang perlu dicek hari ini.</p><div class="assist-brief-sub"><span>Pekerjaan yang perlu dicek <strong>· ${data.count}</strong></span>${data.overdueCount ? `<span class="assist-chip late">${data.overdueCount} lewat deadline</span>` : ""}</div><div class="assist-brief-list" aria-label="Pekerjaan yang perlu dicek" tabindex="0">${data.count ? data.orders.map(briefingRow).join("") : '<div class="assist-empty">Semua pekerjaan outstanding sudah ditangani.</div>'}</div><div class="assist-modal-actions"><span class="assist-brief-date">${h(dayLabel)} · WITA</span><button type="button" class="primary" data-read>✓ Sudah Dibaca</button></div>`,markRead);
      m.element.classList.add("briefing-dialog");
      bindRows(m.element,m.close);
      m.element.querySelector("[data-read]").onclick = m.close;
    } catch (error) { if (manual && uid===identity()) c.toast(error.message,"error"); }
    finally { if (version === epoch) briefingLoading = false; }
  }
  function updateFloatingButton() {
    const button = document.querySelector("#briefing-fab");
    const available = can("projects.orders") || can("projects.waiting");
    button.classList.toggle("hidden", !identity() || !available);
    button.onclick = () => showBriefing(true);
  }
  function onLoad() {
    updateFloatingButton(); const key = `${identity()}:${witaDay()}`;
    if (identity() && !checkedAuto.has(key) && !c.dialog.open && !dialogs.size && c.canAuto()) { checkedAuto.add(key); showBriefing(false); }
  }
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible" && identity()) onLoad(); });
  setInterval(() => { if (document.visibilityState === "visible" && identity()) onLoad(); },60000);
  function resetSession() { epoch++; briefingLoading = false; checkedAuto = new Set(); document.querySelector("#briefing-fab").classList.add("hidden"); for(const element of dialogs){element.close();element.remove();}dialogs.clear(); }

  function stockTable(stock) {
    return stock.rows.length ? `<div class="assist-stock-table"><table><thead><tr><th>Bahan</th><th>Fisik</th><th>Alokasi lain</th><th>Tersedia</th><th>Kebutuhan</th><th>Kurang</th></tr></thead><tbody>${stock.rows.map(row=>`<tr><td><strong>${h(row.name)}</strong><small>${h(row.unit)}</small></td><td>${row.physical==null?'—':qty(row.physical)}</td><td>${qty(row.reserved)}</td><td>${row.available==null?'—':qty(row.available)}</td><td>${qty(row.required)}</td><td class="${row.untracked||row.shortage>0?'assist-balance':''}">${row.untracked?'Belum terhubung':qty(row.shortage)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="assist-muted">${stock.committed?'Stok pesanan sudah diproses saat Selesai.':'Produk ini belum memiliki kebutuhan bahan yang terhubung.'}</p>`;
  }
  function showStock(stock) { modal("Kesiapan bahan pesanan",`${stockTable(stock)}<p class="assist-stock-note">Alokasi berasal dari pesanan aktif yang sudah dikonfirmasi pembayarannya. Stok fisik tetap berkurang saat pesanan Selesai.</p>`); }
  function stockAlert(stock) { const count=stock.shortages.length;return count ? `<div class="assist-inline-alert"><div><strong>${stock.shortages.every(s=>s.untracked)?'Kebutuhan bahan perlu diperiksa':'Bahan tersedia belum cukup untuk pesanan ini'}</strong><small>${count} bahan perlu perhatian</small></div><button type="button" class="assist-text-button" data-stock>Cek Bahan</button></div>`:""; }

  function mountCheckout() {
    const form = document.querySelector("#checkout"); if(!form)return;
    const uid=identity(), version=epoch;
    let lookupTimer, lookupVersion=0, stockVersion=0;
    const customerField=form.querySelector('[name="customerName"]');
    const names=[...new Set(c.state.orders.filter(o=>o.confirmed||o.paymentConfirmed).map(o=>o.customerName))];
    const list=document.createElement("datalist");list.id="assist-customers";list.innerHTML=names.map(name=>`<option value="${h(name)}"></option>`).join("");form.append(list);customerField.setAttribute("list",list.id);
    const repeat=document.createElement("div");repeat.className="assist-repeat hidden";customerField.closest("label").after(repeat);
    const production=c.state.cart.some(item=>needsFile(item,c.state.products.find(p=>p.id===item.productId)));
    const assistance=document.createElement("div");assistance.className="assist-checkout";
    assistance.innerHTML=`${production?`<label class="field"><span>Kesiapan file</span><select name="fileReadiness">${Object.entries(fileNames).map(([value,label])=>`<option value="${value}" ${c.state.draft.fileReadiness===value?'selected':''}>${label}</option>`).join("")}</select></label>`:""}<div data-completeness></div><div data-stock-warning></div>`;
    form.querySelector(".checkout-actions").before(assistance);
    function valid(){return form.isConnected&&uid===identity()&&version===epoch;}
    function drawIssues(){
      const issues=completeness({...c.state.draft,items:c.state.cart},c.state.products);
      assistance.querySelector('[data-completeness]').innerHTML=c.state.cart.length?`<details class="assist-completeness"><summary>Kelengkapan <span class="assist-chip ${issues.length?'held':'blue'}">${issues.length?`${issues.length} perlu dicek`:'Lengkap'}</span></summary><ul>${issues.map(issue=>`<li>${h(issue.label)}</li>`).join('')||'<li>Detail pesanan sudah lengkap.</li>'}</ul></details>`:'';
    }
    const lookup=async()=>{
      const request=++lookupVersion;
      const name=form.elements.customerName.value.trim(),phone=form.elements.phone.value;
      if(!name){repeat.classList.add('hidden');return;}
      try{
        const result=await c.api(`/api/repeat-order?${new URLSearchParams({customerName:name,phone})}`);
        if(!valid()||request!==lookupVersion)return;
        repeat.classList.toggle('hidden',!result.order&&!result.ambiguous);
        if(result.ambiguous){repeat.innerHTML='<small>Isi nomor WhatsApp untuk membedakan pelanggan dengan nama yang sama.</small>';return;}
        if(!result.order)return;
        repeat.innerHTML=`<div><strong>Pesanan terakhir</strong><p>${h(result.order.summary)}</p><small>${h(stamp(result.order.createdAt))} · ${h(result.order.code)}</small></div><button class="secondary" type="button">↶ Pesan Lagi</button>`;
        repeat.querySelector('button').onclick=()=>openRepeat(result.order.id);
      }catch{if(valid()&&request===lookupVersion)repeat.classList.add('hidden');}
    };
    form.addEventListener('input',event=>{drawIssues();if(['customerName','phone'].includes(event.target.name)){clearTimeout(lookupTimer);lookupTimer=setTimeout(lookup,250);}});
    form.addEventListener('change',event=>{if(event.target.name==='fileReadiness')c.state.draft.fileReadiness=event.target.value;drawIssues();});
    drawIssues(); if(form.elements.customerName.value.trim())lookup();
    if(c.state.cart.length&&can('pos.create')){
      const request=++stockVersion;
      c.api('/api/orders/check',{method:'POST',body:JSON.stringify({items:c.state.cart,editingOrderId:c.state.editingOrderId})}).then(data=>{
        if(!valid()||request!==stockVersion)return;
        const target=assistance.querySelector('[data-stock-warning]');target.innerHTML=stockAlert(data.stock);target.querySelector('[data-stock]')?.addEventListener('click',()=>showStock(data.stock));
      }).catch(()=>{});
    }
  }
  async function openRepeat(id){
    const uid=identity();
    try{
      const quote=await c.api(`/api/orders/${id}/repeat`,{method:'POST',body:'{}'});if(uid!==identity())return;
      const m=modal('Pesan Lagi',`<p class="assist-muted">Sumber: ${h(quote.code)}</p>${quote.canRepeat?`<div class="assist-repeat-items">${quote.items.map(item=>`<p><strong>${h(item.productName)}</strong><small>${h(item.displaySize)}</small></p>`).join('')}</div><div class="assist-repeat-total"><span>Harga katalog saat ini</span><strong>${money(quote.total)}</strong></div>${quote.previousTotal!=null&&quote.previousTotal!==quote.total?`<p class="assist-muted">Pesanan sebelumnya ${money(quote.previousTotal)}. Harga dan biaya mengikuti katalog saat ini.</p>`:''}${stockAlert(quote.stock)}<p class="assist-stock-note">Konfirmasi ulang file dan deadline. Pembayaran dan biaya design dari pesanan sebelumnya tidak disalin.</p>`:`<ul class="assist-issues">${quote.issues.map(issue=>`<li>${h(issue)}</li>`).join('')}</ul><p class="assist-stock-note">Pilih ulang item yang berubah melalui POS.</p>`}<div class="assist-modal-actions"><button class="secondary" type="button" data-cancel>Batal</button><button class="primary" type="button" data-use ${quote.canRepeat?'':'disabled'}>Gunakan Pesanan Ini</button></div>`);
      m.element.querySelector('[data-cancel]').onclick=m.close;
      m.element.querySelector('[data-stock]')?.addEventListener('click',()=>showStock(quote.stock));
      m.element.querySelector('[data-use]').onclick=async()=>{
        if(c.state.cart.length&&!await confirm('Ganti isi pesanan?','Produk dalam pesanan yang sedang diisi akan diganti dengan repeat order.','Ya, Gunakan Repeat Order'))return;
        m.close();c.useRepeat(quote);c.toast('Repeat order disiapkan. Periksa file, deadline, dan harga terbaru.');
      };
    }catch(error){if(uid===identity())c.toast(error.message,'error');}
  }

  function holdDialog(order,current,onChanged){
    const m=modal(current?'Ubah Penanda Tertahan':'Tandai Pesanan Tertahan',`<form class="assist-hold-form"><label class="field"><span>Alasan *</span><select name="reason">${['Menunggu approval customer','Menunggu file customer','Bahan belum tersedia','Menunggu pembayaran','Kendala mesin','Alasan lainnya'].map(reason=>`<option ${current?.reason===reason?'selected':''}>${h(reason)}</option>`).join('')}</select></label><label class="field"><span>Catatan</span><textarea name="note" maxlength="1000" rows="3">${h(current?.note||'')}</textarea></label><p class="assist-stock-note">Status produksi tetap ${h(c.state.statusLabels[order.status])}. Alasan dan waktu perubahan masuk riwayat pesanan.</p><div class="assist-modal-actions"><button class="secondary" type="button" data-cancel>Batal</button><button class="primary" type="submit">Simpan Penanda</button></div></form>`);
    m.element.querySelector('[data-cancel]').onclick=m.close;
    m.element.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;try{const data=await c.api(`/api/orders/${order.id}/hold`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});m.close();onChanged(data);c.toast('Penanda tertahan disimpan di riwayat.');}catch(error){c.toast(error.message,'error');button.disabled=false;}};
  }
  async function mountOrder(order,element){
    const uid=identity(),version=epoch;if(!element)return;
    let latest, painted=false, expanded=new Set();
    const editable=['projects.assign','projects.status','pos.edit'].some(can);
    const live=()=>element.isConnected&&uid===identity()&&version===epoch;
    const update=async(path,body)=>{const data=await c.api(`/api/orders/${order.id}/${path}`,{method:'PATCH',body:JSON.stringify(body)});if(live())paint(data);return data;};
    function paint(data){
      latest=data;order.hold=data.hold;order.fileReadiness=data.fileReadiness;
      const open=expanded;expanded=new Set([...element.querySelectorAll('details[open]')].map(d=>d.dataset.assistExpand).filter(Boolean));if(!expanded.size)expanded=open;
      const missing=data.issues.length;
      element.innerHTML=`${data.hold?`<div class="assist-inline-alert assist-hold"><div><strong>Ⅱ ${h(data.hold.reason)} ${h(since(data.hold.since))}</strong><small>${h(data.hold.note||'')} · ${h(data.hold.actor)} · ${h(stamp(data.hold.since))}</small></div>${editable?'<button class="assist-text-button" type="button" data-release>Lepaskan Penanda</button>':''}</div>`:''}<div class="assist-order-tools">${['DESAIN','CETAK','FINISHING'].includes(order.status)&&editable?`<button type="button" class="secondary" data-hold>Ⅱ ${data.hold?'Ubah Penanda':'Tandai Tertahan'}</button>`:''}<details class="assist-completeness" data-assist-expand="completeness" ${expanded.has('completeness')?'open':''}><summary>Kelengkapan <span class="assist-chip ${missing?'held':'blue'}">${missing?missing+' perlu dicek':'Lengkap'}</span></summary><ul>${data.issues.map(issue=>`<li>${h(issue.label)}</li>`).join('')||'<li>Detail pesanan sudah lengkap.</li>'}</ul>${data.checklist.some(item=>item.steps.some(step=>step.key==='file'))?`<label class="field"><span>Kesiapan file</span><select data-file ${editable?'':'disabled'}>${Object.entries(fileNames).map(([value,label])=>`<option value="${value}" ${data.fileReadiness===value?'selected':''}>${label}</option>`).join('')}</select></label>`:''}</details></div>${stockAlert(data.stock)}${data.checklist.length?`<div class="assist-checklist"><h3>Checklist produksi per produk</h3>${data.checklist.map(item=>`<details data-assist-expand="item-${item.index}" ${expanded.has('item-'+item.index)||!painted&&order.status==='FINISHING'?'open':''}><summary><span>${h(item.productName)}</span><span class="assist-chip">${item.steps.filter(s=>s.done).length}/${item.steps.length}</span></summary><p class="assist-muted">${h(item.specification)}</p>${item.steps.map(step=>`<label class="assist-check"><input type="checkbox" data-check-index="${item.index}" data-check-key="${h(step.key)}" ${step.done?'checked':''} ${can('projects.status')?'':'disabled'}><span>${h(step.label)}${step.checkedAt?`<small>${h(step.actor)} · ${h(stamp(step.checkedAt))}</small>`:''}</span></label>`).join('')}</details>`).join('')}</div>`:''}`;
      painted=true;
      element.querySelector('[data-stock]')?.addEventListener('click',()=>showStock(data.stock));
      element.querySelector('[data-hold]')?.addEventListener('click',()=>holdDialog(order,data.hold,result=>{if(live())paint(result);}));
      element.querySelector('[data-release]')?.addEventListener('click',async()=>{if(!await confirm('Lepaskan penanda tertahan?','Pastikan kendala pesanan sudah selesai.','Ya, Lepaskan Penanda'))return;try{await update('hold',{release:true});c.toast('Penanda tertahan dilepas.');}catch(error){c.toast(error.message,'error');}});
      element.querySelector('[data-file]')?.addEventListener('change',async event=>{event.target.disabled=true;try{await update('file-readiness',{fileReadiness:event.target.value});c.toast('Kesiapan file diperbarui.');}catch(error){c.toast(error.message,'error');if(live())paint(data);}});
      element.querySelectorAll('[data-check-index]').forEach(input=>input.onchange=async()=>{input.disabled=true;try{await update('checklist',{index:Number(input.dataset.checkIndex),key:input.dataset.checkKey,done:input.checked});}catch(error){c.toast(error.message,'error');if(live())paint(data);}});
      const timeline=c.dialog.querySelector('.timeline');if(timeline&&data.timeline)timeline.innerHTML=data.timeline.map(item=>`<div class="timeline-item"><p>${h(item.message)}</p><small>${h(item.actor)} · ${h(stamp(item.createdAt))}</small></div>`).join('');
      element.querySelectorAll('details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)expanded.add(d.dataset.assistExpand);else expanded.delete(d.dataset.assistExpand);}));
    }
    element.innerHTML='<p class="assist-muted">Memuat kesiapan pesanan…</p>';
    try{const data=await c.api(`/api/orders/${order.id}/assistance`);if(live())paint(data);}catch(error){if(live())element.innerHTML=`<p class="assist-muted">${h(error.message)}</p>`;}
  }
  async function checkBeforeAdvance(id){
    try{
      const data=await c.api(`/api/orders/${id}/assistance`);
      if(data.hold){c.toast('Pesanan masih tertahan: '+data.hold.reason+'. Lepaskan penanda setelah kendala selesai.','error');return {allow:false};}
      if(data.pending.length){const accepted=await confirm('Checklist belum lengkap',`${data.pending.length} langkah belum diperiksa. Pastikan pekerjaan sudah sesuai pesanan sebelum melanjutkan.`);return {allow:accepted,confirmChecklist:accepted};}
      return {allow:true,confirmChecklist:false,outstanding:data.outstanding};
    }catch(error){c.toast(error.message,'error');return {allow:false};}
  }
  return {onLoad,resetSession,mountCheckout,mountOrder,checkBeforeAdvance,showBriefing};
}
