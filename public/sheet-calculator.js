export const DEFAULT_SHEET_PROFILES = [
  { id: 'a3', name: 'A3', paperWidthCm: 29.7, paperLengthCm: 42, areaWidthCm: 28.5, areaLengthCm: 41, cuttingWidthCm: 27, cuttingLengthCm: 39.5, gapMm: 2 },
  { id: 'a3-plus', name: 'A3+', paperWidthCm: 32, paperLengthCm: 48, areaWidthCm: 31, areaLengthCm: 47, cuttingWidthCm: 30, cuttingLengthCm: 45, gapMm: 3 }
];

export function validateSheetProfile(input) {
  const profile = { id: String(input.id || '').trim(), name: String(input.name || '').trim() };
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(profile.id) || !profile.name || profile.name.length > 80) throw new Error('ID dan nama profil kalkulator tidak valid');
  for (const key of ['paperWidthCm','paperLengthCm','areaWidthCm','areaLengthCm','cuttingWidthCm','cuttingLengthCm','gapMm']) {
    const value = Number(input[key]);
    if (input[key] == null || input[key] === '' || !Number.isFinite(value) || value <= 0 || value > 1000 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw new Error('Ukuran profil harus positif, maksimal 1.000, dan maksimal dua desimal');
    profile[key] = value;
  }
  if (profile.areaWidthCm > profile.paperWidthCm || profile.areaLengthCm > profile.paperLengthCm || profile.cuttingWidthCm > profile.areaWidthCm || profile.cuttingLengthCm > profile.areaLengthCm) throw new Error('Area gambar harus di dalam kertas; area cutting tidak boleh melebihi area tanpa cutting');
  return profile;
}

export function cuttingMode(finishes = []) {
  const kinds = new Set(finishes.map(f => f.cuttingMode || (/kiss\s*cut/i.test(`${f.id || ''} ${f.name || ''}`) ? 'kiss' : /die\s*cut/i.test(`${f.id || ''} ${f.name || ''}`) ? 'die' : '')).filter(Boolean));
  if (kinds.has('kiss') && kinds.has('die')) return 'both';
  return kinds.has('die') ? 'die' : kinds.has('kiss') ? 'kiss' : 'none';
}
export const cuttingLabel = mode => ({ none: 'Tanpa cutting', kiss: 'Kisscut', die: 'Diecut', both: 'Kisscut + Diecut' }[mode] || 'Tanpa cutting');

export function productSheetProfile(product, profiles, variantId = '') {
  if (!product?.sheetCalculatorEnabled || product.priceBasis !== 'unit') return null;
  const variant = (product.materialVariants || []).find(v => v.id === variantId);
  const id = variant?.sheetProfileId || product.sheetProfileId;
  return (profiles || []).find(p => p.id === id) || null;
}

export function calculateSheetLayout(profile, input, mode = 'none') {
  profile = validateSheetProfile(profile);
  const numeric = value => Number(String(value ?? '').replace(',', '.'));
  const lengthCm = numeric(input.lengthCm), widthCm = input.shape === 'circle' ? lengthCm : numeric(input.widthCm), requestedQuantity = Number(input.requestedQuantity);
  if (![widthCm,lengthCm].every(v => Number.isFinite(v) && v >= .1 && v <= 1000 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-7)) throw new Error('Ukuran gambar minimal 0,1 cm dan maksimal dua desimal');
  if (!['rectangle','circle'].includes(input.shape)) throw new Error('Bentuk gambar tidak valid');
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 1000000000) throw new Error('Jumlah pesanan harus bilangan bulat minimal 1 pcs');
  if (!['none','kiss','die','both'].includes(mode)) throw new Error('Jenis cutting tidak valid');
  const areaWidthCm = mode === 'none' ? profile.areaWidthCm : profile.cuttingWidthCm;
  const areaLengthCm = mode === 'none' ? profile.areaLengthCm : profile.cuttingLengthCm;
  // Integer hundredths of a millimetre avoid floating point boundary errors.
  const aw = Math.round(areaWidthCm * 1000), ah = Math.round(areaLengthCm * 1000), gap = Math.round(profile.gapMm * 100);
  const w = Math.round(widthCm * 1000), h = Math.round(lengthCm * 1000);
  const grid = (width, height, rotated) => { const columns = Math.floor((aw + gap) / (width + gap)), rows = Math.floor((ah + gap) / (height + gap)); return { columns, rows, capacity: columns * rows, rotated }; };
  const normal = grid(w,h,false), rotated = grid(h,w,true);
  const layout = input.allowRotation !== false && input.shape !== 'circle' && rotated.capacity > normal.capacity ? rotated : normal;
  if (!layout.capacity) throw new Error(`Ukuran gambar tidak muat dalam area ${areaWidthCm} × ${areaLengthCm} cm`);
  const sheets = Math.ceil(requestedQuantity / layout.capacity);
  return { ...layout, shape: input.shape, widthCm, lengthCm, requestedQuantity, allowRotation: input.allowRotation !== false, sheets, lastSheetQuantity: requestedQuantity - (sheets - 1) * layout.capacity, cuttingMode: mode, areaWidthCm, areaLengthCm, profile: { ...profile } };
}

export function sheetSpecification(snapshot) {
  if (!snapshot) return '';
  const n = value => Number(value).toLocaleString('id-ID');
  const size = snapshot.shape === 'circle' ? `Ø ${n(snapshot.lengthCm)} cm` : `${n(snapshot.widthCm)} × ${n(snapshot.lengthCm)} cm`;
  if (snapshot.mode === 'capacity') return `${size} · ${n(snapshot.capacity)} pcs/lembar · ${snapshot.profile.name} · Area ${n(snapshot.areaWidthCm)} × ${n(snapshot.areaLengthCm)} cm · Jarak ${n(snapshot.profile.gapMm)} mm`;
  return `${size} · ${n(snapshot.requestedQuantity)} pcs · ${n(snapshot.capacity)} pcs/lembar · ${snapshot.profile.name} · ${cuttingLabel(snapshot.cuttingMode)} · Area ${n(snapshot.areaWidthCm)} × ${n(snapshot.areaLengthCm)} cm · Jarak ${n(snapshot.profile.gapMm)} mm`;
}

// New POS calculations show capacity only. Legacy snapshots retain their original fields.
export function calculateSheetCapacity(profile, input) {
  const conservative = { ...profile, areaWidthCm: Math.min(profile.areaWidthCm, profile.cuttingWidthCm), areaLengthCm: Math.min(profile.areaLengthCm, profile.cuttingLengthCm) };
  const result = calculateSheetLayout(conservative, { ...input, shape: 'rectangle', requestedQuantity: 1 }, 'none');
  const { requestedQuantity, sheets, lastSheetQuantity, cuttingMode: ignoredMode, ...capacity } = result;
  return { ...capacity, mode: 'capacity' };
}
