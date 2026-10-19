import { rollPlacements, rollPlacementNote, supportsOutdoorPlacement } from './roll-placement.js';
const n = value => Number(value).toLocaleString('id-ID', {maximumFractionDigits:4});
const money = value => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(value);
import { configurationBadge as badge, configurationFinishing, configurationDesign, configurationNotes, configurationActions } from './product-configurator.js';

export function rollConfigurationHtml(product, {escapeHtml:h, quantity, finishing, files, options=''}) {
  const outdoor = supportsOutdoorPlacement(product);
  const variants = [{id:'custom',label:'Meteran'}, ...(product.fixedSizeVariants || [])];
  return `<div class="product-config"><section class="roll-size ${outdoor ? 'outdoor-auto-size' : ''}"><h3>${badge(1)}<span>UKURAN & JUMLAH</span></h3><div class="config-section-content">
    ${product.fixedSizeVariants?.length ? `<div class="chips roll-size-options" role="group" aria-label="Pilihan ukuran">${variants.map((v,i)=>`<div class="chip"><input type="radio" name="size-variant" id="size-variant-${product.id}-${v.id}" value="${h(v.id)}" ${i?'':'checked'}><label for="size-variant-${product.id}-${v.id}"><span class="radio-chip-copy"><strong>${h(v.label)}</strong>${v.price!=null?`<small>${money(v.price)}</small>`:''}</span></label></div>`).join('')}</div>` : ''}
    <div data-size-custom class="roll-dimensions ${outdoor ? 'outdoor-auto-dimensions' : ''}"><label class="field"><span>Lebar gambar</span><span class="input-with-unit"><input id="image-width" type="number" min="0.01" step="any" value="${Number(product.widths[0] || .9)*100}" required><b>cm</b></span></label><label class="field"><span>Panjang gambar</span><span class="input-with-unit"><input id="image-length" type="number" min="0.01" step="any" value="100" required><b>cm</b></span></label>${outdoor ? `<label class="field"><span>Lebihan / sisi</span><span class="input-with-unit"><input id="allowance" type="number" min="0" step="any" value="0" required aria-label="Lebihan per sisi"><b>cm</b></span></label>` : ''}<p>Bahan dan arah cetak dipilih otomatis.</p></div>
    <p class="roll-fixed-info hidden" data-roll-fixed-info>Harga mengikuti ukuran yang dipilih, per lembar.</p>
    <div class="roll-quantity-area">${quantity}<details class="roll-details"><summary>Detail perhitungan <span class="ui-chevron" aria-hidden="true"></span></summary><div class="roll-details-body" data-roll-plan></div></details></div>
    ${options}
    <p class="roll-error hidden" data-roll-error role="status" aria-live="polite"></p>
    </div></section>
    ${configurationFinishing(2, finishing, product.finishing.length > 0)}
    ${configurationDesign(3, files)}
    ${configurationNotes()}${configurationActions()}</div>`;
}

function placementSvg(p) {
  const scale=Math.min(240/p.capacityCm,180/p.alongCm),w=p.capacityCm*scale,h=p.alongCm*scale,x=(320-w)/2,y=(230-h)/2;
  return `<svg viewBox="0 0 320 250" class="roll-preview" role="img" aria-label="Gambar ${n(p.acrossCm)} kali ${n(p.alongCm)} cm pada roll ${n(p.capacityCm)} cm"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#edf1f6" stroke="#a8b9cf"/><rect x="${x}" y="${y}" width="${p.acrossCm*scale}" height="${h}" fill="#cce1ff" stroke="#0a68f4"/><text x="160" y="${y-10}" text-anchor="middle" fill="#52627a" font-size="11">Roll ${n(p.capacityCm)} cm</text><text x="${x+p.acrossCm*scale/2}" y="${y+h/2}" text-anchor="middle" fill="#125895" font-size="11">${n(p.acrossCm)} × ${n(p.alongCm)} cm</text></svg>`;
}

