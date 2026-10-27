// Shared POS/server rules. Existing catalogs without a basis retain quantity tiers.
export const wholesaleBasis = product => ['area','length'].includes(product.wholesaleBasis) ? product.wholesaleBasis : 'quantity';
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
export function effectivePriceTiers(product, fixedVariant = null, materialVariant = null, combination = null) {
  // A fixed-size option never inherits meter-based tiers.
  if (fixedVariant && wholesaleBasis(product) !== 'quantity') return [];
  return combination?.priceTiers?.length ? combination.priceTiers : combination?.price != null ? []
    : materialVariant?.priceTiers?.length ? materialVariant.priceTiers : materialVariant?.price != null || fixedVariant?.price != null ? []
    : product.wholesaleEnabled ? product.priceTiers || [] : [];
}
export function wholesaleUnits(product, {width=1,billedLength=1,quantity=1,sizeVariantId=''} = {}) {
  const basis=wholesaleBasis(product);
  return Number(((sizeVariantId || basis==='quantity' ? 1 : basis==='area' ? Number(width)*Number(billedLength) : Number(billedLength))*Number(quantity)).toFixed(8));
}
export function wholesaleGroupKey(line) {
  return JSON.stringify([line.productId,line.materialVariantId || '',line.subVariantId || '',line.sizeVariantId || '',(line.choices || []).map(c=>[c.groupId,c.optionId]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
}

export function candidateRollPrice(product, line, candidate) {
  const basis=wholesaleBasis(product), ownUnits=wholesaleUnits(product,line);
  const units=Number((basis==='quantity' ? line.quantity : candidate.billingUnits*line.quantity).toFixed(8));
  const totalUnits=basis==='quantity'?units:Number((Number(line.wholesaleQuantity ?? ownUnits)-ownUnits+units).toFixed(8));
  const material=product.materialVariants?.find(v=>v.id===line.materialVariantId);
  const combination=material?.combinations?.find(c=>c.subVariantId===line.subVariantId);
  const tier=tierForUnits(effectivePriceTiers(product,null,material,combination),totalUnits);
  let price=Number(tier?.price ?? combination?.price ?? material?.price ?? product.price);
  // Match the promo already evaluated for this preview; avoid changing it mid-render.
  if(line.discountApplied)price=product.discount.type==='nominal'?Math.max(0,price-product.discount.value):Math.max(0,Math.round(price*(1-Math.min(product.discount.value,100)/100)));
  return Math.round(candidate.billingUnits*line.quantity*price);
}
