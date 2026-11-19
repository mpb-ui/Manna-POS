import { rollPlacements, rollPlacementNote, supportsOutdoorPlacement } from './roll-placement.js';
import { candidateRollPrice, usesPrintAreaTier } from './product-pricing.js';
import { printRollCapacity, printRollLengthLimit, PRINT_ROLL_VERSION } from './outdoor-sizing.js';
const n = value => Number(value).toLocaleString('id-ID', {maximumFractionDigits:4});
const money = value => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(value);
import { configurationBadge as badge, configurationDesign, configurationNotes } from './product-configurator.js';

export function rollConfigurationHtml(product, {escapeHtml:h, finishing, files, designStep, options=''}) {
  const outdoor = supportsOutdoorPlacement(product);
  const variants = [{id:'custom',label:'Meteran'}, ...(product.fixedSizeVariants || [])];
  return `<div class="product-config"><section class="roll-size print-size ${outdoor ? 'outdoor-auto-size' : ''}"><h3>${badge(1)}<span>${outdoor ? 'CETAK' : 'UKURAN'}</span></h3><div class="config-section-content">
    ${product.fixedSizeVariants?.length ? `<div class="chips roll-size-options" role="group" aria-label="Pilihan ukuran">${variants.map((v,i)=>`<div class="chip"><input type="radio" name="size-variant" id="size-variant-${product.id}-${v.id}" value="${h(v.id)}" ${i?'':'checked'}><label for="size-variant-${product.id}-${v.id}"><span class="radio-chip-copy"><strong>${h(v.label)}</strong>${v.price!=null?`<small>${money(v.price)}</small>`:''}</span></label></div>`).join('')}</div>` : ''}
    <div data-size-custom class="print-roll-fields">
      <div class="roll-dimensions ${outdoor ? 'outdoor-auto-dimensions' : ''}">
        <label class="field"><span>Lebar</span><span class="input-with-unit"><input id="image-width" type="number" min="0.01" step="any" value="${Number(product.widths[0] || .9)*100}" required><b>cm</b></span></label>
        <label class="field"><span>Panjang</span><span class="input-with-unit"><input id="image-length" type="number" min="0.01" step="any" value="100" required><b>cm</b></span></label>
        ${outdoor ? `<label class="field"><span>Lebihan / sisi</span><span class="input-with-unit"><input id="allowance" type="number" min="0" step="any" value="0" required aria-label="Lebihan per sisi"><b>cm</b></span></label>` : ''}
      </div>
      <div class="print-roll-status"><div class="print-roll-chips" role="group" aria-label="Roll terpakai"><span>Roll terpakai</span>
        ${[...product.widths].sort((a,b)=>a-b).map(width=>`<span class="print-roll-chip" data-print-roll="${Number(width)}">${n(printRollCapacity(product, width, PRINT_ROLL_VERSION))} cm</span>`).join('')}
        </div><details class="roll-details print-roll-details"><summary aria-controls="roll-plan">Detail perhitungan <span class="ui-chevron" aria-hidden="true"></span></summary></details>
      </div>
      <div class="roll-details-body hidden" id="roll-plan" data-roll-plan></div>
    </div>
    <p class="roll-fixed-info hidden" data-roll-fixed-info>Harga mengikuti ukuran yang dipilih, per lembar.</p>
    ${options}
    <div data-print-wholesale></div>
    <p class="roll-error hidden" data-roll-error role="status" aria-live="polite"></p>
    </div></section>
    ${finishing}
    ${configurationDesign(designStep, files)}
    ${configurationNotes()}</div>`;
}

