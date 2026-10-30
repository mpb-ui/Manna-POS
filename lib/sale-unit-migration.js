import { SALE_UNIT_PRICING_VERSION, normalizeSaleUnit, saleUnitBasis, saleUnitProduct, normalizeSaleUnitOptions } from '../public/sale-units.js';

// One-time catalog-only migration. A pre-migration PostgreSQL backup is required
// by Store.init. Keep the actual legacy pricing basis if old labels disagreed.
export function migrateSaleUnitPricing(state) {
  if (Number(state.saleUnitPricingVersion || 0) >= SALE_UNIT_PRICING_VERSION) return false;
  const corrected = [];
  for (const product of state.products || []) {
    const basis = product.priceBasis, unit = normalizeSaleUnit(product.saleUnit || product.unitName || '');
    if (['unit','sqm','linear_m'].includes(basis) && saleUnitBasis(unit) !== basis) {
      const replacement = basis === 'sqm' ? 'm²' : basis === 'linear_m' ? 'm lari' : saleUnitBasis(product.unitName) === 'unit' && product.unitName ? normalizeSaleUnit(product.unitName) : 'pcs';
      corrected.push({productId:product.id,previousUnit:product.saleUnit || '',saleUnit:replacement,priceBasis:basis});
      product.saleUnit = replacement;
      product.unitName = replacement; product.unitLabel = `/${replacement}`;
    }
    Object.assign(product,saleUnitProduct(product));
  }
  const options = state.catalogOptions ||= {};
  options.saleUnits = normalizeSaleUnitOptions([...(options.saleUnits || []),'pcs','lbr','m²','m lari','pack','set','box','paket',...(state.products || []).map(p=>p.saleUnit)]);
  state.saleUnitPricingVersion = SALE_UNIT_PRICING_VERSION;
  state.saleUnitPricingMigration = {at:new Date().toISOString(),corrected};
  return true;
}
