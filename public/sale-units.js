// Shared by the product editor, POS pricing and server validation.
export const SALE_UNIT_PRICING_VERSION = 1;
export const PRICE_BASIS_LABELS = { unit:'Per unit', sqm:'Luas m²', linear_m:'Meter lari' };
const key = value => String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[\s_^]+/g,'');
export function normalizeSaleUnit(value) {
  const label = String(value ?? '').trim().replace(/\s+/g,' '), code = key(label);
  if (['m2','sqm','meterpersegi'].includes(code)) return 'm²';
  if (['mlari','meterlari','linearm','lm','m','meter'].includes(code)) return 'm lari';
  const known = ['pcs','lbr','pack','set','box','paket','rim','lembar'];
  return known.includes(code) ? code : label;
}
export function saleUnitBasis(value) {
  const unit = normalizeSaleUnit(value);
  return unit === 'm²' ? 'sqm' : unit === 'm lari' ? 'linear_m' : 'unit';
}
export const defaultWholesaleBasis = basis => basis === 'sqm' ? 'area' : basis === 'linear_m' ? 'length' : 'quantity';
export function productSaleUnit(product) {
  return normalizeSaleUnit(product.saleUnit || (product.priceBasis === 'sqm' ? 'm²' : product.priceBasis === 'linear_m' ? 'm lari' : product.unitName || 'pcs'));
}
export function saleUnitProduct(product) {
  const saleUnit = productSaleUnit(product), priceBasis = saleUnitBasis(saleUnit);
  return {...product,saleUnit,priceBasis,priceBasisLabel:PRICE_BASIS_LABELS[priceBasis],widths:priceBasis === 'unit' ? [] : product.widths || []};
}
export function normalizeSaleUnitOptions(values = []) {
  const seen = new Set();
  return values.map(normalizeSaleUnit).filter(label => { const code = key(label); if (!label || seen.has(code)) return false; seen.add(code); return true; });
}