export function syncRollConfigurator(scope, product, line) {
  if (!scope.querySelector('.roll-size')) return;
  const error = scope.querySelector('[data-roll-error]'), target = scope.querySelector('[data-roll-plan]');
  const outdoor = supportsOutdoorPlacement(product);
  const invalidQuantity = !Number.isSafeInteger(Number(scope.querySelector('#quantity').value)) || Number(scope.querySelector('#quantity').value)<1;
  const message=line.placementError || (invalidQuantity?'Jumlah produk harus bilangan bulat minimal 1':!Number.isSafeInteger(line.previewTotal)?'Nilai perhitungan terlalu besar':'');
  error.textContent=message; error.classList.toggle('hidden',!message);
  scope.querySelector('#add-item').disabled=Boolean(message);
  const fixed=Boolean(line.sizeVariantId);
  scope.querySelector('[data-roll-fixed-info]').classList.toggle('hidden',!fixed);
  const key=JSON.stringify([line.imageWidthCm,line.imageLengthCm,line.allowanceCm,line.sizeVariantId,line.unitPrice,line.quantity,line.placementError]);
  if (target.dataset.key===key) return;
  // Preserve a user's open preview/table when the price or quantity changes.
  const previewOpen=Boolean(target.querySelector('[data-placement-preview]')?.open), compareOpen=Boolean(target.querySelector('[data-placement-compare]')?.open);
  target.dataset.key=key;
  if (fixed) { target.textContent='Harga tetap per lembar sesuai varian pada Master Data. Tidak mengikuti pembulatan meteran.'; return; }
  if (!line.rollPlacement) { target.textContent=message || (line.legacyPlacement ? 'Perhitungan lama dipertahankan selama ukuran dan jumlah tidak diubah.' : 'Isi lebar dan panjang gambar.'); return; }
  const p=line.rollPlacement,candidates=rollPlacements(product,line);
  const note = outdoor ? `Lebihan ${n(line.allowanceCm)} cm/sisi termasuk dalam penempatan. Lebihan hingga 5 cm tidak menambah panjang tagihan. Harga memakai ${product.priceBasis === 'sqm' ? 'lebar nominal roll × panjang tagihan' : 'panjang tagihan per meter lari'}; panjang dibulatkan per ${n(Number(product.billingIncrement || .5)*100)} cm, minimum 1 m.` : `Harga memakai lebar nominal roll; panjang dibulatkan per ${n(Number(product.billingIncrement || .5)*100)} cm, minimum 1 m.`;
  target.innerHTML=`<p><b>Otomatis · Paling hemat bahan</b></p><p>${rollPlacementNote(line)}${p.rotated?' · Diputar 90°':''}</p><div class="roll-plan-values"><span>Panjang ditagihkan <b>${n(p.billedLength)} m</b></span><span>Estimasi bahan <b>${n(p.usedArea)} m² / lembar</b></span></div><p class="roll-plan-help">Ukuran asli tetap ${n(line.imageWidthCm)} × ${n(line.imageLengthCm)} cm. ${note}</p><details data-placement-preview ${previewOpen?'open':''}><summary>Pratinjau penempatan</summary>${placementSvg(p)}</details><details data-placement-compare ${compareOpen?'open':''}><summary>Bandingkan penempatan</summary><div class="roll-table-scroll"><table><thead><tr><th>Penempatan</th><th>Roll</th><th>Bahan / lembar</th><th>Harga print</th></tr></thead><tbody>${candidates.map((c,i)=>`<tr ${i?'':'class="chosen"'}><td>${n(c.acrossCm)} × ${n(c.alongCm)} cm${i?'':' · ✓'}</td><td>${n(c.nominalWidth)} m</td><td>${n(c.usedArea)} m²</td><td>${money(Math.round(c.billingUnits*line.unitPrice*line.quantity))}</td></tr>`).join('')}</tbody></table></div><p class="roll-plan-help">Prioritas bahan terpakai terkecil, lalu tagihan terendah jika sama. Estimasi ini bukan pengurangan stok roll. Belum menggabungkan beberapa gambar dalam satu roll.</p></details>`;
}
