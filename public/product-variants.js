// Variant types are display labels. Sale units alone determine the price formula.
export const DEFAULT_VARIANT_TYPES = ['Varian Bahan', 'Varian Ukuran', 'Sisi Cetak'];
export const DEFAULT_OPTION_TYPES = ['Sisi Cetak'];
export const availableVariants = product => (product.materialVariants || []).filter(v => v.active !== false && (!product.subVariants?.length || v.combinations?.some(c => c.active !== false)));
export const variantCardName = (variant, option, index = 0, optionIndex = 0) => [variant?.label?.trim() || `Varian ${index + 1}`, option ? option.label?.trim() || `Opsi ${optionIndex + 1}` : ''].filter(Boolean).join(', ');
export const copyTierRanges = tiers => tiers.map(t => ({ min: t.min, max: t.max, price: '' }));
export function mergeMaterialSources(...groups) {
  const merged = new Map();
  for (const source of groups.flat()) {
    if (!source?.materialId) continue;
    const previous = merged.get(source.materialId), units = Number(source.quantity || 0) * (1 + Number(source.wastePercent || 0) / 100);
    if (previous) { previous.quantity += units; previous.wastePercent = 0; }
    else merged.set(source.materialId, { ...source, quantity: units, wastePercent: 0 });
  }
  return [...merged.values()];
}
export function promoDate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit' }).format(date) : '';
}
export function promoDateBoundary(value, end = false) {
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Tanggal promo tidak valid');
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+08:00`);
  if (!Number.isFinite(date.getTime()) || promoDate(date.toISOString()) !== value) throw new Error('Tanggal promo tidak valid');
  return date.toISOString();
}
