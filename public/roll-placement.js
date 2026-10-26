import { imageGeometry, outdoorCapacity, supportsOutdoorAllowance } from './outdoor-sizing.js';
import { supportsAlbatrosPlacement, albatrosPlacements, albatrosPlacementNote } from './albatros-sizing.js';

export function supportsOutdoorPlacement(product) {
  return supportsOutdoorAllowance(product) && ['sqm', 'linear_m'].includes(product.priceBasis);
}

export function supportsLfPlacement(product) {
  return !product?.templateProduct && product?.priceBasis === 'sqm'
    && (['poster-luster', 'poster-canvas'].includes(product.id) || product.category === 'LF Sticker');
}

export const supportsRollPlacement = product => supportsAlbatrosPlacement(product) || supportsOutdoorPlacement(product) || supportsLfPlacement(product);
export const rollPlacementNote = item => albatrosPlacementNote(item);

// Physical footprint includes both allowances, even when <=5 cm is free for billing.
// The nominal width and the product's own price basis still determine the charge.
export function rollPlacements(product, input) {
  // LF uses the same no-allowance geometry, nominal billing and rounding as Albatros.
  if (supportsAlbatrosPlacement(product) || supportsLfPlacement(product)) return albatrosPlacements(product, input);
  if (!supportsOutdoorPlacement(product)) return [];
  const g = imageGeometry(product, input), allowance = g.allowanceCm;
  const step = Number(product.billingIncrement) > 0 ? Number(product.billingIncrement) : .5;
  const round = n => Number(n.toFixed(8)), candidates = [];
  const orientations = g.imageWidthCm === g.imageLengthCm ? [[g.imageWidthCm,g.imageLengthCm]] : [[g.imageWidthCm,g.imageLengthCm],[g.imageLengthCm,g.imageWidthCm]];
  for (const [imageAcrossCm,imageAlongCm] of orientations) for (const width of product.widths || []) {
    const nominalWidth = Number(width), capacityCm = outdoorCapacity(product, nominalWidth);
    const acrossCm = Number((imageAcrossCm + 2 * allowance).toFixed(4)), alongCm = Number((imageAlongCm + 2 * allowance).toFixed(4));
    if (!Number.isFinite(nominalWidth) || nominalWidth <= 0 || !Number.isFinite(capacityCm) || capacityCm <= 0 || acrossCm > capacityCm + 1e-9) continue;
    const actualLength = (imageAlongCm + (allowance > 5 ? 2 * allowance : 0)) / 100;
    const billedLength = Math.max(1, Number((Math.ceil(actualLength / step - 1e-9) * step).toFixed(4)));
    const usedArea = round(capacityCm * alongCm / 10000);
    const billingUnits = round((product.priceBasis === 'sqm' ? nominalWidth : 1) * billedLength);
    if (![acrossCm,alongCm,actualLength,billedLength,usedArea,billingUnits].every(Number.isFinite)) throw new Error('Ukuran gambar terlalu besar');
    candidates.push({version:1, sizingMode:'outdoor', nominalWidth, capacityCm, imageAcrossCm, imageAlongCm, allowanceCm:allowance, acrossCm, alongCm, actualLength, billedLength, usedArea, billingUnits, wasteArea:round(Math.max(0,(capacityCm-acrossCm)*alongCm/10000)), rotated:imageAcrossCm !== g.imageWidthCm});
  }
  return candidates.sort((a,b) => Math.round((a.usedArea-b.usedArea)*1e8) || a.billingUnits-b.billingUnits || a.nominalWidth-b.nominalWidth || a.acrossCm-b.acrossCm || a.alongCm-b.alongCm);
}

export function selectRollPlacement(product, input) {
  const best = rollPlacements(product, input)[0];
  if (!best) throw new Error(`Kedua arah gambar tidak muat pada roll ${product.name || 'produk'} yang tersedia. Perlu bahan lain atau penanganan sambungan.`);
  return best;
}
