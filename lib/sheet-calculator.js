import { DEFAULT_SHEET_PROFILES, validateSheetProfile, productSheetProfile, calculateSheetLayout, calculateSheetCapacity, cuttingMode } from '../public/sheet-calculator.js';
import { categoryKey } from './catalog-settings.js';

export function initializeSheetCalculator(state) {
  state.catalogOptions.sheetCalculatorProfiles ||= structuredClone(DEFAULT_SHEET_PROFILES);
  // Seed existing paper SKUs once. Explicit settings (including disabled) survive restarts.
  for (const product of state.products || []) {
    if (Object.hasOwn(product, 'sheetCalculatorEnabled')) continue;
    if (categoryKey(state.catalogOptions, product.category) !== 'print-a3' || product.priceBasis !== 'unit') continue;
    let profileId = '';
    if (product.a3Kind === 'sticker') profileId = 'a3-plus';
    if (product.a3Kind === 'paper') {
      const family = String(product.a3Family || '').toLowerCase();
      if (['hvs','akasia','concorde','copenhagen','hammer','jasmine','kraft','linen','kraft linen'].includes(family)) profileId = 'a3';
      else if (family === 'art paper (ap)') profileId = Number(String(product.a3Variant).replace(/\D/g,'')) >= 150 && Number(String(product.a3Variant).replace(/\D/g,'')) <= 310 ? 'a3-plus' : 'a3';
      else if (['bluishwhite','bc manila','bc tik','java','lmo paper'].includes(family)) profileId = 'a3-plus';
      else if (['A3','A3+'].includes(product.a3Size)) profileId = product.a3Size === 'A3' ? 'a3' : 'a3-plus';
    }
    // Legacy quick cards have no curated family; new products always save an explicit toggle.
    if (!profileId) {
      const name = product.name || '';
      if (/\b(?:art\s*paper|ap)\s*(?:150|210|230|260|310)\b|bluishwhite|bc\s*manila|bc\s*tik|\bjava\b|lmo\s*paper|sticker/i.test(name)) profileId = 'a3-plus';
      else if (/\bhvs\b|akasia|concorde|copenhagen|hammer|jasmine|kraft|linen/i.test(name)) profileId = 'a3';
    }
    if (profileId) { product.sheetCalculatorEnabled = true; product.sheetProfileId = profileId; product.saleUnit ||= 'lbr'; }
  }
}

export function validateProductCalculator(product, state, body, current) {
  const enabled = body.sheetCalculatorEnabled === undefined ? !!current?.sheetCalculatorEnabled : body.sheetCalculatorEnabled === true;
  const profileId = String(body.sheetProfileId ?? current?.sheetProfileId ?? '').trim();
  const profiles = state.catalogOptions.sheetCalculatorProfiles || [];
  if (enabled && categoryKey(state.catalogOptions, product.category) !== 'print-a3') throw new Error('Kalkulator lembar hanya tersedia pada kategori Print A3+');
  if (enabled && (product.priceBasis !== 'unit' || !['lbr','lembar'].includes(String(product.saleUnit).toLowerCase()))) throw new Error('Kalkulator lembar memerlukan dasar per unit dan satuan lbr/lembar');
  if (enabled && !profiles.some(p => p.id === profileId)) throw new Error('Pilih profil kalkulator yang tersedia');
  product.sheetCalculatorEnabled = enabled;
  product.sheetProfileId = profileId;
  for (const variant of product.materialVariants || []) {
    const requested = (body.materialVariants || []).find(v => v.id === variant.id);
    const previous = current?.materialVariants?.find(v => v.id === variant.id);
    variant.sheetProfileId = String(requested?.sheetProfileId ?? previous?.sheetProfileId ?? '').trim();
    if (variant.sheetProfileId && !profiles.some(p => p.id === variant.sheetProfileId)) throw new Error('Profil varian bahan tidak tersedia');
  }
}

export function pricedSheetSnapshot(product, input, profiles, finishes, historical = null) {
  if (!input.sheetCalculation) return null;
  const profile = productSheetProfile(product, profiles, input.materialVariantId);
  if (!profile && !historical) throw new Error('Kalkulator tidak aktif atau profil tidak tersedia');
  if (input.sheetCalculation.mode === 'capacity') return calculateSheetCapacity(historical?.profile || profile, input.sheetCalculation);
  const snapshot = calculateSheetLayout(historical?.profile || profile, input.sheetCalculation, cuttingMode(finishes));
  if (snapshot.sheets !== Number(input.quantity)) throw new Error('Jumlah lembar tidak sesuai kalkulator. Gunakan hasil terbaru atau isi jumlah secara manual.');
  return snapshot;
}

export function registerSheetProfileRoutes({ app, store, requireCatalogAdmin, audit }) {
  app.put('/api/sheet-profiles/:id', requireCatalogAdmin, async (req,res,next) => {
    try {
      const result = await store.mutate(state => {
        const profile = validateSheetProfile({ ...req.body, id: req.params.id });
        const profiles = state.catalogOptions.sheetCalculatorProfiles;
        if (profiles.some(p => p.id !== profile.id && p.name.toLowerCase() === profile.name.toLowerCase())) throw new Error('Nama profil sudah digunakan');
        const index = profiles.findIndex(p => p.id === profile.id);
        if (index < 0 && profiles.length >= 30) throw new Error('Maksimal 30 profil kalkulator');
        if (index < 0) profiles.push(profile); else profiles[index] = profile;
        audit(state,req.user,'SHEET_PROFILE_UPDATE',`Menyimpan profil kalkulator ${profile.name}`);
        return profile;
      }); res.json(result);
    } catch(error) { next(error); }
  });
}
