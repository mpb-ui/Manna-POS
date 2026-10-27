import { effectivePriceTiers, wholesaleBasis } from './product-pricing.js';
export { effectivePriceTiers } from './product-pricing.js';

export function wholesalePriceRows(tiers, retailPrice, basis = 'quantity') {
  if (!tiers.length) return [];
  if (basis !== 'quantity') {
    const sorted=[...tiers].sort((a,b)=>a.min-b.min),rows=[{min:0,max:Number(sorted[0].min),price:Number(retailPrice),retail:true,exclusive:true}];
    sorted.forEach((t,i)=>rows.push({min:Number(t.min),max:sorted[i+1]?Number(sorted[i+1].min):null,price:Number(t.price),retail:false,exclusive:true}));
    return rows;
  }
  const rows = [];
  let next = 1;
  for (const tier of [...tiers].sort((a, b) => Number(a.min) - Number(b.min))) {
    const min = Number(tier.min), max = tier.max == null || tier.max === "" ? null : Number(tier.max);
    if (min > next) rows.push({ min: next, max: min - 1, price: Number(retailPrice), retail: true });
    rows.push({ min, max, price: Number(tier.price), retail: false });
    if (max == null) return rows;
    next = max + 1;
  }
  rows.push({ min: next, max: null, price: Number(retailPrice), retail: true });
  return rows;
}

export function updateWholesalePrices({ scope, product, line, fixedVariant, materialVariant, combination }) {
  const field = scope?.querySelector('.quantity-field');
  if (!field) return;
  const tiers = effectivePriceTiers(product, fixedVariant, materialVariant, combination);
  let details = field.querySelector('.wholesale-prices');
  if (!tiers.length) { details?.remove(); field.classList.remove('has-wholesale-prices'); return; }
  field.classList.add('has-wholesale-prices');
  if (!details) {
    details = document.createElement('details'); details.className = 'wholesale-prices';
    details.innerHTML = '<summary><span class="wholesale-current">Harga Satuan <strong></strong> <span class="wholesale-price-unit"></span></span><span class="wholesale-expand"><span>Lihat semua</span><span class="wholesale-chevron ui-chevron" aria-hidden="true"></span></span></summary><p class="wholesale-quantity-note" data-wholesale-quantity></p><table aria-label="Tingkat harga produk"><thead><tr><th scope="col">JUMLAH</th><th scope="col">HARGA SATUAN</th></tr></thead><tbody></tbody></table><small class="wholesale-discount-note hidden">Harga tabel sebelum diskon produk.</small>';
    details.addEventListener('toggle', () => { details.querySelector('.wholesale-expand > span').textContent = details.open ? 'Tutup' : 'Lihat semua'; });
    const control = field.querySelector('.sheet-quantity-row') || field.querySelector('.quantity-control');
    control.after(details);
  }
  const storedUnit = fixedVariant && !product.groupedProduct ? 'lembar' : product.unitName || 'lembar';
  const quantityUnit = /^lbr$/i.test(storedUnit) ? 'lembar' : storedUnit;
  const basis=fixedVariant?'quantity':wholesaleBasis(product),measured=basis!=='quantity';
  const tierUnit=measured?(basis==='area'?'m²':'m'):quantityUnit;
  const pricingQuantity=Number(line.wholesaleQuantity ?? line.quantity);
  details.querySelector('thead th').textContent=measured?'LUAS / PANJANG TAGIHAN':'JUMLAH';
  details.querySelector('[data-wholesale-quantity]').textContent=measured?`Akumulasi ${pricingQuantity.toLocaleString('id-ID',{maximumFractionDigits:4})} ${tierUnit} · produk & varian sama dalam invoice`:'';
  const priceUnit = fixedVariant || product.priceBasis === 'unit' ? quantityUnit : product.priceBasis === 'sqm' ? 'm²' : 'm';
  const money = value => 'Rp' + Number(value).toLocaleString('id-ID', { maximumFractionDigits: 0 });
  details.querySelector('.wholesale-current strong').textContent = money(line.unitPrice);
  details.querySelector('.wholesale-price-unit').textContent = '/ ' + priceUnit;
  details.querySelector('.wholesale-discount-note').classList.toggle('hidden', !line.discountApplied);
  const retail = combination?.price ?? materialVariant?.price ?? fixedVariant?.price ?? product.price;
  const tbody = details.querySelector('tbody'); tbody.replaceChildren();
  for (const row of wholesalePriceRows(tiers, retail, basis)) {
    const tr = document.createElement('tr'), qty = document.createElement('td'), price = document.createElement('td');
    const range = row.exclusive && row.min===0 ? '< '+row.max.toLocaleString('id-ID') : row.exclusive && row.max!=null ? row.min.toLocaleString('id-ID')+'–< '+row.max.toLocaleString('id-ID') : row.max == null ? '≥ ' + row.min.toLocaleString('id-ID') : row.min === row.max ? row.min.toLocaleString('id-ID') : row.min.toLocaleString('id-ID') + '–' + row.max.toLocaleString('id-ID');
    qty.textContent = range + ' ' + tierUnit;
    price.textContent = money(row.price);
    if (row.retail) { const label = document.createElement('small'); label.textContent = 'Harga normal'; qty.append(label); }
    if (pricingQuantity >= row.min && (row.max == null || (row.exclusive ? pricingQuantity < row.max : pricingQuantity <= row.max))) {
      tr.className = 'wholesale-active';
      tr.setAttribute('aria-current', 'true');
      const label = document.createElement('small'); label.className = 'wholesale-active-label'; label.textContent = 'Berlaku'; price.append(label);
    }
    tr.append(qty, price); tbody.append(tr);
  }
}
