import { calculateSheetLayout, productSheetProfile, cuttingMode, cuttingLabel, sheetSpecification } from './sheet-calculator.js';

export function sheetCalculatorHtml() {
  return `<aside id="sheet-calculator" class="sheet-calculator hidden" aria-label="Kalkulator jumlah lembar"><div class="sheet-heading"><strong>Kalkulator ukuran</strong><button type="button" id="sheet-close" class="text-button" aria-label="Tutup kalkulator">×</button></div><div id="sheet-area" class="sheet-area"></div><small id="sheet-format"></small><div id="sheet-cutting" class="sheet-cutting"></div>
    <label class="field"><span>Bentuk gambar</span><select id="sheet-shape"><option value="rectangle">Persegi panjang / persegi</option><option value="circle">Lingkaran</option></select></label><div class="sheet-dimensions"><label class="field"><span id="sheet-length-label">Panjang</span><span class="input-with-unit"><input id="sheet-length" type="text" inputmode="decimal" value="10" aria-labelledby="sheet-length-label"><b>cm</b></span></label><label class="field" id="sheet-width-field"><span id="sheet-width-label">Lebar</span><span class="input-with-unit"><input id="sheet-width" type="text" inputmode="decimal" value="8" aria-labelledby="sheet-width-label"><b>cm</b></span></label></div><label class="field"><span>Jumlah yang dipesan</span><span class="input-with-unit"><input id="sheet-requested" type="text" inputmode="numeric" value="100"><b>pcs</b></span></label><label class="sheet-rotation"><input id="sheet-rotation" type="checkbox" checked> Rotasi 90° otomatis</label>
    <div id="sheet-result" class="sheet-result" aria-live="polite"></div><div id="sheet-error" class="sheet-error hidden" role="alert"></div><button type="button" id="sheet-apply" class="primary">Gunakan hasil</button><details class="sheet-preview"><summary>Lihat susunan cetak</summary><div class="sheet-preview-options"><button type="button" data-sheet-view="full" aria-pressed="true">Lembar penuh</button><button type="button" data-sheet-view="last" aria-pressed="false">Lembar terakhir</button></div><svg id="sheet-paper" role="img" aria-label="Susunan gambar pada kertas"></svg><small id="sheet-grid"></small></details></aside>`;
}

