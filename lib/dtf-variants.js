import { categoryKey } from './catalog-settings.js';
import { normalizeProductTiers } from '../public/product-pricing.js';
import { DTF_SIZES, DTF_LABEL_LENGTH, MAX_DTF_VARIANTS, dtfLabel, dtfSize, dtfVariantKey, usableDtfMaterial } from '../public/dtf-variants.js';

export function normalizeDtfStockVariants(state,product,rows) {
  if (!Array.isArray(rows) || rows.length<1 || rows.length>MAX_DTF_VARIANTS) throw new Error(`Isi 1–${MAX_DTF_VARIANTS} varian kaos`);
  const materials=new Map(state.materials.map(row=>[row.id,row]));
  const existing = new Set((product.dtfStockVariants || []).map(row => dtfVariantKey(row.color, row.size)));
  const combinations=new Set(), sources=new Set(), colors=new Map();
  for (const {color} of product.dtfStockVariants || []) colors.set(dtfLabel(color).toLocaleLowerCase('id-ID'),color);
  return rows.map(row=>{
    const entered=dtfLabel(row?.color),size=dtfSize(row?.size),materialId=row?.materialId;
    if (!entered || !size || entered.length>DTF_LABEL_LENGTH || size.length>DTF_LABEL_LENGTH) throw new Error(`Warna dan ukuran wajib diisi (maksimal ${DTF_LABEL_LENGTH} karakter)`);
    const colorKey=entered.toLocaleLowerCase('id-ID'),color=colors.get(colorKey) || entered;
    colors.set(colorKey,color);
    const key=dtfVariantKey(color,size);
    if (!DTF_SIZES.includes(size) && !existing.has(key)) throw new Error('Ukuran kaos harus S, M, L, XL, atau XXL');
    if (combinations.has(key)) throw new Error(`Varian ${color} ${size} sudah ada`);
    if (sources.has(materialId)) throw new Error('Pilih bahan stok yang berbeda untuk setiap varian kaos');
    const material=materials.get(materialId);
    if (!usableDtfMaterial(material) || categoryKey(state.catalogOptions,material.category,'materials')!=='kaos-polos-dtf') {
      throw new Error(`Pilih bahan Kaos Polos DTF aktif dengan stok Per Satuan (pcs) untuk ${color} ${size}`);
    }
    combinations.add(key);sources.add(materialId);
    return {color,size,materialId};
  });
}

export function normalizeDtfSizeSurcharges(rows,variants) {
  const sizes=new Set(variants.map(row=>dtfSize(row.size)));
  if (!Array.isArray(rows) || rows.length>sizes.size) throw new Error('Tambahan harga ukuran tidak valid');
  const seen=new Set();
  return rows.map(row=>{
    const size=dtfSize(row?.size),amount=row?.amount;
    if (!sizes.has(size) || seen.has(size) || !Number.isSafeInteger(amount) || amount<0) throw new Error('Tambahan harga ukuran tidak valid');
    seen.add(size);
    return {size,amount};
  });
}

export function normalizeDtfWholesaleTiers(rows, packages) {
  if (!Array.isArray(rows)) throw new Error('Tingkat harga grosir tidak valid');
  if (!rows.length) return [];
  const ranges = normalizeProductTiers(rows.map(row => ({ min: row?.min, max: row?.max, price: 1 })));
  const byMinimum = new Map(rows.map(row => [Number(row.min), row.prices]));
  return ranges.map(({ min, max }) => {
    const prices = byMinimum.get(min);
    if (!prices || packages.some(({id}) => !Number.isSafeInteger(prices[id]) || prices[id] <= 0)) {
      throw new Error('Isi harga grosir yang valid untuk semua paket dan rentang');
    }
    return { min, max, prices: Object.fromEntries(packages.map(({id}) => [id, prices[id]])) };
  });
}

export function normalizeDtfShirtCosts(rows) {
  if (!Array.isArray(rows) || rows.length > DTF_SIZES.length) throw new Error('Biaya kaos per ukuran tidak valid');
  const seen = new Set();
  return rows.map(row => {
    const size = dtfSize(row?.size), amount = row?.amount;
    if (!DTF_SIZES.includes(size) || seen.has(size) || !Number.isSafeInteger(amount) || amount < 0) {
      throw new Error('Biaya kaos harus Rp0 atau lebih dan hanya diisi sekali per ukuran');
    }
    seen.add(size);
    return { size, amount };
  });
}
