import { defaultStockMethod, normalizedStockUnit } from './stock-methods.js';

export const MAX_DTF_VARIANTS = 100;
export const DTF_LABEL_LENGTH = 40;
export const dtfLabel = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/g,' ') : '';
export const dtfSize = value => dtfLabel(value).toUpperCase();
export const dtfVariantKey = (color,size) => JSON.stringify([dtfLabel(color).toLocaleLowerCase('id-ID'),dtfSize(size)]);
export const dtfSizeSurcharge = (product,size) => {
  const key=dtfSize(size);
  return product.dtfSizeSurcharges?.find(row=>row.size===key)?.amount ?? (key==='XXL' ? 15000 : 0);
};

export function usableDtfMaterial(material) {
  return Boolean(material && !material.deletedAt && material.active!==false && !material.stockNeedsCount &&
    defaultStockMethod(material)==='UNIT' && normalizedStockUnit(material.unit)==='pcs' &&
    normalizedStockUnit(material.stockUnit || material.unit)==='pcs');
}
