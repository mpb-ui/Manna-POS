import { holdLabel } from "./hold-label.js";
import { witaDay } from "./order-rules.js";
import { projectDeadlineInfo } from "./project-deadline.js";

export const briefingProfileOptions = [["auto","Otomatis sesuai role"],["cashier","CS / Kasir"],["design","Operator Design"],["print","Operator Cetak"],["finishing","Tim Finishing"],["all","Seluruh outstanding"],["none","Tanpa briefing otomatis"]];

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
  function since(value) {
    const days = Math.max(0, Math.round((Date.parse(witaDay()) - Date.parse(witaDay(value)))/86400000));
    return days === 0 ? "sejak hari ini" : days === 1 ? "sejak kemarin" : `sejak ${days} hari lalu`;
  }
  function briefingRow(order, payment) {
    const item = payment ? order.paymentItem : order.jobs.find(job => job.itemId === order.workItemId);
    const other = payment ? item?.otherItems || 0 : Math.max(0, order.jobs.length - 1);
    const product = item ? `${item.productName} · ${item.quantityLabel}${other ? ` · +${other} item` : ""}` : order.summary || "Pesanan";
    let meta;
    if (payment) {
      meta = `<span class="assist-brief-attention">Belum Lunas · Sisa ${h(money(order.outstanding))}</span>`;
    } else {
      const deadline = projectDeadlineInfo(order);
      const status = c.state.statusLabels[order.status] || order.status;
      const hold = order.hold ? ` (${holdLabel(order.hold.reason) === "Menunggu ACC" ? "Menunggu ACC" : "Tertahan"})` : "";
      const label = deadline.state === "late" && !deadline.overdueDays ? `Terlambat hari ini, ${deadline.label.split(", ").at(-1)}` : deadline.label;
      meta = `${h(status + hold)} · ${h(order.pic === "Belum ada PIC" ? order.pic : `PIC: ${order.pic}`)}${deadline.state === "none" ? "" : ` · <span class="${deadline.state === "late" ? "assist-brief-attention" : ""}">${h(label)}</span>`}`;
    }
    return `<article class="assist-brief-order"><div class="assist-brief-copy"><strong class="assist-brief-customer">${h(order.customerName)}</strong><p class="assist-brief-product" title="${h(product)}">${h(product)}</p><p class="assist-brief-meta">${meta}</p></div><button type="button" class="secondary" data-brief-order="${h(order.id)}">${payment ? "Cek pembayaran" : "Cek pesanan"}</button></article>`;
  }

  function mountBriefing(m, data) {
    const previewLimit = 3, panel = m.element.querySelector(".assist-brief-list");
    const more = m.element.querySelector("[data-brief-more]");
    const work = data.orders.filter(order => order.workItemId);
    const payments = data.canSeePayments ? data.orders.filter(order => order.outstanding > 0).sort((a,b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0)) : [];
    const tabs = [...m.element.querySelectorAll("[data-brief-tab]")];
    const groups = { work, payments }, expanded = { work: false, payments: false };
    let selected = data.canSeePayments && (c.state.currentUser.role === "CASHIER" || data.profile === "cashier" || payments.length && !work.some(order => order.priority < 2)) ? "payments" : "work";
    const total = payments.reduce((sum, order) => sum + order.outstanding, 0);
    for (const tab of tabs) tab.querySelector("span").textContent = groups[tab.dataset.briefTab].length;

    function render() {
      const payment = selected === "payments", rows = groups[selected], all = expanded[selected];
      const note = payment ? `Total sisa tagihan: ${money(total)}` : rows[0]?.priority === 0 ? "Mulai dari pesanan yang sudah terlambat." : rows[0]?.priority === 1 ? "Utamakan pesanan dengan deadline hari ini." : "Pekerjaan yang masih berjalan.";
      for (const tab of tabs) {
        const active = tab.dataset.briefTab === selected;
        tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
        if (active) panel.setAttribute("aria-labelledby", tab.id);
      }
      panel.innerHTML = rows.length ? `<p class="assist-brief-note">${h(note)}</p>${rows.slice(0, all ? rows.length : previewLimit).map(order => briefingRow(order,payment)).join("")}` : `<div class="assist-empty">${payment ? "Tidak ada tagihan yang belum lunas." : "Tidak ada pekerjaan yang perlu dicek."}</div>`;
      more.hidden = rows.length <= previewLimit;
      more.setAttribute("aria-expanded", String(all));
      more.textContent = all ? "Tampilkan ringkasan" : `Lihat semua (${rows.length})`;
    }
    function select(tab) { selected = tab.dataset.briefTab; render(); panel.scrollTop = 0; }
    tabs.forEach((tab,index) => {
      tab.onclick = () => select(tab);
      tab.onkeydown = event => {
        const next = event.key === "ArrowLeft" ? tabs.at(index - 1) : event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : null;
        if (next) { event.preventDefault(); select(next); next.focus(); }
      };
    });
    more.onclick = () => {
      expanded[selected] = !expanded[selected]; render();
      if (expanded[selected]) panel.querySelectorAll("[data-brief-order]")[previewLimit]?.focus();
      else panel.scrollTop = 0;
    };
    panel.onclick = async event => {
      const button = event.target.closest("[data-brief-order]");
      if (!button) return;
      const order = groups[selected].find(row => row.id === button.dataset.briefOrder);
      if (!order) return;
      const uid = identity(), payment = selected === "payments";
      m.close();
      try { await c.openOrder(order.id, { payment, itemId: payment ? null : order.workItemId }); }
      catch (error) { if (uid === identity()) c.toast(error.message,"error"); }
    };
    m.element.querySelector("[data-brief-close]").onclick = m.close;
    render();
  }
  async function showBriefing(manual = true) {
    const uid = identity(), version = epoch;
    if (!uid || briefingLoading || dialogs.size || !manual && (c.dialog.open || !c.canAuto())) return;
    briefingLoading = true;
    try {
      const data = await c.api(manual ? "/api/briefing" : "/api/briefing/open", manual ? {} : { method:"POST", body:"{}" });
      if (uid !== identity() || version !== epoch || dialogs.size || !manual && (c.dialog.open || !c.canAuto() || !data.show)) return;
      const markRead = () => c.api("/api/briefing/read",{method:"POST",body:JSON.stringify({date:data.date})}).catch(error => { if (uid === identity()) c.toast(error.message,"error"); });
      const dayLabel = new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Makassar",day:"numeric",month:"long",year:"numeric"}).format(new Date(`${data.date}T00:00:00+08:00`));
      const tabs = data.canSeePayments ? `<div class="assist-brief-tabs" role="tablist" aria-label="Jenis prioritas"><button type="button" role="tab" id="briefing-work-tab" data-brief-tab="work" aria-controls="briefing-list">Pekerjaan <span></span></button><button type="button" role="tab" id="briefing-payments-tab" data-brief-tab="payments" aria-controls="briefing-list">Pembayaran <span></span></button></div>` : "";
      const m = modal("Prioritas hari ini", `<p class="assist-brief-date">${h(dayLabel)} · WITA</p>${tabs}<div id="briefing-list" class="assist-brief-list" ${tabs ? 'role="tabpanel"' : 'aria-label="Pekerjaan"'} tabindex="0"></div><div class="assist-modal-actions"><button type="button" class="assist-text-button" data-brief-more aria-controls="briefing-list" hidden></button><button type="button" class="secondary" data-brief-close>Tutup</button></div>`,markRead);
      m.element.classList.add("briefing-dialog");
      m.element.querySelector("h2").id = "briefing-title";
      m.element.setAttribute("aria-labelledby", "briefing-title");
      mountBriefing(m,data);
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
    return stock.rows.length ? `<div class="assist-stock-table"><table><thead><tr><th>Bahan</th><th>Fisik</th><th>Alokasi lain</th><th>Tersedia</th><th>Kebutuhan</th><th>Kurang</th></tr></thead><tbody>${stock.rows.map(row=>`<tr><td><strong>${h(row.name)}</strong><small>${h(row.unit)}</small></td><td>${row.physical==null?'—':qty(row.physical)}</td><td>${qty(row.reserved)}</td><td>${row.available==null?'—':qty(row.available)}</td><td>${qty(row.required)}</td><td class="${row.untracked||row.shortage>0?'assist-balance':''}">${row.untracked?'Belum terhubung':qty(row.shortage)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="assist-muted">${stock.committed?'Stok pesanan sudah diproses saat masuk Proses Cetak.':'Produk ini belum memiliki kebutuhan bahan yang terhubung.'}</p>`;
  }
  function showStock(stock) { modal("Kesiapan bahan pesanan",`${stockTable(stock)}<p class="assist-stock-note">Alokasi berasal dari pesanan aktif yang sudah dikonfirmasi pembayarannya. Bahan Per Satuan berkurang saat produk masuk Proses Cetak. Pengeluaran roll dicatat manual.</p>`); }
  function stockAlert(stock) { const count=stock.shortages.length;return count ? `<div class="assist-inline-alert"><div><strong>${stock.shortages.every(s=>s.untracked)?'Kebutuhan bahan perlu diperiksa':'Bahan tersedia belum cukup untuk pesanan ini'}</strong><small>${count} bahan perlu perhatian</small></div><button type="button" class="assist-text-button" data-stock>Cek Bahan</button></div>`:""; }

  function mountCheckout(cachedCheck = null) {
    const form = document.querySelector("#checkout"); if(!form)return;
    const uid=identity(), version=epoch;
    let stockVersion=0;
    const assistance=document.createElement("div");assistance.className="assist-checkout";
    assistance.innerHTML='<div data-stock-warning></div>';
    (form.querySelector(".checkout-footer") || form.querySelector(".checkout-actions")).before(assistance);
    function valid(){return form.isConnected&&uid===identity()&&version===epoch;}
    if(c.state.cart.length&&can('pos.create')){
      const request=++stockVersion;
      (cachedCheck ? Promise.resolve(cachedCheck) : c.api('/api/orders/check',{method:'POST',body:JSON.stringify({items:c.state.cart,editingOrderId:c.state.editingOrderId})})).then(data=>{
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
    const m=modal(current?'Ubah Penanda Tertahan':'Tandai Pesanan Tertahan',`<form class="assist-hold-form"><label class="field"><span>Alasan *</span><select name="reason">${['Menunggu approval customer','Menunggu file customer','Bahan belum tersedia','Menunggu pembayaran','Kendala mesin','Alasan lainnya'].map(reason=>`<option value="${h(reason)}" ${current?.reason===reason?'selected':''}>${h(holdLabel(reason))}</option>`).join('')}</select></label><label class="field"><span>Catatan</span><textarea name="note" maxlength="1000" rows="3">${h(current?.note||'')}</textarea></label><p class="assist-stock-note">Status produksi tetap ${h(c.state.statusLabels[order.status])}. Alasan dan waktu perubahan masuk riwayat pesanan.</p><div class="assist-modal-actions"><button class="secondary" type="button" data-cancel>Batal</button><button class="primary" type="submit">Simpan Penanda</button></div></form>`);
    m.element.querySelector('[data-cancel]').onclick=m.close;
    m.element.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;try{const data=await c.api(`/api/orders/${order.id}/hold`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});m.close();onChanged(data);c.toast('Penanda tertahan disimpan di riwayat.');}catch(error){c.toast(error.message,'error');button.disabled=false;}};
  }
  async function mountOrder(order,element){
    const uid=identity(),version=epoch;if(!element)return;
    const editable=['projects.assign','projects.status','pos.edit'].some(can);
    const live=()=>element.isConnected&&uid===identity()&&version===epoch;
    const update=async(path,body)=>{const data=await c.api(`/api/orders/${order.id}/${path}`,{method:'PATCH',body:JSON.stringify(body)});if(live())paint(data);return data;};
    function paint(data){
      const holdChanged = JSON.stringify(order.hold || null) !== JSON.stringify(data.hold || null);
      order.hold=data.hold;order.fileReadiness=data.fileReadiness;
      element.innerHTML=`${data.hold?`<div class="assist-inline-alert assist-hold"><div><strong>Ⅱ ${h(holdLabel(data.hold.reason))} ${h(since(data.hold.since))}</strong><small>${h(data.hold.note||'')} · ${h(data.hold.actor)} · ${h(stamp(data.hold.since))}</small></div>${editable?'<button class="assist-text-button" type="button" data-release>Lepaskan Penanda</button>':''}</div>`:''}<div class="assist-order-tools">${['DESAIN','CETAK','FINISHING'].includes(order.status)&&editable?`<button type="button" class="secondary" data-hold>Ⅱ ${data.hold?'Ubah Penanda':'Tandai Tertahan'}</button>`:''}</div>${stockAlert(data.stock)}`;
      if (holdChanged) c.refreshProjects();
      element.querySelector('[data-stock]')?.addEventListener('click',()=>showStock(data.stock));
      element.querySelector('[data-hold]')?.addEventListener('click',()=>holdDialog(order,data.hold,result=>{if(live())paint(result);}));
      element.querySelector('[data-release]')?.addEventListener('click',async()=>{if(!await confirm('Lepaskan penanda tertahan?','Pastikan kendala pesanan sudah selesai.','Ya, Lepaskan Penanda'))return;try{await update('hold',{release:true});c.toast('Penanda tertahan dilepas.');}catch(error){c.toast(error.message,'error');}});

      const timeline=c.dialog.querySelector('.timeline');if(timeline&&data.timeline)timeline.innerHTML=data.timeline.map(item=>`<div class="timeline-item"><p>${h(item.message)}</p><small>${h(item.actor)} · ${h(stamp(item.createdAt))}</small></div>`).join('');
    }
    element.innerHTML='<p class="assist-muted">Memuat kesiapan pesanan…</p>';
    try{const data=await c.api(`/api/orders/${order.id}/assistance`);if(live())paint(data);}catch(error){if(live())element.innerHTML=`<p class="assist-muted">${h(error.message)}</p>`;}
  }
  async function checkBeforeAdvance(id){
    try{
      const data=await c.api(`/api/orders/${id}/assistance`);
      if(data.hold){c.toast('Pesanan masih tertahan: '+holdLabel(data.hold.reason)+'. Lepaskan penanda setelah kendala selesai.','error');return {allow:false};}
      return {allow:true,outstanding:data.outstanding};
    }catch(error){c.toast(error.message,'error');return {allow:false};}
  }
  return {onLoad,resetSession,mountCheckout,mountOrder,checkBeforeAdvance,showBriefing};
}
