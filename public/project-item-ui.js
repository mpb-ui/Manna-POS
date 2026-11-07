import { bindBackdropClose } from './dialog-dismiss.js';
import { driveLink } from './project-item.js';
import { itemQuantityLabel } from './item-workflow.js';
import { holdLabel } from './hold-label.js';

export function closeProjectItems() { document.querySelectorAll('.project-item-dialog').forEach(dialog=>dialog.close()); }

export async function openProjectItem({orderId,itemId,api,toast,escapeHtml:h,currentUser,onChanged}) {
  if(document.querySelector('.project-item-dialog[open]'))return;
  const uid=currentUser()?.id, dialog=document.createElement('dialog');
  dialog.className='project-item-dialog';
  dialog.setAttribute('aria-label','Detail item produksi');
  dialog.innerHTML='<p class="project-item-loading">Memuat detail order…</p>';
  document.body.append(dialog);dialog.showModal();bindBackdropClose(dialog);
  const live=()=>dialog.open && dialog.isConnected && currentUser()?.id===uid;
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  const path=`/api/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`;
  try {
    let data=await api(path+'/production-details');if(!live())return;
    const item=data.item, editable=data.canEdit;
    const finishes=(item.finishing || []).map(f=>`${f.name}${f.units>1?` × ${f.units}`:''}${f.note?` · ${f.note}`:''}`).join(', ');
    dialog.innerHTML=`<form class="project-item-form"><header class="project-item-head"><div><span>${h(data.code)}</span><h2>${h(data.customerName)}</h2></div><button type="button" class="project-item-close" aria-label="Tutup detail order"><img src="/project-assets/close.svg" alt=""></button></header><div class="project-item-body"><section class="project-item-card"><h3><span>${data.itemNumber}</span>${h(item.productName)}</h3><div class="project-item-specs"><div><strong>${h(item.variantSummary || 'Pesanan')}</strong><strong>${h(itemQuantityLabel(item))}</strong></div>${(item.details || []).map(line=>`<p>${h(line)}</p>`).join('')}${finishes?`<div><span>Finishing</span><span>${h(finishes)}</span></div>`:''}<div><span>File</span><span>${h(item.templateDesign || item.fileService?.name || 'File Siap Cetak')}${item.fileService?.quantity>1?` × ${item.fileService.quantity}`:''}</span></div>${item.fileService?.note?`<p>${h(item.fileService.note)}</p>`:''}</div></section><label class="project-item-note"><span>Catatan <small>(opsional)</small></span><textarea name="productionNote" rows="2" maxlength="2000" placeholder="Catatan untuk produksi…" ${editable?'':'readonly'}>${h(item.productionNote)}</textarea></label><label class="project-item-link"><span>Link Google Drive <small>(opsional)</small> <img src="/project-assets/link.svg" alt=""></span><input type="url" name="driveUrl" maxlength="2048" value="${h(item.driveUrl)}" placeholder="https://drive.google.com/…" ${editable?'':'readonly'}></label><div data-saved-link></div><div data-item-hold></div><p class="project-item-feedback" role="status" aria-live="polite"></p></div>${editable?'<footer class="project-item-footer"><button type="submit" class="primary">Simpan</button></footer>':''}</form>`;
    const form=dialog.querySelector('form'),feedback=dialog.querySelector('[role=status]');
    dialog.querySelector('.project-item-close').onclick=()=>{if(!dialog.hasAttribute('data-saving'))dialog.close();};
    dialog.addEventListener('cancel',event=>{if(dialog.hasAttribute('data-saving'))event.preventDefault();});
    function savedLink() {
      let link='';try{link=driveLink(data.item.driveUrl || '');}catch{}
      dialog.querySelector('[data-saved-link]').innerHTML=link?`<a class="project-item-open-link" href="${h(link)}" target="_blank" rel="noopener noreferrer">Buka link tersimpan ↗</a>`:'';
    }
    function holdTools() {
      const host=dialog.querySelector('[data-item-hold]'),hold=data.item.hold;
      host.innerHTML=`${hold?`<div class="project-item-held"><strong>Ⅱ ${h(holdLabel(hold.reason))}</strong>${hold.note?`<p>${h(hold.note)}</p>`:''}</div>`:''}${editable && data.item.status!=='SELESAI'?`<button type="button" class="secondary" data-hold-action>${hold?'Lepaskan Tertahan':'Ⅱ Tandai Tertahan'}</button>`:''}`;
      host.querySelector('[data-hold-action]')?.addEventListener('click',async()=>{
        if(hold)return updateHold({release:true},host.querySelector('button'));
        const reasons=['Menunggu approval customer','Menunggu file customer','Bahan belum tersedia','Menunggu pembayaran','Kendala mesin','Alasan lainnya'];
        host.innerHTML=`<fieldset class="project-item-hold-editor"><legend>Tandai item tertahan</legend><label>Alasan<select name="holdReason">${reasons.map(reason=>`<option value="${h(reason)}">${h(holdLabel(reason))}</option>`).join('')}</select></label><label>Catatan alasan <small>(opsional)</small><textarea name="holdNote" rows="2" maxlength="1000"></textarea></label><div><button type="button" class="secondary" data-hold-cancel>Batal</button><button type="button" class="secondary" data-hold-save>Simpan Penanda</button></div></fieldset>`;
        host.querySelector('[data-hold-cancel]').onclick=()=>{if(!dialog.hasAttribute('data-saving'))holdTools();};
        host.querySelector('[data-hold-save]').onclick=event=>updateHold({reason:form.elements.holdReason.value,note:form.elements.holdNote.value},event.currentTarget);
      });
    }
    async function updateHold(body,button) {
      button.disabled=true;dialog.setAttribute('data-saving','');
      try { const result=await api(path+'/hold',{method:'PATCH',body:JSON.stringify({...body,expectedHoldUpdatedAt:data.item.hold?.updatedAt || null})});if(!live())return;data.item.hold=result.item.hold;holdTools();onChanged(result);feedback.textContent=body.release?'Penanda tertahan dilepas.':'Penanda tertahan disimpan.'; }
      catch(error){if(live()){feedback.textContent=error.message;toast(error.message,'error');}}
      finally{dialog.removeAttribute('data-saving');button.disabled=false;}
    }
    form.onsubmit=async event=>{
      event.preventDefault();if(!editable || dialog.hasAttribute('data-saving'))return;
      const button=form.querySelector('[type=submit]');button.disabled=true;dialog.setAttribute('data-saving','');feedback.textContent='Menyimpan…';
      try {
        const link=driveLink(form.elements.driveUrl.value);
        const result=await api(path+'/production-details',{method:'PATCH',body:JSON.stringify({productionNote:form.elements.productionNote.value,driveUrl:link,expectedRevision:data.item.productionRevision})});
        if(!live())return;onChanged(result);dialog.close();toast('Catatan dan link produksi disimpan.');
      } catch(error){if(live()){feedback.textContent=error.message;toast(error.message,'error');}}
      finally{dialog.removeAttribute('data-saving');button.disabled=false;}
    };
    savedLink();holdTools();dialog.querySelector('.project-item-close').focus();
  } catch(error){if(live()){dialog.close();toast(error.message,'error');}}
}
