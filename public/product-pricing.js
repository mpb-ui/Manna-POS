import { isPaperProductCategory } from './paper-product-tabs.js';
import { PRINT_ROLL_VERSION, usesPrintRollRules } from './outdoor-sizing.js';

// Shared POS/server rules. Existing catalogs without a basis retain quantity tiers.
export const usesPrintAreaTier = (product, line) => line?.rollCalculationVersion === PRINT_ROLL_VERSION
  && !line.sizeVariantId && usesPrintRollRules(product);
export const wholesaleBasis = (product, line) => usesPrintAreaTier(product, line) ? 'area'
  : ['area','length'].includes(product.wholesaleBasis) ? product.wholesaleBasis : 'quantity';
export const purchaseUnit = product => product?.priceBasis && product.priceBasis !== 'unit' ? 'lembar' : product?.unitName || product?.saleUnit || 'pcs';
export const minimumQuantity = product => product?.minimumEnabled === true ? Math.max(1, Number(product.minimumQuantity) || 1) : 1;
export function minimumError(product, quantity) {
  const min = minimumQuantity(product);
  return product?.minimumEnabled && (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < min)
    ? `Minimum pembelian ${min} ${purchaseUnit(product)} untuk ${product.name}` : '';
}
export function normalizeMinimum(body, current = {}) {
  const enabled = body.minimumEnabled === undefined ? current.minimumEnabled === true : body.minimumEnabled === true;
  const quantity = Number(body.minimumQuantity ?? current.minimumQuantity ?? 1);
  if (enabled && (!Number.isSafeInteger(quantity) || quantity < 1)) throw new Error('Jumlah minimum pembelian harus bilangan bulat minimal 1');
  return {minimumEnabled:enabled, minimumQuantity:enabled ? quantity : 1};
}
export const supportsPurchaseMultiple = isPaperProductCategory;
export function normalizePurchaseMultiple(category, value = 1) {
  if (!supportsPurchaseMultiple(category)) return 1;
  const multiple = Number(value);
  if (!Number.isSafeInteger(multiple) || multiple < 1) throw new Error('Kelipatan pembelian harus bilangan bulat minimal 1');
  return multiple;
}
export function purchaseMultiple(product) {
  const multiple = Number(product?.purchaseMultiple);
  return supportsPurchaseMultiple(product?.category) && Number.isSafeInteger(multiple) && multiple > 1 ? multiple : 1;
}
export const firstPurchaseQuantity = product => product?.minimumEnabled === true ? minimumQuantity(product) : purchaseMultiple(product);
export function roundPurchaseQuantity(product, quantity) {
  const first = firstPurchaseQuantity(product), multiple = purchaseMultiple(product);
  return first + Math.max(0, Math.ceil((Number(quantity) - first) / multiple)) * multiple;
}
export function purchaseMultipleError(product, quantity, previousQuantity) {
  const multiple = purchaseMultiple(product), amount = Number(quantity);
  if (multiple === 1 || amount === previousQuantity) return '';
  const first = firstPurchaseQuantity(product);
  if (Number.isSafeInteger(amount) && amount >= first && (amount - first) % multiple === 0) return '';
  return `${product.name} memiliki kelipatan pembelian ${multiple} ${purchaseUnit(product)}, mulai dari ${first} ${purchaseUnit(product)}`;
}
const spandukTemplatePrices = new Map([['1.5x1', 45000], ['2x1.5', 90000], ['3x2', 180000]]);
export function spandukTemplatePrintPrice(product, width, length) {
  return product.id === 'spanduk-template' && product.templateProduct
    ? spandukTemplatePrices.get(`${Number(width)}x${Number(length)}`) ?? null : null;
}

