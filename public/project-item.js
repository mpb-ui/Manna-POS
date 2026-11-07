import { historyProductRows } from './order-history-detail.js';
import { rollPlacementNote } from './roll-placement.js';
import { sheetSpecification } from './sheet-calculator.js';

export const PRODUCTION_STATUSES = ['DESAIN', 'CETAK', 'FINISHING', 'SELESAI'];
export const productionStatusLabel = status => ({DESAIN:'Design',CETAK:'Proses Cetak',FINISHING:'Finishing',SELESAI:'Selesai'})[status] || status;
export const canMoveProduction = (user, current, target) => PRODUCTION_STATUSES.includes(current) && PRODUCTION_STATUSES.includes(target) &&
  (user.permissions?.includes('projects.status') || user.role === 'CASHIER' && user.permissions?.includes('orders.pickup') && current === 'FINISHING' && target === 'SELESAI');

export function driveLink(value) {
  if (typeof value !== 'string') throw new Error('Link Google Drive tidak valid');
  const text = value.trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error('Masukkan link Google Drive yang lengkap (https://…)'); }
  if (text.length > 2048 || url.protocol !== 'https:' || !['drive.google.com','docs.google.com'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('Gunakan link HTTPS dari Google Drive atau Google Docs');
  return url.href;
}

export function productionSpecification(item) {
  if (item.sheetCalculation) return sheetSpecification(item.sheetCalculation);
  const size = item.imageWidthCm > 0 && item.imageLengthCm > 0
    ? `${Number(item.imageWidthCm).toLocaleString('id-ID')} × ${Number(item.imageLengthCm).toLocaleString('id-ID')} cm${item.allowanceCm > 0 ? ` · Lebihan ${Number(item.allowanceCm).toLocaleString('id-ID')} cm/sisi` : ''}`
    : item.displaySize || '';
  return [size, ...(item.finishing || []).map(f => f.name).filter(name => name && !size.toLocaleLowerCase('id-ID').includes(name.toLocaleLowerCase('id-ID')))].filter(Boolean).join(' · ');
}

// Explicit production projection: the same response for Owner and operators.
export function productionDetail(order, item) {
  const fields = ['itemId','productId','productName','quantity','priceBasis','unitName','saleUnit','displaySize','sizeVariantLabel','materialVariantLabel','subVariantLabel','width','actualLength','billedLength','imageWidthCm','imageLengthCm','allowanceCm','finalImageWidthCm','finalImageLengthCm','status','designPic','deadline','completedAt','productionNote','driveUrl','productionRevision','productionUpdatedAt','productionUpdatedBy','hold'];
  const result = Object.fromEntries(fields.filter(key => Object.hasOwn(item,key)).map(key => [key,structuredClone(item[key])]));
  result.hold ??= null;
  result.productionNote ||= ''; result.driveUrl ||= ''; result.productionRevision ||= 0;
  result.specification = productionSpecification(item);
  const rows=historyProductRows({items:[item]}), row=rows[0], details=[];
  if (item.shirtVariants?.length) {
    result.variantSummary=item.dtfPackageLabel || '';
    details.push(...item.shirtVariants.map(v=>`${v.color} · ${v.size} × ${v.quantity} pcs`));
  } else {
    // The historical sizeVariantLabel also stores named choices such as FL410
    // Glossy. A choice label is not evidence of a physical measurement.
    const variants=[...new Set([item.materialVariantLabel,item.sizeVariantLabel,item.subVariantLabel,...(item.choices || []).map(choice=>choice.optionLabel)].map(value=>String(value || '').trim()).filter(Boolean))];
    const quantityOnly=/^\d+(?:[.,]\d+)?\s*(set|pack|box|paket|roll|rim|produk|buah|kaos|pcs|unit|lbr|lembar)$/i;
    const historicalVariants=(row?.variant || '').split(' | ').filter(value=>value && value!=='—' && !quantityOnly.test(value));
    const physicalSize=item.priceBasis!=='unit' && row?.size!=='—' ? row?.size : '';
    result.variantSummary=variants.length ? variants.join(', ') : historicalVariants.join(', ') || physicalSize || '';
    if (physicalSize && physicalSize!==result.variantSummary && !variants.includes(physicalSize)) details.push(`Ukuran: ${physicalSize}`);
  }
  if (Number(item.allowanceCm)>0) {
    details.push(`Lebihan ${Number(item.allowanceCm).toLocaleString('id-ID')} cm/sisi`);
    if (item.finalImageWidthCm>0 && item.finalImageLengthCm>0) details.push(`Ukuran akhir: ${Number(item.finalImageWidthCm).toLocaleString('id-ID')} × ${Number(item.finalImageLengthCm).toLocaleString('id-ID')} cm`);
  }
  const placement=rollPlacementNote(item);if(placement)details.push(placement);
  if(item.sheetCalculation)details.push(sheetSpecification(item.sheetCalculation));
  result.details=[...new Set(details)];
  result.finishing = (item.finishing || []).map(({name,units,note})=>({name,units,note}));
  result.choices = (item.choices || []).map(({groupLabel,optionLabel})=>({groupLabel,optionLabel}));
  result.fileService = item.fileService ? {name:item.fileService.name,quantity:item.fileService.quantity,note:item.fileService.note} : null;
  result.templateDesign = item.templateDesign || '';
  return {orderId:order.id,code:order.code,customerName:order.customerName,itemNumber:order.items.indexOf(item)+1,item:result};
}