export function bindRollDetails(scope) {
  const details = scope.querySelector('.print-roll-details');
  const plan = scope.querySelector('[data-roll-plan]');
  details?.addEventListener('toggle', () => plan.classList.toggle('hidden', !details.open));
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
  const message=line.placementError || line.finishingError || (invalidQuantity?'Jumlah produk harus bilangan bulat minimal 1':!Number.isSafeInteger(line.previewTotal)?'Nilai perhitungan terlalu besar':'');
  error.textContent=message; error.classList.toggle('hidden',!message);
  scope.querySelector('#add-item').disabled=Boolean(message);
  const fixed=Boolean(line.sizeVariantId);
  scope.querySelector('[data-roll-fixed-info]').classList.toggle('hidden',!fixed);
  for (const chip of scope.querySelectorAll('[data-print-roll]')) {
    const selected = Number(chip.dataset.printRoll) === line.rollPlacement?.nominalWidth;
    const capacity = printRollCapacity(product, Number(chip.dataset.printRoll), line.rollCalculationVersion);
    chip.textContent = `${n(capacity)} cm`;
    if (selected) chip.setAttribute('aria-current', 'true'); else chip.removeAttribute('aria-current');
  }
  const key=JSON.stringify([line.imageWidthCm,line.imageLengthCm,line.allowanceCm,line.sizeVariantId,line.unitPrice,line.quantity,line.placementError,line.baseTotal,line.rollCalculationVersion]);
  if (target.dataset.key===key) return;
  // Preserve a user's open preview/table when the price or quantity changes.
  const previewOpen=Boolean(target.querySelector('[data-placement-preview]')?.open), compareOpen=Boolean(target.querySelector('[data-placement-compare]')?.open);
  target.dataset.key=key;
  if (fixed) { target.textContent='Harga tetap per lembar sesuai varian pada Master Data. Tidak mengikuti pembulatan meteran.'; return; }
  if (!line.rollPlacement) { target.textContent=message || (line.legacyPlacement ? 'Perhitungan lama dipertahankan selama ukuran dan jumlah tidak diubah.' : 'Isi lebar dan panjang gambar.'); return; }
  const p=line.rollPlacement,candidates=rollPlacements(product,line);
  const rounding = `Panjang dibulatkan per ${n(Number(product.billingIncrement || .5)*100)} cm, minimum 1 m.`;
  const limit = printRollLengthLimit(product, p.capacityCm, line.rollCalculationVersion);
  const cap = Number.isFinite(limit) ? ` Panjang tagih maksimum ${limit} m untuk roll ${n(p.capacityCm)} cm.` : '';
  const allowance = outdoor ? ` Lebihan hingga 5 cm per sisi memakai ruang roll tanpa menambah panjang tagih.` : '';
  const tier = usesPrintAreaTier(product, line) ? `<p>Dasar harga grosir cetak <b>${n(line.wholesaleQuantity)} m² per lembar</b></p>` : '';
  const effectiveRate = line.unitPrice * (product.priceBasis === 'sqm' ? p.nominalWidth : 1);
  target.innerHTML=`<p>${rollPlacementNote(line)}${p.rotated?' · Diputar 90°':''}</p>
    <p>${n(p.billedLength)} m tertagih × ${n(line.quantity)} lembar × ${money(effectiveRate)}/m = <b>${money(line.baseTotal)}</b></p>${tier}
    <div class="roll-plan-values"><span>Estimasi bahan <b>${n(p.usedArea)} m² / lembar</b></span></div>
    <p class="roll-plan-help">${rounding}${cap}${allowance}</p>
    <details data-placement-preview ${previewOpen?'open':''}><summary>Pratinjau penempatan</summary>${placementSvg(p)}</details>
    <details data-placement-compare ${compareOpen?'open':''}><summary>Bandingkan penempatan</summary><div class="roll-table-scroll"><table><thead><tr><th>Penempatan</th><th>Roll</th><th>Bahan / lembar</th><th>Harga cetak</th></tr></thead><tbody>${candidates.map((c,i)=>`<tr ${i?'':'class="chosen"'}><td>${n(c.acrossCm)} × ${n(c.alongCm)} cm${i?'':' · ✓'}</td><td>${n(c.capacityCm)} cm</td><td>${n(c.usedArea)} m²</td><td>${money(candidateRollPrice(product,line,c))}</td></tr>`).join('')}</tbody></table></div></details>`;
}
