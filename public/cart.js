import { manualAreaFinishing } from './finishing-pricing.js';

const number = value => Number(value || 0);
const text = value => String(value || '').trim();
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const rounded = value => Number(value.toFixed(8));

export function ensureCartIds(lines) {
  return lines.every(line => line.cartId) ? lines : lines.map(line => line.cartId ? line : { ...line, cartId: crypto.randomUUID() });
}

export function cartMergeKey(line, product) {
  const quantity = number(line.quantity) || 1;
  const image = number(line.imageWidthCm) > 0 && number(line.imageLengthCm) > 0;
  const finishes = (line.finishing || []).map(f => {
    const definition = product.finishing?.find(item => item.id === f.id);
    return [f.id, text(f.note), definition?.rule === 'area' && !manualAreaFinishing(definition) ? 'auto' : rounded(number(f.units) / quantity)];
  }).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(stable({
    productId: line.productId, width: number(line.width) || 1,
    length: image ? null : number(line.length ?? line.actualLength) || 1,
    imageWidthCm: image ? number(line.imageWidthCm) : null, imageLengthCm: image ? number(line.imageLengthCm) : null,
    allowanceCm: number(line.allowanceCm), size: text(line.sizeVariantId), material: text(line.materialVariantId), sub: text(line.subVariantId),
    choices: (line.choices || []).filter(c => c.optionId).map(c => [c.groupId,c.optionId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))),
    sheet: line.sheetCalculation || null, finishing: finishes, template: text(line.templateDesign),
    design: text(line.fileServiceId || line.fileService?.id || 'READY'), designNote: text(line.fileServiceNote ?? line.fileService?.note),
    note: text(line.productionNote), package: text(line.dtfPackageId),
    shirts: (line.shirtVariants || []).map(v => [v.color,v.size]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }));
}

function validQuantity(quantity) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Jumlah produk harus bilangan bulat minimal 1');
  return quantity;
}

export function mergeCartLines(previous, added, product) {
  const merged = { ...previous, quantity: validQuantity(number(previous.quantity) + number(added.quantity)) };
  if ((previous.fileServiceId || previous.fileService?.id) !== 'READY' && (previous.fileServicePrice || previous.fileService?.price)) {
    merged.fileServiceQuantity = validQuantity(number(previous.fileServiceQuantity ?? previous.fileService?.quantity ?? 1) + number(added.fileServiceQuantity ?? added.fileService?.quantity ?? 1));
  }
  if (product.templateProduct) merged.templateDesignQuantity = validQuantity(number(previous.templateDesignQuantity || 1) + number(added.templateDesignQuantity || 1));
  merged.finishing = (previous.finishing || []).map(f => {
    const extra = added.finishing.find(item => item.id === f.id);
    return { ...f, units: Number((number(f.units) + number(extra?.units)).toFixed(4)) };
  });
  if (product.dtfShirt) merged.shirtVariants = previous.shirtVariants.map(v => ({ ...v,
    quantity: validQuantity(number(v.quantity) + number(added.shirtVariants.find(a=>a.color===v.color&&a.size===v.size)?.quantity))
  }));
  // Legacy target retains its stable itemId. Server quotation recalculates every
  // amount and automatic finishing unit from the new quantities.
  return merged;
}

export function addCartLine(cart, line, product) {
  validQuantity(number(line.quantity));
  const key = cartMergeKey(line, product), index = cart.findIndex(item => item.productId === product.id && cartMergeKey(item, product) === key);
  if (index < 0) return [...cart, { ...line, cartId: crypto.randomUUID() }];
  return cart.map((item,i) => i === index ? mergeCartLines(item,line,product) : item);
}

export function editCartLine(cart, cartId, replacement) {
  if (!cart.some(item => item.cartId === cartId)) throw new Error('Item pesanan sudah tidak tersedia');
  validQuantity(number(replacement.quantity));
  return cart.map(item => item.cartId !== cartId ? item : { ...replacement, cartId,
    ...(item.productId === replacement.productId && item.itemId ? { itemId: item.itemId } : {})
  });
}

export function plainRetailLine(line) {
  return !line.sizeVariantId && !line.materialVariantId && !line.subVariantId && !(line.choices || []).some(c=>c.optionId)
    && !(line.finishing || []).length && !line.templateDesign && !line.sheetCalculation && !text(line.productionNote)
    && (!line.fileServiceId || line.fileServiceId === 'READY') && !(line.shirtVariants || []).length;
}
