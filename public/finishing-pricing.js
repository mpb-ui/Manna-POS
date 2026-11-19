// Shared by the POS preview and authoritative order calculation.
export function manualLfCutting(finish) {
  return finish.rule === "area" && (["fin-lf-manual", "manual-cut-lf"].includes(finish.id)
    || /^(cutting manual lf|cutting lf manual)$/i.test(String(finish.name || "").trim()));
}

export function manualAreaFinishing(finish) {
  return finish.rule === "area" && (finish.name === "Kisscut LF" || manualLfCutting(finish));
}

export const FINISHING_SOURCES = [
  ['product', 'Ikuti Jumlah Produk'],
  ['size', 'Hitung dari Ukuran'],
  ['manual', 'Input Manual'],
];

export const FINISHING_SIZE_RULES = [
  ['length', 'Panjang'], ['width', 'Lebar'], ['area', 'Luas'],
  ['perimeter', 'Keliling'], ['top_bottom', 'Atas–bawah'], ['left_right', 'Kanan–kiri'],
];

export function finishingUnit(finish) {
  if (finish.rule === 'area') return 'm²';
  if (finish.rule === 'point') return 'titik';
  if (finish.rule === 'sheet') return 'lembar';
  return FINISHING_SIZE_RULES.some(([rule]) => rule === finish.rule) ? 'm lari' : 'unit';
}

export function validateFinishingSource(source, rule) {
  if (!source) return '';
  if (!FINISHING_SOURCES.some(([value]) => value === source)) throw new Error('Pilih sumber jumlah finishing yang tersedia');
  if (source === 'size' && !FINISHING_SIZE_RULES.some(([value]) => value === rule)) throw new Error('Pilih dasar ukuran untuk finishing');
  return source;
}

export function finishingQuantitySource(finish, product) {
  if (finish.quantitySource) return finish.quantitySource;
  if (finish.rule === 'area' && !manualLfCutting(finish)) return 'size';
  if (['paper', 'sticker'].includes(product.a3Kind) && ['free', 'sheet'].includes(finish.rule)) return 'product';
  return 'manual';
}

export function finishingUnitsPerProduct(finish, product, dimensions, manualUnits) {
  const source = finishingQuantitySource(finish, product);
  if (source === 'product') return 1;
  if (source === 'manual') {
    const units = Number(manualUnits);
    const measured = FINISHING_SIZE_RULES.some(([rule]) => rule === finish.rule);
    return measured || Number.isSafeInteger(units) ? units : NaN;
  }
  const hasImage = dimensions.imageWidthCm > 0 && dimensions.imageLengthCm > 0;
  const width = hasImage ? dimensions.imageWidthCm / 100 : dimensions.width;
  const length = hasImage ? dimensions.imageLengthCm / 100 : dimensions.length;
  switch (finish.rule) {
    case 'area': return hasImage ? width * length : dimensions.area;
    case 'width': return width;
    case 'length': return length;
    case 'perimeter': return 2 * (width + length);
    case 'top_bottom': return 2 * width;
    case 'left_right': return 2 * length;
    default: return NaN;
  }
}

export function totalFinishingUnits(units, quantity) {
  return Number((units * quantity).toFixed(4));
}

export function normalizeFinishingTiers(value = []) {
  if (!Array.isArray(value) || value.length > 10) throw new Error("Maksimal 10 tingkat grosir finishing");
  const tiers = value.map((tier) => {
    if (!tier || tier.min === "" || tier.min == null || tier.price === "" || tier.price == null) throw new Error("Jumlah minimum dan harga grosir wajib diisi");
    const min = Number(tier.min);
    const max = tier.max === "" || tier.max == null ? null : Number(tier.max);
    const price = Number(tier.price);
    if (!Number.isFinite(min) || min <= 0 || (max !== null && (!Number.isFinite(max) || max < min)) || !Number.isFinite(price) || price < 0) throw new Error("Jumlah atau harga grosir finishing tidak valid");
    return { min, max, price };
  }).sort((a, b) => a.min - b.min);
  tiers.forEach((tier, index) => {
    if (index && (tiers[index - 1].max === null || tier.min <= tiers[index - 1].max)) throw new Error("Rentang tingkat grosir finishing tidak boleh tumpang tindih");
  });
  return tiers;
}

export function finishingPriceForUnits(finishing, units) {
  const tier = (finishing.priceTiers || []).find((item) => units >= item.min && (item.max == null || units <= item.max));
  return tier ? Number(tier.price) : Number(finishing.price || 0);
}
