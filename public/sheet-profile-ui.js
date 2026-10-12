export function openSheetProfiles({ getProfiles, showDialog, api, refresh, toast, escapeHtml: e }) {
  const fields = [['paperWidthCm','Lebar kertas','cm'],['paperLengthCm','Panjang kertas','cm'],['areaWidthCm','Lebar gambar tanpa cutting','cm'],['areaLengthCm','Panjang gambar tanpa cutting','cm'],['cuttingWidthCm','Lebar gambar Kisscut / Diecut','cm'],['cuttingLengthCm','Panjang gambar Kisscut / Diecut','cm'],['gapMm','Jarak horizontal & vertikal','mm']];
  function listing() {
    const detail=showDialog('Profil Kalkulator',`<div class="sheet-profiles-list"><p class="product-note">Profil dipilih pada Tambah/Edit Produk. Perubahan berlaku pada perhitungan baru; spesifikasi pesanan lama tetap tersimpan.</p><button type="button" class="primary" id="add-sheet-profile">+ Tambah Profil</button><div class="table-wrap"><table><thead><tr><th>Profil</th><th>Tanpa cutting</th><th>Kisscut / Diecut</th><th>Jarak</th><th></th></tr></thead><tbody>${getProfiles().map(p=>`<tr><td><strong>${e(p.name)}</strong><small>Kertas ${p.paperWidthCm} × ${p.paperLengthCm} cm</small></td><td>${p.areaWidthCm} × ${p.areaLengthCm} cm</td><td>${p.cuttingWidthCm} × ${p.cuttingLengthCm} cm</td><td>${p.gapMm} mm</td><td><button type="button" class="secondary" data-edit-sheet="${e(p.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`);
    detail.querySelector('#add-sheet-profile').onclick=()=>editor(null);
    detail.querySelectorAll('[data-edit-sheet]').forEach(b=>b.onclick=()=>editor(getProfiles().find(p=>p.id===b.dataset.editSheet)));
  }
  function editor(profile) {
    const detail=showDialog(profile?'Edit Profil Kalkulator':'Tambah Profil Kalkulator',`<form id="sheet-profile-form" class="master-form"><label class="field"><span>Nama profil *</span><input name="name" value="${e(profile?.name || '')}" maxlength="80" required></label><div class="form-grid">${fields.map(([key,label,unit])=>`<label class="field"><span>${label} *</span><span class="input-with-unit"><input name="${key}" type="number" min="0.01" max="1000" step="0.01" required value="${profile?.[key] || ''}"><b>${unit}</b></span></label>`).join('')}</div><div class="form-footer sticky-form-footer"><button type="button" class="secondary" id="back-sheet-profiles">Batal</button><button class="primary" type="submit">Simpan Profil</button></div></form>`);
    detail.querySelector('#back-sheet-profiles').onclick=listing;
    detail.querySelector('form').onsubmit=async event=>{
      event.preventDefault();const submit=event.target.querySelector('[type="submit"]');submit.disabled=true;
      try {const values=Object.fromEntries(new FormData(event.target));await api(`/api/sheet-profiles/${profile?.id || 'sheet-'+crypto.randomUUID()}`,{method:'PUT',body:JSON.stringify(values)});await refresh();listing();toast('Profil kalkulator disimpan');}
      catch(error){toast(error.message,'error');submit.disabled=false;}
    };
  }
  listing();
}
