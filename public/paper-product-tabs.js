export const PAPER_PRODUCT_TABS = [
  ['kartu-nama', 'Kartu Nama'],
  ['brosur', 'Brosur'],
  ['tent-card', 'Tent Card'],
  ['map-folder', 'Map Folder'],
  ['voucher', 'Voucher']
];

export const isPaperProductCategory = category => String(category || '').trim().toLowerCase() === 'produk kertas';

const isPaperTab = value => PAPER_PRODUCT_TABS.some(([id]) => id === value);

export function paperProductTab(product) {
  if (!isPaperProductCategory(product?.category)) return null;
  if (isPaperTab(product.paperProductTab)) return product.paperProductTab;
  // Existing products can have names prefixed with a sale unit such as [RIM] or PAKET.
  const name = String(product.name || '').trim().toLowerCase()
    .replace(/^(?:\[[^\]]+\]\s*|paket\s+)+/, '').replace(/[^a-z0-9]+/g, '-');
  return PAPER_PRODUCT_TABS.find(([id]) => name === id || name.startsWith(id + '-'))?.[0] ?? null;
}

export function normalizePaperProductTab(category, value) {
  if (!isPaperProductCategory(category) || value == null || value === '') return null;
  if (!isPaperTab(value)) throw new Error('Pilih tab Produk Kertas yang tersedia');
  return value;
}
