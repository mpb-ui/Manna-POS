import { dtfLabel, dtfSize, dtfSizeSurcharge, dtfVariantKey } from '../public/dtf-variants.js';
import { allocateRupiah } from '../public/order-discount.js';

const normalized = value => dtfLabel(value).toLocaleLowerCase('id-ID');
const sum = values => values.reduce((total, value) => total + value, 0);
const optionLabel = (label, options, id) => dtfLabel(label) || dtfLabel(options?.find(option => id && option.id === id)?.label);

function legacyVariantLabels(item, product) {
  const parts = dtfLabel(item.displaySize).split(/\s*·\s*/);
  const countIndex = parts.findIndex(part => /^\d+(?:[.,]\d+)?\s+(lembar|lbr|pcs|set|pack|box|paket|roll|rim|produk|buah|kaos|unit)$/i.test(part));
  if (countIndex < 0) return [];
  const labels = parts.slice(countIndex + 1);
  if ((item.priceBasis ?? product?.priceBasis) === 'unit' || item.sizeVariantId) labels.unshift(parts.slice(0, countIndex).join(' · '));
  return labels;
}

function configuredVariants(item, product) {
  const fixedSize = optionLabel(item.sizeVariantLabel, product?.fixedSizeVariants, item.sizeVariantId);
  const choices = (item.choices || []).map(choice => optionLabel(
    choice.optionLabel,
    product?.choiceGroups?.find(group => group.id === choice.groupId)?.options,
    choice.optionId
  ));
  const variants = [
    optionLabel(item.materialVariantLabel, product?.materialVariants, item.materialVariantId),
    fixedSize,
    optionLabel(item.subVariantLabel, product?.subVariants, item.subVariantId),
    ...choices
  ].filter(Boolean);
  const labels = variants.length ? variants : legacyVariantLabels(item, product);
  // A Roll Banner's configured label combines its dimensions and print material.
  // Rank it by the named material, e.g. Luster HI-RES, across the offered sizes.
  return item.productId === 'display-roll-banner'
    ? labels.map(label => label.replace(/^\d+(?:[.,]\d+)?\s*[×x]\s*\d+(?:[.,]\d+)?\s*cm\s*·\s*/i, ''))
    : labels;
}

function shirtWeights(item, shirts) {
  const baseTotal = Number(item.baseTotal ?? item.subtotal);
  const fitsSnapshot = totals => Array.isArray(totals) && totals.length === shirts.length
    && totals.every(value => Number.isSafeInteger(value) && value >= 0)
    && baseTotal > 0 && sum(totals) === baseTotal;
  if (fitsSnapshot(item.shirtVariantSubtotals)) return item.shirtVariantSubtotals;

  // Older lines stored a package price and line total. Use the legacy XXL
  // surcharge only when it reconciles with the recorded total.
  const legacyPrices = shirts.map(row => row.quantity * (Number(item.unitPrice) + dtfSizeSurcharge({}, row.size)));
  return fitsSnapshot(legacyPrices) ? legacyPrices : shirts.map(row => row.quantity);
}

export function reportProductVariants(item, product, quantity) {
  const name = dtfLabel(item.productName) || dtfLabel(product?.name) || 'Produk';
  const productKey = item.productId || normalized(name);
  const shirts = (Array.isArray(item.shirtVariants) ? item.shirtVariants : []).map(row => ({
    color: dtfLabel(row?.color), size: dtfSize(row?.size), quantity: Number(row?.quantity)
  }));
  if (shirts.length && shirts.every(row => row.color && row.size && Number.isSafeInteger(row.quantity) && row.quantity > 0)
      && sum(shirts.map(row => row.quantity)) === quantity) {
    const weights = shirtWeights(item, shirts);
    return shirts.map((row, index) => ({
      key: JSON.stringify([productKey, dtfVariantKey(row.color, row.size)]),
      label: [name, row.color, row.size].join(' '),
      quantity: row.quantity,
      weight: weights[index]
    }));
  }

  const legacyPrint = name.match(/^((?:Print\s+)?(?:A3\+?|A4)\s+.+?)\s*\/([12])S$/i);
  let productName = legacyPrint?.[1] || name;
  if (legacyPrint && !/^Print\s/i.test(productName)) productName = 'Print ' + productName;
  const side = legacyPrint ? legacyPrint[2] + 'S' : product?.a3Side;
  const variants = configuredVariants(item, product);
  if (side === '1S' || side === '2S') variants.push('Cetak ' + side[0] + ' Sisi');
  const unique = new Map(variants.filter(Boolean).map(label => [normalized(label), label]));
  const nameKey = normalized(productName);
  const suffix = [...unique].filter(([key]) => nameKey !== key && !nameKey.endsWith(' ' + key)).map(([,label]) => label);
  return [{
    key: JSON.stringify([productKey, ...[...unique.keys()].sort()]),
    label: [productName, ...suffix].join(' '),
    quantity
  }];
}

export function allocateVariantSales(variants, total) {
  if (variants.length === 1) return [total];
  const weights = variants.map(variant => variant.weight);
  if (Number.isSafeInteger(total)) {
    return allocateRupiah(Math.abs(total), weights).map(amount => amount * Math.sign(total));
  }
  // Preserve fractional amounts in legacy order snapshots.
  const denominator = sum(weights);
  const shares = weights.slice(0, -1).map(weight => total * weight / denominator);
  return [...shares, total - sum(shares)];
}
