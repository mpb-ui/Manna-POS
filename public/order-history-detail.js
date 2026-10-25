import { cancelled } from './order-rules.js';
import { itemQuantityLabel } from './item-workflow.js';

export function historyActions(order, permissions = []) {
  const can = permission => permissions.includes(permission), view = Boolean(order && can('orders.view'));
  const live = view && !cancelled(order), waiting = ['DRAFT','MENUNGGU_PEMBAYARAN'].includes(order?.status);
  const money = can('projects.money');
  return { detail:view, edit:live && waiting && can('pos.edit') && can('pos.view'), invoice:view && money,
    spk:live && !waiting, receipt:live && money && ['SELESAI','DIAMBIL'].includes(order.status),
    payment:live && money && can('pos.payment') && Number(order.total) > Number(order.paidAmount || 0) };
}
const text = value => String(value || '').trim();
const number = value => Number(value).toLocaleString('id-ID', { maximumFractionDigits:4 });
const unique = values => [...new Set(values.map(text).filter(Boolean))];
const sideLabel = value => ({'1S':'Cetak 1 Sisi','2S':'Cetak 2 Sisi'})[value] || '';
function columns(item) {
  let product = text(item.productName), size = '', variants = [item.materialVariantLabel, item.subVariantLabel, ...(item.choices || []).map(choice => choice.optionLabel)];
  // Parse only the known historical A3 catalog naming convention. Never use
  // today's master prices or overwrite the stored item to build this view.
  const paper = product.match(/^(A3\+?|A4)\s+(.+?)\s*\/(1S|2S)$/i);
  if (paper) {
    size = paper[1]; let material = paper[2];
    const ap = material.match(/^AP\s*(\d+)$/i);
    if (ap) { product = 'Art Paper'; variants.push(`AP${ap[1]}`); }
    else {
      const family = material.match(/^(Akasia|Concorde|Copenhagen|HVS|Bluishwhite|BC Manila|BC Tik|Hammer|Jasmine|Kraft Linen|Java|LMO Paper)\b(.*)$/i);
      if (family) { product = family[1]; variants.push(family[2].trim()); }
    }
    variants.push(sideLabel(paper[3].toUpperCase()));
  }
  if (!size && item.sizeVariantLabel) size = item.sizeVariantLabel;
  if (!size && item.priceBasis !== 'unit') {
    const width = Number(item.imageWidthCm) > 0 ? Number(item.imageWidthCm) : Number(item.width) * 100;
    const length = Number(item.imageLengthCm) > 0 ? Number(item.imageLengthCm) : Number(item.actualLength ?? item.length ?? item.billedLength) * 100;
    if (width > 0 && length > 0) size = `${number(width)} × ${number(length)} cm`;
  }
  if (!unique(variants).length && !paper && !item.shirtVariants?.length) variants.push(...text(item.displaySize).split(' · ').slice(1).filter(part=>!/^\d+\s*(lembar|lbr|pcs|unit)$/i.test(part)));
  if (item.templateDesign) variants.push(`Template ${item.templateDesign}`);
  const finishing = (item.finishing || []).map(finish => `${finish.name}${Number.isFinite(Number(finish.units)) ? ` × ${number(finish.units)}` : ''}${finish.note ? ` (${finish.note})` : ''}`).join(' · ');
  return { product:product || '—', variant:unique(variants).join(' | ') || '—', size:size || '—', quantity:itemQuantityLabel(item), finishing:finishing || '—', note:text(item.productionNote) || '—' };
}
export function historyProductRows(order) {
  return (order.items || []).flatMap(item => {
    const row = columns(item);
    return item.shirtVariants?.length ? item.shirtVariants.map(variant => ({ ...row, variant:unique([item.dtfPackageLabel,variant.color]).join(' | ') || '—', size:variant.size || '—', quantity:itemQuantityLabel({...item,quantity:variant.quantity,unitName:item.unitName || 'Kaos'}) })) : [row];
  });
}
