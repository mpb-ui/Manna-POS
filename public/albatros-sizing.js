import { outdoorCapacity } from './outdoor-sizing.js';

export const ALBATROS_CALCULATION_VERSION = 1;
export function supportsAlbatrosPlacement(product) {
  return product?.id === 'poster-albatros' && product.priceBasis === 'sqm' && !product.templateProduct;
}

// Physical usage selects the placement. Nominal widths and existing rounding
// still determine billing/HPP; this estimate never deducts physical roll stock.
export function albatrosPlacements(product, input) {
  const w = Number(input.imageWidthCm), h = Number(input.imageLengthCm);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) throw new Error('Ukuran gambar tidak valid');
  const step = Number(product.billingIncrement) > 0 ? Number(product.billingIncrement) : .5;
  const round = n => Number(n.toFixed(8));
  const candidates = [];
  for (const [acrossCm, alongCm] of w === h ? [[w,h]] : [[w,h],[h,w]]) {
    for (const nominalWidth of product.widths || []) {
      const capacityCm = outdoorCapacity(product, nominalWidth);
      if (!Number.isFinite(nominalWidth) || nominalWidth <= 0 || !Number.isFinite(capacityCm) || capacityCm <= 0 || acrossCm > capacityCm + 1e-9) continue;
      const actualLength = alongCm / 100;
      const billedLength = Math.max(1, Number((Math.ceil(actualLength / step - 1e-9) * step).toFixed(4)));
      const usedArea = round(capacityCm * alongCm / 10000);
      const billingUnits = round(nominalWidth * billedLength);
      if (![actualLength,billedLength,usedArea,billingUnits].every(Number.isFinite)) throw new Error('Ukuran gambar terlalu besar');
      candidates.push({version:ALBATROS_CALCULATION_VERSION, nominalWidth, capacityCm, acrossCm, alongCm, actualLength, billedLength, usedArea, billingUnits, wasteArea:round(Math.max(0,(capacityCm-acrossCm)*alongCm/10000)), rotated:acrossCm !== w});
    }
  }
  // Deterministic even if the original dimensions or configured widths swap order.
  return candidates.sort((a,b) => Math.round((a.usedArea-b.usedArea)*1e8) || a.billingUnits-b.billingUnits || a.nominalWidth-b.nominalWidth || a.acrossCm-b.acrossCm || a.alongCm-b.alongCm);
}

export function selectAlbatrosPlacement(product, input) {
  const best = albatrosPlacements(product,input)[0];
  if (!best) throw new Error('Kedua arah gambar tidak muat pada roll Albatros yang tersedia. Perlu bahan lain atau penanganan sambungan.');
  return best;
}

export function albatrosPlacementNote(item) {
  const p = item.rollPlacement;
  if (p?.version !== ALBATROS_CALCULATION_VERSION) return '';
  const n = value => Number(value).toLocaleString('id-ID');
  return `Penempatan cetak: ${n(p.acrossCm)} × ${n(p.alongCm)} cm · Roll ${n(p.nominalWidth)} m (${n(p.capacityCm)} cm)`;
}
