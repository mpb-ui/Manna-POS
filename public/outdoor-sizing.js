// Nominal width remains the pricing basis; capacity is only used to select the roll.
export const OUTDOOR_CAPACITIES = {
  'fl-280-glossy': {1:110,2:220,3:320},
  'fl-380-matte': {1:110,2:220,3:320},
  'fl-410-glossy': {2:220},
  'fl-440-matte': {3:320},
  'nb-backlite-510': {3:320}
};
export const LF_CAPACITIES = {
  'poster-albatros': {0.9:90,1.2:125,1.5:152},
  'poster-luster': {0.9:90,1.2:125,1.5:152},
  'poster-canvas': {1.2:125},
  'lf-sticker-transparent': {1.5:152},
  'lf-sticker-white-glossy': {1:102,1.5:152},
  'lf-sticker-matte': {1:102,1.5:152},
  'lf-sticker-sandblast-print': {1:102,1.5:152},
  'lf-sticker-sandblast-plain': {1:102,1.5:152},
  'lf-sticker-oneway-outdoor': {1:102,1.5:152},
  'lf-sticker-oneway-hires': {1:102,1.5:152}
};
export function supportsAutoRollWidth(product) {
  return supportsOutdoorAllowance(product) || !product.templateProduct && product.priceBasis !== 'unit' && (Boolean(product.rollCapacities) || Boolean(LF_CAPACITIES[product.id]) || ['LF Poster','LF Sticker'].includes(product.category));
}
export function supportsOutdoorAllowance(product) {
  return !product.templateProduct && product.priceBasis !== 'unit' && (product.category === 'Outdoor' || Boolean(product.outdoorCapacities) || Boolean(OUTDOOR_CAPACITIES[product.id]) || product.id === 'cloth-banner');
}
export function outdoorCapacity(product,width) {
  return Number((product.rollCapacities || product.outdoorCapacities || LF_CAPACITIES[product.id] || OUTDOOR_CAPACITIES[product.id] || {})[width] ?? Number(width)*100);
}
export function suggestedOutdoorWidth(product,imageWidthCm,allowanceCm=0) {
  const widths=[...(product.widths || [])].sort((a,b)=>outdoorCapacity(product,a)-outdoorCapacity(product,b));
  const required=Number(imageWidthCm)+2*(supportsOutdoorAllowance(product)?Number(allowanceCm):0);
  return widths.find(width=>outdoorCapacity(product,width)>=required-1e-9) ?? widths.at(-1);
}
export function imageGeometry(product,input) {
  const imageWidthCm=Number(input.imageWidthCm),imageLengthCm=Number(input.imageLengthCm);
  const allowanceCm=supportsOutdoorAllowance(product) ? Number(input.allowanceCm ?? 0) : 0;
  if (!Number.isFinite(imageWidthCm)||imageWidthCm<=0||!Number.isFinite(imageLengthCm)||imageLengthCm<=0) throw new Error('Ukuran gambar tidak valid');
  if (!Number.isFinite(allowanceCm)||allowanceCm<0) throw new Error('Lebihan tidak valid');
  const finalImageWidthCm=Number((imageWidthCm+2*allowanceCm).toFixed(4));
  const finalImageLengthCm=Number((imageLengthCm+2*allowanceCm).toFixed(4));
  const billingLength=(imageLengthCm+(allowanceCm>5?2*allowanceCm:0))/100;
  return {imageWidthCm,imageLengthCm,allowanceCm,finalImageWidthCm,finalImageLengthCm,billingLength};
}