export function bindSheetCalculator({ scope, product, profiles, update, saved }) {
  const panel = scope.querySelector('#sheet-calculator');
  if (!panel || !product.sheetCalculatorEnabled) return null;
  const get = id => scope.querySelector('#sheet-'+id), qty = scope.querySelector('#quantity');
  const layout = scope.querySelector('.sheet-config-layout');
  const entry = document.createElement('button'); entry.type = 'button'; entry.id = 'sheet-toggle'; entry.className = 'sheet-toggle'; entry.textContent = '▦ Hitung dari ukuran'; entry.setAttribute('aria-controls','sheet-calculator'); entry.setAttribute('aria-expanded','false');
  const label=scope.querySelector('.quantity-field > span');
  if(label) label.textContent='Jumlah Cetak';
  const control=scope.querySelector('.quantity-control');
  if(control){const row=document.createElement('div');row.className='sheet-quantity-row';control.replaceWith(row);row.append(control,entry);}
  const appliedNote = document.createElement('small'); appliedNote.className = 'sheet-applied hidden'; appliedNote.setAttribute('aria-live','polite'); qty.closest('.quantity-field').append(appliedNote);
  let applied = saved?.applied === true, result = null, error = '', view = 'full';
  function open(active) { panel.classList.toggle('hidden',!active); layout?.classList.toggle('sheet-open',active); entry.setAttribute('aria-expanded',String(active)); }
  const input = () => ({ shape:get('shape').value, widthCm:get('width').value, lengthCm:get('length').value, requestedQuantity:Number(get('requested').value), allowRotation:get('rotation').checked });
  function clearApplied() { applied = false; appliedNote.classList.add('hidden'); }
  function draw() {
    const svg=get('paper');
    if (!result) { svg.replaceChildren(); get('grid').textContent=''; return; }
    const p=result.profile,pw=p.paperWidthCm*10,ph=p.paperLengthCm*10,aw=result.areaWidthCm*10,ah=result.areaLengthCm*10,g=p.gapMm;
    const w=(result.rotated?result.lengthCm:result.widthCm)*10,h=(result.rotated?result.widthCm:result.lengthCm)*10,px=w+g,py=h+g;
    const usedW=result.columns*w+(result.columns-1)*g,usedH=result.rows*h+(result.rows-1)*g,x=(pw-usedW)/2,y=(ph-usedH)/2;
    const filled=view==='full'?result.capacity:result.lastSheetQuantity,rows=Math.floor(filled/result.columns),partial=filled%result.columns;
    const mark=cls=>result.shape==='circle'?`<circle cx="${w/2}" cy="${h/2}" r="${w/2}" class="${cls}"/>`:`<rect width="${w}" height="${h}" class="${cls}"/>`;
    svg.setAttribute('viewBox',`0 0 ${pw} ${ph}`);svg.style.aspectRatio=`${pw}/${ph}`;
    svg.innerHTML=`<defs><pattern id="sheet-filled" x="${x}" y="${y}" width="${px}" height="${py}" patternUnits="userSpaceOnUse">${mark('sheet-image-filled')}</pattern><pattern id="sheet-empty" x="${x}" y="${y}" width="${px}" height="${py}" patternUnits="userSpaceOnUse">${mark('sheet-image-empty')}</pattern></defs><rect x=".6" y=".6" width="${pw-1.2}" height="${ph-1.2}" class="sheet-page"/><rect x="${(pw-aw)/2}" y="${(ph-ah)/2}" width="${aw}" height="${ah}" class="sheet-print-area"/><rect x="${x}" y="${y}" width="${usedW}" height="${usedH}" fill="url(#sheet-empty)"/>${rows?`<rect x="${x}" y="${y}" width="${usedW}" height="${rows*py-g}" fill="url(#sheet-filled)"/>`:''}${partial?`<rect x="${x}" y="${y+rows*py}" width="${partial*px-g}" height="${h}" fill="url(#sheet-filled)"/>`:''}`;
    svg.setAttribute('aria-label',`${filled} gambar, ${result.columns} kolom dan ${result.rows} baris, ${cuttingLabel(result.cuttingMode)}, area ${result.areaWidthCm} × ${result.areaLengthCm} cm, jarak ${g} mm.`);
    get('grid').textContent=`${result.columns} kolom × ${result.rows} baris${result.rotated?' · Diputar 90°':''}`;
  }
  function sync() {
    const variantId=scope.querySelector('input[name="material-variant"]:checked')?.value || '';
    const profile=productSheetProfile(product,profiles,variantId);
    const finishes=[...scope.querySelectorAll('#finishing-grid input[type="checkbox"]:checked')].map(i=>product.finishing.find(f=>f.id===i.value)).filter(Boolean);
    const mode=cuttingMode(finishes);
    get('cutting').textContent=cuttingLabel(mode);
    get('width-field').classList.toggle('hidden',get('shape').value==='circle');get('length-label').textContent=get('shape').value==='circle'?'Diameter':'Panjang';get('rotation').disabled=get('shape').value==='circle';
    if (profile) { const aw=mode==='none'?profile.areaWidthCm:profile.cuttingWidthCm,ah=mode==='none'?profile.areaLengthCm:profile.cuttingLengthCm;get('area').textContent=`Area gambar ${aw.toLocaleString('id-ID')} × ${ah.toLocaleString('id-ID')} cm`;get('format').textContent=`${profile.name} · Kertas ${profile.paperWidthCm.toLocaleString('id-ID')} × ${profile.paperLengthCm.toLocaleString('id-ID')} cm · Jarak ${profile.gapMm} mm`; }
    try { if(!profile)throw new Error('Pilih varian bahan dengan profil kalkulator');result=calculateSheetLayout(profile,input(),mode);error=''; }
    catch(e) {result=null;error=e.message;}
    get('error').textContent=error;get('error').classList.toggle('hidden',!error);get('result').classList.toggle('hidden',!!error);get('apply').disabled=!!error;
    if (result) {
      get('result').innerHTML=`<div><span>Per lembar</span><strong>${result.capacity.toLocaleString('id-ID')} pcs</strong></div><div><span>Kebutuhan</span><strong>${result.sheets.toLocaleString('id-ID')} lembar</strong></div><small>Isi lembar terakhir: ${result.lastSheetQuantity.toLocaleString('id-ID')} pcs</small>`;
      get('apply').textContent=`Gunakan ${result.sheets.toLocaleString('id-ID')} lembar`;
      if(applied) {qty.value=String(result.sheets);appliedNote.textContent=sheetSpecification(result);appliedNote.classList.remove('hidden');}
    } else {get('apply').textContent='Periksa ukuran';appliedNote.classList.add('hidden');}
    draw();
  }
  entry.onclick=()=>open(panel.classList.contains('hidden'));get('close').onclick=()=>open(false);
  get('apply').onclick=()=>{if(!result)return;applied=true;sync();update();};
  qty.addEventListener('input',clearApplied,true);qty.addEventListener('change',clearApplied,true);
  scope.querySelectorAll('[data-product-minus],[data-product-plus]').forEach(b=>b.addEventListener('click',clearApplied,true));
  panel.addEventListener('input',update);panel.addEventListener('change',update);
  panel.querySelectorAll('[data-sheet-view]').forEach(b=>b.onclick=()=>{view=b.dataset.sheetView;panel.querySelectorAll('[data-sheet-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();});
  if(saved) {applied=!!saved.applied;open(!!saved.open);}
  sync();
  return {sync,snapshot:()=>applied&&result?structuredClone(result):null,validate:()=>{if(applied&&error){open(true);return error;}return '';},capture:()=>({applied,open:!panel.classList.contains('hidden')})};
}

export function sheetProfileOptions(profiles, current='', inherit=false) {
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return (inherit?'<option value="">Ikuti profil produk</option>':'')+(profiles || []).map(p=>`<option value="${escape(p.id)}" ${p.id===current?'selected':''}>${escape(p.name)}</option>`).join('');
}