export function templateDesignUnits({ quantity, width, length, templateDesign }, previous) {
  // An unchanged saved draft keeps the original design count. New work uses the product quantity.
  if (previous && quantity === previous.quantity && width === previous.width
    && length === (previous.actualLength ?? previous.length) && templateDesign === previous.templateDesign) {
    return previous.templateDesignQuantity ?? 1;
  }
  return quantity;
}
export function normalizeWholesaleBasis(value, priceBasis, fallback = 'quantity') {
  const basis = value ?? fallback;
  if (!['quantity','area','length'].includes(basis) || basis === 'area' && priceBasis !== 'sqm' || basis === 'length' && priceBasis !== 'linear_m') throw new Error('Dasar harga grosir tidak sesuai perhitungan produk');
  return basis;
}
export function normalizeProductTiers(tiers, basis = 'quantity') {
  if (!Array.isArray(tiers) || !tiers.length || tiers.length > 10) throw new Error('Isi 1–10 tingkat harga grosir');
  const measured = basis !== 'quantity';
  const rows = tiers.map(t => ({min:Number(t.min), max:measured || t.max == null || t.max === '' ? null : Number(t.max), price:Number(t.price)})).sort((a,b)=>a.min-b.min);
  for (let i=0;i<rows.length;i++) {
    const t=rows[i];
    if (!Number.isFinite(t.min) || t.min <= 0 || !measured && !Number.isSafeInteger(t.min) || !Number.isSafeInteger(t.price) || t.price <= 0) throw new Error('Batas dan harga grosir harus valid');
    if (t.max != null && (!Number.isSafeInteger(t.max) || t.max < t.min)) throw new Error('Maksimum quantity tidak boleh lebih kecil dari minimum');
    if (i && (measured ? t.min === rows[i-1].min : rows[i-1].max == null || t.min <= rows[i-1].max)) throw new Error('Tingkat grosir duplikat atau tumpang tindih');
  }
  return rows;
}
export function tierForUnits(tiers, units) {
  return [...tiers].filter(t=>Number(t.min)<=units+1e-8 && (t.max == null || t.max === '' || units<=Number(t.max)+1e-8)).sort((a,b)=>b.min-a.min)[0];
}
export function effectivePriceTiers(product, fixedVariant = null, materialVariant = null, combination = null, line = null) {
  // A fixed-size option never inherits meter-based tiers.
  if (fixedVariant && wholesaleBasis(product) !== 'quantity') return [];
  const tiers = combination?.priceTiers?.length ? combination.priceTiers : combination?.price != null ? []
    : materialVariant?.priceTiers?.length ? materialVariant.priceTiers : materialVariant?.price != null || fixedVariant?.price != null ? []
    : product.wholesaleEnabled ? product.priceTiers || [] : [];
  // Per-sheet area tiers start at each threshold, including catalogs saved with count ranges.
  return usesPrintAreaTier(product, line) ? tiers.map(tier => ({...tier, max:null})) : tiers;
}
export function wholesaleUnits(product, line = {}) {
  const {width=1, billedLength=1, quantity=1, sizeVariantId='', imageWidthCm, imageLengthCm} = line;
  if (usesPrintAreaTier(product, line)) return Number((imageWidthCm * imageLengthCm / 10000).toFixed(8));
  const basis=wholesaleBasis(product, line);
  return Number(((sizeVariantId || basis==='quantity' ? 1 : basis==='area' ? Number(width)*Number(billedLength) : Number(billedLength))*Number(quantity)).toFixed(8));
}
export function wholesaleGroupKey(line) {
  return JSON.stringify([line.productId,line.materialVariantId || '',line.subVariantId || '',line.sizeVariantId || '',(line.choices || []).map(c=>[c.groupId,c.optionId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

export function candidateRollPrice(product, line, candidate) {
  const basis=wholesaleBasis(product), ownUnits=wholesaleUnits(product,line);
  const units=Number((basis==='quantity' ? line.quantity : candidate.billingUnits*line.quantity).toFixed(8));
  const totalUnits=usesPrintAreaTier(product,line) ? ownUnits
    : basis==='quantity'?units:Number((Number(line.wholesaleQuantity ?? ownUnits)-ownUnits+units).toFixed(8));
  const material=product.materialVariants?.find(v=>v.id===line.materialVariantId);
  const combination=material?.combinations?.find(c=>c.subVariantId===line.subVariantId);
  const tier=tierForUnits(effectivePriceTiers(product,null,material,combination,line),totalUnits);
  let price=Number(tier?.price ?? combination?.price ?? material?.price ?? product.price);
  // Match the promo already evaluated for this preview; avoid changing it mid-render.
  if(line.discountApplied)price=product.discount.type==='nominal'?Math.max(0,price-product.discount.value):Math.max(0,Math.round(price*(1-Math.min(product.discount.value,100)/100)));
  return Math.round(candidate.billingUnits*line.quantity*price);
}
