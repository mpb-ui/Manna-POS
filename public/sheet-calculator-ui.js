import { calculateSheetCapacity, productSheetProfile } from './sheet-calculator.js';

export function sheetCalculatorHtml(product) {
  const informational = product && !/^(lbr|lembar)$/i.test(product.unitName || product.saleUnit || 'lembar');
  return `<aside id="sheet-calculator" class="sheet-calculator hidden" aria-label="Kalkulator kapasitas per lembar"><div class="sheet-heading"><strong>Kalkulator ukuran</strong><button type="button" id="sheet-close" class="text-button" aria-label="Tutup kalkulator">×</button></div><div id="sheet-area" class="sheet-area"></div><small id="sheet-format"></small>
    ${informational ? '<p class="sheet-unit-help">Kapasitas ini untuk satu lembar bahan. Jumlah pesanan tetap mengikuti satuan jual produk dan tidak diubah oleh kalkulator.</p>' : ''}
    <div class="sheet-dimensions"><label class="field"><span id="sheet-length-label">Panjang</span><span class="input-with-unit"><input id="sheet-length" type="text" inputmode="decimal" value="10" aria-labelledby="sheet-length-label"><b>cm</b></span></label><label class="field"><span id="sheet-width-label">Lebar</span><span class="input-with-unit"><input id="sheet-width" type="text" inputmode="decimal" value="8" aria-labelledby="sheet-width-label"><b>cm</b></span></label></div><label class="sheet-rotation"><input id="sheet-rotation" type="checkbox" checked> Rotasi 90° otomatis</label>
    <div id="sheet-result" class="sheet-result" aria-live="polite"></div><div id="sheet-error" class="sheet-error hidden" role="alert"></div><details class="sheet-preview"><summary>Pratinjau susunan cetak</summary><svg id="sheet-paper" role="img" aria-label="Susunan gambar pada satu lembar"></svg><small id="sheet-grid"></small></details></aside>`;
}

export function bindSheetCalculator({ scope, product, profiles, update, saved }) {
  const panel = scope.querySelector('#sheet-calculator');
  if (!panel || !product.sheetCalculatorEnabled) return null;
  const get = id => scope.querySelector('#sheet-'+id), layout = scope.querySelector('.sheet-config-layout');
  const entry = document.createElement('button'); entry.type = 'button'; entry.id = 'sheet-toggle'; entry.className = 'sheet-toggle'; entry.textContent = '▦ Hitung dari ukuran'; entry.setAttribute('aria-controls','sheet-calculator'); entry.setAttribute('aria-expanded','false');
  const label=scope.querySelector('.quantity-field > span');
  if(label) label.textContent=product.a3Kind==='ready'?'Jumlah produk':'Jumlah Cetak';
  const control=scope.querySelector('.quantity-control');
  if(control){const row=document.createElement('div');row.className='sheet-quantity-row';control.replaceWith(row);row.append(control,entry);}
  let active = saved?.active === true || saved?.applied === true, result = null;
  function open(show) { if(show) active=true; panel.classList.toggle('hidden',!show); layout?.classList.toggle('sheet-open',show); entry.setAttribute('aria-expanded',String(show)); }
  const input = () => ({ widthCm:get('width').value, lengthCm:get('length').value, allowRotation:get('rotation').checked });
  function draw() {
    const svg=get('paper');
    if (!result) { svg.replaceChildren(); get('grid').textContent=''; return; }
    const p=result.profile,pw=p.paperWidthCm*10,ph=p.paperLengthCm*10,aw=result.areaWidthCm*10,ah=result.areaLengthCm*10,g=p.gapMm;
    const w=(result.rotated?result.lengthCm:result.widthCm)*10,h=(result.rotated?result.widthCm:result.lengthCm)*10,px=w+g,py=h+g;
    const usedW=result.columns*w+(result.columns-1)*g,usedH=result.rows*h+(result.rows-1)*g,x=(pw-usedW)/2,y=(ph-usedH)/2;
    svg.setAttribute('viewBox',`0 0 ${pw} ${ph}`);svg.style.aspectRatio=`${pw}/${ph}`;
    svg.innerHTML=`<defs><pattern id="sheet-filled" x="${x}" y="${y}" width="${px}" height="${py}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" class="sheet-image-filled"/></pattern></defs><rect x=".6" y=".6" width="${pw-1.2}" height="${ph-1.2}" class="sheet-page"/><rect x="${(pw-aw)/2}" y="${(ph-ah)/2}" width="${aw}" height="${ah}" class="sheet-print-area"/><rect x="${x}" y="${y}" width="${usedW}" height="${usedH}" fill="url(#sheet-filled)"/>`;
    svg.setAttribute('aria-label',`${result.capacity} gambar per lembar, ${result.columns} kolom dan ${result.rows} baris, area ${result.areaWidthCm} × ${result.areaLengthCm} cm, jarak ${g} mm.`);
    get('grid').textContent=`${result.columns} kolom × ${result.rows} baris${result.rotated?' · Diputar 90°':''}`;
  }
  function sync() {
    const variantId=scope.querySelector('input[name="material-variant"]:checked')?.value || '';
    const profile=productSheetProfile(product,profiles,variantId);
    if(profile){const aw=Math.min(profile.areaWidthCm,profile.cuttingWidthCm),ah=Math.min(profile.areaLengthCm,profile.cuttingLengthCm);get('area').textContent=`Area gambar ${aw.toLocaleString('id-ID')} × ${ah.toLocaleString('id-ID')} cm`;get('format').textContent=`${profile.name} · Jarak ${profile.gapMm} mm`;}
    let error='';
    try{if(!profile)throw new Error('Pilih varian bahan dengan profil kalkulator');result=calculateSheetCapacity(profile,input());}
    catch(e){result=null;error=e.message;}
    get('error').textContent=error;get('error').classList.toggle('hidden',!error);get('result').classList.toggle('hidden',!!error);
    if(result)get('result').innerHTML=`<div><span>Hasil per lembar</span><strong>${result.capacity.toLocaleString('id-ID')} pcs</strong></div>`;
    draw();
  }
  entry.onclick=()=>{open(panel.classList.contains('hidden'));update();};get('close').onclick=()=>open(false);
  panel.addEventListener('input',update);panel.addEventListener('change',update);
  if(saved)open(!!saved.open);
  sync();
  return {sync,snapshot:()=>active&&result?structuredClone(result):null,validate:()=>'',capture:()=>({active,open:!panel.classList.contains('hidden')})};
}

export function sheetProfileOptions(profiles, current='', inherit=false) {
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return (inherit?'<option value="">Ikuti profil produk</option>':'')+(profiles || []).map(p=>`<option value="${escape(p.id)}" ${p.id===current?'selected':''}>${escape(p.name)}</option>`).join('');
}
